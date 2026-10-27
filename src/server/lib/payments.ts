/**
 * Payment provider abstraction.
 * - `stripe`: Stripe Checkout + Connect (Separate charges and transfers), TEST MODE keys only.
 * - `mock`: deterministic in-process provider, available only in development/test,
 *   used by automated tests when no Stripe test key is configured.
 */
import { isDevLike, type Env } from '../env';
import { hmacHex, safeEqual } from './crypto';
import { HttpError } from './errors';

export type CheckoutInput = {
  requestId: string;
  title: string;
  amount: number;
  successUrl: string;
  cancelUrl: string;
};

export interface PaymentProvider {
  kind: 'stripe' | 'mock';
  createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }>;
  refund(paymentIntentId: string, amount: number): Promise<{ id: string }>;
  transfer(input: {
    amount: number;
    destination: string;
    transferGroup: string;
  }): Promise<{ id: string }>;
  createConnectedAccount(userId: string): Promise<{ id: string }>;
  accountLink(accountId: string, returnUrl: string): Promise<{ url: string }>;
}

class StripeProvider implements PaymentProvider {
  kind = 'stripe' as const;
  constructor(private key: string) {}

  private async call<T>(
    path: string,
    params: Record<string, string>,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(params),
    });
    if (!res.ok) {
      // Do not log the response body: it may contain payment details.
      throw new HttpError(502, 'payment_provider_error', '決済サービスとの通信に失敗しました');
    }
    return (await res.json()) as T;
  }

  async createCheckout(i: CheckoutInput) {
    const s = await this.call<{ id: string; url: string }>(
      'checkout/sessions',
      {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'jpy',
        'line_items[0][price_data][unit_amount]': String(i.amount),
        'line_items[0][price_data][product_data][name]': i.title.slice(0, 100),
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        client_reference_id: i.requestId,
        'metadata[request_id]': i.requestId,
        'payment_intent_data[transfer_group]': i.requestId,
        'payment_intent_data[metadata][request_id]': i.requestId,
      },
      `checkout-${i.requestId}-${crypto.randomUUID()}`,
    );
    return { id: s.id, url: s.url };
  }

  async refund(paymentIntentId: string, amount: number) {
    const r = await this.call<{ id: string }>(
      'refunds',
      { payment_intent: paymentIntentId, amount: String(amount) },
      `refund-${paymentIntentId}-${amount}`,
    );
    return { id: r.id };
  }

  async transfer(i: { amount: number; destination: string; transferGroup: string }) {
    const t = await this.call<{ id: string }>(
      'transfers',
      {
        amount: String(i.amount),
        currency: 'jpy',
        destination: i.destination,
        transfer_group: i.transferGroup,
      },
      `transfer-${i.transferGroup}`,
    );
    return { id: t.id };
  }

  async createConnectedAccount(userId: string) {
    const a = await this.call<{ id: string }>('accounts', {
      type: 'express',
      country: 'JP',
      'capabilities[transfers][requested]': 'true',
      'metadata[user_id]': userId,
    });
    return { id: a.id };
  }

  async accountLink(accountId: string, returnUrl: string) {
    const l = await this.call<{ url: string }>('account_links', {
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return { url: l.url };
  }
}

class MockProvider implements PaymentProvider {
  kind = 'mock' as const;
  constructor(private kv: KVNamespace) {}

  async createCheckout(i: CheckoutInput) {
    const id = `mock_cs_${crypto.randomUUID()}`;
    await this.kv.put(
      `mockcs:${id}`,
      JSON.stringify({ requestId: i.requestId, amount: i.amount }),
      {
        expirationTtl: 3600,
      },
    );
    return { id, url: `/checkout/mock/${id}` };
  }
  async refund() {
    return { id: `mock_re_${crypto.randomUUID()}` };
  }
  async transfer() {
    return { id: `mock_tr_${crypto.randomUUID()}` };
  }
  async createConnectedAccount() {
    return { id: `acct_mock_${crypto.randomUUID().slice(0, 8)}` };
  }
  async accountLink(_accountId: string, returnUrl: string) {
    return { url: returnUrl };
  }
}

export function getPaymentProvider(env: Env): PaymentProvider {
  const key = env.STRIPE_SECRET_KEY;
  if (key) {
    if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
      // Live keys are never accepted by this codebase (CLAUDE.md 2-4).
      throw new HttpError(503, 'payments_unavailable', '決済は現在利用できません');
    }
    return new StripeProvider(key);
  }
  if (isDevLike(env)) return new MockProvider(env.KV);
  throw new HttpError(503, 'payments_unavailable', '決済は現在利用できません');
}

/** Verifies a Stripe webhook signature (`Stripe-Signature: t=...,v1=...`). */
export async function verifyStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string,
  toleranceSec = 300,
  now = Date.now(),
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, ...v] = kv.split('=');
      return [k?.trim(), v.join('=')];
    }),
  ) as Record<string, string>;
  const t = Number(parts.t);
  const signatures = header
    .split(',')
    .filter((p) => p.trim().startsWith('v1='))
    .map((p) => p.trim().slice(3));
  if (!t || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return signatures.some((s) => safeEqual(s, expected));
}
