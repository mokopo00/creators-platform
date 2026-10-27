import type { Context, MiddlewareHandler } from 'hono';
import type { AppBindings } from '../env';
import { HttpError } from './errors';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "media-src 'self' blob:",
  "connect-src 'self' wss: ws:",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://checkout.stripe.com",
  "object-src 'none'",
].join('; ');

export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  if (c.res.status === 101) return; // WebSocket upgrade responses have immutable headers
  const h = c.res.headers;
  h.set('Content-Security-Policy', CSP);
  h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  h.set('X-Frame-Options', 'DENY');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
};

/**
 * CSRF protection: state-changing requests must carry an Origin header that
 * matches the app origin. GET/HEAD/OPTIONS never change state.
 */
export const originCheck: MiddlewareHandler<AppBindings> = async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (c.req.path === '/api/payments/webhook') return next(); // verified by Stripe signature
  const origin = c.req.header('Origin');
  const allowed = new Set([c.env.APP_ORIGIN, new URL(c.req.url).origin]);
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, 'forbidden_origin', '不正なリクエスト元です');
  }
  return next();
};

/** Fixed-window rate limiter backed by KV. */
export function rateLimit(
  bucket: string,
  limit: number,
  windowSec: number,
): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    await enforceRateLimit(c, bucket, limit, windowSec);
    return next();
  };
}

export async function enforceRateLimit(
  c: Context<AppBindings>,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<void> {
  const who = c.get('user')?.id ?? c.req.header('CF-Connecting-IP') ?? 'anon';
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${bucket}:${who}:${window}`;
  const current = Number((await c.env.KV.get(key)) ?? '0');
  if (current >= limit) {
    throw new HttpError(
      429,
      'rate_limited',
      'リクエストが多すぎます。しばらくしてから再度お試しください',
    );
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: Math.max(60, windowSec * 2) });
}
