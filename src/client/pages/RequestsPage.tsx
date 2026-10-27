import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Avatar, ErrorState, LoginRequired, PageTitle } from '../components/common';
import { api, yen } from '../lib/api';
import { useMe } from '../lib/auth';
import { STATUS_LABELS } from '../lib/labels';
import type { RequestSummary } from '../lib/types';
import { fadeUp, staggerContainer } from '../ui/motion';
import { PageSkeleton } from '../ui/Skeleton';

export function RequestsPage() {
  const me = useMe();
  const q = useQuery({
    queryKey: ['requests'],
    queryFn: () => api<{ requests: RequestSummary[] }>('/api/requests'),
    enabled: !!me.data?.user,
  });
  if (me.isPending || (me.data?.user && q.isPending)) return <PageSkeleton variant="list" />;
  if (!me.data?.user) return <LoginRequired />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const list = q.data?.requests ?? [];

  return (
    <div data-testid="requests-page">
      <PageTitle>依頼</PageTitle>
      {list.length === 0 ? (
        <p className="glass p-6 text-center text-sm text-ink-soft">依頼はまだありません</p>
      ) : (
        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-2"
        >
          {list.map((r) => (
            <motion.li key={r.id} variants={fadeUp}>
              <Link
                to={`/requests/${r.id}`}
                className="glass flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5"
              >
                <Avatar name={r.counterpart.displayName} url={r.counterpart.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-xs text-ink-soft">
                    {r.role === 'creator' ? '依頼者' : 'クリエイター'}: {r.counterpart.displayName}{' '}
                    ・ 納期 {r.dueDate} ・ {yen(r.price)}
                  </p>
                </div>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
