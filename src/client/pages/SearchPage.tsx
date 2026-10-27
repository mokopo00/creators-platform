import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar, ErrorState, PageTitle, PostGrid } from '../components/common';
import { api, errorMessage, post } from '../lib/api';
import type { Author, Post } from '../lib/types';
import { Button } from '../ui/Button';
import { PageSkeleton } from '../ui/Skeleton';
import { Tabs } from '../ui/Tabs';

type Mode = 'keyword' | 'ai';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [mode, setMode] = useState<Mode>('keyword');
  const [text, setText] = useState(q);
  const result = useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      api<{ posts: Post[]; creators: Omit<Author, 'id'>[] }>(
        `/api/search?q=${encodeURIComponent(q)}`,
      ),
  });
  const ai = useMutation({
    mutationFn: (query: string) =>
      post<{ posts: Post[]; keywords: string[]; fallback: boolean; message?: string }>(
        '/api/ai/search',
        { query },
      ),
  });

  if (result.isPending) return <PageSkeleton variant="feed" />;

  return (
    <div data-testid="search-page">
      <PageTitle>探す</PageTitle>
      <div className="mb-3">
        <Tabs
          label="検索方法"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'keyword', label: 'キーワード' },
            { value: 'ai', label: 'AIおすすめ検索' },
          ]}
        />
      </div>
      <form
        role="search"
        className="glass mb-4 flex gap-2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'keyword') setParams(text ? { q: text } : {}, { replace: true });
          else if (text.trim()) ai.mutate(text);
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          {mode === 'keyword' ? 'キーワード' : '探しているテイスト'}
        </label>
        <input
          id="search-input"
          type="search"
          value={text}
          maxLength={mode === 'keyword' ? 100 : 200}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === 'keyword'
              ? '作品名・ハッシュタグ・クリエイター'
              : '例：淡い色合いの水彩風ファンタジー背景'
          }
          className="flex-1 rounded-xl bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <Button type="submit" disabled={ai.isPending}>
          {ai.isPending ? '検索中…' : '検索'}
        </Button>
      </form>

      {mode === 'ai' ? (
        <section aria-live="polite">
          {ai.isError && (
            <p role="alert" data-testid="ai-error" className="glass mb-3 p-3 text-sm text-danger">
              {errorMessage(ai.error)}
            </p>
          )}
          {ai.data && (
            <>
              {ai.data.message && (
                <p className="mb-3 text-sm text-ink-soft" data-testid="ai-search-message">
                  {ai.data.message}
                </p>
              )}
              {ai.data.keywords.length > 0 && (
                <p className="mb-3 text-xs text-ink-soft">
                  抽出キーワード: {ai.data.keywords.join('、')}
                </p>
              )}
              <PostGrid posts={ai.data.posts} empty="条件に合う作品が見つかりませんでした" />
            </>
          )}
        </section>
      ) : result.isError ? (
        <ErrorState message={result.error.message} onRetry={() => result.refetch()} />
      ) : (
        <>
          {result.data.creators.length > 0 && (
            <section className="mb-4" aria-labelledby="creators-h">
              <h2 id="creators-h" className="mb-2 text-base font-bold">
                クリエイター
              </h2>
              <ul className="flex flex-wrap gap-2">
                {result.data.creators.map((c) => (
                  <li key={c.handle}>
                    <Link
                      to={`/u/${c.handle}`}
                      className="glass flex h-10 items-center gap-2 !rounded-full pl-1.5 pr-4 text-sm font-medium"
                    >
                      <Avatar name={c.displayName} url={c.avatarUrl} size="sm" />
                      {c.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <PostGrid
            posts={result.data.posts}
            empty={q ? '見つかりませんでした' : '作品はまだありません'}
          />
        </>
      )}
    </div>
  );
}
