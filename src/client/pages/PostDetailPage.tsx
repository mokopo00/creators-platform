import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AiLabel, Avatar, ErrorState, FieldLabel, PrLabel } from '../components/common';
import { SaveToFolder } from '../components/SaveToFolder';
import { TranslateButton } from '../components/TranslateButton';
import { useMe } from '../lib/auth';
import { api, del, errorMessage, post } from '../lib/api';
import type { Post } from '../lib/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PageSkeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

export function PostDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const q = useQuery({
    queryKey: ['post', id],
    queryFn: () => api<{ post: Post; isOwner: boolean }>(`/api/posts/${encodeURIComponent(id)}`),
  });

  const fav = useMutation({
    mutationFn: (on: boolean) => (on ? post(`/api/favorites/${id}`) : del(`/api/favorites/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['post', id] }),
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => del(`/api/posts/${id}`),
    onSuccess: () => {
      toast.show('削除しました', 'success');
      nav('/');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (q.isPending) return <PageSkeleton variant="detail" />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const p = q.data.post;
  const loggedIn = !!me.data?.user;

  return (
    <article data-testid="post-detail" className="glass overflow-hidden">
      {p.mediaType === 'image' && p.mediaUrl && (
        <img
          src={p.mediaUrl}
          alt={p.title}
          className="max-h-[70vh] w-full bg-white/40 object-contain"
        />
      )}
      {p.mediaType === 'video' && p.mediaUrl && (
        <video
          src={p.mediaUrl}
          controls
          className="max-h-[70vh] w-full bg-black/80"
          aria-label={p.title}
        />
      )}
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <FieldLabel field={p.field} />
          {p.aiAssisted && <AiLabel />}
          {p.promoted && <PrLabel />}
        </div>
        <h1 className="text-2xl font-bold">{p.title}</h1>
        <Link
          to={`/u/${p.author.handle}`}
          className="flex items-center gap-2 text-sm hover:underline"
        >
          <Avatar name={p.author.displayName} url={p.author.avatarUrl} size={28} />
          {p.author.displayName}
        </Link>
        {p.body && (
          <div>
            <p className="whitespace-pre-wrap leading-relaxed">{p.body}</p>
            <TranslateButton text={p.body} />
          </div>
        )}
        {p.hashtags.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="ハッシュタグ">
            {p.hashtags.map((t) => (
              <li key={t}>
                <Link
                  to={`/?tag=${encodeURIComponent(t)}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  #{t}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-soft">
          閲覧 {p.viewCount} ・ 保存 {p.saveCount} ・{' '}
          {new Date(p.createdAt + 'Z').toLocaleDateString('ja-JP')}
        </p>
        <div className="flex flex-wrap gap-2">
          {loggedIn && (
            <Button
              variant={p.isFavorited ? 'primary' : 'secondary'}
              aria-pressed={p.isFavorited}
              onClick={() => fav.mutate(!p.isFavorited)}
            >
              {p.isFavorited ? '♥ お気に入り済み' : '♡ お気に入り'}
            </Button>
          )}
          {loggedIn && <SaveToFolder postId={p.id} />}
          {q.data.isOwner && (
            <>
              <Link
                to={`/posts/${p.id}/edit`}
                className="glass !rounded-full px-5 py-2 text-sm font-semibold"
              >
                編集
              </Link>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                削除
              </Button>
            </>
          )}
          {!q.data.isOwner && (
            <Link
              to={`/report?type=post&id=${p.id}`}
              className="ml-auto self-center text-xs text-ink-soft underline"
            >
              通報する
            </Link>
          )}
        </div>
      </div>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="作品を削除しますか？"
      >
        <p className="mb-4 text-sm">この操作は取り消せません。</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            削除する
          </Button>
        </div>
      </Modal>
    </article>
  );
}
