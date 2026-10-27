import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FIELD_LABELS, type Field } from '../../shared/constants';
import type { Post } from '../lib/types';
import { Card } from '../ui/Card';
import { staggerContainer } from '../ui/motion';

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        className="rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="inline-flex items-center justify-center rounded-full bg-accent-soft font-bold text-accent"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}

export function AiLabel() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
      AI補助
    </span>
  );
}

export function PrLabel() {
  return (
    <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white">
      PR
    </span>
  );
}

export function FieldLabel({ field }: { field: string }) {
  return (
    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
      {FIELD_LABELS[field as Field] ?? field}
    </span>
  );
}

export function PostCard({ post }: { post: Post }) {
  return (
    <Card interactive className="!p-0 overflow-hidden" data-testid="post-card">
      <Link to={`/posts/${post.id}`} className="block focus-visible:outline-offset-[-3px]">
        <div className="aspect-[4/3] w-full overflow-hidden bg-white/40">
          {post.mediaType === 'image' && post.mediaUrl ? (
            <img
              src={post.mediaUrl}
              alt={post.title}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : post.mediaType === 'video' && post.mediaUrl ? (
            <video
              src={post.mediaUrl}
              muted
              preload="metadata"
              className="size-full object-cover"
              aria-label={post.title}
            />
          ) : (
            <p className="line-clamp-6 p-4 text-sm leading-relaxed text-ink-soft">{post.body}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 p-3">
          <div className="flex flex-wrap items-center gap-1">
            <FieldLabel field={post.field} />
            {post.aiAssisted && <AiLabel />}
            {post.promoted && <PrLabel />}
          </div>
          <h3 className="line-clamp-1 font-semibold">{post.title}</h3>
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <Avatar name={post.author.displayName} url={post.author.avatarUrl} size={20} />
            <span className="truncate">{post.author.displayName}</span>
            <span className="ml-auto shrink-0 whitespace-nowrap">♡ {post.saveCount}</span>
          </div>
        </div>
      </Link>
    </Card>
  );
}

export function PostGrid({
  posts,
  empty = '作品はまだありません',
}: {
  posts: Post[];
  empty?: string;
}) {
  if (posts.length === 0)
    return <p className="glass p-6 text-center text-sm text-ink-soft">{empty}</p>;
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 lg:grid-cols-3"
    >
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </motion.div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass flex flex-col items-center gap-3 p-6 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-semibold text-accent underline"
        >
          再読み込み
        </button>
      )}
    </div>
  );
}

export function LoginRequired() {
  return (
    <div className="glass flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm text-ink-soft">この機能を使うにはログインが必要です。</p>
      <Link
        to="/login"
        className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
      >
        ログイン
      </Link>
    </div>
  );
}
