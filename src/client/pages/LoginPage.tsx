import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageTitle } from '../components/common';
import { api, errorMessage, post } from '../lib/api';
import { Button, buttonClass } from '../ui/Button';
import { Input } from '../ui/Input';
import { PageSkeleton } from '../ui/Skeleton';

export function LoginPage() {
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/';
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => api<{ google: boolean; mock: boolean }>('/api/auth/providers'),
  });
  if (providers.isPending) return <PageSkeleton variant="form" />;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4" data-testid="login-page">
      <PageTitle>ログイン</PageTitle>
      <div className="glass flex flex-col gap-4 p-6">
        <p className="text-sm text-ink-soft">Google アカウントでログイン・新規登録できます。</p>
        {params.get('error') && (
          <p role="alert" className="text-sm text-danger">
            ログインが完了しませんでした。もう一度お試しください。
          </p>
        )}
        {providers.data?.google ? (
          <a
            href={`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}
            className={`${buttonClass('secondary')} w-full`}
            data-testid="google-login"
          >
            <span aria-hidden="true" className="font-bold text-accent">
              G
            </span>
            Google でログイン
          </a>
        ) : (
          <p
            className="rounded-xl bg-white/60 p-3 text-sm text-ink-soft"
            data-testid="google-unavailable"
          >
            Google ログインはこの環境では設定されていません。
          </p>
        )}
        <p className="text-xs text-ink-soft">
          取得する情報は Google
          のユーザーID・表示名・プロフィール画像のみです。メールアドレスは保存しません。
        </p>
      </div>
      {providers.data?.mock && <MockLogin returnTo={returnTo} />}
    </div>
  );
}

/** Rendered only when the server reports mock auth (development/test). */
function MockLogin({ returnTo }: { returnTo: string }) {
  const [handle, setHandle] = useState('test-user-01');
  const [error, setError] = useState('');
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <form
      className="glass flex flex-col gap-3 border-dashed p-6"
      data-testid="mock-login"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await post('/api/auth/mock-login', { handle, displayName: handle, adult: true });
          await qc.invalidateQueries();
          nav(returnTo);
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <p className="text-xs font-semibold text-ink-soft">開発・テスト環境専用のログイン</p>
      <Input label="テストユーザー名" value={handle} onChange={(e) => setHandle(e.target.value)} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit">テストユーザーでログイン</Button>
    </form>
  );
}
