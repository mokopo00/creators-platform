import { describe, expect, it } from 'vitest';
import { hmacHex } from '../../src/server/lib/crypto';
import { verifyStripeSignature } from '../../src/server/lib/payments';

const secret = 'whsec_test_dummy';

describe('Stripe webhook signature', () => {
  it('accepts a valid signature', async () => {
    const t = Math.floor(Date.now() / 1000);
    const body = '{"type":"checkout.session.completed"}';
    const sig = await hmacHex(secret, `${t}.${body}`);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret)).toBe(true);
  });

  it('rejects tampered payloads, wrong secrets and stale timestamps', async () => {
    const t = Math.floor(Date.now() / 1000);
    const body = '{"a":1}';
    const sig = await hmacHex(secret, `${t}.${body}`);
    expect(await verifyStripeSignature('{"a":2}', `t=${t},v1=${sig}`, secret)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_other')).toBe(false);
    const old = t - 3600;
    const oldSig = await hmacHex(secret, `${old}.${body}`);
    expect(await verifyStripeSignature(body, `t=${old},v1=${oldSig}`, secret)).toBe(false);
    expect(await verifyStripeSignature(body, undefined, secret)).toBe(false);
  });
});
