export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503 | 504,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, 'not_found', '見つかりません');
export const forbidden = () => new HttpError(403, 'forbidden', '権限がありません');
export const unauthorized = () => new HttpError(401, 'unauthorized', 'ログインが必要です');
