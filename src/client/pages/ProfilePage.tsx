import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, ErrorState, PostGrid } from '../components/common';
import { TranslateButton } from '../components/TranslateButton';
import { api, del, errorMessage, post, yen } from '../lib/api';
import type { CreatorProfile } from '../lib/types';
import { Button } from '../ui/Button';
import { PageSkeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

export function ProfilePage() {
  const { handle = '' } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['user', handle],
    queryFn: () => api<CreatorProfile>(`/api/users/${encodeURIComponent(handle)}`),
  });

  const theme = q.data?.user.theme;
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.portfolioTheme = theme;
    return () => {
      delete document.documentElement.dataset.portfolioTheme;
    };
  }, [theme]);

  const follow = useMutation({
    mutationFn: (on: boolean) =>
      on ? post(`/api/users/${handle}/follow`) : del(`/api/users/${handle}/follow`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', handle] }),
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (q.isPending) return <PageSkeleton variant="profile" />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const { user, settings } = q.data;

  return (
    <div data-testid="profile-page" className="flex flex-col gap-5">
      <section className="glass flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={user.displayName} url={user.avatarUrl} size={80} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-bold">
            {user.decoration && <span aria-hidden="true">{user.decoration} </span>}
            {user.displayName}
          </h1>
          <p className="text-sm text-ink-soft">@{user.handle}</p>
          {user.bio && (
            <div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{user.bio}</p>
              <TranslateButton text={user.bio} />
            </div>
          )}
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex gap-1">
              <dt className="text-ink-soft">実績</dt>
              <dd className="font-semibold" data-testid="completed-count">
                {user.completedCount}件
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-ink-soft">フォロワー</dt>
              <dd className="font-semibold">{user.followerCount}</dd>
            </div>
            {user.isCreator && (
              <div className="flex gap-1">
                <dt className="text-ink-soft">受付状況</dt>
                <dd className="font-semibold" data-testid="capacity">
                  {user.acceptingRequests && user.remainingThisMonth > 0
                    ? `今月あと${user.remainingThisMonth}件受注可能`
                    : '現在受付停止中'}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {user.isSelf ? (
            <Link
              to="/settings"
              className="glass !rounded-full px-5 py-2 text-center text-sm font-semibold"
            >
              プロフィールを編集
            </Link>
          ) : (
            <>
              {user.isCreator && (
                <Link
                  to={`/u/${user.handle}/request`}
                  data-testid="request-button"
                  className="rounded-full bg-accent px-6 py-2.5 text-center text-sm font-semibold text-white shadow-[0_6px_20px_rgba(79,85,200,0.35)]"
                >
                  依頼する
                </Link>
              )}
              <Button
                variant="secondary"
                onClick={() => follow.mutate(!user.isFollowing)}
                disabled={follow.isPending}
              >
                {user.isFollowing ? 'フォロー中' : 'フォロー'}
              </Button>
            </>
          )}
        </div>
      </section>

      {user.isCreator && settings.priceList.length > 0 && (
        <section className="glass p-5" aria-labelledby="price-heading">
          <h2 id="price-heading" className="mb-3 font-bold">
            料金表
          </h2>
          <ul className="flex flex-col divide-y divide-white/80">
            {settings.priceList.map((p) => (
              <li key={p.name} className="flex justify-between gap-4 py-2 text-sm">
                <span>
                  {p.name}
                  {p.description && (
                    <span className="block text-xs text-ink-soft">{p.description}</span>
                  )}
                </span>
                <span className="font-semibold">{yen(p.price)}〜</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="works-heading">
        <h2 id="works-heading" className="mb-3 text-lg font-bold">
          ポートフォリオ
        </h2>
        <PostGrid posts={q.data.posts ?? []} />
      </section>
    </div>
  );
}
