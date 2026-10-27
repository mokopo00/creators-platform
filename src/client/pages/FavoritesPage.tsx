import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, LoginRequired, PageTitle, PostGrid } from '../components/common';
import { api, del, errorMessage, post } from '../lib/api';
import { useMe } from '../lib/auth';
import type { Post } from '../lib/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Input } from '../ui/Input';
import { PageSkeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

export function FavoritesPage() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const enabled = !!me.data?.user;
  const favs = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api<{ posts: Post[] }>('/api/favorites'),
    enabled,
  });
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => api<{ folders: { id: string; name: string; count: number }[] }>('/api/folders'),
    enabled,
  });
  const create = useMutation({
    mutationFn: () => post('/api/folders', { name }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (me.isPending || (enabled && (favs.isPending || folders.isPending)))
    return <PageSkeleton variant="feed" />;
  if (!enabled) return <LoginRequired />;
  if (favs.isError)
    return <ErrorState message={favs.error.message} onRetry={() => favs.refetch()} />;

  return (
    <div data-testid="favorites-page" className="flex flex-col gap-5">
      <PageTitle>お気に入り</PageTitle>
      <section aria-labelledby="folders-h" className="glass flex flex-col gap-3 p-4">
        <h2 id="folders-h" className="text-base font-bold">
          保存フォルダ
        </h2>
        <ul className="flex flex-wrap gap-2">
          {folders.data?.folders.map((f) => (
            <li key={f.id}>
              <Link
                to={`/favorites/folders/${f.id}`}
                className="glass inline-flex h-8 items-center gap-1.5 !rounded-full px-3 text-xs font-semibold"
              >
                <Icon name="folder" size="sm" />
                {f.name} <span className="text-ink-soft">({f.count})</span>
              </Link>
            </li>
          ))}
        </ul>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="flex-1">
            <Input
              label="フォルダを作成"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit">作成</Button>
        </form>
      </section>
      <PostGrid posts={favs.data!.posts} empty="お気に入りはまだありません" />
    </div>
  );
}

export function FolderPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['folder', id],
    queryFn: () => api<{ name: string; posts: Post[] }>(`/api/folders/${encodeURIComponent(id)}`),
  });
  const remove = useMutation({
    mutationFn: (postId: string) => del(`/api/folders/${id}/items/${postId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folder', id] }),
  });
  if (q.isPending) return <PageSkeleton variant="feed" />;
  if (q.isError) return <ErrorState message={q.error.message} />;
  return (
    <div>
      <PageTitle>{q.data.name}</PageTitle>
      <PostGrid posts={q.data.posts} empty="このフォルダは空です" />
      {q.data.posts.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 text-xs">
          {q.data.posts.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="text-ink-soft underline"
                onClick={() => remove.mutate(p.id)}
              >
                「{p.title}」をフォルダから外す
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
