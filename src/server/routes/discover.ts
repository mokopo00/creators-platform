import { Hono } from 'hono';
import { z } from 'zod';
import { FIELDS } from '../../shared/constants';
import { folderSchema, hashtagSchema, idSchema, searchQuerySchema } from '../../shared/schemas';
import type { AppBindings } from '../env';
import { requireFolderOwner } from '../lib/authz';
import { all, allow, first, newId, run } from '../lib/db';
import { HttpError, notFound } from '../lib/errors';
import { bumpDailyStat, POST_SELECT, toPostDto, type PostRow } from '../lib/posts';
import { ftsQuery, likePattern } from '../lib/search';
import { requireUser } from '../lib/session';
import { parseJson, parseParam, parseQuery } from '../lib/validate';

/* ---------------- Search ---------------- */

export const searchRoutes = new Hono<AppBindings>();

const SORTS = ['relevance', 'new', 'popular'] as const;
const ORDER_BY: Record<(typeof SORTS)[number], string> = {
  relevance: 'ORDER BY (p.save_count * 3 + p.view_count) DESC, p.created_at DESC',
  new: 'ORDER BY p.created_at DESC',
  popular: 'ORDER BY (p.save_count * 3 + p.view_count) DESC',
};

export async function searchPosts(
  db: D1Database,
  viewer: string,
  q: string,
  field?: string,
  sort?: string,
) {
  const order = ORDER_BY[allow(sort, SORTS, 'relevance')]; // dynamic ORDER BY from allow-list only
  const where: string[] = [];
  const params: unknown[] = [viewer];
  const fts = ftsQuery(q);
  if (fts) {
    where.push('p.id IN (SELECT post_id FROM posts_fts WHERE posts_fts MATCH ?)');
    params.push(fts);
  } else if (q) {
    // Too short for the trigram index: fall back to an escaped LIKE.
    const like = likePattern(q);
    where.push(
      `(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM post_hashtags h WHERE h.post_id = p.id AND h.tag LIKE ? ESCAPE '\\'))`,
    );
    params.push(like, like, like);
  }
  if (field) {
    where.push('p.field = ?');
    params.push(field);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await all<PostRow>(db, `${POST_SELECT} ${whereSql} ${order} LIMIT 60`, ...params);
  return rows.map(toPostDto);
}

searchRoutes.get('/', async (c) => {
  const q = parseQuery(c, searchQuerySchema);
  const viewer = c.get('user')?.id ?? '';
  const posts = await searchPosts(c.env.DB, viewer, q.q, q.field, q.sort);
  const creators = q.q
    ? await all<{ handle: string; display_name: string; avatar_url: string | null }>(
        c.env.DB,
        `SELECT handle, display_name, avatar_url FROM users
         WHERE deleted_at IS NULL AND is_creator = 1 AND (display_name LIKE ? ESCAPE '\\' OR handle LIKE ? ESCAPE '\\') LIMIT 10`,
        likePattern(q.q),
        likePattern(q.q),
      )
    : [];
  return c.json({
    posts,
    creators: creators.map((u) => ({
      handle: u.handle,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
    })),
  });
});

/* ---------------- Rankings ---------------- */

export const rankingRoutes = new Hono<AppBindings>();

rankingRoutes.get('/', async (c) => {
  const q = parseQuery(
    c,
    z.object({
      period: z.enum(['weekly', 'monthly']).default('weekly'),
      field: z.enum(FIELDS).optional(),
      tag: hashtagSchema.optional(),
    }),
  );
  const scope = q.tag ? `tag:${q.tag.toLowerCase()}` : q.field ? `field:${q.field}` : 'all';
  const viewer = c.get('user')?.id ?? '';
  const rows = await all<PostRow & { rank: number; score: number; computed_at: string }>(
    c.env.DB,
    `SELECT x.*, r.rank, r.score, r.computed_at FROM rankings r
     JOIN (${POST_SELECT}) x ON x.id = r.post_id
     WHERE r.period = ? AND r.scope = ? ORDER BY r.rank LIMIT 50`,
    viewer,
    q.period,
    scope,
  );
  const tags = await all<{ tag: string; n: number }>(
    c.env.DB,
    `SELECT substr(scope, 5) AS tag, SUM(score) AS n FROM rankings WHERE period = ? AND scope LIKE 'tag:%'
     GROUP BY scope ORDER BY n DESC LIMIT 20`,
    q.period,
  );
  return c.json({
    period: q.period,
    scope,
    computedAt: rows[0]?.computed_at ?? null,
    items: rows.map((r) => ({ rank: r.rank, score: r.score, post: toPostDto(r) })),
    popularTags: tags.map((t) => t.tag),
  });
});

/* ---------------- Favorites & folders ---------------- */

export const favoriteRoutes = new Hono<AppBindings>();

favoriteRoutes.get('/', async (c) => {
  const user = requireUser(c);
  const rows = await all<PostRow>(
    c.env.DB,
    `${POST_SELECT} JOIN favorites fv ON fv.post_id = p.id AND fv.user_id = ? ORDER BY fv.created_at DESC LIMIT 500`,
    user.id,
    user.id,
  );
  return c.json({ posts: rows.map(toPostDto) });
});

favoriteRoutes.post('/:postId', async (c) => {
  const user = requireUser(c);
  const postId = parseParam(c.req.param('postId'), idSchema);
  const exists = await first(c.env.DB, 'SELECT 1 FROM posts WHERE id = ?', postId);
  if (!exists) throw notFound();
  const n = await run(
    c.env.DB,
    'INSERT OR IGNORE INTO favorites (user_id, post_id) VALUES (?, ?)',
    user.id,
    postId,
  );
  if (n > 0) {
    await run(c.env.DB, 'UPDATE posts SET save_count = save_count + 1 WHERE id = ?', postId);
    await bumpDailyStat(c.env.DB, postId, 'saves');
  }
  return c.json({ ok: true });
});

favoriteRoutes.delete('/:postId', async (c) => {
  const user = requireUser(c);
  const postId = parseParam(c.req.param('postId'), idSchema);
  const n = await run(
    c.env.DB,
    'DELETE FROM favorites WHERE user_id = ? AND post_id = ?',
    user.id,
    postId,
  );
  if (n > 0)
    await run(
      c.env.DB,
      'UPDATE posts SET save_count = MAX(0, save_count - 1) WHERE id = ?',
      postId,
    );
  return c.json({ ok: true });
});

export const folderRoutes = new Hono<AppBindings>();

folderRoutes.get('/', async (c) => {
  const user = requireUser(c);
  const rows = await all<{ id: string; name: string; count: number }>(
    c.env.DB,
    `SELECT f.id, f.name, (SELECT COUNT(*) FROM folder_items i WHERE i.folder_id = f.id) AS count
     FROM folders f WHERE f.user_id = ? ORDER BY f.created_at`,
    user.id,
  );
  return c.json({ folders: rows });
});

folderRoutes.post('/', async (c) => {
  const user = requireUser(c);
  const b = await parseJson(c, folderSchema);
  const count = await first<{ n: number }>(
    c.env.DB,
    'SELECT COUNT(*) AS n FROM folders WHERE user_id = ?',
    user.id,
  );
  if ((count?.n ?? 0) >= 100) throw new HttpError(422, 'too_many', 'フォルダは100個までです');
  const id = newId();
  await run(
    c.env.DB,
    'INSERT INTO folders (id, user_id, name) VALUES (?, ?, ?)',
    id,
    user.id,
    b.name,
  );
  return c.json({ id }, 201);
});

folderRoutes.get('/:id', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  await requireFolderOwner(c.env.DB, id, user.id);
  const folder = await first<{ name: string }>(
    c.env.DB,
    'SELECT name FROM folders WHERE id = ?',
    id,
  );
  const rows = await all<PostRow>(
    c.env.DB,
    `${POST_SELECT} JOIN folder_items fi ON fi.post_id = p.id AND fi.folder_id = ? ORDER BY fi.created_at DESC`,
    user.id,
    id,
  );
  return c.json({ name: folder?.name ?? '', posts: rows.map(toPostDto) });
});

folderRoutes.delete('/:id', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  await requireFolderOwner(c.env.DB, id, user.id);
  await run(c.env.DB, 'DELETE FROM folders WHERE id = ? AND user_id = ?', id, user.id);
  return c.json({ ok: true });
});

folderRoutes.post('/:id/items', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  await requireFolderOwner(c.env.DB, id, user.id);
  const { postId } = await parseJson(c, z.object({ postId: idSchema }));
  const exists = await first(c.env.DB, 'SELECT 1 FROM posts WHERE id = ?', postId);
  if (!exists) throw notFound();
  await run(
    c.env.DB,
    'INSERT OR IGNORE INTO folder_items (folder_id, post_id) VALUES (?, ?)',
    id,
    postId,
  );
  return c.json({ ok: true });
});

folderRoutes.delete('/:id/items/:postId', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const postId = parseParam(c.req.param('postId'), idSchema);
  await requireFolderOwner(c.env.DB, id, user.id);
  await run(c.env.DB, 'DELETE FROM folder_items WHERE folder_id = ? AND post_id = ?', id, postId);
  return c.json({ ok: true });
});

/* ---------------- Notifications ---------------- */

export const notificationRoutes = new Hono<AppBindings>();

notificationRoutes.get('/', async (c) => {
  const user = requireUser(c);
  const rows = await all(
    c.env.DB,
    `SELECT id, kind, message, link, read_at AS readAt, created_at AS createdAt
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100`,
    user.id,
  );
  return c.json({ notifications: rows });
});

notificationRoutes.post('/read-all', async (c) => {
  const user = requireUser(c);
  await run(
    c.env.DB,
    "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL",
    user.id,
  );
  return c.json({ ok: true });
});

notificationRoutes.post('/:id/read', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  const n = await run(
    c.env.DB,
    "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (n === 0) throw notFound();
  return c.json({ ok: true });
});
