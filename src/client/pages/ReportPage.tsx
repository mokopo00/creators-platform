import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageTitle } from '../components/common';
import { errorMessage, post } from '../lib/api';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';

const KINDS = [
  { value: 'copyright', label: '著作権侵害（削除申立）' },
  { value: 'derivative', label: '二次創作' },
  { value: 'ai_undeclared', label: 'AI 生成・AI 補助の未申告' },
  { value: 'abuse', label: '嫌がらせ・不適切な内容' },
  { value: 'other', label: 'その他' },
];

/** 通報フォーム / 著作権削除申立フロー. */
export function ReportPage() {
  const [params] = useSearchParams();
  const [targetType, setTargetType] = useState(params.get('type') ?? 'post');
  const [targetId, setTargetId] = useState(params.get('id') ?? '');
  const [kind, setKind] = useState('copyright');
  const [details, setDetails] = useState('');
  const m = useMutation({
    mutationFn: () => post('/api/reports', { targetType, targetId, kind, details }),
  });

  if (m.isSuccess) {
    return (
      <div className="glass p-6 text-sm" role="status" data-testid="report-done">
        受け付けました。運営が内容を確認し、必要に応じて対応します。
      </div>
    );
  }

  return (
    <form
      className="glass flex flex-col gap-4 p-6"
      data-testid="report-page"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <PageTitle>通報・削除申立</PageTitle>
      <ol className="list-decimal pl-5 text-sm text-ink-soft">
        <li>対象と理由を入力して送信します。</li>
        <li>
          運営が内容を確認します。著作権侵害の申立ての場合、必要に応じて投稿者に通知し、投稿を非公開または削除します。
        </li>
        <li>投稿者は異議を申し立てることができます。</li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="対象の種類"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
        >
          <option value="post">作品</option>
          <option value="user">ユーザー</option>
          <option value="message">メッセージ</option>
        </Select>
        <Input
          label="対象の ID または URL"
          required
          maxLength={100}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        />
      </div>
      <Select label="理由" value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </Select>
      <Textarea
        label="詳細"
        hint="著作権侵害の場合は、元の作品の所在（URL 等）と権利者であることの説明を記入してください（10文字以上）"
        required
        minLength={10}
        maxLength={3000}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      {m.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(m.error)}
        </p>
      )}
      <Button type="submit" disabled={m.isPending} className="self-start">
        送信する
      </Button>
    </form>
  );
}
