import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays } from '../../shared/delay';
import { Avatar, ErrorState, LoginRequired, PostGrid } from '../components/common';
import { DelayTerms } from '../components/DelayTerms';
import { api, errorMessage, post, yen } from '../lib/api';
import { useMe } from '../lib/auth';
import type { CreatorProfile } from '../lib/types';
import { Button } from '../ui/Button';
import { Checkbox, Input, Select, Textarea } from '../ui/Input';
import { PageSkeleton } from '../ui/Skeleton';

/** リクエストページ: price list, samples, notes, delay terms and the request form. */
export function RequestPage() {
  const { handle = '' } = useParams();
  const me = useMe();
  const q = useQuery({
    queryKey: ['user', handle],
    queryFn: () => api<CreatorProfile>(`/api/users/${encodeURIComponent(handle)}`),
  });
  if (q.isPending || me.isPending) return <PageSkeleton variant="detail" />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const { user, settings } = q.data;

  return (
    <div className="flex flex-col gap-4" data-testid="request-page">
      <header className="glass flex items-center gap-3 p-5">
        <Avatar name={user.displayName} url={user.avatarUrl} size="lg" />
        <div>
          <h1 className="text-xl font-bold">{user.displayName} さんへの依頼</h1>
          <p className="text-sm text-ink-soft">
            {user.acceptingRequests && user.remainingThisMonth > 0
              ? `今月あと${user.remainingThisMonth}件受注可能`
              : '現在受付停止中'}
            ・実績 {user.completedCount}件
          </p>
        </div>
      </header>

      <section className="glass p-5" aria-labelledby="prices">
        <h2 id="prices" className="mb-2 text-base font-bold">
          料金表
        </h2>
        {settings.priceList.length === 0 ? (
          <p className="text-sm text-ink-soft">料金はチャットで相談してください。</p>
        ) : (
          <ul className="divide-y divide-white/80">
            {settings.priceList.map((p) => (
              <li key={p.name} className="flex justify-between py-2 text-sm">
                <span>{p.name}</span>
                <span className="font-semibold">{yen(p.price)}〜</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settings.samples.length > 0 && (
        <section aria-labelledby="samples">
          <h2 id="samples" className="mb-2 text-base font-bold">
            商品サンプル
          </h2>
          <PostGrid posts={settings.samples} />
        </section>
      )}

      <section className="glass p-5 text-sm" aria-labelledby="notes">
        <h2 id="notes" className="mb-2 text-base font-bold">
          注意事項
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-soft">作成期間</dt>
          <dd>{settings.productionDays}日</dd>
          <dt className="text-ink-soft">支払い条件</dt>
          <dd>{settings.paymentTerms}</dd>
          <dt className="text-ink-soft">リテイク</dt>
          <dd>{settings.retakeCount}回まで</dd>
        </dl>
        {settings.notes && <p className="mt-3 whitespace-pre-wrap">{settings.notes}</p>}
      </section>

      <DelayTerms />

      {!me.data?.user ? (
        <LoginRequired />
      ) : user.isSelf ? null : !me.data.user.isAdult ? (
        <div className="glass p-5 text-sm">
          有償の依頼は18歳以上の方のみ利用できます。
          <Link to="/settings" className="ml-1 font-semibold text-accent underline">
            設定から年齢確認
          </Link>
          をしてください。
        </div>
      ) : (
        <RequestForm data={q.data} />
      )}
    </div>
  );
}

function RequestForm({ data }: { data: CreatorProfile }) {
  const nav = useNavigate();
  const minDate = addDays(new Date().toISOString().slice(0, 10), 2);
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [price, setPrice] = useState(data.settings.priceList[0]?.price ?? 5000);
  const [dueDate, setDueDate] = useState(
    addDays(minDate, Math.max(0, data.settings.productionDays - 2)),
  );
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const m = useMutation({
    mutationFn: () =>
      post<{ id: string }>('/api/requests', {
        creatorHandle: data.user.handle,
        templateId: templateId || undefined,
        title,
        details,
        price,
        dueDate,
        agreeDelayTerms: agree,
      }),
    onSuccess: (r) => nav(`/requests/${r.id}`),
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <form
      className="glass flex flex-col gap-4 p-5"
      data-testid="request-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        if (!agree) {
          setError('遅延・減額・返金条件への同意が必要です');
          return;
        }
        m.mutate();
      }}
    >
      <h2 className="text-base font-bold">依頼内容</h2>
      {data.templates.length > 0 && (
        <Select
          label="依頼テンプレート"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            const t = data.templates.find((x) => x.id === e.target.value);
            if (t) {
              setTitle(t.title);
              setDetails(t.body);
            }
          }}
        >
          <option value="">使用しない</option>
          {data.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
      )}
      <Input
        label="件名"
        required
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Textarea
        label="要望"
        hint="詳細はこのあとチャットで相談できます"
        required
        maxLength={5000}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="依頼料（円）"
          type="number"
          required
          min={500}
          max={10000000}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <Input
          label="納期"
          type="date"
          required
          min={minDate}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <Checkbox
        label="上記の「納期遅延時の減額・返金条件」と注意事項を確認し、同意します"
        checked={agree}
        onChange={(e) => setAgree(e.target.checked)}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={m.isPending} className="self-start">
        依頼を作成してチャットへ
      </Button>
    </form>
  );
}
