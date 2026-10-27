/**
 * Authorization helpers. Every resource access checks ownership/participation
 * on the server using the session user; IDs sent by the client are never
 * trusted on their own. Non-visible resources return 404 to avoid leaking
 * their existence.
 */
import { first } from './db';
import { forbidden, notFound } from './errors';

export type RequestRow = {
  id: string;
  creator_id: string;
  client_id: string;
  title: string;
  details: string;
  price: number;
  due_date: string;
  status: string;
  delay_terms_agreed_at: string;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  delivery_note: string | null;
  client_approved_at: string | null;
  creator_approved_at: string | null;
  reduction_amount: number;
  payout_amount: number | null;
  platform_fee: number | null;
  payout_status: string;
  transfer_id: string | null;
  refund_amount: number;
  refund_id: string | null;
  created_at: string;
};

export async function requireRequestParticipant(
  db: D1Database,
  requestId: string,
  userId: string,
): Promise<RequestRow & { role: 'creator' | 'client' }> {
  const row = await first<RequestRow>(
    db,
    'SELECT * FROM requests WHERE id = ? AND (creator_id = ? OR client_id = ?)',
    requestId,
    userId,
    userId,
  );
  if (!row) throw notFound();
  return { ...row, role: row.creator_id === userId ? 'creator' : 'client' };
}

export async function requirePostOwner(
  db: D1Database,
  postId: string,
  userId: string,
): Promise<void> {
  const row = await first<{ author_id: string }>(
    db,
    'SELECT author_id FROM posts WHERE id = ?',
    postId,
  );
  if (!row) throw notFound();
  if (row.author_id !== userId) throw forbidden();
}

export async function requireFolderOwner(
  db: D1Database,
  folderId: string,
  userId: string,
): Promise<void> {
  const row = await first(
    db,
    'SELECT 1 FROM folders WHERE id = ? AND user_id = ?',
    folderId,
    userId,
  );
  if (!row) throw notFound();
}
