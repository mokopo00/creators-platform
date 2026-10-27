import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ErrorState, LoginRequired, PageTitle } from '../components/common';
import { api, post } from '../lib/api';
import { useMe } from '../lib/auth';
import { Button } from '../ui/Button';
import { fadeUp, staggerContainer } from '../ui/motion';
import { PageSkeleton } from '../ui/Skeleton';

type Notification = {
  id: string;
  kind: string;
  message: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ notifications: Notification[] }>('/api/notifications'),
    enabled: !!me.data?.user,
  });
  const readAll = useMutation({
    mutationFn: () => post('/api/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries(),
  });
  const read = useMutation({
    mutationFn: (id: string) => post(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  if (me.isPending || (me.data?.user && q.isPending)) return <PageSkeleton variant="list" />;
  if (!me.data?.user) return <LoginRequired />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const list = q.data?.notifications ?? [];

  return (
    <div data-testid="notifications-page">
      <PageTitle
        action={
          list.some((n) => !n.readAt) && (
            <Button variant="secondary" onClick={() => readAll.mutate()}>
              すべて既読にする
            </Button>
          )
        }
      >
        通知
      </PageTitle>
      {list.length === 0 ? (
        <p className="glass p-6 text-center text-sm text-ink-soft">通知はありません</p>
      ) : (
        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-2"
        >
          {list.map((n) => (
            <motion.li key={n.id} variants={fadeUp}>
              <Link
                to={n.link || '/'}
                onClick={() => !n.readAt && read.mutate(n.id)}
                className={`glass flex items-start gap-3 p-4 text-sm ${n.readAt ? 'opacity-70' : ''}`}
              >
                {!n.readAt && (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                    aria-label="未読"
                  />
                )}
                <span className="flex-1">{n.message}</span>
                <time className="shrink-0 text-xs text-ink-soft" dateTime={n.createdAt}>
                  {new Date(n.createdAt.replace(' ', 'T') + 'Z').toLocaleString('ja-JP')}
                </time>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
