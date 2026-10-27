/**
 * In-process fakes of Cloudflare bindings for unit tests.
 * D1 is backed by Node's built-in SQLite (node:sqlite) with the real migrations,
 * so SQL, constraints and FTS5 behave like production.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Env } from '../../../src/server/env';

type Params = SQLInputValue[];

function normalize(params: unknown[]): Params {
  return params.map((p) =>
    p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p,
  ) as Params;
}

class FakeStatement {
  private params: Params = [];
  constructor(
    private db: DatabaseSync,
    private sql: string,
  ) {}
  bind(...params: unknown[]) {
    const s = new FakeStatement(this.db, this.sql);
    s.params = normalize(params);
    return s;
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as
      Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...this.params) as T[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
    };
  }
  async raw<T>() {
    const rows = this.db.prepare(this.sql).all(...this.params) as Record<string, unknown>[];
    return rows.map((r) => Object.values(r)) as T[];
  }
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = join(import.meta.dirname, '../../../migrations');
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  const d1 = {
    prepare: (sql: string) => new FakeStatement(db, sql),
    batch: async (stmts: FakeStatement[]) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return { d1: d1 as unknown as D1Database, raw: db };
}

export function createKV(): KVNamespace {
  const store = new Map<string, string>();
  const kv = {
    get: async (key: string, type?: string | { type: string }) => {
      const v = store.get(key);
      if (v === undefined) return null;
      const t = typeof type === 'string' ? type : type?.type;
      return t === 'json' ? JSON.parse(v) : v;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [...store.keys()].map((name) => ({ name })), list_complete: true }),
  };
  return kv as unknown as KVNamespace;
}

export function createR2(): R2Bucket {
  const store = new Map<string, { body: Uint8Array; contentType?: string }>();
  const r2 = {
    put: async (
      key: string,
      value: ArrayBuffer | Uint8Array,
      opts?: { httpMetadata?: { contentType?: string } },
    ) => {
      store.set(key, {
        body: value instanceof Uint8Array ? value : new Uint8Array(value),
        contentType: opts?.httpMetadata?.contentType,
      });
      return { key };
    },
    get: async (key: string) => {
      const v = store.get(key);
      if (!v) return null;
      return {
        body: new Blob([v.body as unknown as ArrayBuffer]).stream(),
        httpMetadata: { contentType: v.contentType },
        arrayBuffer: async () => v.body.buffer,
        writeHttpMetadata: (h: Headers) => {
          if (v.contentType) h.set('content-type', v.contentType);
        },
        httpEtag: '"x"',
      };
    },
    head: async (key: string) => (store.has(key) ? { key } : null),
    delete: async (key: string | string[]) => {
      for (const k of Array.isArray(key) ? key : [key]) store.delete(k);
    },
    _store: store,
  };
  return r2 as unknown as R2Bucket;
}

export function createEnv(overrides: Partial<Env> = {}) {
  const { d1, raw } = createD1();
  const env: Env = {
    DB: d1,
    KV: createKV(),
    MEDIA: createR2(),
    ENVIRONMENT: 'test',
    APP_ORIGIN: 'http://localhost',
    MOCK_AUTH: 'true',
    SESSION_SECRET: 'test-secret-not-for-production-0123456789',
    ALLOW_AI_GENERATED: 'false',
    PLATFORM_FEE_RATE: '0.10',
    ...overrides,
  };
  return { env, sqlite: raw };
}
