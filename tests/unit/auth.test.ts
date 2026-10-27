import { describe, expect, it } from 'vitest';
import { resolveRedirectUri, safeReturnTo } from '../../src/server/routes/auth';
import { setup } from './helpers/client';

describe('authentication', () => {
  it('only exposes Google as a login provider outside dev/test', async () => {
    const { client } = setup({ ENVIRONMENT: 'staging', MOCK_AUTH: 'true' });
    const res = await client().get('/api/auth/providers');
    expect(await res.json()).toEqual({ google: false, mock: false });
  });

  it('disables mock login on staging and production even if MOCK_AUTH=true', async () => {
    for (const ENVIRONMENT of ['staging', 'production'] as const) {
      const { client } = setup({ ENVIRONMENT, MOCK_AUTH: 'true' });
      const res = await client().post('/api/auth/mock-login', { handle: 'test-user-01' });
      expect(res.status).toBe(404);
    }
  });

  it('mock login creates a signed HttpOnly session cookie', async () => {
    const { client } = setup();
    const c = client();
    const res = await c.post('/api/auth/mock-login', { handle: 'test-user-01' });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('__Host-sid=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    const me = (await (await c.get('/api/me')).json()) as { user: { handle: string } };
    expect(me.user.handle).toBe('test-user-01');
  });

  it('rejects a tampered session cookie', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-user-01');
    c.cookie = c.cookie.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
    const me = (await (await c.get('/api/me')).json()) as { user: unknown };
    expect(me.user).toBeNull();
  });

  it('logout invalidates the session', async () => {
    const { client } = setup();
    const c = client();
    await c.login('test-user-01');
    const stolen = c.cookie;
    await c.post('/api/auth/logout');
    c.cookie = stolen;
    const me = (await (await c.get('/api/me')).json()) as { user: unknown };
    expect(me.user).toBeNull();
  });

  it('starts Google OAuth with PKCE (S256) and state, using an allow-listed redirect_uri', async () => {
    const { client } = setup({
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      OAUTH_REDIRECT_URIS: 'http://localhost/api/auth/google/callback',
    });
    const res = await client().get('/api/auth/google/start');
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://accounts.google.com');
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('code_challenge')).toBeTruthy();
    expect(loc.searchParams.get('state')).toBeTruthy();
    expect(loc.searchParams.get('redirect_uri')).toBe('http://localhost/api/auth/google/callback');
    expect(loc.searchParams.get('scope')).toBe('openid profile');
  });

  it('rejects an OAuth callback whose state does not match the browser cookie', async () => {
    const { client } = setup({
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      OAUTH_REDIRECT_URIS: 'http://localhost/api/auth/google/callback',
    });
    const res = await client().get('/api/auth/google/callback?code=abc&state=forged');
    expect(res.status).toBe(400);
  });

  it('refuses redirect URIs that are not on the allow-list', () => {
    expect(() =>
      resolveRedirectUri({
        APP_ORIGIN: 'https://evil.invalid',
        OAUTH_REDIRECT_URIS: 'http://localhost/api/auth/google/callback',
      } as never),
    ).toThrow();
  });

  it('prevents open redirects after login', () => {
    expect(safeReturnTo('//evil.invalid')).toBe('/');
    expect(safeReturnTo('https://evil.invalid')).toBe('/');
    expect(safeReturnTo('/\\evil.invalid')).toBe('/');
    expect(safeReturnTo('/requests')).toBe('/requests');
  });

  it('rejects state-changing requests without a matching Origin (CSRF)', async () => {
    const { client } = setup();
    const c = client();
    const res = await c.post(
      '/api/auth/mock-login',
      { handle: 'test-user-01' },
      { Origin: 'https://evil.invalid' },
    );
    expect(res.status).toBe(403);
  });

  it('sets security headers', async () => {
    const { client } = setup();
    const res = await client().get('/api/health');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBeTruthy();
    expect(res.headers.get('permissions-policy')).toBeTruthy();
  });
});
