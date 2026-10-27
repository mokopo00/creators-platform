import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/shared/delay';
import { todayJst } from '../../src/server/lib/db';
import { evaluateDelays } from '../../src/server/lib/requests';
import { setup, type TestClient } from './helpers/client';
import { createPost } from './helpers/fixtures';

type Detail = {
  request: {
    status: string;
    payoutStatus: string;
    payoutAmount: number | null;
    reductionAmount: number;
    refundAmount: number;
  };
  delay: { amount: number; chargeableDays: number };
  canCancelRefund: boolean;
  messages: { body: string }[];
};

async function world(overrides = {}) {
  const s = setup({ ADMIN_HANDLES: 'test-operator-01', ...overrides });
  const creator = s.client();
  const client = s.client();
  const stranger = s.client();
  await creator.login('test-creator-01');
  await client.login('test-client-01');
  await stranger.login('test-stranger-01');
  await createPost(creator);
  return { env: s.env, sqlite: s.sqlite, newClient: s.client, creator, client, stranger };
}

async function createRequest(client: TestClient, overrides: Record<string, unknown> = {}) {
  const res = await client.post('/api/requests', {
    creatorHandle: 'test-creator-01',
    title: 'テスト依頼',
    details: 'キャラクターイラストを1枚お願いします（架空のテスト依頼）',
    price: 10_000,
    dueDate: addDays(todayJst(), 7),
    agreeDelayTerms: true,
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`createRequest ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function pay(client: TestClient, id: string) {
  const co = (await (await client.post(`/api/requests/${id}/checkout`)).json()) as { url: string };
  const sessionId = co.url.split('/').pop()!;
  const res = await client.post('/api/payments/mock/complete', { sessionId });
  expect(res.status).toBe(200);
}

const detail = async (c: TestClient, id: string) =>
  (await (await c.get(`/api/requests/${id}`)).json()) as Detail;

/** Moves a request's due date into the past so it is `days` overdue today. */
function makeOverdue(
  sqlite: { prepare: (s: string) => { run: (...a: string[]) => unknown } },
  id: string,
  days: number,
) {
  sqlite
    .prepare('UPDATE requests SET due_date = ? WHERE id = ?')
    .run(addDays(todayJst(), -days), id);
}

describe('request flow', () => {
  it('request → chat → prepay → deliver → both approve → transferred', async () => {
    const { creator, client } = await world();
    const id = await createRequest(client);
    expect(
      (await client.post(`/api/requests/${id}/messages`, { body: 'よろしくお願いします' })).status,
    ).toBe(201);
    expect(
      (await creator.post(`/api/requests/${id}/messages`, { body: '承知しました' })).status,
    ).toBe(201);
    expect((await detail(creator, id)).messages.map((m) => m.body)).toContain(
      'よろしくお願いします',
    );

    await pay(client, id);
    expect((await detail(client, id)).request.status).toBe('paid');

    expect(
      (await creator.post(`/api/requests/${id}/deliver`, { note: '納品しました' })).status,
    ).toBe(200);
    const a1 = (await (await client.post(`/api/requests/${id}/approve`)).json()) as {
      status: string;
    };
    expect(a1.status).toBe('delivered');
    const a2 = (await (await creator.post(`/api/requests/${id}/approve`)).json()) as {
      status: string;
      payoutStatus: string;
    };
    expect(a2).toEqual({ status: 'completed', payoutStatus: 'transferred' });
    const d = await detail(creator, id);
    expect(d.request.payoutAmount).toBe(9_000); // 10,000 - 10% fee
  });

  it('requires age confirmation (18+) for paid requests', async () => {
    const s = setup();
    const creator = s.client();
    const minor = s.client();
    await creator.login('test-creator-01');
    await createPost(creator);
    await minor.login('test-client-02', false);
    const res = await minor.post('/api/requests', {
      creatorHandle: 'test-creator-01',
      title: 't',
      details: 'd',
      price: 1000,
      dueDate: addDays(todayJst(), 3),
      agreeDelayTerms: true,
    });
    expect(res.status).toBe(403);
  });

  it('requires agreement to the delay/refund terms', async () => {
    const { client } = await world();
    const res = await client.post('/api/requests', {
      creatorHandle: 'test-creator-01',
      title: 't',
      details: 'd',
      price: 1000,
      dueDate: addDays(todayJst(), 3),
      agreeDelayTerms: false,
    });
    expect(res.status).toBe(400);
  });
});

describe('authorization (IDOR) for requests', () => {
  it('a third party cannot read, message, pay, deliver, approve or cancel', async () => {
    const { client, stranger } = await world();
    const id = await createRequest(client);
    expect((await stranger.get(`/api/requests/${id}`)).status).toBe(404);
    expect((await stranger.post(`/api/requests/${id}/messages`, { body: 'x' })).status).toBe(404);
    expect((await stranger.post(`/api/requests/${id}/checkout`)).status).toBe(404);
    expect((await stranger.post(`/api/requests/${id}/deliver`, { note: 'x' })).status).toBe(404);
    expect((await stranger.post(`/api/requests/${id}/approve`)).status).toBe(404);
    expect((await stranger.post(`/api/requests/${id}/cancel`)).status).toBe(404);
    expect(
      (
        await stranger.post(`/api/requests/${id}/pauses`, {
          reason: 'client_material_delay',
          startDate: todayJst(),
        })
      ).status,
    ).toBe(404);
    const list = (await (await stranger.get('/api/requests')).json()) as { requests: unknown[] };
    expect(list.requests).toHaveLength(0);
  });

  it('roles are enforced between participants', async () => {
    const { creator, client } = await world();
    const id = await createRequest(client);
    expect((await creator.post(`/api/requests/${id}/checkout`)).status).toBe(403);
    await pay(client, id);
    expect((await client.post(`/api/requests/${id}/deliver`, { note: 'x' })).status).toBe(403);
  });

  it("cannot complete someone else's mock checkout session", async () => {
    const { client, stranger } = await world();
    const id = await createRequest(client);
    const co = (await (await client.post(`/api/requests/${id}/checkout`)).json()) as {
      url: string;
    };
    const res = await stranger.post('/api/payments/mock/complete', {
      sessionId: co.url.split('/').pop(),
    });
    expect(res.status).toBe(404);
  });
});

describe('delay reduction (Cron)', () => {
  it('reduces 5% of the price per overdue day and stops at 50%', async () => {
    const { client, sqlite, env } = await world();
    const id = await createRequest(client);
    await pay(client, id);
    for (const [days, expected] of [
      [1, 500],
      [5, 2_500],
      [10, 5_000],
      [15, 5_000],
    ] as const) {
      makeOverdue(sqlite, id, days);
      const results = await evaluateDelays(env);
      expect(results.find((r) => r.requestId === id)?.amount).toBe(expected);
    }
    const rows = sqlite
      .prepare('SELECT reduction_amount, reason FROM delay_adjustments WHERE request_id = ?')
      .all(id) as { reduction_amount: number; reason: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.reason).toContain('納期超過');
  });

  it('applies the frozen reduction at settlement and refunds it to the client', async () => {
    const { creator, client, sqlite, env } = await world();
    const id = await createRequest(client);
    await pay(client, id);
    makeOverdue(sqlite, id, 5);
    await evaluateDelays(env);
    await creator.post(`/api/requests/${id}/deliver`, { note: '遅れて納品' });
    await client.post(`/api/requests/${id}/approve`);
    await creator.post(`/api/requests/${id}/approve`);
    const d = await detail(client, id);
    expect(d.request.reductionAmount).toBe(2_500);
    expect(d.request.refundAmount).toBe(2_500);
    expect(d.request.payoutAmount).toBe(6_750); // (10,000 - 2,500) * 0.9
  });

  it('does not reduce for justified delays (client-side delay acknowledged by client)', async () => {
    const { client, sqlite, env } = await world();
    const id = await createRequest(client);
    await pay(client, id);
    makeOverdue(sqlite, id, 4);
    const start = addDays(todayJst(), -4);
    const r = await client.post(`/api/requests/${id}/pauses`, {
      reason: 'client_material_delay',
      startDate: start,
    });
    expect(((await r.json()) as { status: string }).status).toBe('approved');
    await evaluateDelays(env);
    expect((await detail(client, id)).delay.amount).toBe(0);
  });

  it('creator force majeure only stops the reduction after operator approval', async () => {
    const { creator, client, sqlite, env, newClient } = await world();
    const id = await createRequest(client);
    await pay(client, id);
    makeOverdue(sqlite, id, 3);
    const r = await creator.post(`/api/requests/${id}/pauses`, {
      reason: 'creator_force_majeure',
      startDate: addDays(todayJst(), -3),
      note: '体調不良（テスト）',
    });
    const { id: pauseId, status } = (await r.json()) as { id: string; status: string };
    expect(status).toBe('pending');
    expect((await detail(client, id)).delay.amount).toBe(1_500);

    // Client cannot self-approve a force-majeure claim
    expect((await client.post(`/api/requests/${id}/pauses/${pauseId}/approve`)).status).toBe(404);
    const operator = newClient();
    await operator.login('test-operator-01');
    expect(
      (await operator.post(`/api/admin/pauses/${pauseId}/review`, { decision: 'approved' })).status,
    ).toBe(200);
    await evaluateDelays(env);
    expect((await detail(client, id)).delay.amount).toBe(0);
  });

  it('platform outages and creator-declared client delays (once confirmed) are excluded', async () => {
    const { creator, client, sqlite, newClient } = await world();
    const id = await createRequest(client);
    await pay(client, id);
    makeOverdue(sqlite, id, 6);
    const r = await creator.post(`/api/requests/${id}/pauses`, {
      reason: 'client_approval_wait',
      startDate: addDays(todayJst(), -5),
      endDate: addDays(todayJst(), -4),
    });
    const { id: pauseId } = (await r.json()) as { id: string };
    expect((await detail(client, id)).delay.amount).toBe(3_000);
    await client.post(`/api/requests/${id}/pauses/${pauseId}/approve`);
    expect((await detail(client, id)).delay.amount).toBe(2_000);

    const operator = newClient();
    await operator.login('test-operator-01');
    await operator.post('/api/admin/outages', {
      startDate: addDays(todayJst(), -3),
      endDate: addDays(todayJst(), -1),
    });
    expect((await detail(client, id)).delay.amount).toBe(500);
  });

  it('non-operators cannot approve pauses or declare outages', async () => {
    const { creator } = await world();
    expect(
      (await creator.post('/api/admin/outages', { startDate: '2026-01-01', endDate: '2026-01-02' }))
        .status,
    ).toBe(403);
  });
});

describe('full refund cancellation', () => {
  it('is only available once overdue', async () => {
    const { client } = await world();
    const id = await createRequest(client);
    await pay(client, id);
    expect((await detail(client, id)).canCancelRefund).toBe(false);
    expect((await client.post(`/api/requests/${id}/cancel`)).status).toBe(409);
  });

  it('refunds the full price and never pays the creator', async () => {
    const { creator, client, sqlite, env } = await world();
    const id = await createRequest(client);
    await pay(client, id);
    makeOverdue(sqlite, id, 3);
    await evaluateDelays(env);
    expect((await detail(client, id)).canCancelRefund).toBe(true);
    expect((await creator.post(`/api/requests/${id}/cancel`)).status).toBe(403);
    const res = await client.post(`/api/requests/${id}/cancel`);
    expect(res.status).toBe(200);
    const d = await detail(client, id);
    expect(d.request.status).toBe('cancelled_refunded');
    expect(d.request.refundAmount).toBe(10_000);
    expect(d.request.payoutStatus).toBe('not_applicable');
    expect(d.request.payoutAmount).toBe(0);
    const transfers = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM payment_records WHERE request_id = ? AND kind = 'transfer'",
      )
      .get(id) as { n: number };
    expect(transfers.n).toBe(0);
    // The creator can no longer deliver or approve
    expect((await creator.post(`/api/requests/${id}/deliver`, { note: 'x' })).status).toBe(409);
    expect((await creator.post(`/api/requests/${id}/approve`)).status).toBe(409);
  });
});

describe('payments safety', () => {
  it('rejects live Stripe keys', async () => {
    const { client } = await world({ STRIPE_SECRET_KEY: 'sk_live_dummy' });
    const id = await createRequest(client);
    expect((await client.post(`/api/requests/${id}/checkout`)).status).toBe(503);
  });

  it('has no mock payments on staging', async () => {
    const s = setup({ ENVIRONMENT: 'staging' });
    const res = await s.client().post('/api/payments/mock/complete', { sessionId: 'x' });
    expect([401, 403, 404]).toContain(res.status);
  });
});
