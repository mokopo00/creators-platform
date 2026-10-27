import { Hono } from 'hono';
import {
  feedQuerySchema,
  idSchema,
  postCreateSchema,
  postUpdateSchema,
} from '../../shared/schemas';
import type { AppBindings } from '../env';
import { requirePostOwner } from '../lib/authz';
import { all, first, newId, run, todayJst } from '../lib/db';
import { HttpError, notFound } from '../lib/errors';
import {
  bumpDailyStat,
  notifyFollowersOfNewPost,
  POST_SELECT,
  reindexPost,
  setHashtags,
  toPostDto,
  type PostRow,
} from '../lib/posts';
import { rateLimit } from '../lib/security';
import { requireUser } from '../lib/session';
import { parseJson, parseParam, parseQuery } from '../lib/validate';
import { assertOwnMedia } from './uploads';

export const postRoutes = new Hono<AppBindings>();

postRoutes.post('/', rateLimit('post', 20, 3600), async (c) => {
  const user = requireUser(c);
  const body = await parseJson(c, postCreateSchema);
  if (body.aiGenerated && c.env.ALLOW_AI_GENERATED !== 'true') {
    throw new HttpError(422, 'ai_generated_not_allowed', 'AI 生成作品は現在投稿できません');
  }
  if (body.mediaKey) {
    await assertOwnMedia(c.env.MEDIA, body.mediaKey, user.id);
    const used = await first(c.env.DB, 'SELECT 1 FROM posts WHERE media_key = ?', body.mediaKey);
    if (used) throw new HttpError(409, 'media_in_use', 'このファイルは既に使用されています');
  }
  const id = newId();
  await run(
    c.env.DB,
    `INSERT INTO posts (id, author_id, title, body, lang, media_type, media_key, field, ai_assisted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    user.id,
    body.title,
    body.body,
    body.lang,
    body.mediaType,
    body.mediaType === 'text' ? null : (body.mediaKey ?? null),
    body.field,
    body.aiAssisted ? 1 : 0,
  );
  await run(c.env.DB, 'UPDATE users SET is_creator = 1 WHERE id = ?', user.id);
  await setHashtags(c.env.DB, id, body.hashtags);
  await reindexPost(c.env.DB, id);
  await notifyFollowersOfNewPost(c.env.DB, user.id, user.displayName, id);
  return c.json({ id }, 201);
});

postRoutes.get('/:id', async (c) => {
  const id = parseParam(c.req.param('id'), idSchema);
  const viewer = c.get('user')?.id ?? '';
  const row = await first<PostRow>(c.env.DB, `${POST_SELECT} WHERE p.id = ?`, viewer, id);
  if (!row) throw notFound();
  if (row.author_id !== viewer) {
    await run(c.env.DB, 'UPDATE posts SET view_count = view_count + 1 WHERE id = ?', id);
    await bumpDailyStat(c.env.DB, id, 'views');
  }
  return c.json({ post: toPostDto(row), isOwner: row.author_id === viewer });
});

postRoutes.patch('/:id', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  await requirePostOwner(c.env.DB, id, user.id);
  const body = await parseJson(c, postUpdateSchema);
  await run(
    c.env.DB,
    `UPDATE posts SET
       title = COALESCE(?, title), body = COALESCE(?, body), field = COALESCE(?, field),
       ai_assisted = COALESCE(?, ai_assisted), updated_at = datetime('now')
     WHERE id = ? AND author_id = ?`,
    body.title ?? null,
    body.body ?? null,
    body.field ?? null,
    body.aiAssisted === undefined ? null : body.aiAssisted ? 1 : 0,
    id,
    user.id,
  );
  if (body.hashtags) await setHashtags(c.env.DB, id, body.hashtags);
  await reindexPost(c.env.DB, id);
  return c.json({ ok: true });
});

postRoutes.delete('/:id', async (c) => {
  const user = requireUser(c);
  const id = parseParam(c.req.param('id'), idSchema);
  await requirePostOwner(c.env.DB, id, user.id);
  const row = await first<{ media_key: string | null }>(
    c.env.DB,
    'SELECT media_key FROM posts WHERE id = ?',
    id,
  );
  await run(c.env.DB, 'DELETE FROM posts_fts WHERE post_id = ?', id);
  await run(c.env.DB, 'DELETE FROM posts WHERE id = ? AND author_id = ?', id, user.id);
  if (row?.media_key) await c.env.MEDIA.delete(row.media_key);
  return c.json({ ok: true });
});

export const feedRoutes = new Hono<AppBindings>();

/** 新着 / おすすめ timeline with optional field and hashtag filters. */
feedRoutes.get('/', async (c) => {
  const q = parseQuery(c, feedQuerySchema);
  const viewer = c.get('user')?.id ?? '';
  const where: string[] = [];
  const params: unknown[] = [viewer];
  if (q.field) {
    where.push('p.field = ?');
    params.push(q.field);
  }
  if (q.tag) {
    where.push('EXISTS (SELECT 1 FROM post_hashtags h2 WHERE h2.post_id = p.id AND h2.tag = ?)');
    params.push(q.tag.toLowerCase());
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = 'ORDER BY p.created_at DESC, p.id DESC';
  if (q.tab === 'recommended') {
    // Promoted posts first (PR label shown), then posts matching the viewer's
    // favourite fields/tags and followed creators, then overall popularity.
    orderSql = `ORDER BY
      (p.is_promoted_until IS NOT NULL AND p.is_promoted_until >= ?) DESC,
      (CASE WHEN p.author_id IN (SELECT creator_id FROM follows WHERE follower_id = ?) THEN 3 ELSE 0 END
       + CASE WHEN p.field IN (SELECT p2.field FROM favorites f2 JOIN posts p2 ON p2.id = f2.post_id WHERE f2.user_id = ?) THEN 2 ELSE 0 END
       + CASE WHEN EXISTS (SELECT 1 FROM post_hashtags h3 WHERE h3.post_id = p.id AND h3.tag IN (
           SELECT h4.tag FROM favorites f3 JOIN post_hashtags h4 ON h4.post_id = f3.post_id WHERE f3.user_id = ?)) THEN 2 ELSE 0 END
      ) DESC,
      (p.save_count * 3 + p.view_count) DESC, p.created_at DESC`;
    params.push(todayJst(), viewer, viewer, viewer);
  }
  const rows = await all<PostRow>(
    c.env.DB,
    `${POST_SELECT} ${whereSql} ${orderSql} LIMIT 60`,
    ...params,
  );
  return c.json({ posts: rows.map(toPostDto) });
});
