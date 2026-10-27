import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FIELD_LABELS, FIELDS } from '../../shared/constants';
import { ErrorState, LoginRequired, PageTitle } from '../components/common';
import { api, errorMessage, patch, post, uploadFile } from '../lib/api';
import { useMe } from '../lib/auth';
import type { Post } from '../lib/types';
import { Button } from '../ui/Button';
import { Checkbox, Input, Select, Textarea } from '../ui/Input';
import { PageSkeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';

export function PostEditorPage() {
  const { id } = useParams();
  const me = useMe();
  const existing = useQuery({
    queryKey: ['post', id],
    queryFn: () => api<{ post: Post; isOwner: boolean }>(`/api/posts/${id}`),
    enabled: !!id,
  });
  if (me.isPending || (id && existing.isPending)) return <PageSkeleton variant="form" />;
  if (!me.data?.user) return <LoginRequired />;
  if (existing.isError) return <ErrorState message={existing.error.message} />;
  return <Editor key={id ?? 'new'} initial={existing.data?.post} />;
}

function Editor({ initial }: { initial?: Post }) {
  const nav = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [field, setField] = useState(initial?.field ?? 'illustration');
  const [tags, setTags] = useState(initial?.hashtags.join(' ') ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [aiAssisted, setAiAssisted] = useState(initial?.aiAssisted ?? false);
  const [original, setOriginal] = useState(!!initial);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [error, setError] = useState('');

  const hashtags = tags
    .split(/[\s,、]+/)
    .map((t) => t.replace(/^#/, ''))
    .filter(Boolean);

  const suggest = useMutation({
    mutationFn: () => post<{ tags: string[] }>('/api/ai/tags', { title, body }),
    onSuccess: (r) => setSuggested(r.tags.filter((t) => !hashtags.includes(t))),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (initial) {
        await patch(`/api/posts/${initial.id}`, { title, body, field, hashtags, aiAssisted });
        return initial.id;
      }
      let mediaKey: string | undefined;
      let mediaType: 'image' | 'video' | 'text' = 'text';
      if (file) {
        mediaKey = await uploadFile(file);
        mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      }
      const r = await post<{ id: string }>('/api/posts', {
        title,
        body,
        field,
        hashtags,
        mediaType,
        mediaKey,
        aiAssisted,
        originalConfirmed: original,
      });
      return r.id;
    },
    onSuccess: (pid) => {
      toast.show(initial ? '更新しました' : '投稿しました', 'success');
      nav(`/posts/${pid}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!initial && !original) {
      setError('オリジナル作品であることへの同意が必要です');
      return;
    }
    save.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="glass flex flex-col gap-4 p-5" data-testid="post-editor">
      <PageTitle>{initial ? '作品を編集' : '作品を投稿'}</PageTitle>
      {!initial && (
        <div className="flex flex-col gap-1">
          <label htmlFor="media" className="text-sm font-medium">
            画像・動画（テキスト作品の場合は不要）
          </label>
          <input
            id="media"
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:font-semibold file:text-accent"
          />
          <p className="text-xs text-ink-soft">
            画像 10MB・動画 50MB まで。位置情報などの撮影情報は自動で削除されます。
          </p>
        </div>
      )}
      <Input
        label="タイトル"
        required
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Textarea
        label="説明・本文"
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Select label="分野" value={field} onChange={(e) => setField(e.target.value)}>
        {FIELDS.map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </Select>
      <Input
        label="ハッシュタグ"
        hint="スペース区切りで10個まで"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => suggest.mutate()}
          disabled={suggest.isPending || !title}
        >
          {suggest.isPending ? '生成中…' : 'AIでタグ候補を生成'}
        </Button>
        {suggest.isError && (
          <p role="alert" data-testid="ai-error" className="text-xs text-danger">
            {errorMessage(suggest.error)}
          </p>
        )}
        {suggested.length > 0 && (
          <div data-testid="tag-suggestions" className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-soft">候補（クリックで追加）:</span>
            {suggested.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTags((cur) => `${cur} ${t}`.trim());
                  setSuggested((s) => s.filter((x) => x !== t));
                }}
                className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>
      <Checkbox
        label="AI補助ツールを使用しました（作品に「AI補助」ラベルが表示されます）"
        checked={aiAssisted}
        onChange={(e) => setAiAssisted(e.target.checked)}
      />
      {!initial && (
        <Checkbox
          label="この作品は自分が創作したオリジナル作品であり、二次創作・他者の作品・AI生成作品ではありません"
          checked={original}
          onChange={(e) => setOriginal(e.target.checked)}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={save.isPending} className="self-start">
        {save.isPending ? '送信中…' : initial ? '更新する' : '投稿する'}
      </Button>
    </form>
  );
}
