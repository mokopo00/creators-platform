import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/shared/delay';
import { todayJst } from '../../src/server/lib/db';
import { ageOn } from '../../src/server/routes/extras';
import { setup } from './helpers/client';
import { createPost } from './helpers/fixtures';

describe('analytics', () => {
  it('returns daily views/saves/requests for own posts only', async () => {
    const { client } = setup();
    const creator = client();
    const viewer = client();
    await creator.login('test-creator-01');
    await viewer.login('test-viewer-01');
    const id = await createPost(creator);
    await viewer.get(`/api/posts/${id}`);
    await viewer.post(`/api/favorites/${id}`);
    type A = { totals: { views: number; saves: number }; series: unknown[] };
    const a = (await (await creator.get('/api/me/analytics?days=7')).json()) as A;
    expect(a.series).toHaveLength(7);
    expect(a.totals).toMatchObject({ views: 1, saves: 1 });
    const other = (await (await viewer.get('/api/me/analytics?days=7')).json()) as A;
    expect(other.totals).toMatchObject({ views: 0, saves: 0 });
  });
});

describe('premium', () => {
  it('activates (test mode) and shows the configurable price', async () => {
    const { client } = setup({ PREMIUM_PRICE_JPY: '800', PREMIUM_PRICE_TAX_LABEL: '税込' });
    const c = client();
    await c.login('test-user-01');
    expect((await c.post('/api/premium/subscribe')).status).toBe(200);
    const p = (await (await c.get('/api/premium')).json()) as {
      active: boolean;
      priceJpy: number;
      taxLabel: string;
    };
    expect(p).toMatchObject({ active: true, priceJpy: 800, taxLabel: '税込' });
  });
});

describe('promotions', () => {
  it('reserves a PR slot for own posts and labels them', async () => {
    const { client } = setup();
    const a = client();
    const b = client();
    await a.login('test-creator-01');
    await b.login('test-creator-02');
    const id = await createPost(a);
    expect(
      (await b.post('/api/promotions', { postId: id, startDate: todayJst(), endDate: todayJst() }))
        .status,
    ).toBe(404);
    expect(
      (
        await a.post('/api/promotions', {
          postId: id,
          startDate: todayJst(),
          endDate: addDays(todayJst(), 30),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.post('/api/promotions', {
          postId: id,
          startDate: todayJst(),
          endDate: addDays(todayJst(), 3),
        })
      ).status,
    ).toBe(201);
    const p = (await (await b.get(`/api/posts/${id}`)).json()) as { post: { promoted: boolean } };
    expect(p.post.promoted).toBe(true);
  });
});

describe('age confirmation', () => {
  it('computes age correctly', () => {
    expect(ageOn('2008-10-28', '2026-10-27')).toBe(17);
    expect(ageOn('2008-10-27', '2026-10-27')).toBe(18);
  });

  it('rejects under-18 and does not store the birth date', async () => {
    const { client, sqlite } = setup();
    const c = client();
    await c.login('test-user-01', false);
    const minor = addDays(todayJst(), -365 * 10);
    expect(
      (await c.post('/api/me/age-confirmation', { birthDate: minor, confirm: true })).status,
    ).toBe(403);
    expect(
      (await c.post('/api/me/age-confirmation', { birthDate: '1990-01-01', confirm: true })).status,
    ).toBe(200);
    const cols = sqlite.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    expect(cols.map((x) => x.name)).not.toContain('birth_date');
  });
});

describe('digital sales framework', () => {
  it('stores draft products and exposes the 15% fee setting', async () => {
    const { client } = setup({ DIGITAL_SALES_FEE_RATE: '0.15' });
    const c = client();
    await c.login('test-creator-01');
    expect((await c.post('/api/me/products', { title: '素材集', price: 1000 })).status).toBe(201);
    const r = (await (await c.get('/api/me/products')).json()) as {
      feeRate: number;
      products: unknown[];
    };
    expect(r.feeRate).toBe(0.15);
    expect(r.products).toHaveLength(1);
  });
});
