import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PAUSE_REASONS } from '../../shared/schemas';
import { ErrorState, LoginRequired } from '../components/common';
import { TranslateButton } from '../components/TranslateButton';
import { api, errorMessage, post, yen } from '../lib/api';
import { useMe } from '../lib/auth';
import {
  PAUSE_REASON_LABELS,
  PAUSE_STATUS_LABELS,
  PAYOUT_LABELS,
  STATUS_LABELS,
} from '../lib/labels';
import type { Author } from '../lib/types';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageSkeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

type Detail = {
  request: {
    id: string;
    title: string;
    details: string;
    price: number;
    dueDate: string;
    status: string;
    role: 'creator' | 'client';
    creator: Author;
    client: Author;
    deliveredAt: string | null;
    deliveryNote: string | null;
    clientApprovedAt: string | null;
    creatorApprovedAt: string | null;
    reductionAmount: number;
    payoutAmount: number | null;
    platformFee: number | null;
    payoutStatus: string;
    refundAmount: number;
  };
  delay: {
    overdueDays: number;
    excusedDays: number;
    chargeableDays: number;
    amount: number;
    capped: boolean;
  };
  settlementPreview: { creatorGross: number; fee: number; payout: number; refundToClient: number };
  canCancelRefund: boolean;
  messages: { id: string; body: string; createdAt: string; senderId: string }[];
  pauses: {
    id: string;
    reason: string;
    startDate: string;
    endDate: string | null;
    note: string;
    status: string;
    createdBy: string;
  }[];
  adjustments: { evaluatedOn: string; reductionAmount: number; reason: string }[];
};

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['request', id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<Detail>(`/api/requests/${encodeURIComponent(id)}`),
    enabled: !!me.data?.user,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const status = params.get('checkout');
    if (!status) return;
    toast.show(
      status === 'success' ? '支払いを受け付けました' : '支払いをキャンセルしました',
      status === 'success' ? 'success' : 'info',
    );
    params.delete('checkout');
    setParams(params, { replace: true });
  }, [params, setParams, toast]);

  // Live updates over WebSocket (Durable Object). Polling above is the fallback.
  useEffect(() => {
    if (!q.data) return;
    let ws: WebSocket | null = null;
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/requests/${id}/ws`);
      ws.onmessage = () => qc.invalidateQueries({ queryKey: ['request', id] });
    } catch {
      ws = null;
    }
    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!q.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      post<{ url?: string }>(`/api/requests/${id}/${path}`, body),
    onSuccess: (r) => {
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      refresh();
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  if (me.isPending || (me.data?.user && q.isPending)) return <PageSkeleton variant="chat" />;
  if (!me.data?.user) return <LoginRequired />;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const d = q.data;
  const r = d.request;
  const myId = me.data.user.id;
  const counterpart = r.role === 'creator' ? r.client : r.creator;
  const myApproved = r.role === 'client' ? r.clientApprovedAt : r.creatorApprovedAt;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]" data-testid="request-detail">
      <section className="glass flex min-h-[60vh] flex-col p-4" aria-labelledby="chat-h">
        <header className="mb-3 border-b border-white/80 pb-3">
          <h1 id="chat-h" className="text-lg font-bold">
            {r.title}
          </h1>
          <p className="text-xs text-ink-soft">
            {r.role === 'creator' ? '依頼者' : 'クリエイター'}:{' '}
            <Link to={`/u/${counterpart.handle}`} className="underline">
              {counterpart.displayName}
            </Link>
          </p>
        </header>
        <ol
          className="flex flex-1 flex-col gap-2 overflow-y-auto"
          aria-live="polite"
          data-testid="chat-messages"
        >
          <AnimatePresence initial={false}>
            {d.messages.map((m) => {
              const mine = m.senderId === myId;
              return (
                <motion.li
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'self-end bg-accent text-white' : 'self-start bg-white/80'}`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {!mine && <TranslateButton text={m.body} />}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
        <ChatInput
          requestId={id}
          onSent={refresh}
          disabled={['completed', 'cancelled', 'cancelled_refunded'].includes(r.status)}
        />
      </section>

      <aside className="flex flex-col gap-4">
        <section className="glass flex flex-col gap-2 p-4 text-sm" aria-labelledby="st-h">
          <h2 id="st-h" className="font-bold">
            依頼の状況
          </h2>
          <p>
            <span
              className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent"
              data-testid="request-status"
            >
              {STATUS_LABELS[r.status] ?? r.status}
            </span>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-ink-soft">依頼料</dt>
            <dd>{yen(r.price)}</dd>
            <dt className="text-ink-soft">納期</dt>
            <dd>{r.dueDate}</dd>
            {d.delay.overdueDays > 0 && (
              <>
                <dt className="text-ink-soft">遅延</dt>
                <dd data-testid="delay-info">
                  {d.delay.overdueDays}日（減額対象 {d.delay.chargeableDays}日）・減額{' '}
                  {yen(d.delay.amount)}
                  {d.delay.capped && '（上限）'}
                </dd>
              </>
            )}
            <dt className="text-ink-soft">送金</dt>
            <dd data-testid="payout-status">{PAYOUT_LABELS[r.payoutStatus] ?? r.payoutStatus}</dd>
            {r.payoutAmount !== null && (
              <>
                <dt className="text-ink-soft">送金額</dt>
                <dd>{yen(r.payoutAmount)}</dd>
              </>
            )}
            {r.refundAmount > 0 && (
              <>
                <dt className="text-ink-soft">返金額</dt>
                <dd>{yen(r.refundAmount)}</dd>
              </>
            )}
          </dl>
          {r.deliveryNote && (
            <p className="rounded-xl bg-white/60 p-2">
              <span className="block text-xs text-ink-soft">納品メモ</span>
              {r.deliveryNote}
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2">
            {r.role === 'client' && r.status === 'pending_payment' && (
              <Button
                onClick={() => action.mutate({ path: 'checkout' })}
                disabled={action.isPending}
                data-testid="pay-button"
              >
                依頼を確定して支払う（前払い）
              </Button>
            )}
            {r.status === 'pending_payment' && (
              <Button variant="ghost" onClick={() => action.mutate({ path: 'cancel' })}>
                依頼を取り下げる
              </Button>
            )}
            {r.role === 'creator' && r.status === 'paid' && (
              <DeliverForm
                onSubmit={(note) => action.mutate({ path: 'deliver', body: { note } })}
              />
            )}
            {r.status === 'delivered' && !myApproved && (
              <Button
                onClick={() => action.mutate({ path: 'approve' })}
                data-testid="approve-button"
              >
                受け取りを承認する
              </Button>
            )}
            {r.status === 'delivered' && myApproved && (
              <p className="text-xs text-ink-soft">相手の承認を待っています</p>
            )}
            {d.canCancelRefund && (
              <CancelRefund
                amount={r.price}
                delayAmount={d.delay.amount}
                onConfirm={() => action.mutate({ path: 'cancel' })}
              />
            )}
          </div>
        </section>

        {['paid', 'delivered'].includes(r.status) && (
          <PauseSection detail={d} myId={myId} onDone={refresh} />
        )}

        {d.adjustments.length > 0 && (
          <section className="glass p-4 text-xs" aria-labelledby="adj-h">
            <h2 id="adj-h" className="mb-2 text-sm font-bold">
              減額の履歴
            </h2>
            <ul className="flex flex-col gap-1">
              {d.adjustments.map((a) => (
                <li key={a.evaluatedOn}>
                  {a.evaluatedOn}: {yen(a.reductionAmount)} — {a.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function ChatInput({
  requestId,
  onSent,
  disabled,
}: {
  requestId: string;
  onSent: () => void;
  disabled: boolean;
}) {
  const [body, setBody] = useState('');
  const toast = useToast();
  const ref = useRef<HTMLTextAreaElement>(null);
  const m = useMutation({
    mutationFn: () => post(`/api/requests/${requestId}/messages`, { body }),
    onSuccess: () => {
      setBody('');
      onSent();
      ref.current?.focus();
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });
  if (disabled)
    return <p className="mt-3 text-center text-xs text-ink-soft">この依頼は終了しています</p>;
  return (
    <form
      className="mt-3 flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) m.mutate();
      }}
    >
      <label htmlFor="chat-input" className="sr-only">
        メッセージ
      </label>
      <textarea
        id="chat-input"
        ref={ref}
        value={body}
        maxLength={2000}
        rows={2}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) m.mutate();
        }}
        placeholder="メッセージを入力"
        className="flex-1 resize-none rounded-xl border border-white/90 bg-white/70 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <Button type="submit" disabled={m.isPending || !body.trim()} data-testid="chat-send">
        送信
      </Button>
    </form>
  );
}

function DeliverForm({ onSubmit }: { onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) onSubmit(note);
      }}
    >
      <Textarea
        label="納品メモ"
        required
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit">納品する</Button>
    </form>
  );
}

function CancelRefund({
  amount,
  delayAmount,
  onConfirm,
}: {
  amount: number;
  delayAmount: number;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl bg-white/60 p-3 text-xs">
        納期を過ぎています。減額（現在 {yen(delayAmount)}
        ）を適用して待つか、キャンセルして全額返金を受けられます。
      </div>
      <Button variant="danger" onClick={() => setOpen(true)} data-testid="cancel-refund">
        キャンセルして全額返金
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="キャンセルして全額返金しますか？">
        <p className="mb-4 text-sm">
          依頼料 {yen(amount)}{' '}
          を全額返金し、依頼を終了します。クリエイターへの支払いは発生しません。この操作は取り消せません。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            待つ
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            全額返金でキャンセル
          </Button>
        </div>
      </Modal>
    </>
  );
}

function PauseSection({
  detail,
  myId,
  onDone,
}: {
  detail: Detail;
  myId: string;
  onDone: () => void;
}) {
  const role = detail.request.role;
  const toast = useToast();
  const reasons = PAUSE_REASONS.filter((r) =>
    r === 'platform_outage' ? false : r === 'creator_force_majeure' ? role === 'creator' : true,
  );
  const [reason, setReason] = useState<string>(reasons[0]!);
  const [startDate, setStartDate] = useState(detail.request.dueDate);
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const declare = useMutation({
    mutationFn: () =>
      post(`/api/requests/${detail.request.id}/pauses`, {
        reason,
        startDate,
        endDate: endDate || undefined,
        note,
      }),
    onSuccess: () => {
      toast.show('申告しました', 'success');
      onDone();
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });
  const approve = useMutation({
    mutationFn: (pid: string) => post(`/api/requests/${detail.request.id}/pauses/${pid}/approve`),
    onSuccess: onDone,
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  return (
    <section className="glass flex flex-col gap-3 p-4 text-sm" aria-labelledby="pause-h">
      <h2 id="pause-h" className="font-bold">
        正当な理由による遅延の申告
      </h2>
      {detail.pauses.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {detail.pauses.map((p) => (
            <li key={p.id} className="rounded-lg bg-white/60 p-2">
              {PAUSE_REASON_LABELS[p.reason]}（{p.startDate}〜{p.endDate ?? ''}）:{' '}
              {PAUSE_STATUS_LABELS[p.status]}
              {role === 'client' &&
                p.status === 'pending' &&
                p.createdBy !== myId &&
                (p.reason === 'client_material_delay' || p.reason === 'client_approval_wait') && (
                  <button
                    type="button"
                    className="ml-2 font-semibold text-accent underline"
                    onClick={() => approve.mutate(p.id)}
                  >
                    事実を確認して承認
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          declare.mutate();
        }}
      >
        <Select label="理由" value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {PAUSE_REASON_LABELS[r]}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="開始日"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="終了日（任意）"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <Textarea
          label="補足"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={declare.isPending}>
          申告する
        </Button>
      </form>
    </section>
  );
}
