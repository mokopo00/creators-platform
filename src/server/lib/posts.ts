import { all, run, todayJst } from './db';

export type PostRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  lang: string;
  media_type: string;
  media_key: string | null;
  field: string;
  ai_assisted: number;
  is_promoted_until: string | null;
  view_count: number;
  save_count: number;
  created_at: string;
  updated_at: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  tags: string | null;
  favorited?: number;
};

/** Base SELECT joined with the author and aggregated hashtags. `?` = viewer id. */
export const POST_SELECT = `
  SELECT p.*, u.handle, u.display_name, u.avatar_url,
    (SELECT group_concat(tag, ' ') FROM post_hashtags h WHERE h.post_id = p.id) AS tags,
    EXISTS (SELECT 1 FROM favorites f WHERE f.post_id = p.id AND f.user_id = ?) AS favorited
  FROM posts p JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL`;

export function toPostDto(r: PostRow) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    lang: r.lang,
    mediaType: r.media_type,
    mediaUrl: r.media_key ? `/${r.media_key}` : null,
    field: r.field,
    hashtags: r.tags ? r.tags.split(' ').filter(Boolean) : [],
    aiAssisted: r.ai_assisted === 1,
    promoted: !!r.is_promoted_until && r.is_promoted_until >= todayJst(),
    viewCount: r.view_count,
    saveCount: r.save_count,
    createdAt: r.created_at,
    isFavorited: r.favorited === 1,
    author: {
      id: r.author_id,
      handle: r.handle,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
    },
  };
}
export type PostDto = ReturnType<typeof toPostDto>;

export async function setHashtags(db: D1Database, postId: string, tags: string[]) {
  await run(db, 'DELETE FROM post_hashtags WHERE post_id = ?', postId);
  for (const tag of [...new Set(tags.map((t) => t.toLowerCase()))]) {
    await run(db, 'INSERT INTO post_hashtags (post_id, tag) VALUES (?, ?)', postId, tag);
  }
}

export async function reindexPost(db: D1Database, postId: string) {
  await run(db, 'DELETE FROM posts_fts WHERE post_id = ?', postId);
  await run(
    db,
    `INSERT INTO posts_fts (post_id, title, body, tags)
     SELECT p.id, p.title, p.body, COALESCE((SELECT group_concat(tag, ' ') FROM post_hashtags WHERE post_id = p.id), '')
     FROM posts p WHERE p.id = ?`,
    postId,
  );
}

export async function bumpDailyStat(
  db: D1Database,
  postId: string,
  column: 'views' | 'saves',
  delta = 1,
) {
  const col = column === 'views' ? 'views' : 'saves'; // allow-listed column name
  await run(
    db,
    `INSERT INTO post_daily_stats (post_id, day, ${col}) VALUES (?, ?, ?)
     ON CONFLICT (post_id, day) DO UPDATE SET ${col} = ${col} + excluded.${col}`,
    postId,
    todayJst(),
    delta,
  );
}

export async function notify(
  db: D1Database,
  userId: string,
  kind: string,
  message: string,
  link: string,
) {
  await run(
    db,
    'INSERT INTO notifications (id, user_id, kind, message, link) VALUES (?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    userId,
    kind,
    message,
    link,
  );
}

export async function notifyFollowersOfNewPost(
  db: D1Database,
  authorId: string,
  displayName: string,
  postId: string,
) {
  const followers = await all<{ follower_id: string }>(
    db,
    'SELECT follower_id FROM follows WHERE creator_id = ?',
    authorId,
  );
  for (const f of followers) {
    await notify(
      db,
      f.follower_id,
      'new_post',
      `${displayName} さんが新作を投稿しました`,
      `/posts/${postId}`,
    );
  }
}
