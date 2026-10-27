import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/shared/delay';
import { todayJst } from '../../src/server/lib/db';
import { setup } from './helpers/client';
import { createPost } from './helpers/fixtures';

describe('reports', () => {
  it('accepts copyright takedown requests without login and validates input', async () => {
    const { client, sqlite } = setup();
    const c = client();
    const ok = await c.post('/api/reports', {
      targetType: 'post',
      targetId: '00000000-0000-0000-0000-000000000000',
      kind: 'copyright',
      details: '自分の作品が無断転載されています（テスト）',
    });
    expect(ok.status).toBe(201);
    expect(
      (
        await c.post('/api/reports', {
          targetType: 'post',
          targetId: 'x',
          kind: 'copyright',
          details: '短い',
        })
      ).status,
    ).toBe(400);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number }).n).toBe(1);
  });
});

describe('特定商取引法 page data', () => {
  it('reads operator details from the environment only', async () => {
    const { client } = setup({ BUSINESS_NAME: 'テスト事業者（架空）' });
    const r = (await (await client().get('/api/legal/business')).json()) as {
      name: string;
      address: string | null;
    };
    expect(r.name).toBe('テスト事業者（架空）');
    expect(r.address).toBeNull();
  });
});

describe('account deletion', () => {
  it('deletes personal data, keeps payment records and anonymises the user', async () => {
    const { client, sqlite, env } = setup();
    const creator = client();
    const buyer = client();
    await creator.login('test-creator-01');
    await buyer.login('test-client-01');
    const postId = await createPost(creator);
    const media = (
      sqlite.prepare('SELECT media_key FROM posts WHERE id = ?').get(postId) as {
        media_key: string;
      }
    ).media_key;
    await buyer.post(`/api/favorites/${postId}`);
    const res = await buyer.post('/api/requests', {
      creatorHandle: 'test-creator-01',
      title: 't',
      details: 'd',
      price: 1000,
      dueDate: addDays(todayJst(), 5),
      agreeDelayTerms: true,
    });
    const { id } = (await res.json()) as { id: string };
    const co = (await (await buyer.post(`/api/requests/${id}/checkout`)).json()) as { url: string };
    await buyer.post('/api/payments/mock/complete', { sessionId: co.url.split('/').pop() });

    // Active request blocks deletion
    expect((await creator.delete('/api/me')).status).toBe(409);
    await creator.post(`/api/requests/${id}/deliver`, { note: 'n' });
    await buyer.post(`/api/requests/${id}/approve`);
    await creator.post(`/api/requests/${id}/approve`);

    expect((await creator.delete('/api/me')).status).toBe(200);
    const u = sqlite
      .prepare(
        "SELECT google_sub, display_name, deleted_at FROM users WHERE handle LIKE 'deleted-%'",
      )
      .get() as {
      google_sub: string | null;
      deleted_at: string | null;
    };
    expect(u.google_sub).toBeNull();
    expect(u.deleted_at).toBeTruthy();
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(0);
    expect(await env.MEDIA.head(media)).toBeNull();
    expect(
      (
        sqlite
          .prepare('SELECT COUNT(*) AS n FROM payment_records WHERE request_id = ?')
          .get(id) as { n: number }
      ).n,
    ).toBeGreaterThan(0);
    // Session is gone and the profile is no longer reachable
    expect(((await (await creator.get('/api/me')).json()) as { user: unknown }).user).toBeNull();
    expect((await buyer.get('/api/users/test-creator-01')).status).toBe(404);
  });
});
