import { Hono } from 'hono';
import { z } from 'zod';
import { addDays, daysBetween } from '../../shared/delay';
import {
  ageConfirmSchema,
  digitalProductSchema,
  idSchema,
  promotionSchema,
} from '../../shared/schemas';
import type { AppBindings, Env } from '../env';
import { all, first, newId, run, todayJst } from '../lib/db';
import { HttpError, notFound } from '../lib/errors';
import { getPaymentProvider } from '../lib/payments';
import { requireUser } from '../lib/session';
import { parseJson, parseParam, parseQuery } from '../lib/validate';

/* ---------------- Analytics ---------------- */

export const analyticsRoutes = new Hono<AppBindings>();

analyticsRoutes.get('/', async (c) => {
  const user = requireUser(c);
  const { days } = parseQuery(
    c,
    z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }),
  );
  const to = todayJst();
  const from = addDays(to, -(days - 1));
  const stats = await all<{ day: string; views: number; saves: number }>(
    c.env.DB,
    `SELECT s.day, SUM(s.views) AS views, SUM(s.saves) AS saves FROM post_daily_stats s
     JOIN posts p ON p.id = s.post_id WHERE p.author_id = ? AND s.day BETWEEN ? AND ? GROUP BY s.day`,
    user.id,
    from,
    to,
  );
  const reqs = await all<{ day: string; n: number }>(
    c.env.DB,
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM requests
     WHERE creator_id = ? AND substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY day`,
    user.id,
    from,
    to,
  );
  const byDay = new Map(stats.map((s) => [s.day, s]));
  const reqByDay = new Map(reqs.map((r) => [r.day, r.n]));
  const series = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    return {
      day,
      views: byDay.get(day)?.views ?? 0,
      saves: byDay.get(day)?.saves ?? 0,
      requests: reqByDay.get(day) ?? 0,
    };
  });
  const top = await all<{ id: string; title: string; view_count: number; save_count: number }>(
    c.env.DB,
    'SELECT id, title, view_count, save_count FROM posts WHERE author_id = ? ORDER BY view_count + save_count * 3 DESC LIMIT 5',
    user.id,
  );
  return c.json({
    from,
    to,
    series,
    totals: series.reduce(
      (t, s) => ({
        views: t.views + s.views,
        saves: t.saves + s.saves,
        requests: t.requests + s.requests,
      }),
      { views: 0, saves: 0, requests: 0 },
    ),
    topPosts: top.map((p) => ({
      id: p.id,
      title: p.title,
      views: p.view_count,
      saves: p.save_count,
    })),
  });
});

/* ---------------- Premium ---------------- */

function premiumPrice(env: Env) {
  const n = Number(env.PREMIUM_PRICE_JPY ?? '800');
  return Number.isInteger(n) && n > 0 ? n : 800;
}

export async function activatePremium(env: Env, userId: string, providerRef: string) {
  const until = addDays(todayJst(), 30);
  await run(env.DB, 'UPDATE users SET premium_until = ? WHERE id = ?', until, userId);
  await run(
    env.DB,
    "INSERT INTO premium_subscriptions (id, user_id, status, price_jpy, current_period_end, provider_ref) VALUES (?, ?, 'active', ?, ?, ?)",
    newId(),
    userId,
    premiumPrice(env),
    until,
    providerRef,
  );
}

export const premiumRoutes = new Hono<AppBindings>();

premiumRoutes.get('/', async (c) => {
  const user = c.get('user');
  const sub = user
    ? await first<{ status: string; current_period_end: string }>(
        c.env.DB,
        'SELECT status, current_period_end FROM premium_subscriptions WHERE user_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1',
        user.id,
      )
    : null;
  return c.json({
    priceJpy: premiumPrice(c.env),
    taxLabel: c.env.PREMIUM_PRICE_TAX_LABEL ?? '税込',
    active: !!user?.isPremium,
    until: sub?.current_period_end ?? null,
    cancelled: sub?.status === 'cancelled',
  });
});

premiumRoutes.post('/subscribe', async (c) => {
  const user = requireUser(c);
  if (user.isPremium) throw new HttpError(409, 'already_premium', '既にプレミアム会員です');
  const provider = getPaymentProvider(c.env);
  if (provider.kind === 'mock') {
    await activatePremium(c.env, user.id, `mock_premium_${crypto.randomUUID()}`);
    return c.json({ ok: true });
  }
  const session = await provider.createCheckout({
    requestId: `premium_${user.id}`,
    title: 'プレミアム会員（1か月）',
    amount: premiumPrice(c.env),
    successUrl: `${c.env.APP_ORIGIN}/settings?premium=success`,
    cancelUrl: `${c.env.APP_ORIGIN}/settings?premium=cancel`,
  });
  return c.json({ url: session.url });
});

premiumRoutes.post('/cancel', async (c) => {
  const user = requireUser(c);
  await run(
    c.env.DB,
    "UPDATE premium_subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
    user.id,
  );
  return c.json({ ok: true });
});

/* ---------------- Promotions (上位表示予約・広告の枠組み) ---------------- */

export const promotionRoutes = new Hono<AppBindings>();

promotionRoutes.get('/', async (c) => {
  const user = requireUser(c);
  const rows = await all(
    c.env.DB,
    `SELECT pr.id, pr.post_id AS postId, p.title, pr.start_date AS startDate, pr.end_date AS endDate, pr.status, pr.label
     FROM promotions pr JOIN posts p ON p.id = pr.post_id WHERE pr.user_id = ? ORDER BY pr.start_date DESC`,
    user.id,
  );
  return c.json({ promotions: rows });
});

promotionRoutes.post('/', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, promotionSchema);
  const post = await first(
    c.env.DB,
    'SELECT 1 FROM posts WHERE id = ? AND author_id = ?',
    b.postId,
    user.id,
  );
  if (!post) throw notFound();
  const today = todayJst();
  if (b.startDate < today || b.endDate < b.startDate || daysBetween(b.startDate, b.endDate) > 13) {
    throw new HttpError(400, 'invalid_range', '期間は本日以降、最長14日間で指定してください');
  }
  const id = newId();
  // Payment for promotions is out of scope for the MVP (framework only).
  await run(
    c.env.DB,
    "INSERT INTO promotions (id, post_id, user_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, 'reserved')",
    id,
    b.postId,
    user.id,
    b.startDate,
    b.endDate,
  );
  await applyPromotions(c.env.DB, today);
  return c.json({ id }, 201);
});

promotionRoutes.delete('/:id', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const n = await run(
    c.env.DB,
    "UPDATE promotions SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status IN ('reserved', 'active')",
    id,
    user.id,
  );
  if (n === 0) throw notFound();
  await applyPromotions(c.env.DB, todayJst());
  return c.json({ ok: true });
});

/** Daily: activates/ends promotions and syncs `posts.is_promoted_until`. */
export async function applyPromotions(db: D1Database, today: string) {
  await run(
    db,
    "UPDATE promotions SET status = 'ended' WHERE status IN ('reserved','active') AND end_date < ?",
    today,
  );
  await run(
    db,
    "UPDATE promotions SET status = 'active' WHERE status = 'reserved' AND start_date <= ? AND end_date >= ?",
    today,
    today,
  );
  await run(
    db,
    `UPDATE posts SET is_promoted_until = (
       SELECT MAX(end_date) FROM promotions pr WHERE pr.post_id = posts.id AND pr.status = 'active')`,
  );
}

/* ---------------- Digital sales (framework only) ---------------- */

export const productRoutes = new Hono<AppBindings>();

productRoutes.get('/', async (c) => {
  const user = requireUser(c);
  const rows = await all(
    c.env.DB,
    'SELECT id, title, price, status FROM digital_products WHERE creator_id = ? ORDER BY created_at DESC',
    user.id,
  );
  const rate = Number(c.env.DIGITAL_SALES_FEE_RATE ?? '0.15');
  return c.json({ products: rows, feeRate: Number.isFinite(rate) ? rate : 0.15 });
});

productRoutes.post('/', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, digitalProductSchema);
  const id = newId();
  await run(
    c.env.DB,
    "INSERT INTO digital_products (id, creator_id, title, price, status) VALUES (?, ?, ?, ?, 'draft')",
    id,
    user.id,
    b.title,
    b.price,
  );
  return c.json({ id }, 201);
});

/* ---------------- Age confirmation ---------------- */

export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty! - by!;
  if (tm! < bm! || (tm === bm && td! < bd!)) age--;
  return age;
}

export const ageRoutes = new Hono<AppBindings>();

/**
 * Self-declared birth date. Only the result (18+ flag and timestamp) is
 * stored; the birth date itself is discarded (data minimisation).
 */
ageRoutes.post('/', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, ageConfirmSchema);
  const age = ageOn(b.birthDate, todayJst());
  if (age < 0 || age > 120)
    throw new HttpError(400, 'invalid_birth_date', '生年月日が正しくありません');
  if (age < 18) {
    throw new HttpError(403, 'under_18', '有償の依頼は18歳以上の方のみ利用できます');
  }
  await run(
    c.env.DB,
    "UPDATE users SET age_confirmed_adult = 1, age_confirmed_at = datetime('now') WHERE id = ?",
    user.id,
  );
  return c.json({ ok: true });
});
