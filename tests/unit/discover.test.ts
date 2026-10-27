import { describe, expect, it } from 'vitest';
import { todayJst } from '../../src/server/lib/db';
import { computeRankings } from '../../src/server/lib/rankings';
import { ftsPhrase, ftsQuery, likePattern } from '../../src/server/lib/search';
import { setup } from './helpers/client';
import { createPost } from './helpers/fixtures';

type PostList = { posts: { id: string; title: string }[] };

const INJECTIONS = [
  "' OR 1=1 --",
  "'; DROP TABLE users; --",
  '" OR ""="',
  "1' UNION SELECT id, google_sub, handle, display_name, avatar_url FROM users --",
  'NEAR(a b) OR * AND',
  '%',
  '_',
  '\\',
  "abc') OR ('1'='1",
  'title:* OR body:*',
  '"""',
  'テスト" OR "1"="1',
];

describe('SQL injection resistance', () => {
  it('search treats injection payloads as plain text and does not error or leak', async () => {
    const { client, sqlite } = setup();
    const c = client();
    await c.login('test-creator-01');
    await createPost(c, { title: '秘密ではない作品' });
    for (const q of INJECTIONS) {
      const res = await c.get(`/api/search?q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      const body = (await res.json()) as PostList & { creators: unknown[] };
      // None of the payloads appear in any post, so nothing should match.
      expect(body.posts, q).toHaveLength(0);
      expect(JSON.stringify(body)).not.toContain('google_sub');
      expect(JSON.stringify(body)).not.toContain('mock:');
    }
    // Tables still exist and data is intact
    const n = sqlite.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(n.n).toBe(1);
  });

  it('injection payloads in path params, query and bodies are rejected or harmless', async () => {
    const { client, sqlite } = setup();
    const c = client();
    await c.login('test-creator-01');
    const id = await createPost(c);
    for (const q of INJECTIONS) {
      const enc = encodeURIComponent(q);
      expect([400, 404]).toContain((await c.get(`/api/posts/${enc}`)).status);
      expect([400, 404]).toContain((await c.get(`/api/users/${enc}`)).status);
      expect([200, 400]).toContain((await c.get(`/api/feed?tag=${enc}`)).status);
      expect([200, 400]).toContain((await c.get(`/api/rankings?tag=${enc}`)).status);
      expect([200, 400]).toContain((await c.get(`/api/search?q=x&sort=${enc}`)).status);
      // Stored as plain text when it is a valid value
      expect((await c.patch(`/api/posts/${id}`, { title: q })).status).toBe(200);
      const r = (await (await c.get(`/api/posts/${id}`)).json()) as { post: { title: string } };
      expect(r.post.title).toBe(q.trim());
    }
    const tables = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('users','posts','requests')",
      )
      .get() as { n: number };
    expect(tables.n).toBe(3);
  });

  it('escapes FTS5 and LIKE input', () => {
    expect(ftsPhrase('a"b')).toBe('"a""b"');
    expect(ftsQuery('ab')).toBeNull();
    expect(ftsQuery('abc OR def')).toBe('"abc" AND "def"');
    expect(likePattern('50%_\\')).toBe('%50\\%\\_\\\\%');
  });
});

describe('search', () => {
  it('finds posts by title, body and hashtag (trigram and short queries)', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    const a = await createPost(c, { title: '夕焼けの海辺', hashtags: ['風景'] });
    await createPost(c, { title: '山の朝', hashtags: ['山'] });
    const long = (await (
      await c.get(`/api/search?q=${encodeURIComponent('夕焼けの')}`)
    ).json()) as PostList;
    expect(long.posts.map((p) => p.id)).toEqual([a]);
    const short = (await (
      await c.get(`/api/search?q=${encodeURIComponent('海辺')}`)
    ).json()) as PostList;
    expect(short.posts.map((p) => p.id)).toEqual([a]);
  });
});

describe('rankings', () => {
  it('computes weekly rankings by field and hashtag from views and saves', async () => {
    const { client, env } = setup();
    const creator = client();
    const viewer = client();
    await creator.login('test-creator-01');
    await viewer.login('test-viewer-01');
    const a = await createPost(creator, { field: 'illustration', hashtags: ['花'] });
    const b = await createPost(creator, { field: '3dcg', hashtags: ['花'] });
    await viewer.get(`/api/posts/${a}`);
    await viewer.get(`/api/posts/${b}`);
    await viewer.post(`/api/favorites/${b}`);
    await computeRankings(env.DB, todayJst());
    type R = { items: { rank: number; post: { id: string } }[] };
    const all = (await (await viewer.get('/api/rankings?period=weekly')).json()) as R;
    expect(all.items.map((i) => i.post.id)).toEqual([b, a]);
    const byField = (await (
      await viewer.get('/api/rankings?period=weekly&field=illustration')
    ).json()) as R;
    expect(byField.items.map((i) => i.post.id)).toEqual([a]);
    const byTag = (await (
      await viewer.get(`/api/rankings?tag=${encodeURIComponent('花')}`)
    ).json()) as R;
    expect(byTag.items).toHaveLength(2);
  });
});

describe('favorites, folders and notifications', () => {
  it('folders are private to their owner (IDOR)', async () => {
    const { client } = setup();
    const a = client();
    const b = client();
    await a.login('test-user-a');
    await b.login('test-user-b');
    const postId = await createPost(a);
    const { id } = (await (await a.post('/api/folders', { name: 'お気に入り資料' })).json()) as {
      id: string;
    };
    expect((await a.post(`/api/folders/${id}/items`, { postId })).status).toBe(200);
    expect((await b.get(`/api/folders/${id}`)).status).toBe(404);
    expect((await b.post(`/api/folders/${id}/items`, { postId })).status).toBe(404);
    expect((await b.delete(`/api/folders/${id}`)).status).toBe(404);
    const own = (await (await a.get(`/api/folders/${id}`)).json()) as PostList;
    expect(own.posts).toHaveLength(1);
  });

  it('favorites are unlimited and update the save count', async () => {
    const { client } = setup();
    const a = client();
    await a.login('test-user-a');
    const ids: string[] = [];
    for (let i = 0; i < 15; i++) ids.push(await createPost(a, { title: `作品${i}` }));
    for (const id of ids) expect((await a.post(`/api/favorites/${id}`)).status).toBe(200);
    const favs = (await (await a.get('/api/favorites')).json()) as PostList;
    expect(favs.posts).toHaveLength(15);
  });

  it('notifies followers of new posts; notifications are private', async () => {
    const { client } = setup();
    const creator = client();
    const fan = client();
    await creator.login('test-creator-01');
    await fan.login('test-fan-01');
    await createPost(creator); // makes them a creator
    await fan.post('/api/users/test-creator-01/follow');
    await createPost(creator, { title: '新作' });
    type N = { notifications: { id: string; kind: string }[] };
    const n = (await (await fan.get('/api/notifications')).json()) as N;
    expect(n.notifications.some((x) => x.kind === 'new_post')).toBe(true);
    const id = n.notifications[0]!.id;
    expect((await creator.post(`/api/notifications/${id}/read`)).status).toBe(404);
    expect((await fan.post(`/api/notifications/${id}/read`)).status).toBe(200);
  });
});
