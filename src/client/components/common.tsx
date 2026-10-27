import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FIELD_LABELS, type Field } from '../../shared/constants';
import type { Post } from '../lib/types';
import { buttonClass } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { staggerContainer } from '../ui/motion';

const AVATAR_SIZES = { xs: 20, sm: 28, md: 40, lg: 56, xl: 80 } as const;
export type AvatarSize = keyof typeof AVATAR_SIZES;
const AVATAR_TEXT: Record<AvatarSize, string> = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg',
  xl: 'text-2xl',
};

export function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url: string | null;
  size?: AvatarSize;
}) {
  const px = AVATAR_SIZES[size];
  const style = { width: px, height: px };
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        className="shrink-0 rounded-full object-cover ring-2 ring-white"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft to-white font-bold text-accent ring-2 ring-white ${AVATAR_TEXT[size]}`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex min-h-10 flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}

/** Section heading used inside glass panels (one size everywhere). */
export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-base font-bold">
      {children}
    </h2>
  );
}

type ChipTone = 'accent' | 'amber' | 'dark' | 'neutral';
const CHIP_TONES: Record<ChipTone, string> = {
  accent: 'bg-accent-soft text-accent',
  amber: 'bg-amber-100 text-amber-900',
  dark: 'bg-ink/80 text-white',
  neutral: 'bg-white/80 text-ink-soft',
};

/** Small status/category label. One height (20px) and text size everywhere. */
export function Chip({ tone = 'accent', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-semibold ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const AiLabel = () => <Chip tone="amber">AI補助</Chip>;
export const PrLabel = () => <Chip tone="dark">PR</Chip>;
export const FieldLabel = ({ field }: { field: string }) => (
  <Chip>{FIELD_LABELS[field as Field] ?? field}</Chip>
);

/** Toggle chip used for filters (field, period, hashtag). */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors ${active ? 'bg-accent text-white shadow-[0_4px_14px_rgba(79,85,200,0.25)]' : 'glass !rounded-full text-ink-soft hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

export function PostCard({ post }: { post: Post }) {
  return (
    <Card interactive className="group !p-0 overflow-hidden" data-testid="post-card">
      <Link to={`/posts/${post.id}`} className="block focus-visible:outline-offset-[-3px]">
        <div className="aspect-[4/3] w-full overflow-hidden bg-white/40">
          {post.mediaType === 'image' && post.mediaUrl ? (
            <img
              src={post.mediaUrl}
              alt={post.title}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
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
            <div className="flex size-full flex-col bg-gradient-to-br from-white to-accent-soft/60 p-4">
              <p className="line-clamp-5 text-sm leading-relaxed text-ink-soft">{post.body}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 p-3.5">
          <div className="flex flex-wrap items-center gap-1">
            <FieldLabel field={post.field} />
            {post.aiAssisted && <AiLabel />}
            {post.promoted && <PrLabel />}
          </div>
          <h3 className="line-clamp-1 text-sm font-semibold">{post.title}</h3>
          <div className="flex h-5 items-center gap-2 text-xs text-ink-soft">
            <Avatar name={post.author.displayName} url={post.author.avatarUrl} size="xs" />
            <span className="truncate">{post.author.displayName}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 tabular-nums">
              <Icon name="heart" size="sm" filled={post.isFavorited} />
              <span className="sr-only">保存数</span>
              {post.saveCount}
            </span>
          </div>
        </div>
      </Link>
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="glass p-8 text-center text-sm text-ink-soft">{children}</p>;
}

export function PostGrid({
  posts,
  empty = '作品はまだありません',
}: {
  posts: Post[];
  empty?: string;
}) {
  if (posts.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
    >
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </motion.div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={buttonClass('secondary', 'sm')}>
          再読み込み
        </button>
      )}
    </div>
  );
}

export function LoginRequired() {
  return (
    <div className="glass flex flex-col items-center gap-4 p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name="user" size="lg" />
      </span>
      <p className="text-sm text-ink-soft">この機能を使うにはログインが必要です。</p>
      <Link to="/login" className={buttonClass('primary')}>
        ログイン
      </Link>
    </div>
  );
}
