import { expect, test } from '@playwright/test';
import { apiPost, createPostApi, handle, jstDate, login, PNG } from './helpers';

test.describe('受け入れ基準: 投稿・探索', () => {
  test('作品投稿（画像）→ プロフィール表示 → 新着・おすすめへの表示が通る', async ({ page }) => {
    const me = handle('test-poster');
    await login(page, me);
    await page.goto('/posts/new');
    await expect(page.getByTestId('post-editor')).toBeVisible();
    await page
      .getByLabel('画像・動画')
      .setInputFiles({ name: 'artwork.png', mimeType: 'image/png', buffer: PNG });
    const title = `夕暮れの街並み ${Date.now()}`;
    await page.getByLabel('タイトル').fill(title);
    await page.getByLabel('説明・本文').fill('架空のテスト作品です');
    await page.getByLabel('分野').selectOption('illustration');
    await page.getByLabel('ハッシュタグ').fill('夕暮れ 街');
    await page.getByLabel(/オリジナル作品であり/).check();
    await page.getByRole('button', { name: '投稿する' }).click();

    await expect(page.getByTestId('post-detail')).toBeVisible();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const img = page.getByTestId('post-detail').locator('img').first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

    await page.goto(`/u/${me}`);
    await expect(page.getByTestId('profile-page').getByText(title)).toBeVisible();
    await page.goto('/');
    await expect(page.getByTestId('home-page').getByText(title)).toBeVisible();
    await page.getByRole('tab', { name: 'おすすめ' }).click();
    await expect(page.getByTestId('home-page').getByText(title)).toBeVisible();
  });

  test('オリジナル作品の同意がないと投稿できない', async ({ page }) => {
    await login(page, handle('test-consent'));
    await page.goto('/posts/new');
    await page.getByLabel('タイトル').fill('同意なし');
    await page.getByRole('button', { name: '投稿する' }).click();
    await expect(page.getByRole('alert')).toContainText('同意が必要');
  });

  test('ハッシュタグ・分野で絞り込みでき、週間ランキングが表示される', async ({ browser }) => {
    const creatorPage = await (await browser.newContext()).newPage();
    const viewer = await (await browser.newContext()).newPage();
    await login(creatorPage, handle('test-rank-creator'));
    await login(viewer, handle('test-rank-viewer'));
    const run = Date.now().toString(36);
    const tag = `rank${run}`;
    const A = `絞り込みA-${run}`;
    const B = `絞り込みB-${run}`;
    const a = await createPostApi(creatorPage, {
      title: A,
      field: '3dcg',
      hashtags: [tag],
    });
    const b = await createPostApi(creatorPage, {
      title: B,
      field: 'manga',
      hashtags: ['other'],
    });

    // Field filter
    await viewer.goto('/');
    await viewer
      .getByRole('group', { name: '分野で絞り込み' })
      .getByRole('button', { name: '3DCG' })
      .click();
    await expect(viewer.getByText(A)).toBeVisible();
    await expect(viewer.getByText(B)).toHaveCount(0);
    // Hashtag filter (from a post's hashtag link)
    await viewer.goto(`/posts/${a}`);
    await viewer.getByRole('link', { name: `#${tag}` }).click();
    await expect(viewer.getByText(`#${tag}`)).toBeVisible();
    await expect(viewer.getByText(A)).toBeVisible();
    await expect(viewer.getByText(B)).toHaveCount(0);

    // Views/saves then the daily Cron job builds the weekly ranking
    await viewer.goto(`/posts/${b}`);
    await viewer.getByRole('button', { name: 'お気に入り', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'お気に入り済み' })).toBeVisible();
    await apiPost(viewer.request, '/api/admin/dev/run-daily', { today: jstDate(0) });
    await viewer.goto('/ranking');
    await expect(viewer.getByRole('tab', { name: '週間' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const list = viewer.getByTestId('ranking-list');
    await expect(list).toBeVisible();
    await expect(list.getByText(B)).toBeVisible();
    await expect(list.getByLabel('1位', { exact: true })).toBeVisible();
    // Hashtag ranking
    await viewer.goto(`/ranking?tag=${tag}`);
    await expect(viewer.getByTestId('ranking-list').getByText(A)).toBeVisible();
  });
});
