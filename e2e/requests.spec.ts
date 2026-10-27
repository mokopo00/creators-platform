import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiPost, createPaidRequest, createPostApi, handle, jstDate, login } from './helpers';

async function pair(browser: Browser, tag: string) {
  const creator = await (await browser.newContext()).newPage();
  const client = await (await browser.newContext()).newPage();
  const creatorHandle = handle(`test-cr-${tag}`);
  await login(creator, creatorHandle);
  await login(client, handle(`test-cl-${tag}`));
  await createPostApi(creator);
  return { creator, client, creatorHandle };
}

async function setDue(page: Page, requestId: string, offset: number) {
  await apiPost(page.request, '/api/admin/dev/due-date', { requestId, dueDate: jstDate(offset) });
}

test.describe('受け入れ基準: 依頼・決済', () => {
  test('依頼ボタン → リクエストページ → 依頼作成 → チャット送信が通る', async ({ browser }) => {
    const { creator, client, creatorHandle } = await pair(browser, 'flow');
    await client.goto(`/u/${creatorHandle}`);
    await client.getByTestId('request-button').click();
    const rp = client.getByTestId('request-page');
    await expect(rp).toBeVisible();
    await expect(rp.getByRole('heading', { name: '料金表' })).toBeVisible();
    await expect(rp.getByRole('heading', { name: '注意事項' })).toBeVisible();
    const terms = client.getByTestId('delay-terms');
    await expect(terms).toContainText('5%');
    await expect(terms).toContainText('50%');
    await expect(terms).toContainText('全額返金');
    for (const amount of ['9,500円', '7,500円', '5,000円'])
      await expect(terms).toContainText(amount);

    const form = client.getByTestId('request-form');
    await form.getByLabel('件名').fill('キャラクターイラストの依頼');
    await form.getByLabel('要望').fill('架空のキャラクターを1体描いてください');
    await form.getByLabel('依頼料（円）').fill('10000');
    await form.getByRole('button', { name: '依頼を作成してチャットへ' }).click();
    await expect(form.getByRole('alert')).toContainText('同意が必要');
    await form.getByLabel(/減額・返金条件」と注意事項を確認し、同意します/).check();
    await form.getByRole('button', { name: '依頼を作成してチャットへ' }).click();

    await expect(client.getByTestId('request-detail')).toBeVisible();
    await client.getByLabel('メッセージ').fill('よろしくお願いします');
    await client.getByTestId('chat-send').click();
    await expect(
      client.getByTestId('chat-messages').getByText('よろしくお願いします'),
    ).toBeVisible();

    // The creator sees the message and replies
    const url = new URL(client.url());
    await creator.goto(url.pathname);
    await expect(
      creator.getByTestId('chat-messages').getByText('よろしくお願いします'),
    ).toBeVisible();
    await creator.getByLabel('メッセージ').fill('承知しました');
    await creator.getByTestId('chat-send').click();
    await expect(creator.getByTestId('chat-messages').getByText('承知しました')).toBeVisible();
    await client.reload();
    await expect(client.getByTestId('chat-messages').getByText('承知しました')).toBeVisible();
  });

  test('テスト用決済で前払いができ、承認後に送金状態へ遷移する', async ({ browser }) => {
    const { creator, client, creatorHandle } = await pair(browser, 'pay');
    const { id } = await apiPost<{ id: string }>(client.request, '/api/requests', {
      creatorHandle,
      title: '決済テスト',
      details: '架空の依頼',
      price: 10000,
      dueDate: jstDate(7),
      agreeDelayTerms: true,
    });
    await client.goto(`/requests/${id}`);
    await expect(client.getByTestId('request-status')).toHaveText('支払い待ち');
    await client.getByTestId('pay-button').click();
    await expect(client.getByTestId('mock-checkout')).toBeVisible();
    await client.getByTestId('mock-pay').click();
    await expect(client.getByTestId('request-status')).toHaveText('制作中（支払い済み）');

    await creator.goto(`/requests/${id}`);
    await creator.getByLabel('納品メモ').fill('納品しました');
    await creator.getByRole('button', { name: '納品する' }).click();
    await expect(creator.getByTestId('request-status')).toHaveText('納品済み・承認待ち');
    await creator.getByTestId('approve-button').click();
    await expect(creator.getByText('相手の承認を待っています')).toBeVisible();
    await expect(creator.getByTestId('payout-status')).toHaveText('未送金');

    await client.reload();
    await client.getByTestId('approve-button').click();
    await expect(client.getByTestId('request-status')).toHaveText('完了・送金済み');
    await expect(client.getByTestId('payout-status')).toHaveText('送金済み');
    await creator.reload();
    await expect(creator.getByTestId('payout-status')).toHaveText('送金済み');
    await expect(creator.getByText('9,000円')).toBeVisible(); // 10,000 - 10% fee
  });

  test('遅延時、1日ごとに受取額の5%が減額され、合計が50%で止まる', async ({ browser }) => {
    const { client, creatorHandle } = await pair(browser, 'delay');
    const id = await createPaidRequest(client, creatorHandle, 10_000);
    for (const [days, amount] of [
      [1, '500円'],
      [5, '2,500円'],
      [10, '5,000円'],
      [15, '5,000円'],
    ] as const) {
      await setDue(client, id, -days);
      await apiPost(client.request, '/api/admin/dev/run-daily', { today: jstDate(0) });
      await client.goto(`/requests/${id}`);
      await expect(client.getByTestId('delay-info')).toContainText(`${days}日`);
      await expect(client.getByTestId('delay-info')).toContainText(`減額 ${amount}`);
      if (days >= 10) await expect(client.getByTestId('delay-info')).toContainText('上限');
    }
    // History stored by the Cron job
    await expect(client.getByRole('heading', { name: '減額の履歴' })).toBeVisible();
  });

  test('遅延時に依頼者が全額返金でキャンセルでき、クリエイターへの支払いが発生しない', async ({
    browser,
  }) => {
    const { creator, client, creatorHandle } = await pair(browser, 'refund');
    const id = await createPaidRequest(client, creatorHandle, 12_000);
    await client.goto(`/requests/${id}`);
    await expect(client.getByTestId('cancel-refund')).toHaveCount(0); // not overdue yet
    await setDue(client, id, -2);
    await client.reload();
    await client.getByTestId('cancel-refund').click();
    await client.getByRole('dialog').getByRole('button', { name: '全額返金でキャンセル' }).click();
    await expect(client.getByTestId('request-status')).toHaveText('キャンセル（全額返金）');
    await expect(client.getByText('12,000円').last()).toBeVisible();
    await expect(client.getByTestId('payout-status')).toHaveText('送金なし');

    await creator.goto(`/requests/${id}`);
    await expect(creator.getByTestId('payout-status')).toHaveText('送金なし');
    await expect(creator.getByRole('button', { name: '納品する' })).toHaveCount(0);
    const d = await (await creator.request.get(`/api/requests/${id}`)).json();
    expect(d.request.payoutAmount).toBe(0);
    expect(d.request.refundAmount).toBe(12_000);
  });

  test('正当な理由の遅延は減額されない', async ({ browser }) => {
    const { client, creatorHandle } = await pair(browser, 'pause');
    const id = await createPaidRequest(client, creatorHandle, 10_000);
    await setDue(client, id, -3);
    await client.goto(`/requests/${id}`);
    await expect(client.getByTestId('delay-info')).toContainText('減額 1,500円');
    // The client declares their own late material delivery covering the overdue period.
    await client.getByLabel('理由', { exact: true }).selectOption('client_material_delay');
    await client.getByLabel('開始日').fill(jstDate(-3));
    await client.getByRole('button', { name: '申告する' }).click();
    await expect(client.getByText('承認済み（減額停止）')).toBeVisible();
    await apiPost(client.request, '/api/admin/dev/run-daily', { today: jstDate(0) });
    await client.reload();
    await expect(client.getByTestId('delay-info')).toContainText('減額対象 0日');
    await expect(client.getByTestId('delay-info')).toContainText('減額 0円');
  });
});
