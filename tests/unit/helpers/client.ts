import { createApp } from '../../../src/server/app';
import type { Env } from '../../../src/server/env';
import { createEnv } from './fakes';

const ORIGIN = 'http://localhost';

/** Minimal cookie-aware client for the Hono app. */
export class TestClient {
  cookie = '';
  constructor(
    public app: ReturnType<typeof createApp>,
    public env: Env,
  ) {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (method !== 'GET' && !('Origin' in headers)) h.Origin = ORIGIN;
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) {
      payload = body as BodyInit;
    } else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await this.app.request(
      `${ORIGIN}${path}`,
      { method, headers: h, body: payload },
      this.env,
    );
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = /__Host-sid=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `__Host-sid=${m[1]}` : '';
    }
    return res;
  }
  get(path: string) {
    return this.req('GET', path);
  }
  post(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.req('POST', path, body ?? {}, headers);
  }
  patch(path: string, body?: unknown) {
    return this.req('PATCH', path, body ?? {});
  }
  put(path: string, body?: unknown) {
    return this.req('PUT', path, body ?? {});
  }
  delete(path: string) {
    return this.req('DELETE', path);
  }
  async login(handle: string, adult = true) {
    const res = await this.post('/api/auth/mock-login', { handle, displayName: handle, adult });
    if (res.status !== 200) throw new Error(`login failed ${res.status}`);
    return ((await res.json()) as { userId: string }).userId;
  }
}

export function setup(overrides: Partial<Env> = {}) {
  const { env, sqlite } = createEnv(overrides);
  const app = createApp();
  const client = (): TestClient => new TestClient(app, env);
  return { env, sqlite, app, client };
}
