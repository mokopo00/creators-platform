import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/common';
import { api, errorMessage, post, yen } from '../lib/api';
import { Button } from '../ui/Button';
import { PageSkeleton } from '../ui/Skeleton';

/** Stand-in for Stripe Checkout in development/test environments only. */
export function MockCheckoutPage() {
  const { sessionId = '' } = useParams();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['mock-checkout', sessionId],
    queryFn: () =>
      api<{ title: string; amount: number; requestId: string }>(`/api/payments/mock/${sessionId}`),
  });
  const pay = useMutation({
    mutationFn: () => post<{ requestId: string }>('/api/payments/mock/complete', { sessionId }),
    onSuccess: (r) => nav(`/requests/${r.requestId}?checkout=success`),
  });
  if (q.isPending) return <PageSkeleton variant="form" />;
  if (q.isError) return <ErrorState message={q.error.message} />;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 glass p-6" data-testid="mock-checkout">
      <p className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
        テスト環境の決済画面です（実際の請求は発生しません）
      </p>
      <h1 className="text-xl font-bold">{q.data.title}</h1>
      <p className="text-2xl font-bold">{yen(q.data.amount)}</p>
      {pay.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(pay.error)}
        </p>
      )}
      <Button onClick={() => pay.mutate()} disabled={pay.isPending} data-testid="mock-pay">
        テスト決済を完了する
      </Button>
      <Button variant="ghost" onClick={() => nav(`/requests/${q.data.requestId}?checkout=cancel`)}>
        戻る
      </Button>
    </div>
  );
}
