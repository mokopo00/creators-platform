import { Hono } from 'hono';
import { computeSettlement } from '../../shared/delay';
import {
  deliverySchema,
  idSchema,
  messageSchema,
  pauseSchema,
  requestCreateSchema,
} from '../../shared/schemas';
import type { AppBindings } from '../env';
import { requireRequestParticipant, type RequestRow } from '../lib/authz';
import { all, first, newId, run, todayJst } from '../lib/db';
import { forbidden, HttpError, notFound } from '../lib/errors';
import { getPaymentProvider } from '../lib/payments';
import { notify } from '../lib/posts';
import { cancelWithFullRefund, currentDelay, feeRate, settle } from '../lib/requests';
import { rateLimit } from '../lib/security';
import { requireUser } from '../lib/session';
import { parseJson, parseParam } from '../lib/validate';

type Person = { id: string; handle: string; display_name: string; avatar_url: string | null };

const person = (p: Person | null) =>
  p ? { id: p.id, handle: p.handle, displayName: p.display_name, avatarUrl: p.avatar_url } : null;

async function getPerson(db: D1Database, id: string) {
  return person(
    await first<Person>(
      db,
      'SELECT id, handle, display_name, avatar_url FROM users WHERE id = ?',
      id,
    ),
  );
}

export const requestRoutes = new Hono<AppBindings>();

requestRoutes.post('/', rateLimit('request', 20, 3600), async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, requestCreateSchema);
  if (!user.isAdult) {
    throw new HttpError(
      403,
      'age_required',
      '有償の依頼は18歳以上の方のみ利用できます（設定から年齢確認をしてください）',
    );
  }
  const creator = await first<{
    id: string;
    is_creator: number;
    accepting_requests: number;
    monthly_capacity: number;
  }>(
    c.env.DB,
    'SELECT id, is_creator, accepting_requests, monthly_capacity FROM users WHERE handle = ? AND deleted_at IS NULL',
    b.creatorHandle,
  );
  if (!creator || creator.is_creator !== 1) throw notFound();
  if (creator.id === user.id) throw new HttpError(400, 'self_request', '自分には依頼できません');
  if (creator.accepting_requests !== 1)
    throw new HttpError(409, 'not_accepting', '現在依頼を受け付けていません');
  const used = await first<{ n: number }>(
    c.env.DB,
    "SELECT COUNT(*) AS n FROM requests WHERE creator_id = ? AND status IN ('paid','delivered','completed') AND substr(paid_at, 1, 7) = ?",
    creator.id,
    todayJst().slice(0, 7),
  );
  if ((used?.n ?? 0) >= creator.monthly_capacity) {
    throw new HttpError(409, 'capacity_full', '今月の受付枠が埋まっています');
  }
  if (b.dueDate <= todayJst())
    throw new HttpError(400, 'invalid_due_date', '納期は明日以降の日付を指定してください');
  if (b.templateId) {
    const t = await first(
      c.env.DB,
      'SELECT 1 FROM request_templates WHERE id = ? AND creator_id = ?',
      b.templateId,
      creator.id,
    );
    if (!t) throw new HttpError(400, 'invalid_template', 'テンプレートが見つかりません');
  }
  const id = newId();
  await run(
    c.env.DB,
    `INSERT INTO requests (id, creator_id, client_id, title, details, price, due_date, delay_terms_agreed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    id,
    creator.id,
    user.id,
    b.title,
    b.details,
    b.price,
    b.dueDate,
  );
  await run(
    c.env.DB,
    'INSERT INTO messages (id, request_id, sender_id, body) VALUES (?, ?, ?, ?)',
    newId(),
    id,
    user.id,
    b.details,
  );
  await notify(
    c.env.DB,
    creator.id,
    'request_created',
    `${user.displayName} さんから新しい依頼「${b.title}」が届きました`,
    `/requests/${id}`,
  );
  return c.json({ id }, 201);
});

requestRoutes.get('/', async (c) => {
  const user = requireUser(c);
  const rows = await all<
    RequestRow & { c_handle: string; c_name: string; c_avatar: string | null; c_id: string }
  >(
    c.env.DB,
    `SELECT r.*, u.id AS c_id, u.handle AS c_handle, u.display_name AS c_name, u.avatar_url AS c_avatar
     FROM requests r JOIN users u ON u.id = CASE WHEN r.creator_id = ?1 THEN r.client_id ELSE r.creator_id END
     WHERE r.creator_id = ?1 OR r.client_id = ?1 ORDER BY r.updated_at DESC LIMIT 100`,
    user.id,
  );
  return c.json({
    requests: rows.map((r) => ({
      id: r.id,
      title: r.title,
      price: r.price,
      dueDate: r.due_date,
      status: r.status,
      role: r.creator_id === user.id ? 'creator' : 'client',
      counterpart: { id: r.c_id, handle: r.c_handle, displayName: r.c_name, avatarUrl: r.c_avatar },
      createdAt: r.created_at,
    })),
  });
});

requestRoutes.get('/:id', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  const today = todayJst();
  const delay = await currentDelay(c.env.DB, r, today);
  const messages = await all<{ id: string; body: string; created_at: string; sender_id: string }>(
    c.env.DB,
    'SELECT id, body, created_at, sender_id FROM messages WHERE request_id = ? ORDER BY created_at, rowid',
    id,
  );
  const pauses = await all(
    c.env.DB,
    'SELECT id, reason, start_date AS startDate, end_date AS endDate, note, status, created_by AS createdBy FROM delay_pauses WHERE request_id = ? ORDER BY created_at',
    id,
  );
  const adjustments = await all(
    c.env.DB,
    `SELECT evaluated_on AS evaluatedOn, overdue_days AS overdueDays, excused_days AS excusedDays,
            chargeable_days AS chargeableDays, reduction_amount AS reductionAmount, reason
     FROM delay_adjustments WHERE request_id = ? ORDER BY evaluated_on DESC LIMIT 60`,
    id,
  );
  return c.json({
    request: {
      id: r.id,
      title: r.title,
      details: r.details,
      price: r.price,
      dueDate: r.due_date,
      status: r.status,
      role: r.role,
      creator: await getPerson(c.env.DB, r.creator_id),
      client: await getPerson(c.env.DB, r.client_id),
      paidAt: r.paid_at,
      deliveredAt: r.delivered_at,
      deliveryNote: r.delivery_note,
      clientApprovedAt: r.client_approved_at,
      creatorApprovedAt: r.creator_approved_at,
      reductionAmount: r.status === 'completed' ? r.reduction_amount : delay.amount,
      payoutAmount: r.payout_amount,
      platformFee: r.platform_fee,
      payoutStatus: r.payout_status,
      refundAmount: r.refund_amount,
      createdAt: r.created_at,
    },
    delay,
    settlementPreview: computeSettlement(r.price, delay.amount, feeRate(c.env)),
    canCancelRefund: r.role === 'client' && r.status === 'paid' && today > r.due_date,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      senderId: m.sender_id,
    })),
    pauses,
    adjustments,
  });
});

requestRoutes.post('/:id/messages', rateLimit('chat', 30, 60), async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  const b = await parseJson(c, messageSchema);
  const msg = {
    id: newId(),
    body: b.body,
    senderId: user.id,
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
  await run(
    c.env.DB,
    'INSERT INTO messages (id, request_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    msg.id,
    id,
    user.id,
    msg.body,
    msg.createdAt,
  );
  const other = r.role === 'creator' ? r.client_id : r.creator_id;
  await notify(
    c.env.DB,
    other,
    'message',
    `「${r.title}」に新しいメッセージがあります`,
    `/requests/${id}`,
  );
  if (c.env.CHAT) {
    const stub = c.env.CHAT.get(c.env.CHAT.idFromName(id));
    c.executionCtx.waitUntil(
      stub
        .fetch('https://chat/broadcast', {
          method: 'POST',
          body: JSON.stringify({ type: 'message', message: msg }),
        })
        .catch(() => undefined),
    );
  }
  return c.json({ message: msg }, 201);
});

/** WebSocket for live chat updates. Participation is checked before upgrading. */
requestRoutes.get('/:id/ws', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  await requireRequestParticipant(c.env.DB, id, user.id);
  if (c.req.header('Upgrade') !== 'websocket' || !c.env.CHAT) {
    throw new HttpError(400, 'websocket_required', 'WebSocket が必要です');
  }
  const stub = c.env.CHAT.get(c.env.CHAT.idFromName(id));
  return stub.fetch(c.req.raw);
});

requestRoutes.post('/:id/checkout', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  if (r.role !== 'client') throw forbidden();
  if (r.status !== 'pending_payment')
    throw new HttpError(409, 'invalid_state', 'この依頼は支払い済みか、キャンセルされています');
  const provider = getPaymentProvider(c.env);
  const origin = c.env.APP_ORIGIN;
  const session = await provider.createCheckout({
    requestId: r.id,
    title: r.title,
    amount: r.price,
    successUrl: `${origin}/requests/${r.id}?checkout=success`,
    cancelUrl: `${origin}/requests/${r.id}?checkout=cancel`,
  });
  await run(c.env.DB, 'UPDATE requests SET checkout_session_id = ? WHERE id = ?', session.id, r.id);
  return c.json({ url: session.url, provider: provider.kind });
});

requestRoutes.post('/:id/deliver', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  if (r.role !== 'creator') throw forbidden();
  const b = await parseJson(c, deliverySchema);
  const n = await run(
    c.env.DB,
    "UPDATE requests SET status = 'delivered', delivered_at = ?, delivery_note = ?, updated_at = datetime('now') WHERE id = ? AND status = 'paid'",
    todayJst(),
    b.note,
    id,
  );
  if (n === 0) throw new HttpError(409, 'invalid_state', '納品できる状態ではありません');
  await notify(
    c.env.DB,
    r.client_id,
    'request_delivered',
    `「${r.title}」が納品されました。内容を確認して受け取りを承認してください`,
    `/requests/${id}`,
  );
  return c.json({ ok: true });
});

requestRoutes.post('/:id/approve', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  if (r.status !== 'delivered')
    throw new HttpError(409, 'invalid_state', '承認できる状態ではありません');
  const column = r.role === 'client' ? 'client_approved_at' : 'creator_approved_at';
  await run(
    c.env.DB,
    `UPDATE requests SET ${column} = COALESCE(${column}, datetime('now')) WHERE id = ?`,
    id,
  );
  const updated = (await first<RequestRow>(c.env.DB, 'SELECT * FROM requests WHERE id = ?', id))!;
  if (updated.client_approved_at && updated.creator_approved_at) {
    await settle(c.env, updated);
  }
  const final = (await first<RequestRow>(
    c.env.DB,
    'SELECT status, payout_status FROM requests WHERE id = ?',
    id,
  ))!;
  return c.json({ status: final.status, payoutStatus: final.payout_status });
});

requestRoutes.post('/:id/cancel', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  if (r.status === 'pending_payment') {
    await run(
      c.env.DB,
      "UPDATE requests SET status = 'cancelled', payout_status = 'not_applicable' WHERE id = ? AND status = 'pending_payment'",
      id,
    );
    const other = r.role === 'creator' ? r.client_id : r.creator_id;
    await notify(
      c.env.DB,
      other,
      'request_cancelled',
      `「${r.title}」はキャンセルされました`,
      `/requests/${id}`,
    );
    return c.json({ status: 'cancelled' });
  }
  if (r.role !== 'client') throw forbidden();
  await cancelWithFullRefund(c.env, r);
  return c.json({ status: 'cancelled_refunded' });
});

/** Justified-delay flags (減額停止フラグ). */
requestRoutes.post('/:id/pauses', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  const b = await parseJson(c, pauseSchema);
  if (b.endDate && b.endDate < b.startDate)
    throw new HttpError(400, 'invalid_range', '終了日は開始日以降にしてください');
  if (b.reason === 'platform_outage') throw forbidden(); // set by the operator only
  if (b.reason === 'creator_force_majeure' && r.role !== 'creator') throw forbidden();
  // A client acknowledging their own delay is effective immediately; anything
  // else waits for the counterparty (client_*) or the operator (force majeure).
  const status =
    r.role === 'client' && b.reason !== 'creator_force_majeure' ? 'approved' : 'pending';
  const pid = newId();
  await run(
    c.env.DB,
    'INSERT INTO delay_pauses (id, request_id, reason, start_date, end_date, note, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    pid,
    id,
    b.reason,
    b.startDate,
    b.endDate ?? null,
    b.note,
    status,
    user.id,
  );
  const other = r.role === 'creator' ? r.client_id : r.creator_id;
  await notify(
    c.env.DB,
    other,
    'delay_pause',
    `「${r.title}」に遅延理由の申告がありました`,
    `/requests/${id}`,
  );
  return c.json({ id: pid, status }, 201);
});

/** The client confirms a creator-declared client-side delay. */
requestRoutes.post('/:id/pauses/:pauseId/approve', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const pauseId = parseParam(c.req.param('pauseId'), idSchema);
  const r = await requireRequestParticipant(c.env.DB, id, user.id);
  if (r.role !== 'client') throw forbidden();
  const n = await run(
    c.env.DB,
    `UPDATE delay_pauses SET status = 'approved', reviewed_at = datetime('now')
     WHERE id = ? AND request_id = ? AND status = 'pending' AND reason IN ('client_material_delay', 'client_approval_wait')`,
    pauseId,
    id,
  );
  if (n === 0) throw notFound();
  return c.json({ ok: true });
});
