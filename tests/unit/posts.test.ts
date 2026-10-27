import { describe, expect, it } from 'vitest';
import { setup } from './helpers/client';
import { createPost, jpegWithExif, pngBytes, uploadImage } from './helpers/fixtures';

describe('uploads', () => {
  it('strips EXIF (incl. GPS) from JPEG uploads', async () => {
    const { client, env } = setup();
    const c = client();
    await c.login('test-creator-01');
    const { key, status } = await uploadImage(c);
    expect(status).toBe(200);
    const obj = await env.MEDIA.get(key);
    const stored = new TextDecoder('latin1').decode(new Uint8Array(await obj!.arrayBuffer()));
    expect(stored).not.toContain('GPS');
    expect(stored).not.toContain('Exif');
  });

  it('rejects files whose magic bytes do not match the declared type', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    const { status } = await uploadImage(c, pngBytes(), 'image/jpeg');
    expect(status).toBe(415);
  });

  it('rejects disallowed MIME types and oversize files', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    expect((await c.post('/api/uploads', { contentType: 'text/html', size: 10 })).status).toBe(400);
    expect(
      (await c.post('/api/uploads', { contentType: 'image/png', size: 50 * 1024 * 1024 })).status,
    ).toBe(413);
  });

  it('rejects an upload URL signed for another user', async () => {
    const { client } = setup();
    const a = client();
    const b = client();
    await a.login('test-creator-01');
    await b.login('test-creator-02');
    const bytes = jpegWithExif();
    const r = await a.post('/api/uploads', { contentType: 'image/jpeg', size: bytes.length });
    const { uploadUrl } = (await r.json()) as { uploadUrl: string };
    const put = await b.req('PUT', uploadUrl, bytes, { 'content-type': 'image/jpeg' });
    expect(put.status).toBe(403);
  });
});

describe('posts', () => {
  it('creates a post that appears on the profile and in new/recommended feeds', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    const id = await createPost(c);
    const profile = (await (await c.get('/api/users/test-creator-01')).json()) as {
      posts: { id: string }[];
    };
    expect(profile.posts.map((p) => p.id)).toContain(id);
    for (const tab of ['new', 'recommended']) {
      const feed = (await (await c.get(`/api/feed?tab=${tab}`)).json()) as {
        posts: { id: string }[];
      };
      expect(feed.posts.map((p) => p.id)).toContain(id);
    }
  });

  it('filters by field and hashtag', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    const a = await createPost(c, { field: 'illustration', hashtags: ['海'] });
    const b = await createPost(c, { field: '3dcg', hashtags: ['山'] });
    const byField = (await (await c.get('/api/feed?field=3dcg')).json()) as {
      posts: { id: string }[];
    };
    expect(byField.posts.map((p) => p.id)).toEqual([b]);
    const byTag = (await (await c.get(`/api/feed?tag=${encodeURIComponent('海')}`)).json()) as {
      posts: { id: string }[];
    };
    expect(byTag.posts.map((p) => p.id)).toEqual([a]);
  });

  it('requires the originality consent and rejects AI-generated works by default', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    const base = { title: 't', mediaType: 'text', field: 'novel', aiAssisted: false };
    expect((await c.post('/api/posts', { ...base, originalConfirmed: false })).status).toBe(400);
    expect(
      (await c.post('/api/posts', { ...base, originalConfirmed: true, aiGenerated: true })).status,
    ).toBe(422);
    expect((await c.post('/api/posts', { ...base, originalConfirmed: true })).status).toBe(201);
  });

  it('labels AI-assisted works', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-creator-01');
    const id = await createPost(c, { aiAssisted: true });
    const r = (await (await c.get(`/api/posts/${id}`)).json()) as { post: { aiAssisted: boolean } };
    expect(r.post.aiAssisted).toBe(true);
  });

  it("cannot attach another user's uploaded media", async () => {
    const { client } = setup();
    const a = client();
    const b = client();
    await a.login('test-creator-01');
    await b.login('test-creator-02');
    const { key } = await uploadImage(a);
    const res = await b.post('/api/posts', {
      title: 'x',
      mediaType: 'image',
      mediaKey: key,
      field: 'illustration',
      aiAssisted: false,
      originalConfirmed: true,
    });
    expect(res.status).toBe(422);
  });
});

describe('authorization (IDOR) for posts', () => {
  it("cannot edit or delete another user's post", async () => {
    const { client } = setup();
    const owner = client();
    const other = client();
    await owner.login('test-creator-01');
    await other.login('test-creator-02');
    const id = await createPost(owner);
    expect((await other.patch(`/api/posts/${id}`, { title: 'hacked' })).status).toBe(403);
    expect((await other.delete(`/api/posts/${id}`)).status).toBe(403);
    const r = (await (await owner.get(`/api/posts/${id}`)).json()) as { post: { title: string } };
    expect(r.post.title).toBe('テスト作品');
  });

  it('requires login for write operations', async () => {
    const { client } = setup();
    const anon = client();
    expect((await anon.post('/api/posts', {})).status).toBe(401);
    expect((await anon.post('/api/uploads', { contentType: 'image/png', size: 10 })).status).toBe(
      401,
    );
  });

  it('only accepts own posts as request samples', async () => {
    const { client } = setup();
    const a = client();
    const b = client();
    await a.login('test-creator-01');
    await b.login('test-creator-02');
    const foreign = await createPost(a);
    const own = await createPost(b);
    await b.put('/api/me/creator-settings', {
      priceList: [],
      samplePostIds: [foreign, own],
      notes: '',
      productionDays: 7,
      paymentTerms: '前払い',
      retakeCount: 1,
    });
    const p = (await (await b.get('/api/users/test-creator-02')).json()) as {
      settings: { samplePostIds: string[] };
    };
    expect(p.settings.samplePostIds).toEqual([own]);
  });
});
