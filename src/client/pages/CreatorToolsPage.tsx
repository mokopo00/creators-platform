import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays } from '../../shared/delay';
import { BarChart } from '../components/BarChart';
import { ErrorState, LoginRequired, PageTitle } from '../components/common';
import { api, del, errorMessage, post, yen } from '../lib/api';
import { useMe } from '../lib/auth';
import type { CreatorProfile } from '../lib/types';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { PageSkeleton } from '../ui/Skeleton';
import { Tabs } from '../ui/Tabs';
import { useToast } from '../ui/Toast';

type Analytics = {
  series: { day: string; views: number; saves: number; requests: number }[];
  totals: { views: number; saves: number; requests: number };
  topPosts: { id: string; title: string; views: number; saves: number }[];
};

export function CreatorToolsPage() {
  const me = useMe();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const q = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api<Analytics>(`/api/me/analytics?days=${days}`),
    enabled: !!me.data?.user,
  });
  if (me.isPending || (me.data?.user && q.isPending)) return <PageSkeleton variant="feed" />;
  if (!me.data?.user) return <LoginRequired />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const d = q.data;
  const pts = (k: 'views' | 'saves' | 'requests') =>
    d.series.map((s) => ({ label: s.day.slice(5), value: s[k] }));

  return (
    <div className="flex flex-col gap-5" data-testid="creator-tools">
      <PageTitle>クリエイターツール</PageTitle>
      <section aria-labelledby="an-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="an-h" className="text-lg font-bold">
            詳細分析
          </h2>
          <Tabs
            label="期間"
            value={days}
            onChange={setDays}
            items={[
              { value: '7', label: '7日' },
              { value: '30', label: '30日' },
              { value: '90', label: '90日' },
            ]}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <BarChart title="閲覧数" unit="回" data={pts('views')} />
          <BarChart title="保存数" unit="件" data={pts('saves')} />
          <BarChart title="依頼数" unit="件" data={pts('requests')} />
        </div>
        {d.topPosts.length > 0 && (
          <div className="glass p-4 text-sm">
            <h3 className="mb-2 font-semibold">よく見られている作品</h3>
            <ol className="flex flex-col gap-1">
              {d.topPosts.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link to={`/posts/${p.id}`} className="truncate hover:underline">
                    {p.title}
                  </Link>
                  <span className="shrink-0 tabular-nums text-ink-soft">
                    閲覧 {p.views} ・ 保存 {p.saves}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      <Promotions handle={me.data.user.handle} />
      <Products />
    </div>
  );
}

function Promotions({ handle }: { handle: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [today] = useState(() => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
  const [postId, setPostId] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const list = useQuery({
    queryKey: ['promotions'],
    queryFn: () =>
      api<{
        promotions: {
          id: string;
          title: string;
          startDate: string;
          endDate: string;
          status: string;
        }[];
      }>('/api/promotions'),
  });
  const posts = useQuery({
    queryKey: ['user', handle],
    queryFn: () => api<CreatorProfile>(`/api/users/${handle}`),
  });
  const done = {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
    onError: (e: unknown) => toast.show(errorMessage(e), 'error'),
  };
  const reserve = useMutation({
    mutationFn: () => post('/api/promotions', { postId, startDate: start, endDate: end }),
    ...done,
  });
  const cancel = useMutation({ mutationFn: (id: string) => del(`/api/promotions/${id}`), ...done });
  const STATUS: Record<string, string> = {
    reserved: '予約済み',
    active: '掲載中',
    ended: '終了',
    cancelled: '取消',
  };

  return (
    <section className="glass flex flex-col gap-3 p-5" aria-labelledby="pr-h">
      <h2 id="pr-h" className="text-lg font-bold">
        上位表示の予約
      </h2>
      <p className="text-xs text-ink-soft">
        予約した作品は「おすすめ」の上位に「PR」ラベル付きで表示されます（最長14日間）。料金の決済は準備中です。
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {list.data?.promotions.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2"
          >
            <span>
              {p.title}（{p.startDate}〜{p.endDate}）: {STATUS[p.status] ?? p.status}
            </span>
            {(p.status === 'reserved' || p.status === 'active') && (
              <button
                type="button"
                className="text-xs text-danger"
                onClick={() => cancel.mutate(p.id)}
              >
                取り消す
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (postId) reserve.mutate();
        }}
      >
        <Select label="作品" value={postId} onChange={(e) => setPostId(e.target.value)}>
          <option value="">選択してください</option>
          {posts.data?.posts?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Input
          label="開始日"
          type="date"
          min={today}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <Input
          label="終了日"
          type="date"
          min={start}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <Button type="submit" disabled={!postId || reserve.isPending}>
          予約する
        </Button>
      </form>
    </section>
  );
}

function Products() {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState(1000);
  const q = useQuery({
    queryKey: ['products'],
    queryFn: () =>
      api<{
        products: { id: string; title: string; price: number; status: string }[];
        feeRate: number;
      }>('/api/me/products'),
  });
  const add = useMutation({
    mutationFn: () => post('/api/me/products', { title, price }),
    onSuccess: () => {
      setTitle('');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });
  return (
    <section className="glass flex flex-col gap-3 p-5" aria-labelledby="dp-h">
      <h2 id="dp-h" className="text-lg font-bold">
        デジタル販売（準備中）
      </h2>
      {q.data && (
        <p className="text-xs text-ink-soft">
          販売手数料: {Math.round(q.data.feeRate * 100)}%。現在は下書きの登録のみ可能です。
        </p>
      )}
      <ul className="flex flex-col gap-1 text-sm">
        {q.data?.products.map((p) => (
          <li key={p.id} className="rounded-xl bg-white/60 px-3 py-2">
            {p.title} — {yen(p.price)}（下書き）
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
      >
        <Input
          label="商品名"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label="価格（円）"
          type="number"
          min={100}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <Button type="submit" variant="secondary">
          下書きを追加
        </Button>
      </form>
    </section>
  );
}
