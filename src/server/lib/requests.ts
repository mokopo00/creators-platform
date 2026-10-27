import { computeDelay, computeSettlement, type DelayPause } from '../../shared/delay';
import type { Env } from '../env';
import type { RequestRow } from './authz';
import { all, first, newId, run, todayJst } from './db';
import { HttpError } from './errors';
import { getPaymentProvider } from './payments';
import { notify } from './posts';

export async function approvedPauses(db: D1Database, requestId: string): Promise<DelayPause[]> {
  const rows = await all<{ start_date: string; end_date: string | null }>(
    db,
    "SELECT start_date, end_date FROM delay_pauses WHERE request_id = ? AND status = 'approved'",
    requestId,
  );
  return rows.map((r) => ({ startDate: r.start_date, endDate: r.end_date }));
}

/** Delay is measured until delivery (or today while undelivered). */
export function delayAsOf(r: Pick<RequestRow, 'delivered_at'>, today: string): string {
  return r.delivered_at ? r.delivered_at.slice(0, 10) : today;
}

export async function currentDelay(db: D1Database, r: RequestRow, today = todayJst()) {
  return computeDelay({
    price: r.price,
    dueDate: r.due_date,
    asOf: delayAsOf(r, today),
    pauses: await approvedPauses(db, r.id),
  });
}

export function feeRate(env: Env): number {
  const v = Number(env.PLATFORM_FEE_RATE ?? '0.1');
  return Number.isFinite(v) && v >= 0 && v < 1 ? v : 0.1;
}

export async function markPaid(
  env: Env,
  requestId: string,
  sessionId: string,
  paymentIntentId: string,
) {
  const changed = await run(
    env.DB,
    `UPDATE requests SET status = 'paid', paid_at = datetime('now'), payment_intent_id = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'pending_payment' AND checkout_session_id = ?`,
    paymentIntentId,
    requestId,
    sessionId,
  );
  if (changed === 0) return false;
  const r = await first<RequestRow>(env.DB, 'SELECT * FROM requests WHERE id = ?', requestId);
  if (!r) return false;
  await run(
    env.DB,
    "INSERT INTO payment_records (id, request_id, kind, amount, provider_ref) VALUES (?, ?, 'charge', ?, ?)",
    newId(),
    r.id,
    r.price,
    paymentIntentId,
  );
  await notify(
    env.DB,
    r.creator_id,
    'request_paid',
    `「${r.title}」の支払いが完了しました。制作を開始してください`,
    `/requests/${r.id}`,
  );
  await notify(
    env.DB,
    r.client_id,
    'request_paid',
    `「${r.title}」の支払いが完了しました`,
    `/requests/${r.id}`,
  );
  return true;
}

/**
 * Called when both parties have approved the delivery: freezes the delay
 * reduction at the delivery date, refunds the reduction to the client and
 * transfers the rest (minus platform fee) to the creator.
 */
export async function settle(env: Env, r: RequestRow): Promise<void> {
  const delay = await currentDelay(env.DB, r);
  const s = computeSettlement(r.price, delay.amount, feeRate(env));
  const provider = getPaymentProvider(env);
  const creator = await first<{ stripe_account_id: string | null }>(
    env.DB,
    'SELECT stripe_account_id FROM users WHERE id = ?',
    r.creator_id,
  );
  let destination = creator?.stripe_account_id ?? null;
  if (!destination) {
    if (provider.kind !== 'mock') {
      throw new HttpError(409, 'payout_account_missing', 'クリエイターの受取口座が未設定です');
    }
    destination = (await provider.createConnectedAccount(r.creator_id)).id;
    await run(
      env.DB,
      'UPDATE users SET stripe_account_id = ? WHERE id = ?',
      destination,
      r.creator_id,
    );
  }
  let refundId: string | null = null;
  if (s.refundToClient > 0 && r.payment_intent_id) {
    refundId = (await provider.refund(r.payment_intent_id, s.refundToClient)).id;
  }
  const transfer = await provider.transfer({ amount: s.payout, destination, transferGroup: r.id });
  await run(
    env.DB,
    `UPDATE requests SET status = 'completed', payout_status = 'transferred', transfer_id = ?, payout_amount = ?,
       platform_fee = ?, reduction_amount = ?, refund_amount = ?, refund_id = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'delivered'`,
    transfer.id,
    s.payout,
    s.fee,
    delay.amount,
    s.refundToClient,
    refundId,
    r.id,
  );
  await run(
    env.DB,
    "INSERT INTO payment_records (id, request_id, kind, amount, provider_ref) VALUES (?, ?, 'transfer', ?, ?)",
    newId(),
    r.id,
    s.payout,
    transfer.id,
  );
  if (refundId) {
    await run(
      env.DB,
      "INSERT INTO payment_records (id, request_id, kind, amount, provider_ref) VALUES (?, ?, 'refund', ?, ?)",
      newId(),
      r.id,
      s.refundToClient,
      refundId,
    );
  }
  for (const uid of [r.creator_id, r.client_id]) {
    await notify(
      env.DB,
      uid,
      'request_completed',
      `「${r.title}」が完了し、送金処理を行いました`,
      `/requests/${r.id}`,
    );
  }
}

/** Full refund cancellation by the client when the request is overdue (CLAUDE.md 3-5-3). */
export async function cancelWithFullRefund(env: Env, r: RequestRow, today = todayJst()) {
  if (r.status !== 'paid')
    throw new HttpError(409, 'invalid_state', 'この依頼はキャンセルできません');
  if (today <= r.due_date) {
    throw new HttpError(
      409,
      'not_overdue',
      '納期を過ぎていないため、全額返金キャンセルはできません',
    );
  }
  const provider = getPaymentProvider(env);
  const refund = r.payment_intent_id ? await provider.refund(r.payment_intent_id, r.price) : null;
  const changed = await run(
    env.DB,
    `UPDATE requests SET status = 'cancelled_refunded', payout_status = 'not_applicable', payout_amount = 0,
       refund_amount = price, refund_id = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'paid'`,
    refund?.id ?? null,
    r.id,
  );
  if (changed === 0) throw new HttpError(409, 'invalid_state', 'この依頼はキャンセルできません');
  await run(
    env.DB,
    "INSERT INTO payment_records (id, request_id, kind, amount, provider_ref) VALUES (?, ?, 'refund', ?, ?)",
    newId(),
    r.id,
    r.price,
    refund?.id ?? null,
  );
  await notify(
    env.DB,
    r.creator_id,
    'request_cancelled',
    `「${r.title}」は納期遅延により依頼者がキャンセルしました（全額返金）`,
    `/requests/${r.id}`,
  );
}

/**
 * Daily Cron job: evaluates every paid, undelivered, overdue request and
 * stores the reduction and its reason in `delay_adjustments`.
 */
export async function evaluateDelays(env: Env, today = todayJst()) {
  const rows = await all<RequestRow>(
    env.DB,
    "SELECT * FROM requests WHERE status = 'paid' AND delivered_at IS NULL AND due_date < ?",
    today,
  );
  const results: { requestId: string; amount: number }[] = [];
  for (const r of rows) {
    const d = await currentDelay(env.DB, r, today);
    const reason =
      d.chargeableDays === 0
        ? `納期超過${d.overdueDays}日（正当な理由により減額なし）`
        : `納期超過${d.overdueDays}日（うち正当理由${d.excusedDays}日を除く${d.chargeableDays}日 × 5%${d.capped ? '、上限50%' : ''}）`;
    await run(
      env.DB,
      `INSERT INTO delay_adjustments
         (id, request_id, evaluated_on, overdue_days, excused_days, chargeable_days, reduction_rate_bp, reduction_amount, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (request_id, evaluated_on) DO UPDATE SET overdue_days = excluded.overdue_days,
         excused_days = excluded.excused_days, chargeable_days = excluded.chargeable_days,
         reduction_rate_bp = excluded.reduction_rate_bp, reduction_amount = excluded.reduction_amount,
         reason = excluded.reason`,
      newId(),
      r.id,
      today,
      d.overdueDays,
      d.excusedDays,
      d.chargeableDays,
      d.rateBp,
      d.amount,
      reason,
    );
    await run(env.DB, 'UPDATE requests SET reduction_amount = ? WHERE id = ?', d.amount, r.id);
    if (d.overdueDays === 1) {
      await notify(
        env.DB,
        r.client_id,
        'request_overdue',
        `「${r.title}」が納期を過ぎました。減額を適用して待つか、全額返金でキャンセルできます`,
        `/requests/${r.id}`,
      );
    }
    results.push({ requestId: r.id, amount: d.amount });
  }
  return results;
}
