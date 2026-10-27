import { expect, test, type Page } from '@playwright/test';
import { createPaidRequest, createPostApi, handle, login } from './helpers';

/** Delays every API response so the full-page skeleton is observable. */
async function slowApi(page: Page, ms = 700) {
  await page.route('**/api/**', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test.describe('受け入れ基準: 画面・UI', () => {
  test('すべての主要ページで全画面スケルトンが表示され、データ取得後に切り替わる', async ({
    page,
  }) => {
    const me = handle('test-skel-user');
    const creator = handle('test-skel-creator');
    await login(page, creator);
    const postId = await createPostApi(page);
    await login(page, me);
    const requestId = await createPaidRequest(page, creator);
    await slowApi(page);

    const pages: [string, string][] = [
      ['/', 'home-page'],
      ['/search', 'search-page'],
      ['/ranking', 'ranking-page'],
      [`/u/${creator}`, 'profile-page'],
      [`/posts/${postId}`, 'post-detail'],
      [`/u/${creator}/request`, 'request-page'],
      ['/requests', 'requests-page'],
      [`/requests/${requestId}`, 'request-detail'],
      ['/favorites', 'favorites-page'],
      ['/notifications', 'notifications-page'],
      ['/settings', 'settings-page'],
      ['/creator', 'creator-tools'],
      ['/legal/tokushoho', 'tokushoho-page'],
    ];
    for (const [path, testId] of pages) {
      await page.goto(path);
      const skeleton = page.getByTestId('page-skeleton');
      await expect(skeleton, `skeleton on ${path}`).toBeVisible();
      // The skeleton fills the main area (full-page, not a small spinner)
      const box = await skeleton.boundingBox();
      expect(box!.height, `skeleton height on ${path}`).toBeGreaterThan(200);
      await expect(page.getByTestId(testId), `content on ${path}`).toBeVisible();
      await expect(skeleton).toHaveCount(0);
    }
  });

  test('白ベースの Liquid Glass UI で、主要要素にガラス効果とアニメーションがある', async ({
    page,
  }) => {
    await login(page, handle('test-glass'));
    await createPostApi(page);
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
    const glass = await page.getByTestId('sidebar').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        backdrop: s.backdropFilter || s.getPropertyValue('-webkit-backdrop-filter'),
        bg: s.backgroundColor,
      };
    });
    expect(glass.backdrop).toContain('blur');
    expect(glass.bg).toMatch(/rgba\(255, 255, 255, 0\.5\d*\)/); // translucent white
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
    expect(bodyBg).toContain('linear-gradient');

    // Card lift animation on hover
    const card = page.getByTestId('post-card').first();
    await expect(card).toBeVisible();
    const before = await card.evaluate((el) => getComputedStyle(el).transform);
    await card.hover();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);

    // Skeleton shimmer animation
    await slowApi(page, 1500);
    await page.goto('/ranking');
    const anim = await page
      .locator('.skeleton-block')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('shimmer');
  });

  test('prefers-reduced-motion 有効時にアニメーションが最小化される', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await login(page, handle('test-reduced'));
    await createPostApi(page);
    await slowApi(page, 1500);
    await page.goto('/');
    const dur = await page
      .locator('.skeleton-block')
      .first()
      .evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(dur)).toBeLessThan(0.01);
    await page.unroute('**/api/**');
    await expect(page.getByTestId('home-page')).toBeVisible();
    // Framer Motion transforms are disabled: hovering a card does not move it
    const card = page.getByTestId('post-card').first();
    await card.hover();
    await page.waitForTimeout(400);
    const t = await card.evaluate((el) => getComputedStyle(el).transform);
    expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();
    await ctx.close();
  });

  test('モバイルとPCで、タブバーとサイドバーが正しく切り替わる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await expect(page.getByTestId('sidebar')).toBeHidden();
    await page.getByTestId('tabbar').getByRole('link', { name: '探す' }).click();
    await expect(page.getByTestId('search-page')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('tabbar')).toBeHidden();
    await page.getByTestId('sidebar').getByRole('link', { name: 'ランキング' }).click();
    await expect(page.getByTestId('ranking-page')).toBeVisible();
  });
});
