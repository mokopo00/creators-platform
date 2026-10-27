import { Hono } from 'hono';
import {
  creatorSettingsSchema,
  handleSchema,
  idSchema,
  profileUpdateSchema,
  templateSchema,
} from '../../shared/schemas';
import type { AppBindings } from '../env';
import { all, first, newId, run, todayJst } from '../lib/db';
import { HttpError, notFound } from '../lib/errors';
import { POST_SELECT, toPostDto, type PostRow } from '../lib/posts';
import { requireUser } from '../lib/session';
import { parseJson, parseParam } from '../lib/validate';

type UserRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  bio_lang: string;
  is_creator: number;
  theme: string;
  decoration: string;
  accepting_requests: number;
  monthly_capacity: number;
};

type SettingsRow = {
  price_list: string;
  sample_post_ids: string;
  notes: string;
  production_days: number;
  payment_terms: string;
  retake_count: number;
};

const DEFAULT_SETTINGS: SettingsRow = {
  price_list: '[]',
  sample_post_ids: '[]',
  notes: '',
  production_days: 14,
  payment_terms: '依頼確定時に前払い',
  retake_count: 2,
};

function parseJsonArray(s: string): unknown[] {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function loadCreatorProfile(db: D1Database, handle: string, viewer: string) {
  const u = await first<UserRow>(
    db,
    `SELECT id, handle, display_name, avatar_url, bio, bio_lang, is_creator, theme, decoration,
            accepting_requests, monthly_capacity
     FROM users WHERE handle = ? AND deleted_at IS NULL`,
    handle,
  );
  if (!u) throw notFound();
  const s =
    (await first<SettingsRow>(db, 'SELECT * FROM creator_settings WHERE user_id = ?', u.id)) ??
    DEFAULT_SETTINGS;
  const month = todayJst().slice(0, 7);
  const stats = await first<{
    completed: number;
    this_month: number;
    followers: number;
    following: number;
  }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM requests WHERE creator_id = ?1 AND status = 'completed') AS completed,
       (SELECT COUNT(*) FROM requests WHERE creator_id = ?1 AND status IN ('paid','delivered','completed')
          AND substr(paid_at, 1, 7) = ?2) AS this_month,
       (SELECT COUNT(*) FROM follows WHERE creator_id = ?1) AS followers,
       EXISTS (SELECT 1 FROM follows WHERE creator_id = ?1 AND follower_id = ?3) AS following`,
    u.id,
    month,
    viewer,
  );
  const sampleIds = parseJsonArray(s.sample_post_ids).filter(
    (x): x is string => typeof x === 'string',
  );
  const samples = sampleIds.length
    ? (
        await all<PostRow>(
          db,
          `${POST_SELECT} WHERE p.author_id = ? AND p.id IN (SELECT value FROM json_each(?))`,
          viewer,
          u.id,
          JSON.stringify(sampleIds),
        )
      ).map(toPostDto)
    : [];
  const templates = await all<{ id: string; title: string; body: string }>(
    db,
    'SELECT id, title, body FROM request_templates WHERE creator_id = ? ORDER BY created_at',
    u.id,
  );
  return {
    user: {
      id: u.id,
      handle: u.handle,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      bio: u.bio,
      bioLang: u.bio_lang,
      isCreator: u.is_creator === 1,
      theme: u.theme,
      decoration: u.decoration,
      acceptingRequests: u.accepting_requests === 1,
      monthlyCapacity: u.monthly_capacity,
      remainingThisMonth: Math.max(0, u.monthly_capacity - (stats?.this_month ?? 0)),
      completedCount: stats?.completed ?? 0,
      followerCount: stats?.followers ?? 0,
      isFollowing: stats?.following === 1,
      isSelf: u.id === viewer,
    },
    settings: {
      priceList: parseJsonArray(s.price_list),
      samplePostIds: sampleIds,
      samples,
      notes: s.notes,
      productionDays: s.production_days,
      paymentTerms: s.payment_terms,
      retakeCount: s.retake_count,
    },
    templates,
  };
}

export const userRoutes = new Hono<AppBindings>();

userRoutes.get('/:handle', async (c) => {
  const handle = parseParam(c.req.param('handle'), handleSchema);
  const viewer = c.get('user')?.id ?? '';
  const profile = await loadCreatorProfile(c.env.DB, handle, viewer);
  const posts = await all<PostRow>(
    c.env.DB,
    `${POST_SELECT} WHERE p.author_id = ? ORDER BY p.created_at DESC LIMIT 60`,
    viewer,
    profile.user.id,
  );
  return c.json({ ...profile, posts: posts.map(toPostDto) });
});

userRoutes.post('/:handle/follow', async (c) => {
  const user = requireUser(c);
  const handle = parseParam(c.req.param('handle'), handleSchema);
  const target = await first<{ id: string }>(
    c.env.DB,
    'SELECT id FROM users WHERE handle = ? AND deleted_at IS NULL',
    handle,
  );
  if (!target) throw notFound();
  if (target.id === user.id) throw new HttpError(400, 'self_follow', '自分はフォローできません');
  await run(
    c.env.DB,
    'INSERT OR IGNORE INTO follows (follower_id, creator_id) VALUES (?, ?)',
    user.id,
    target.id,
  );
  return c.json({ ok: true });
});

userRoutes.delete('/:handle/follow', async (c) => {
  const user = requireUser(c);
  const handle = parseParam(c.req.param('handle'), handleSchema);
  await run(
    c.env.DB,
    'DELETE FROM follows WHERE follower_id = ? AND creator_id = (SELECT id FROM users WHERE handle = ?)',
    user.id,
    handle,
  );
  return c.json({ ok: true });
});

/* ---- Own profile / creator settings ---- */

export const profileRoutes = new Hono<AppBindings>();

profileRoutes.get('/settings', async (c) => {
  const user = requireUser(c);
  return c.json(await loadCreatorProfile(c.env.DB, user.handle, user.id));
});

profileRoutes.patch('/profile', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, profileUpdateSchema);
  if (b.handle && b.handle !== user.handle) {
    const taken = await first(c.env.DB, 'SELECT 1 FROM users WHERE handle = ?', b.handle);
    if (taken) throw new HttpError(409, 'handle_taken', 'このユーザー名は使用されています');
  }
  const bool = (v: boolean | undefined) => (v === undefined ? null : v ? 1 : 0);
  await run(
    c.env.DB,
    `UPDATE users SET
       handle = COALESCE(?, handle), display_name = COALESCE(?, display_name), bio = COALESCE(?, bio),
       bio_lang = COALESCE(?, bio_lang), theme = COALESCE(?, theme), decoration = COALESCE(?, decoration),
       is_creator = COALESCE(?, is_creator), accepting_requests = COALESCE(?, accepting_requests),
       monthly_capacity = COALESCE(?, monthly_capacity)
     WHERE id = ?`,
    b.handle ?? null,
    b.displayName ?? null,
    b.bio ?? null,
    b.bioLang ?? null,
    b.theme ?? null,
    b.decoration ?? null,
    bool(b.isCreator),
    bool(b.acceptingRequests),
    b.monthlyCapacity ?? null,
    user.id,
  );
  return c.json({ ok: true });
});

profileRoutes.put('/creator-settings', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, creatorSettingsSchema);
  // Samples must be the creator's own posts.
  const own = await all<{ id: string }>(
    c.env.DB,
    'SELECT id FROM posts WHERE author_id = ? AND id IN (SELECT value FROM json_each(?))',
    user.id,
    JSON.stringify(b.samplePostIds),
  );
  const ownIds = new Set(own.map((r) => r.id));
  const samples = b.samplePostIds.filter((id) => ownIds.has(id));
  await run(
    c.env.DB,
    `INSERT INTO creator_settings (user_id, price_list, sample_post_ids, notes, production_days, payment_terms, retake_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET price_list = excluded.price_list, sample_post_ids = excluded.sample_post_ids,
       notes = excluded.notes, production_days = excluded.production_days, payment_terms = excluded.payment_terms,
       retake_count = excluded.retake_count`,
    user.id,
    JSON.stringify(b.priceList),
    JSON.stringify(samples),
    b.notes,
    b.productionDays,
    b.paymentTerms,
    b.retakeCount,
  );
  await run(c.env.DB, 'UPDATE users SET is_creator = 1 WHERE id = ?', user.id);
  return c.json({ ok: true });
});

profileRoutes.post('/templates', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, templateSchema);
  const count = await first<{ n: number }>(
    c.env.DB,
    'SELECT COUNT(*) AS n FROM request_templates WHERE creator_id = ?',
    user.id,
  );
  if ((count?.n ?? 0) >= 20) throw new HttpError(422, 'too_many', 'テンプレートは20件までです');
  const id = newId();
  await run(
    c.env.DB,
    'INSERT INTO request_templates (id, creator_id, title, body) VALUES (?, ?, ?, ?)',
    id,
    user.id,
    b.title,
    b.body,
  );
  return c.json({ id }, 201);
});

profileRoutes.delete('/templates/:id', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const n = await run(
    c.env.DB,
    'DELETE FROM request_templates WHERE id = ? AND creator_id = ?',
    id,
    user.id,
  );
  if (n === 0) throw notFound();
  return c.json({ ok: true });
});
