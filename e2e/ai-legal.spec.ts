import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createPostApi, handle, login } from './helpers';

test.describe('受け入れ基準: AI', () => {
  test('Workers AI による翻訳・タグ生成が動作し、失敗時は画面が壊れずにメッセージが出る', async ({
    page,
  }) => {
    await login(page, handle('test-ai'));
    const ok = await createPostApi(page, { body: '星空の下で描いた作品です' });
    const ng = await createPostApi(page, { body: '__AI_FAIL__ 翻訳失敗の再現用' });

    await page.goto(`/posts/${ok}`);
    await page.getByRole('button', { name: '翻訳する' }).click();
    await expect(page.getByTestId('translation')).toContainText('星空');

    await page.goto(`/posts/${ng}`);
    await page.getByRole('button', { name: '翻訳する' }).click();
    await expect(page.getByTestId('ai-error')).toContainText('AI');
    // The page is still intact and usable
    await expect(page.getByTestId('post-detail')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'テスト作品' })).toBeVisible();

    // Tag candidates (user confirms by clicking)
    await page.goto('/posts/new');
    await page.getByLabel('タイトル').fill('海辺の風景');
    await page.getByRole('button', { name: 'AIでタグ候補を生成' }).click();
    const sug = page.getByTestId('tag-suggestions');
    await expect(sug).toBeVisible();
    const first = sug.getByRole('button').first();
    const label = (await first.textContent())!.replace('#', '');
    await first.click();
    await expect(page.getByLabel('ハッシュタグ')).toHaveValue(new RegExp(label));

    // Tag generation failure shows a message without breaking the form
    await page.getByLabel('タイトル').fill('__AI_FAIL__');
    await page.getByRole('button', { name: 'AIでタグ候補を生成' }).click();
    await expect(page.getByTestId('ai-error')).toBeVisible();
    await expect(page.getByTestId('post-editor')).toBeVisible();

    // AI search falls back gracefully
    await page.goto('/search');
    await page.getByRole('tab', { name: 'AIおすすめ検索' }).click();
    await page.getByLabel('探しているテイスト').fill('__AI_FAIL__');
    await page.getByRole('button', { name: '検索' }).click();
    await expect(page.getByTestId('ai-search-message')).toContainText('キーワード検索');
  });

  test('チャットボットがよくある質問に回答する', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ヘルプチャットを開く' }).click();
    await page.getByLabel('質問').fill('納期に遅れたらどうなりますか');
    await page
      .getByRole('dialog', { name: 'ヘルプチャット' })
      .getByRole('button', { name: '送信' })
      .click();
    await expect(page.getByTestId('chatbot-log')).toContainText('5%');
  });
});

test.describe('受け入れ基準: 法務・リポジトリ', () => {
  test('利用規約・プライバシーポリシー・特定商取引法に基づく表記のページが存在し、リンクされている', async ({
    page,
  }) => {
    await page.goto('/');
    const sidebar = page.getByTestId('sidebar');
    for (const [name, testId] of [
      ['利用規約', 'terms-page'],
      ['プライバシーポリシー', 'privacy-page'],
      ['特定商取引法に基づく表記', 'tokushoho-page'],
    ] as const) {
      await sidebar.getByRole('link', { name }).click();
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    }
    await sidebar.getByRole('link', { name: '通報・削除申立' }).click();
    await expect(page.getByTestId('report-page')).toBeVisible();
    await page.getByLabel('対象の ID または URL').fill('test-target-01');
    await page.getByLabel('詳細').fill('架空の削除申立のテストです。');
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page.getByTestId('report-done')).toBeVisible();
  });

  test('LICENSE が存在し、すべての権利を留保する内容で、第三者への利用許諾を含まない', () => {
    const lic = readFileSync('LICENSE', 'utf8');
    expect(lic).toContain('All rights reserved');
    expect(lic).toContain('No license or permission of any kind is granted to any third party');
    expect(lic).toContain('[PROJECT_NAME] Project');
    for (const permissive of [
      'Permission is hereby granted',
      'MIT License',
      'Apache License',
      'GNU General Public',
    ]) {
      expect(lic).not.toContain(permissive);
    }
    expect(readFileSync('README.md', 'utf8')).toContain(
      '閲覧のみ可能で、利用には権利者の許諾が必要',
    );
  });

  test('docs/LEGAL_TODO.md に法的確認項目が記録されている', () => {
    const todo = readFileSync('docs/LEGAL_TODO.md', 'utf8');
    expect(todo).toContain('消費者契約法第9条');
    expect(todo).toContain('LICENSE と利用規約');
    for (const word of ['特定商取引法', '資金決済法', '18歳', '申告期限'])
      expect(todo).toContain(word);
  });

  test('個人情報・秘密情報がリポジトリ内に存在せず、author に個人のメールアドレスが無い', () => {
    const grep = (pattern: string) => {
      try {
        return execSync(`git grep -nIiE "${pattern}" -- . ":!docs/SECURITY.md"`, {
          encoding: 'utf8',
        });
      } catch {
        return ''; // git grep exits 1 when nothing matches
      }
    };
    expect(grep('@(gmail|outlook|yahoo|icloud|hotmail)\\.')).toBe('');
    expect(
      grep(
        'sk_live_[0-9a-zA-Z]{6,}|sk_test_[0-9a-zA-Z]{10,}|whsec_[0-9a-zA-Z]{10,}|PRIVATE KEY-----',
      ),
    ).toBe('');
    const authors = execSync('git log --format=%ae%n%ce', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    for (const a of authors)
      expect(a).toMatch(/@users\.noreply\.github\.com$|^noreply@anthropic\.com$/);
    const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n');
    expect(
      tracked.filter((f) => /(^|\/)\.(env|dev\.vars)(\.|$)/.test(f) && !f.endsWith('.example')),
    ).toEqual([]);
  });
});
