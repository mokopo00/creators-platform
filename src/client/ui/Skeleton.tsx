/**
 * Full-page skeletons. Each variant mirrors the real layout of a route so the
 * page does not jump when data arrives (CLAUDE.md 4: 全画面スケルトン).
 */
export type SkeletonVariant = 'feed' | 'profile' | 'detail' | 'list' | 'form' | 'chat';

function Block({ className = '' }: { className?: string }) {
  return <div className={`skeleton-block ${className}`} />;
}

function FeedGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="glass p-3">
          <Block className="aspect-[4/3] w-full" />
          <Block className="mt-3 h-4 w-3/4" />
          <Block className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ variant }: { variant: SkeletonVariant }) {
  return (
    <div
      data-testid="page-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex w-full flex-col gap-4"
    >
      <span className="sr-only">読み込み中</span>
      {variant === 'feed' && (
        <>
          <Block className="h-8 w-40" />
          <Block className="h-10 w-72 !rounded-full" />
          <FeedGrid />
        </>
      )}
      {variant === 'profile' && (
        <>
          <div className="glass flex items-center gap-4 p-5">
            <Block className="size-20 !rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Block className="h-6 w-1/3" />
              <Block className="h-4 w-2/3" />
              <Block className="h-4 w-1/2" />
            </div>
            <Block className="h-10 w-28 !rounded-full" />
          </div>
          <FeedGrid count={3} />
        </>
      )}
      {variant === 'detail' && (
        <div className="glass p-5">
          <Block className="aspect-video w-full" />
          <Block className="mt-4 h-7 w-1/2" />
          <Block className="mt-3 h-4 w-full" />
          <Block className="mt-2 h-4 w-5/6" />
          <Block className="mt-2 h-4 w-2/3" />
        </div>
      )}
      {variant === 'list' && (
        <>
          <Block className="h-8 w-40" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="glass flex items-center gap-3 p-4">
              <Block className="size-10 !rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Block className="h-4 w-1/2" />
                <Block className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </>
      )}
      {variant === 'form' && (
        <div className="glass flex flex-col gap-4 p-5">
          <Block className="h-7 w-48" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Block className="h-4 w-24" />
              <Block className="h-10 w-full" />
            </div>
          ))}
          <Block className="h-10 w-32 !rounded-full" />
        </div>
      )}
      {variant === 'chat' && (
        <div className="glass flex flex-col gap-3 p-5">
          <Block className="h-6 w-1/3" />
          {Array.from({ length: 5 }, (_, i) => (
            <Block key={i} className={`h-10 ${i % 2 ? 'ml-auto w-1/2' : 'w-2/3'}`} />
          ))}
          <Block className="h-12 w-full" />
        </div>
      )}
    </div>
  );
}
