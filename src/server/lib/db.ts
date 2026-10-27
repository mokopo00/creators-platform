/**
 * Thin helpers over D1 prepared statements. All SQL in this project goes
 * through `prepare().bind()`; never build SQL from user input.
 */
export type Row = Record<string, unknown>;

export async function first<T = Row>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  return (
    (await db
      .prepare(sql)
      .bind(...params)
      .first<T>()) ?? null
  );
}

export async function all<T = Row>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const res = await db
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return res.results ?? [];
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<number> {
  const res = await db
    .prepare(sql)
    .bind(...params)
    .run();
  return res.meta?.changes ?? 0;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Picks a value from an allow-list (used for dynamic ORDER BY etc.). */
export function allow<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

/** Today's date in Asia/Tokyo as YYYY-MM-DD. */
export function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
