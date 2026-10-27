import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { errorMessage, post } from '../lib/api';
import { Icon } from '../ui/Icon';

const TARGETS = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
] as const;

/** AI translation with a graceful failure message (never breaks the page). */
export function TranslateButton({ text }: { text: string }) {
  const id = useId();
  const [target, setTarget] = useState<string>(navigator.language.startsWith('ja') ? 'en' : 'ja');
  const m = useMutation({
    mutationFn: () => post<{ text: string }>('/api/ai/translate', { text, target }),
  });
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={id}>
          翻訳先の言語
        </label>
        <select
          id={id}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-6 rounded-lg border border-white/90 bg-white/70 px-1"
        >
          {TARGETS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => m.mutate()}
          disabled={m.isPending}
          className="inline-flex h-6 items-center gap-1 font-semibold text-accent hover:underline disabled:opacity-50"
        >
          <Icon name="translate" size="sm" />
          {m.isPending ? '翻訳中…' : '翻訳する'}
        </button>
      </div>
      {m.isSuccess && (
        <p
          data-testid="translation"
          className="whitespace-pre-wrap rounded-lg bg-white/60 p-2 text-sm text-ink"
        >
          {m.data.text}
        </p>
      )}
      {m.isError && (
        <p role="alert" data-testid="ai-error" className="text-danger">
          {errorMessage(m.error)}
        </p>
      )}
    </div>
  );
}
