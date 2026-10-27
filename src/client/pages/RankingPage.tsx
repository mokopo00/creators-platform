import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { FIELD_LABELS, FIELDS } from '../../shared/constants';
import { EmptyState, ErrorState, FilterChip, PageTitle, PostCard } from '../components/common';
import { api } from '../lib/api';
import type { Post } from '../lib/types';
import { staggerContainer } from '../ui/motion';
import { PageSkeleton } from '../ui/Skeleton';
import { Tabs } from '../ui/Tabs';

type Ranking = {
  period: string;
  computedAt: string | null;
  items: { rank: number; score: number; post: Post }[];
  popularTags: string[];
};

export function RankingPage() {
  const [params, setParams] = useSearchParams();
  const period = params.get('period') === 'monthly' ? 'monthly' : 'weekly';
  const field = params.get('field') ?? '';
  const tag = params.get('tag') ?? '';
  const qs = new URLSearchParams({ period });
  if (field) qs.set('field', field);
  if (tag) qs.set('tag', tag);
  const q = useQuery({
    queryKey: ['ranking', period, field, tag],
    queryFn: () => api<Ranking>(`/api/rankings?${qs.toString()}`),
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'field') next.delete('tag');
    if (k === 'tag') next.delete('field');
    setParams(next, { replace: true });
  };

  if (q.isPending) return <PageSkeleton variant="feed" />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  return (
    <div data-testid="ranking-page">
      <PageTitle>ランキング</PageTitle>
      <div className="mb-4 flex flex-col gap-3">
        <Tabs
          label="集計期間"
          value={period}
          onChange={(v) => set('period', v === 'weekly' ? '' : v)}
          items={[
            { value: 'weekly', label: '週間' },
            { value: 'monthly', label: '月間' },
          ]}
        />
        <div role="group" aria-label="分野" className="flex flex-wrap gap-2">
          {['', ...FIELDS].map((f) => (
            <FilterChip
              key={f || 'all'}
              active={field === f && !tag}
              onClick={() => set('field', f)}
            >
              {f ? FIELD_LABELS[f as keyof typeof FIELD_LABELS] : '総合'}
            </FilterChip>
          ))}
        </div>
        {q.data.popularTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-soft">ハッシュタグ別</span>
            {q.data.popularTags.map((t) => (
              <FilterChip key={t} active={tag === t} onClick={() => set('tag', t)}>
                #{t}
              </FilterChip>
            ))}
          </div>
        )}
      </div>
      {q.data.items.length === 0 ? (
        <EmptyState>
          集計対象の作品はまだありません。
          <Link to="/" className="text-accent underline">
            新着
          </Link>
          を見る
        </EmptyState>
      ) : (
        <motion.ol
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-4 lg:grid-cols-3"
          data-testid="ranking-list"
        >
          {q.data.items.map((it) => (
            <li key={it.post.id} className="relative">
              <span
                aria-label={`${it.rank}位`}
                className="absolute -left-1 -top-1 z-10 flex size-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white shadow"
              >
                {it.rank}
              </span>
              <PostCard post={it.post} />
            </li>
          ))}
        </motion.ol>
      )}
      {q.data.computedAt && (
        <p className="mt-4 text-xs text-ink-soft">
          集計日時: {new Date(q.data.computedAt).toLocaleString('ja-JP')}
        </p>
      )}
    </div>
  );
}
