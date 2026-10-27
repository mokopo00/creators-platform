import { expect, test } from '@playwright/test';
import {
  apiPost,
  createPaidRequest,
  createPostApi,
  handle,
  login,
  loginViaUi,
  ORIGIN,
} from './helpers';

test.describe('受け入れ基準: 認証・アクセス', () => {
  test('Google ログインのみで登録・ログインできる（他の認証手段が存在しない）', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible();
    // No password / e-mail based authentication exists.
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    await expect(page.locator('input[type=email]')).toHaveCount(0);
    const providers = await (await page.request.get('/api/auth/providers')).json();
    expect(Object.keys(providers).sort()).toEqual(['google', 'mock']);
    expect(providers.google).toBe(true);
    // The mock form is only present because this is the automated test environment.
    await expect(page.getByTestId('mock-login')).toContainText('開発・テスト環境専用');

    // The Google button starts Authorization Code + PKCE with state.
    const google = page.getByTestId('google-login');
    await expect(google).toBeVisible();
    const href = await google.getAttribute('href');
    expect(href).toMatch(/^\/api\/auth\/google\/start/);
    const start = await page.request.get(href!, { maxRedirects: 0 });
    expect(start.status()).toBe(302);
    const authUrl = start.headers()['location']!;
    expect(authUrl).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\//);
    const u = new URL(authUrl);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(u.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect(u.searchParams.get('scope')).toBe('openid profile');
  });

  test('テスト用ログインで登録・ログイン・ログアウトできる', async ({ page }) => {
    await loginViaUi(page, handle('test-user-a'));
    const me = await (await page.request.get('/api/me')).json();
    expect(me.user.handle).toBe(handle('test-user-a'));
    await apiPost(page.request, '/api/auth/logout');
    expect((await (await page.request.get('/api/me')).json()).user).toBeNull();
  });

  test('他ユーザーの投稿・依頼を編集・閲覧できない（IDOR）', async ({ browser }) => {
    const owner = await (await browser.newContext()).newPage();
    const creator = await (await browser.newContext()).newPage();
    const intruder = await (await browser.newContext()).newPage();
    await login(owner, handle('test-idor-owner'));
    await login(creator, handle('test-idor-creator'));
    await login(intruder, handle('test-idor-intruder'));
    const postId = await createPostApi(owner);
    await createPostApi(creator);
    const requestId = await createPaidRequest(owner, handle('test-idor-creator'));

    // Post: cannot edit or delete through the API
    const h = { Origin: ORIGIN };
    expect(
      (
        await intruder.request.patch(`/api/posts/${postId}`, { data: { title: 'x' }, headers: h })
      ).status(),
    ).toBe(403);
    expect((await intruder.request.delete(`/api/posts/${postId}`, { headers: h })).status()).toBe(
      403,
    );
    // ...and the UI does not offer edit/delete
    await intruder.goto(`/posts/${postId}`);
    await expect(intruder.getByTestId('post-detail')).toBeVisible();
    await expect(intruder.getByRole('link', { name: '編集' })).toHaveCount(0);
    await expect(intruder.getByRole('button', { name: '削除' })).toHaveCount(0);

    // Request: cannot view or act on someone else's request
    expect((await intruder.request.get(`/api/requests/${requestId}`)).status()).toBe(404);
    expect(
      (
        await intruder.request.post(`/api/requests/${requestId}/messages`, {
          data: { body: 'x' },
          headers: h,
        })
      ).status(),
    ).toBe(404);
    expect(
      (await intruder.request.post(`/api/requests/${requestId}/cancel`, { headers: h })).status(),
    ).toBe(404);
    await intruder.goto(`/requests/${requestId}`);
    await expect(intruder.getByRole('alert')).toContainText('見つかりません');
    await expect(intruder.getByTestId('chat-messages')).toHaveCount(0);
  });

  test('SQLインジェクションを含む入力でエラーにならず、データが漏れない', async ({ page }) => {
    await login(page, handle('test-sqli'));
    await createPostApi(page, { title: '通常の作品' });
    const payloads = [
      "' OR 1=1 --",
      "'; DROP TABLE users; --",
      '" OR ""="',
      "1' UNION SELECT google_sub FROM users --",
    ];
    for (const p of payloads) {
      await page.goto('/search');
      await page.getByLabel('キーワード').fill(p);
      await page.getByRole('button', { name: '検索' }).click();
      await expect(page.getByText('見つかりませんでした')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      const res = await page.request.get(`/api/search?q=${encodeURIComponent(p)}`);
      expect(res.status()).toBe(200);
      const text = await res.text();
      expect(text).not.toContain('google_sub');
      expect(text).not.toContain('mock:');
    }
    // Data is intact after the attempts
    const feed = await (await page.request.get('/api/feed')).json();
    expect(feed.posts.length).toBeGreaterThan(0);
  });
});
