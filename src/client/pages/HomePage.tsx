import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { FIELD_LABELS, FIELDS } from '../../shared/constants';
import { ErrorState, PageTitle, PostGrid } from '../components/common';
import { api } from '../lib/api';
import type { Post } from '../lib/types';
import { PageSkeleton } from '../ui/Skeleton';
import { Tabs } from '../ui/Tabs';

type Tab = 'new' | 'recommended';

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') === 'recommended' ? 'recommended' : 'new') as Tab;
  const field = params.get('field') ?? '';
  const tag = params.get('tag') ?? '';

  const qs = new URLSearchParams({ tab });
  if (field) qs.set('field', field);
  if (tag) qs.set('tag', tag);
  const q = useQuery({
    queryKey: ['feed', tab, field, tag],
    queryFn: () => api<{ posts: Post[] }>(`/api/feed?${qs.toString()}`),
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  if (q.isPending) return <PageSkeleton variant="feed" />;

  return (
    <div data-testid="home-page">
      <PageTitle
        action={
          <Link
            to="/posts/new"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            作品を投稿
          </Link>
        }
      >
        ホーム
      </PageTitle>
      <div className="mb-4 flex flex-col gap-3">
        <Tabs
          label="タイムライン"
          value={tab}
          onChange={(v) => update('tab', v === 'new' ? '' : v)}
          items={[
            { value: 'new', label: '新着' },
            { value: 'recommended', label: 'おすすめ' },
          ]}
        />
        <div role="group" aria-label="分野で絞り込み" className="flex flex-wrap gap-2">
          {['', ...FIELDS].map((f) => (
            <button
              key={f || 'all'}
              type="button"
              aria-pressed={field === f}
              onClick={() => update('field', f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${field === f ? 'bg-accent text-white' : 'glass !rounded-full text-ink-soft hover:text-ink'}`}
            >
              {f ? FIELD_LABELS[f as keyof typeof FIELD_LABELS] : 'すべて'}
            </button>
          ))}
        </div>
        {tag && (
          <p className="text-sm">
            ハッシュタグ <strong>#{tag}</strong> で絞り込み中{' '}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => update('tag', '')}
            >
              解除
            </button>
          </p>
        )}
      </div>
      {q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <PostGrid posts={q.data.posts} />
      )}
    </div>
  );
}
