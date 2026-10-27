import type { Context } from 'hono';
import type { z } from 'zod';
import { HttpError } from './errors';

function fail(err: z.ZodError): never {
  const first = err.issues[0];
  const where = first?.path.join('.') || 'input';
  throw new HttpError(
    400,
    'invalid_input',
    `入力内容が正しくありません（${where}: ${first?.message ?? ''}）`,
  );
}

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON の形式が正しくありません');
  }
  const r = schema.safeParse(body);
  if (!r.success) fail(r.error);
  return r.data;
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) fail(r.error);
  return r.data;
}

export function parseParam<S extends z.ZodType>(value: unknown, schema: S): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(404, 'not_found', '見つかりません');
  return r.data;
}
