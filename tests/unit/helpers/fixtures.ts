import type { TestClient } from './client';

/** A structurally valid JPEG prefix with an EXIF (APP1) segment containing a fake GPS marker. */
export function jpegWithExif(): Uint8Array {
  const exifPayload = [...'Exif\0\0GPS-35.0000,139.0000'].map((ch) => ch.charCodeAt(0));
  const app1Len = exifPayload.length + 2;
  const dqt = [0xff, 0xdb, 0x00, 0x04, 0x00, 0x00];
  const sos = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9];
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    app1Len >> 8,
    app1Len & 0xff,
    ...exifPayload,
    ...dqt,
    ...sos,
  ]);
}

export function pngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
    0x60, 0x82,
  ]);
}

export async function uploadImage(
  c: TestClient,
  bytes = jpegWithExif(),
  contentType = 'image/jpeg',
) {
  const r = await c.post('/api/uploads', { contentType, size: bytes.length });
  const { key, uploadUrl } = (await r.json()) as { key: string; uploadUrl: string };
  const put = await c.req('PUT', uploadUrl, bytes, { 'content-type': contentType });
  return { key, status: put.status };
}

export async function createPost(c: TestClient, overrides: Record<string, unknown> = {}) {
  const { key } = await uploadImage(c);
  const res = await c.post('/api/posts', {
    title: 'テスト作品',
    body: '架空のテスト投稿です',
    mediaType: 'image',
    mediaKey: key,
    field: 'illustration',
    hashtags: ['風景', 'テスト'],
    aiAssisted: false,
    originalConfirmed: true,
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`createPost ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}
