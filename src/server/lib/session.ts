import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppBindings, Env, SessionUser } from '../env';
import { hmacSign, hmacVerify, randomToken } from './crypto';
import { first } from './db';
import { todayJst } from './db';
import { unauthorized } from './errors';

export const SESSION_COOKIE = '__Host-sid';
const SESSION_TTL_SEC = 60 * 60 * 24 * 14;

type StoredSession = { userId: string; createdAt: number };

export async function createSession(c: Context<AppBindings>, userId: string): Promise<void> {
  const id = randomToken(32);
  const data: StoredSession = { userId, createdAt: Date.now() };
  await c.env.KV.put(`sess:${id}`, JSON.stringify(data), { expirationTtl: SESSION_TTL_SEC });
  const sig = await hmacSign(c.env.SESSION_SECRET, id);
  setCookie(c, SESSION_COOKIE, `${id}.${sig}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
}

export async function destroySession(c: Context<AppBindings>): Promise<void> {
  const sid = c.get('sessionId');
  if (sid) await c.env.KV.delete(`sess:${sid}`);
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}

export async function loadUser(env: Env, userId: string): Promise<SessionUser | null> {
  const row = await first<{
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
    is_creator: number;
    age_confirmed_adult: number;
    premium_until: string | null;
  }>(
    env.DB,
    'SELECT id, handle, display_name, avatar_url, is_creator, age_confirmed_adult, premium_until FROM users WHERE id = ? AND deleted_at IS NULL',
    userId,
  );
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isCreator: row.is_creator === 1,
    isAdult: row.age_confirmed_adult === 1,
    isPremium: !!row.premium_until && row.premium_until >= todayJst(),
  };
}

/** Resolves the signed session cookie into `c.var.user` (or null). */
export const sessionMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  c.set('user', null);
  c.set('sessionId', null);
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const [id, sig] = raw.split('.');
    if (id && sig && (await hmacVerify(c.env.SESSION_SECRET, id, sig))) {
      const stored = await c.env.KV.get<StoredSession>(`sess:${id}`, 'json');
      if (stored) {
        const user = await loadUser(c.env, stored.userId);
        if (user) {
          c.set('user', user);
          c.set('sessionId', id);
        }
      }
    }
  }
  await next();
};

export function requireUser(c: Context<AppBindings>): SessionUser {
  const user = c.get('user');
  if (!user) throw unauthorized();
  return user;
}
