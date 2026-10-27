export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.error?.code ?? 'error',
      data.error?.message ?? '通信に失敗しました',
    );
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export async function uploadFile(file: File): Promise<string> {
  const { key, uploadUrl } = await post<{ key: string; uploadUrl: string }>('/api/uploads', {
    contentType: file.type,
    size: file.size,
  });
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': file.type },
    body: file,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    throw new ApiError(
      res.status,
      'upload_failed',
      data.error?.message ?? 'アップロードに失敗しました',
    );
  }
  return key;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '予期しないエラーが発生しました';
}

export function yen(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}
