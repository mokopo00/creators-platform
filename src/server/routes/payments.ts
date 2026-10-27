import { Hono } from 'hono';
import { z } from 'zod';
import { isDevLike, type AppBindings } from '../env';
import { first, run } from '../lib/db';
import { HttpError, notFound } from '../lib/errors';
import { getPaymentProvider, verifyStripeSignature } from '../lib/payments';
import { markPaid } from '../lib/requests';
import { activatePremium } from './extras';
import { requireUser } from '../lib/session';
import { parseJson } from '../lib/validate';

export const paymentRoutes = new Hono<AppBindings>();

/** Stripe webhook (test mode). Authenticated by signature, not by cookie/Origin. */
paymentRoutes.post('/webhook', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw notFound();
  const payload = await c.req.text();
  const ok = await verifyStripeSignature(payload, c.req.header('Stripe-Signature'), secret);
  if (!ok) throw new HttpError(400, 'invalid_signature', 'invalid signature');
  const event = JSON.parse(payload) as {
    type: string;
    livemode?: boolean;
    data: { object: { id: string; payment_intent?: string; metadata?: { request_id?: string } } };
  };
  if (event.livemode)
    throw new HttpError(400, 'live_mode_rejected', 'live mode events are not accepted');
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const requestId = s.metadata?.request_id;
    if (requestId?.startsWith('premium_')) {
      await activatePremium(c.env, requestId.slice('premium_'.length), s.id);
    } else if (requestId && s.payment_intent) {
      await markPaid(c.env, requestId, s.id, s.payment_intent);
    }
  }
  return c.json({ received: true });
});

/** Completes a mock checkout session (development/test only). */
paymentRoutes.post('/mock/complete', async (c) => {
  if (!isDevLike(c.env) || c.env.STRIPE_SECRET_KEY) throw notFound();
  const user = requireUser(c);
  const { sessionId } = await parseJson(
    c,
    z.object({ sessionId: z.string().regex(/^mock_cs_[0-9a-f-]{36}$/) }),
  );
  const session = await c.env.KV.get<{ requestId: string; amount: number }>(
    `mockcs:${sessionId}`,
    'json',
  );
  if (!session) throw notFound();
  const r = await first<{ client_id: string }>(
    c.env.DB,
    'SELECT client_id FROM requests WHERE id = ?',
    session.requestId,
  );
  if (!r || r.client_id !== user.id) throw notFound();
  await markPaid(c.env, session.requestId, sessionId, `mock_pi_${crypto.randomUUID()}`);
  await c.env.KV.delete(`mockcs:${sessionId}`);
  return c.json({ requestId: session.requestId });
});

paymentRoutes.get('/mock/:sessionId', async (c) => {
  if (!isDevLike(c.env) || c.env.STRIPE_SECRET_KEY) throw notFound();
  const user = requireUser(c);
  const session = await c.env.KV.get<{ requestId: string; amount: number }>(
    `mockcs:${c.req.param('sessionId')}`,
    'json',
  );
  if (!session) throw notFound();
  const r = await first<{ client_id: string; title: string }>(
    c.env.DB,
    'SELECT client_id, title FROM requests WHERE id = ?',
    session.requestId,
  );
  if (!r || r.client_id !== user.id) throw notFound();
  return c.json({ title: r.title, amount: session.amount, requestId: session.requestId });
});

/** Stripe Connect onboarding for creators (Express account, test mode). */
paymentRoutes.post('/connect', async (c) => {
  const user = requireUser(c);
  const provider = getPaymentProvider(c.env);
  const row = await first<{ stripe_account_id: string | null }>(
    c.env.DB,
    'SELECT stripe_account_id FROM users WHERE id = ?',
    user.id,
  );
  let account = row?.stripe_account_id ?? null;
  if (!account) {
    account = (await provider.createConnectedAccount(user.id)).id;
    await run(c.env.DB, 'UPDATE users SET stripe_account_id = ? WHERE id = ?', account, user.id);
  }
  const link = await provider.accountLink(account, `${c.env.APP_ORIGIN}/settings`);
  return c.json({ url: link.url });
});
