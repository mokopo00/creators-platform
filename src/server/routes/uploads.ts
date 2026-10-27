import { Hono } from 'hono';
import { z } from 'zod';
import { uploadRequestSchema } from '../../shared/schemas';
import type { AppBindings } from '../env';
import { hmacSign, hmacVerify } from '../lib/crypto';
import { newId } from '../lib/db';
import { HttpError } from '../lib/errors';
import { matchesMagicBytes, MEDIA_TYPES, stripMetadata, type MediaType } from '../lib/media';
import { rateLimit } from '../lib/security';
import { requireUser } from '../lib/session';
import { parseJson, parseQuery } from '../lib/validate';

const UPLOAD_TTL_SEC = 600;

function signingInput(key: string, type: string, size: number, exp: number, userId: string) {
  return `${key}|${type}|${size}|${exp}|${userId}`;
}

export const uploadRoutes = new Hono<AppBindings>();

/** Issues a short-lived signed upload URL bound to the user, type and size. */
uploadRoutes.post('/', rateLimit('upload', 30, 600), async (c) => {
  const user = requireUser(c);
  const body = await parseJson(c, uploadRequestSchema);
  const spec = MEDIA_TYPES[body.contentType];
  if (body.size > spec.max) {
    throw new HttpError(413, 'too_large', `ファイルサイズは ${spec.max / 1024 / 1024}MB までです`);
  }
  const name = `${newId()}.${spec.ext}`;
  const key = `media/${name}`;
  const exp = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SEC;
  const sig = await hmacSign(
    c.env.SESSION_SECRET,
    signingInput(key, body.contentType, body.size, exp, user.id),
  );
  const qs = new URLSearchParams({
    type: body.contentType,
    size: String(body.size),
    exp: String(exp),
    sig,
  });
  return c.json({ key, uploadUrl: `/api/uploads/${name}?${qs.toString()}` });
});

uploadRoutes.put('/:name', async (c) => {
  const user = requireUser(c);
  const name = c.req.param('name');
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(name)) {
    throw new HttpError(404, 'not_found', '見つかりません');
  }
  const q = parseQuery(
    c,
    z.object({
      type: z.enum(Object.keys(MEDIA_TYPES) as [MediaType, ...MediaType[]]),
      size: z.coerce.number().int().positive(),
      exp: z.coerce.number().int(),
      sig: z.string().min(10).max(100),
    }),
  );
  const key = `media/${name}`;
  const valid = await hmacVerify(
    c.env.SESSION_SECRET,
    signingInput(key, q.type, q.size, q.exp, user.id),
    q.sig,
  );
  if (!valid || q.exp < Date.now() / 1000) {
    throw new HttpError(403, 'invalid_signature', 'アップロード URL が無効か期限切れです');
  }
  if (!name.endsWith(`.${MEDIA_TYPES[q.type].ext}`)) {
    throw new HttpError(415, 'unsupported_media', 'ファイル形式が一致しません');
  }
  if (await c.env.MEDIA.head(key)) throw new HttpError(409, 'exists', 'アップロード済みです');

  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > q.size || q.size > MEDIA_TYPES[q.type].max) {
    throw new HttpError(413, 'too_large', 'ファイルサイズが上限を超えています');
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > q.size) {
    throw new HttpError(413, 'too_large', 'ファイルサイズが申告と一致しません');
  }
  if (!matchesMagicBytes(q.type, bytes)) {
    throw new HttpError(415, 'unsupported_media', 'ファイルの内容が形式と一致しません');
  }
  const clean = stripMetadata(q.type, bytes);
  await c.env.MEDIA.put(key, clean, {
    httpMetadata: { contentType: q.type },
    customMetadata: { owner: user.id },
  });
  return c.json({ key });
});

export const mediaRoutes = new Hono<AppBindings>();

mediaRoutes.get('/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(name)) {
    return c.text('Not found', 404);
  }
  const obj = await c.env.MEDIA.get(`media/${name}`);
  if (!obj) return c.text('Not found', 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Content-Disposition', 'inline');
  return new Response(obj.body, { headers });
});

/** Confirms the media object exists and was uploaded by this user. */
export async function assertOwnMedia(bucket: R2Bucket, key: string, userId: string) {
  const head = await bucket.head(key);
  if (!head || head.customMetadata?.owner !== userId) {
    throw new HttpError(422, 'invalid_media', '添付ファイルが見つかりません');
  }
}
