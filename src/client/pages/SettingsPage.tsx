import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PORTFOLIO_THEMES } from '../../shared/constants';
import { ErrorState, LoginRequired, PageTitle } from '../components/common';
import { api, del, errorMessage, patch, post, put, yen } from '../lib/api';
import { useMe } from '../lib/auth';
import type { CreatorProfile, PriceItem } from '../lib/types';
import { Button } from '../ui/Button';
import { Checkbox, Input, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageSkeleton } from '../ui/Skeleton';
import { Tabs } from '../ui/Tabs';
import { useToast } from '../ui/Toast';

const THEME_LABELS: Record<string, string> = {
  glass: 'グラス',
  mist: 'ミスト',
  paper: 'ペーパー',
  night: 'ナイト',
};

type Section = 'profile' | 'creator' | 'templates' | 'account';

export function SettingsPage() {
  const me = useMe();
  const [section, setSection] = useState<Section>('profile');
  const q = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<CreatorProfile>('/api/me/settings'),
    enabled: !!me.data?.user,
  });
  if (me.isPending || (me.data?.user && q.isPending)) return <PageSkeleton variant="form" />;
  if (!me.data?.user) return <LoginRequired />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="settings-page">
      <PageTitle>設定</PageTitle>
      <Tabs
        label="設定の種類"
        value={section}
        onChange={setSection}
        items={[
          { value: 'profile', label: 'プロフィール' },
          { value: 'creator', label: '依頼受付' },
          { value: 'templates', label: '依頼テンプレート' },
          { value: 'account', label: 'アカウント' },
        ]}
      />
      {section === 'profile' && <ProfileForm data={q.data} />}
      {section === 'creator' && <CreatorForm data={q.data} />}
      {section === 'templates' && <TemplatesForm data={q.data} />}
      {section === 'account' && (
        <AccountSection isAdult={me.data.user.isAdult} isPremium={me.data.user.isPremium} />
      )}
    </div>
  );
}

function useSaved() {
  const toast = useToast();
  const qc = useQueryClient();
  return {
    onSuccess: () => {
      toast.show('保存しました', 'success');
      qc.invalidateQueries();
    },
    onError: (e: unknown) => toast.show(errorMessage(e), 'error'),
  };
}

function ProfileForm({ data }: { data: CreatorProfile }) {
  const u = data.user;
  const [form, setForm] = useState({
    displayName: u.displayName,
    handle: u.handle,
    bio: u.bio,
    decoration: u.decoration,
    theme: u.theme,
  });
  const m = useMutation({ mutationFn: () => patch('/api/me/profile', form), ...useSaved() });
  return (
    <form
      className="glass flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Input
        label="表示名"
        maxLength={50}
        value={form.displayName}
        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
      />
      <Input
        label="ユーザー名"
        hint="半角英小文字・数字・ハイフン（3〜30文字）"
        value={form.handle}
        onChange={(e) => setForm({ ...form, handle: e.target.value })}
      />
      <Textarea
        label="自己紹介"
        maxLength={1000}
        value={form.bio}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
      />
      <Input
        label="プロフィール装飾（絵文字など）"
        maxLength={40}
        value={form.decoration}
        onChange={(e) => setForm({ ...form, decoration: e.target.value })}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">ポートフォリオのテーマ</legend>
        <div className="flex flex-wrap gap-2">
          {PORTFOLIO_THEMES.map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium ${form.theme === t ? 'bg-accent text-white' : 'glass !rounded-full'}`}
            >
              <input
                type="radio"
                name="theme"
                value={t}
                checked={form.theme === t}
                onChange={() => setForm({ ...form, theme: t })}
                className="sr-only"
              />
              {THEME_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={m.isPending} className="self-start">
        保存
      </Button>
    </form>
  );
}

function CreatorForm({ data }: { data: CreatorProfile }) {
  const s = data.settings;
  const [accepting, setAccepting] = useState(data.user.acceptingRequests);
  const [capacity, setCapacity] = useState(data.user.monthlyCapacity);
  const [prices, setPrices] = useState<PriceItem[]>(s.priceList);
  const [newPrice, setNewPrice] = useState({ name: '', price: 5000, description: '' });
  const [form, setForm] = useState({
    notes: s.notes,
    productionDays: s.productionDays,
    paymentTerms: s.paymentTerms,
    retakeCount: s.retakeCount,
  });
  const [samples, setSamples] = useState<string[]>(s.samplePostIds);
  const posts = data.posts ?? [];
  const ownPosts = useQuery({
    queryKey: ['user', data.user.handle],
    queryFn: () => api<CreatorProfile>(`/api/users/${data.user.handle}`),
  });
  const m = useMutation({
    mutationFn: async () => {
      await patch('/api/me/profile', {
        acceptingRequests: accepting,
        monthlyCapacity: capacity,
        isCreator: true,
      });
      await put('/api/me/creator-settings', { ...form, priceList: prices, samplePostIds: samples });
    },
    ...useSaved(),
  });
  const candidates = ownPosts.data?.posts ?? posts;

  return (
    <form
      className="glass flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Checkbox
        label="依頼を受け付ける"
        checked={accepting}
        onChange={(e) => setAccepting(e.target.checked)}
      />
      <Input
        label="月あたりの受注上限（件）"
        type="number"
        min={0}
        max={50}
        value={capacity}
        onChange={(e) => setCapacity(Number(e.target.value))}
      />
      <section className="flex flex-col gap-2" aria-labelledby="pl">
        <h2 id="pl" className="text-sm font-medium">
          料金表
        </h2>
        <ul className="flex flex-col gap-1">
          {prices.map((p, i) => (
            <li
              key={`${p.name}-${i}`}
              className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm"
            >
              <span>
                {p.name}（{yen(p.price)}）
              </span>
              <button
                type="button"
                className="text-xs text-danger"
                onClick={() => setPrices(prices.filter((_, j) => j !== i))}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <Input
            label="項目名"
            value={newPrice.name}
            onChange={(e) => setNewPrice({ ...newPrice, name: e.target.value })}
          />
          <Input
            label="料金（円）"
            type="number"
            min={500}
            value={newPrice.price}
            onChange={(e) => setNewPrice({ ...newPrice, price: Number(e.target.value) })}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (!newPrice.name.trim()) return;
              setPrices([...prices, newPrice]);
              setNewPrice({ name: '', price: 5000, description: '' });
            }}
          >
            追加
          </Button>
        </div>
      </section>
      <Textarea
        label="注意事項"
        maxLength={2000}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="作成期間（日）"
          type="number"
          min={1}
          max={365}
          value={form.productionDays}
          onChange={(e) => setForm({ ...form, productionDays: Number(e.target.value) })}
        />
        <Input
          label="リテイク回数"
          type="number"
          min={0}
          max={20}
          value={form.retakeCount}
          onChange={(e) => setForm({ ...form, retakeCount: Number(e.target.value) })}
        />
        <Input
          label="支払い条件"
          maxLength={200}
          value={form.paymentTerms}
          onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">商品サンプル（自分の作品から選択）</legend>
        {candidates.length === 0 ? (
          <p className="text-xs text-ink-soft">作品を投稿するとサンプルに設定できます。</p>
        ) : (
          <div className="flex flex-col gap-1">
            {candidates.map((p) => (
              <Checkbox
                key={p.id}
                label={p.title}
                checked={samples.includes(p.id)}
                onChange={(e) =>
                  setSamples(
                    e.target.checked ? [...samples, p.id] : samples.filter((x) => x !== p.id),
                  )
                }
              />
            ))}
          </div>
        )}
      </fieldset>
      <Button type="submit" disabled={m.isPending} className="self-start">
        保存
      </Button>
    </form>
  );
}

function TemplatesForm({ data }: { data: CreatorProfile }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const saved = useSaved();
  const add = useMutation({
    mutationFn: () => post('/api/me/templates', { title, body }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      saved.onSuccess();
    },
    onError: saved.onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/me/templates/${id}`),
    ...saved,
  });
  const assist = useMutation({
    mutationFn: () =>
      post<{ reply: string }>('/api/ai/chatbot', { mode: 'template', message: title || body }),
    onSuccess: (r) => setBody(r.reply),
  });
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {data.templates.map((t) => (
          <li key={t.id} className="glass flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{t.title}</p>
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{t.body}</p>
            </div>
            <Button variant="ghost" onClick={() => remove.mutate(t.id)}>
              削除
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="glass flex flex-col gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Input
          label="テンプレート名"
          maxLength={60}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label="内容"
          maxLength={2000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={add.isPending}>
            追加
          </Button>
          <Button
            variant="secondary"
            onClick={() => assist.mutate()}
            disabled={assist.isPending || (!title && !body)}
          >
            {assist.isPending ? '作成中…' : 'AIで下書きを作成'}
          </Button>
        </div>
        {assist.isError && (
          <p role="alert" className="text-xs text-danger">
            {errorMessage(assist.error)}
          </p>
        )}
      </form>
    </div>
  );
}

function AccountSection({ isAdult, isPremium }: { isAdult: boolean; isPremium: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const saved = useSaved();
  const [birthDate, setBirthDate] = useState('');
  const [confirmAge, setConfirmAge] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const premium = useQuery({
    queryKey: ['premium'],
    queryFn: () =>
      api<{ priceJpy: number; taxLabel: string; active: boolean; until: string | null }>(
        '/api/premium',
      ),
  });
  const age = useMutation({
    mutationFn: () => post('/api/me/age-confirmation', { birthDate, confirm: confirmAge }),
    ...saved,
  });
  const subscribe = useMutation({
    mutationFn: () => post<{ url?: string }>('/api/premium/subscribe'),
    onSuccess: (r) => {
      if (r.url) window.location.assign(r.url);
      else saved.onSuccess();
    },
    onError: saved.onError,
  });
  const cancelPremium = useMutation({ mutationFn: () => post('/api/premium/cancel'), ...saved });
  const logout = useMutation({
    mutationFn: () => post('/api/auth/logout'),
    onSuccess: async () => {
      await qc.invalidateQueries();
      nav('/');
    },
  });
  const remove = useMutation({
    mutationFn: () => del('/api/me'),
    onSuccess: async () => {
      toast.show('アカウントを削除しました', 'success');
      await qc.invalidateQueries();
      nav('/');
    },
    onError: saved.onError,
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="glass flex flex-col gap-3 p-5" aria-labelledby="age-h">
        <h2 id="age-h" className="font-bold">
          年齢確認
        </h2>
        {isAdult ? (
          <p className="text-sm text-ok" data-testid="age-confirmed">
            18歳以上であることを確認済みです。有償依頼を利用できます。
          </p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              age.mutate();
            }}
          >
            <p className="text-sm text-ink-soft">有償の依頼は18歳以上の方のみ利用できます。</p>
            <Input
              label="生年月日"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <Checkbox
              label="入力した生年月日が正しいことを確認しました"
              checked={confirmAge}
              onChange={(e) => setConfirmAge(e.target.checked)}
            />
            <Button type="submit" className="self-start" disabled={!confirmAge || !birthDate}>
              確認する
            </Button>
          </form>
        )}
      </section>

      <section className="glass flex flex-col gap-3 p-5" aria-labelledby="pm-h">
        <h2 id="pm-h" className="font-bold">
          プレミアム会員
        </h2>
        {premium.data && (
          <p className="text-sm">
            月額 {yen(premium.data.priceJpy)}（{premium.data.taxLabel}）
            {isPremium && premium.data.until && (
              <span className="ml-2 text-ok">有効期限: {premium.data.until}</span>
            )}
          </p>
        )}
        {isPremium ? (
          <Button variant="secondary" className="self-start" onClick={() => cancelPremium.mutate()}>
            解約する
          </Button>
        ) : (
          <Button
            className="self-start"
            onClick={() => subscribe.mutate()}
            disabled={subscribe.isPending}
          >
            登録する（テストモード）
          </Button>
        )}
      </section>

      <section className="glass flex flex-col gap-3 p-5" aria-labelledby="acct-h">
        <h2 id="acct-h" className="font-bold">
          アカウント
        </h2>
        <Button variant="secondary" className="self-start" onClick={() => logout.mutate()}>
          ログアウト
        </Button>
        <Button variant="danger" className="self-start" onClick={() => setDeleting(true)}>
          アカウントを削除
        </Button>
      </section>

      <Modal open={deleting} onClose={() => setDeleting(false)} title="アカウントを削除しますか？">
        <div className="flex flex-col gap-3 text-sm">
          <p>
            プロフィール・作品・お気に入り・フォルダ・通知が削除されます。決済に関する記録は法令で定められた期間保存されます。進行中の依頼がある場合は削除できません。
          </p>
          <Input
            label="確認のため「削除」と入力"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
          />
          <Button
            variant="danger"
            disabled={deleteText !== '削除' || remove.isPending}
            onClick={() => remove.mutate()}
          >
            削除する
          </Button>
        </div>
      </Modal>
    </div>
  );
}
