import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { mockLoginSchema } from '../../shared/schemas';
import { mockAuthEnabled, type AppBindings, type Env } from '../env';
import { randomToken, sha256 } from '../lib/crypto';
import { first, newId, run } from '../lib/db';
import { HttpError } from '../lib/errors';
import { rateLimit } from '../lib/security';
import { createSession, destroySession } from '../lib/session';
import { parseJson, parseQuery } from '../lib/validate';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = '__Host-oauth_state';

type PendingAuth = { verifier: string; redirectUri: string; returnTo: string };

export function googleConfigured(env: Env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.OAUTH_REDIRECT_URIS);
}

/** The redirect URI must be on the configured allow-list and belong to this app. */
export function resolveRedirectUri(env: Env): string {
  const expected = `${env.APP_ORIGIN}/api/auth/google/callback`;
  const allowList = (env.OAUTH_REDIRECT_URIS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowList.includes(expected)) {
    throw new HttpError(500, 'oauth_misconfigured', 'ログイン設定が正しくありません');
  }
  return expected;
}

/** Only allow same-site relative paths as post-login destinations (no open redirect). */
export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return '/';
  return value;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  if (!part) throw new HttpError(401, 'invalid_token', 'ログインに失敗しました');
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(json, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

async function upsertUser(
  env: Env,
  sub: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<string> {
  const existing = await first<{ id: string; deleted_at: string | null }>(
    env.DB,
    'SELECT id, deleted_at FROM users WHERE google_sub = ?',
    sub,
  );
  if (existing) {
    if (existing.deleted_at)
      throw new HttpError(403, 'account_deleted', 'このアカウントは削除されています');
    return existing.id;
  }
  const id = newId();
  const handle = `user-${randomToken(6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, 'x')}`;
  await run(
    env.DB,
    'INSERT INTO users (id, google_sub, handle, display_name, avatar_url) VALUES (?, ?, ?, ?, ?)',
    id,
    sub,
    handle,
    displayName.slice(0, 50) || 'ユーザー',
    avatarUrl,
  );
  return id;
}

export const authRoutes = new Hono<AppBindings>();

authRoutes.get('/providers', (c) =>
  c.json({ google: googleConfigured(c.env), mock: mockAuthEnabled(c.env) }),
);

authRoutes.get('/google/start', rateLimit('login', 20, 600), async (c) => {
  if (!googleConfigured(c.env)) {
    throw new HttpError(503, 'oauth_unavailable', 'Google ログインは現在利用できません');
  }
  const { returnTo } = parseQuery(c, z.object({ returnTo: z.string().max(200).optional() }));
  const redirectUri = resolveRedirectUri(c.env);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  const pending: PendingAuth = { verifier, redirectUri, returnTo: safeReturnTo(returnTo) };
  await c.env.KV.put(`oauth:${state}`, JSON.stringify(pending), { expirationTtl: 600 });
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return c.redirect(url.toString(), 302);
});

authRoutes.get('/google/callback', rateLimit('login', 20, 600), async (c) => {
  const q = parseQuery(
    c,
    z.object({
      code: z.string().min(1).max(2048).optional(),
      state: z.string().min(1).max(200),
      error: z.string().optional(),
    }),
  );
  const cookieState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/', secure: true });
  if (!cookieState || cookieState !== q.state) {
    throw new HttpError(400, 'invalid_state', 'ログイン状態の検証に失敗しました');
  }
  const pending = await c.env.KV.get<PendingAuth>(`oauth:${q.state}`, 'json');
  await c.env.KV.delete(`oauth:${q.state}`);
  if (!pending) throw new HttpError(400, 'invalid_state', 'ログイン状態の検証に失敗しました');
  if (q.error || !q.code) return c.redirect('/login?error=cancelled', 302);
  if (pending.redirectUri !== resolveRedirectUri(c.env)) {
    throw new HttpError(400, 'invalid_redirect', 'ログイン設定が正しくありません');
  }

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: q.code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: pending.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: pending.verifier,
    }),
  });
  if (!tokenRes.ok) throw new HttpError(401, 'token_exchange_failed', 'ログインに失敗しました');
  const token = (await tokenRes.json()) as { id_token?: string };
  if (!token.id_token) throw new HttpError(401, 'token_exchange_failed', 'ログインに失敗しました');

  // The ID token comes straight from Google's token endpoint over TLS
  // (OIDC Core 3.1.3.7), so we validate the claims rather than the signature.
  const claims = decodeJwtPayload(token.id_token);
  const issOk =
    claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const audOk = claims.aud === c.env.GOOGLE_CLIENT_ID;
  const expOk = typeof claims.exp === 'number' && claims.exp * 1000 > Date.now();
  if (!issOk || !audOk || !expOk || typeof claims.sub !== 'string') {
    throw new HttpError(401, 'invalid_token', 'ログインに失敗しました');
  }
  // Only sub, display name and avatar URL are kept. The e-mail is never requested or stored.
  const userId = await upsertUser(
    c.env,
    `google:${claims.sub}`,
    typeof claims.name === 'string' ? claims.name : 'ユーザー',
    typeof claims.picture === 'string' ? claims.picture : null,
  );
  await createSession(c, userId);
  return c.redirect(pending.returnTo, 302);
});

/** Test-only login. Returns 404 unless ENVIRONMENT is development/test and MOCK_AUTH=true. */
authRoutes.post('/mock-login', async (c) => {
  if (!mockAuthEnabled(c.env)) throw new HttpError(404, 'not_found', '見つかりません');
  const body = await parseJson(c, mockLoginSchema);
  const userId = await upsertUser(
    c.env,
    `mock:${body.handle}`,
    body.displayName ?? body.handle,
    null,
  );
  const existing = await first<{ handle: string }>(
    c.env.DB,
    'SELECT handle FROM users WHERE id = ?',
    userId,
  );
  if (existing && existing.handle.startsWith('user-')) {
    const taken = await first(c.env.DB, 'SELECT 1 FROM users WHERE handle = ?', body.handle);
    if (!taken)
      await run(c.env.DB, 'UPDATE users SET handle = ? WHERE id = ?', body.handle, userId);
  }
  if (body.adult) {
    await run(
      c.env.DB,
      "UPDATE users SET age_confirmed_adult = 1, age_confirmed_at = datetime('now') WHERE id = ?",
      userId,
    );
  }
  await createSession(c, userId);
  return c.json({ ok: true, userId });
});

authRoutes.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});
