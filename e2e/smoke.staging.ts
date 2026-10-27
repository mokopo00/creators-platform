/**
 * Smoke tests for the deployed staging Worker. Run with:
 *   E2E_BASE_URL=https://<staging-url> npx playwright test --config playwright.smoke.config.ts
 * Uses only fictitious seed data; never logs in with a real account.
 */
import { expect, test } from '@playwright/test';

test('health and environment', async ({ request }) => {
  const r = await (await request.get('/api/health')).json();
  expect(r).toEqual({ ok: true, environment: 'staging' });
});

test('home renders seeded test posts with the glass UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByText('テスト作品：架空の短編')).toBeVisible();
  await page.getByText('テスト作品：架空の短編').click();
  await expect(page.getByTestId('post-detail')).toBeVisible();
});

test('creator profile and request page with delay terms', async ({ page }) => {
  await page.goto('/u/test-creator-01');
  await expect(page.getByTestId('profile-page')).toBeVisible();
  await page.getByTestId('request-button').click();
  await expect(page.getByTestId('delay-terms')).toContainText('9,500円');
});

test('legal pages are linked and reachable', async ({ page }) => {
  for (const [path, id] of [
    ['/legal/terms', 'terms-page'],
    ['/legal/privacy', 'privacy-page'],
    ['/legal/tokushoho', 'tokushoho-page'],
    ['/report', 'report-page'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('security headers are present on pages and API', async ({ request }) => {
  for (const path of ['/', '/api/health']) {
    const h = (await request.get(path)).headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['strict-transport-security']).toContain('max-age=');
    expect(h['x-content-type-options']).toBe('nosniff');
  }
});

test('test-only features are disabled on staging', async ({ request }) => {
  const providers = await (await request.get('/api/auth/providers')).json();
  expect(providers.mock).toBe(false);
  const origin = new URL(process.env.E2E_BASE_URL!).origin;
  const h = { Origin: origin };
  expect(
    (
      await request.post('/api/auth/mock-login', { data: { handle: 'test-x' }, headers: h })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post('/api/admin/dev/run-daily', { data: { today: '2026-01-01' }, headers: h })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post('/api/payments/mock/complete', { data: { sessionId: 'x' }, headers: h })
    ).status(),
  ).toBeGreaterThanOrEqual(400);
});

test('search and SQL-injection input are handled', async ({ request }) => {
  const ok = await (await request.get(`/api/search?q=${encodeURIComponent('架空の短編')}`)).json();
  expect(ok.posts.length).toBeGreaterThan(0);
  const inj = await request.get(`/api/search?q=${encodeURIComponent("' OR 1=1 --")}`);
  expect(inj.status()).toBe(200);
  expect((await inj.json()).posts).toHaveLength(0);
});

test('Workers AI translation works or fails gracefully', async ({ request }) => {
  const origin = new URL(process.env.E2E_BASE_URL!).origin;
  const r = await request.post('/api/ai/translate', {
    data: { text: 'こんにちは', target: 'en' },
    headers: { Origin: origin },
  });
  expect([200, 503, 504]).toContain(r.status());
  const body = await r.json();
  if (r.status() === 200) expect(body.text.length).toBeGreaterThan(0);
  else expect(body.error.message).toBeTruthy();
});
