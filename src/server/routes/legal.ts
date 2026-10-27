import { Hono } from 'hono';
import { reportSchema } from '../../shared/schemas';
import type { AppBindings } from '../env';
import { all, newId, run } from '../lib/db';
import { HttpError } from '../lib/errors';
import { randomToken } from '../lib/crypto';
import { rateLimit } from '../lib/security';
import { destroySession, requireUser } from '../lib/session';
import { parseJson } from '../lib/validate';

export const legalRoutes = new Hono<AppBindings>();

/** 特定商取引法に基づく表記: operator details come from environment secrets only. */
legalRoutes.get('/business', (c) => {
  const v = (s: string | undefined) => (s && s.trim() ? s : null);
  return c.json({
    name: v(c.env.BUSINESS_NAME),
    address: v(c.env.BUSINESS_ADDRESS),
    phone: v(c.env.BUSINESS_PHONE),
    contact: v(c.env.BUSINESS_CONTACT),
    feeRate: Number(c.env.PLATFORM_FEE_RATE ?? '0.1'),
    premiumPriceJpy: Number(c.env.PREMIUM_PRICE_JPY ?? '800'),
    premiumTaxLabel: c.env.PREMIUM_PRICE_TAX_LABEL ?? '税込',
  });
});

export const reportRoutes = new Hono<AppBindings>();

/** 通報 / 著作権侵害の削除申立. Available without login so rights holders can report. */
reportRoutes.post('/', rateLimit('report', 5, 3600), async (c) => {
  const b = await parseJson(c, reportSchema);
  const id = newId();
  await run(
    c.env.DB,
    'INSERT INTO reports (id, reporter_id, target_type, target_id, kind, details) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    c.get('user')?.id ?? null,
    b.targetType,
    b.targetId,
    b.kind,
    b.details,
  );
  return c.json({ id }, 201);
});

export const accountRoutes = new Hono<AppBindings>();

/**
 * Account deletion. Profile, posts (and media), favourites, folders, follows,
 * notifications and creator settings are deleted. Request and payment records
 * are retained for the legally required period with the user anonymised.
 */
accountRoutes.delete('/', async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const active = await all(
    db,
    "SELECT id FROM requests WHERE (creator_id = ?1 OR client_id = ?1) AND status IN ('paid', 'delivered')",
    user.id,
  );
  if (active.length > 0) {
    throw new HttpError(
      409,
      'active_requests',
      '進行中の依頼があるため削除できません。完了またはキャンセル後に再度お試しください',
    );
  }
  await run(
    db,
    "UPDATE requests SET status = 'cancelled', payout_status = 'not_applicable' WHERE (creator_id = ?1 OR client_id = ?1) AND status = 'pending_payment'",
    user.id,
  );
  const media = await all<{ media_key: string }>(
    db,
    'SELECT media_key FROM posts WHERE author_id = ? AND media_key IS NOT NULL',
    user.id,
  );
  if (media.length) await c.env.MEDIA.delete(media.map((m) => m.media_key));
  await run(
    db,
    'DELETE FROM posts_fts WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)',
    user.id,
  );
  for (const sql of [
    'DELETE FROM posts WHERE author_id = ?',
    'DELETE FROM favorites WHERE user_id = ?',
    'DELETE FROM folders WHERE user_id = ?',
    'DELETE FROM follows WHERE follower_id = ?1 OR creator_id = ?1',
    'DELETE FROM notifications WHERE user_id = ?',
    'DELETE FROM request_templates WHERE creator_id = ?',
    'DELETE FROM creator_settings WHERE user_id = ?',
    'DELETE FROM promotions WHERE user_id = ?',
    'DELETE FROM digital_products WHERE creator_id = ?',
    'DELETE FROM premium_subscriptions WHERE user_id = ?',
  ]) {
    await run(db, sql, user.id);
  }
  await run(
    db,
    `UPDATE users SET google_sub = NULL, handle = ?, display_name = '退会したユーザー', avatar_url = NULL, bio = '',
       decoration = '', is_creator = 0, accepting_requests = 0, stripe_account_id = NULL, premium_until = NULL,
       deleted_at = datetime('now') WHERE id = ?`,
    `deleted-${randomToken(9)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, 'x')}`,
    user.id,
  );
  await destroySession(c);
  return c.json({ ok: true });
});
