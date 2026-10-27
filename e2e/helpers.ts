import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ORIGIN = 'http://localhost:8787';
const run = Date.now().toString(36);

/** Unique fictitious handle per test run (e.g. `test-creator-ab12cd`). */
export const handle = (base: string) => `${base}-${run}`.slice(0, 30);

/** 1x1 PNG used as fictitious artwork. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export async function apiPost<T = unknown>(
  req: APIRequestContext,
  path: string,
  data: unknown = {},
) {
  const res = await req.post(path, { data, headers: { Origin: ORIGIN } });
  expect(res.ok(), `${path} -> ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Logs in through the test-only mock login form in the UI. */
export async function loginViaUi(page: Page, h: string) {
  await page.goto('/login');
  const form = page.getByTestId('mock-login');
  await form.getByLabel('テストユーザー名').fill(h);
  await form.getByRole('button', { name: 'テストユーザーでログイン' }).click();
  await expect(page.getByTestId('home-page')).toBeVisible();
}

/** Fast login through the API (shares cookies with the page's context). */
export async function login(page: Page, h: string) {
  await apiPost(page.request, '/api/auth/mock-login', { handle: h, displayName: h, adult: true });
}

export async function createPostApi(page: Page, overrides: Record<string, unknown> = {}) {
  const up = await apiPost<{ key: string; uploadUrl: string }>(page.request, '/api/uploads', {
    contentType: 'image/png',
    size: PNG.length,
  });
  const put = await page.request.put(up.uploadUrl, {
    data: PNG,
    headers: { 'content-type': 'image/png', Origin: ORIGIN },
  });
  expect(put.ok()).toBeTruthy();
  const r = await apiPost<{ id: string }>(page.request, '/api/posts', {
    title: 'テスト作品',
    body: '架空のテスト投稿です',
    mediaType: 'image',
    mediaKey: up.key,
    field: 'illustration',
    hashtags: ['テスト'],
    aiAssisted: false,
    originalConfirmed: true,
    ...overrides,
  });
  return r.id;
}

export function jstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** Creates a request (as the logged-in client) and pays it with the test-mode provider. */
export async function createPaidRequest(page: Page, creatorHandle: string, price = 10_000) {
  const { id } = await apiPost<{ id: string }>(page.request, '/api/requests', {
    creatorHandle,
    title: 'テスト依頼',
    details: '架空のテスト依頼です',
    price,
    dueDate: jstDate(7),
    agreeDelayTerms: true,
  });
  const co = await apiPost<{ url: string }>(page.request, `/api/requests/${id}/checkout`);
  await apiPost(page.request, '/api/payments/mock/complete', {
    sessionId: co.url.split('/').pop(),
  });
  return id;
}
