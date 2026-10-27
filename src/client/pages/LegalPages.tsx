import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DelayTerms } from '../components/DelayTerms';
import { PageTitle } from '../components/common';
import { api, yen } from '../lib/api';
import { PageSkeleton } from '../ui/Skeleton';

/*
 * Template texts. Every page is a draft pending review by a qualified
 * professional before production launch (docs/LEGAL_TODO.md).
 */

function Doc({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <article className="glass flex flex-col gap-4 p-6 text-sm leading-relaxed" data-testid={testId}>
      <PageTitle>{title}</PageTitle>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        本ページは暫定版です。正式な内容は公開前に確定します。
      </p>
      {children}
    </article>
  );
}

function Sec({ h, children }: { h: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold">{h}</h2>
      {children}
    </section>
  );
}

export function TermsPage() {
  return (
    <Doc title="利用規約" testId="terms-page">
      <Sec h="第1条（適用）">
        <p>
          本規約は、本サービスの利用に関する条件を定めるものです。利用者は本規約に同意したうえで本サービスを利用するものとします。
        </p>
      </Sec>
      <Sec h="第2条（投稿できる作品）">
        <ul className="list-disc pl-5">
          <li>投稿できるのは、投稿者本人が創作したオリジナル作品のみです。</li>
          <li>二次創作（既存の作品・キャラクター等を元にした作品）は投稿できません。</li>
          <li>
            AI により生成された作品は投稿できません。AI
            補助ツールを使用した作品は投稿時に申告するものとし、当該作品には「AI補助」と表示されます。
          </li>
          <li>
            投稿作品の著作権は投稿者に帰属します。運営は本サービスの提供・表示に必要な範囲で投稿作品を利用できるものとします。
          </li>
        </ul>
      </Sec>
      <Sec h="第3条（禁止行為）">
        <ul className="list-disc pl-5">
          <li>第三者の著作権・商標権・肖像権その他の権利を侵害する行為</li>
          <li>他者の作品を自分の作品として投稿する行為、AI 補助の未申告</li>
          <li>虚偽の情報による依頼、決済を経由しない取引の勧誘</li>
          <li>嫌がらせ、差別的表現、法令または公序良俗に反する行為</li>
          <li>本サービスの運営を妨げる行為、不正アクセス</li>
        </ul>
      </Sec>
      <Sec h="第4条（アカウントの停止）">
        <p>
          運営は、利用者が本規約に違反した場合、事前の通知なく投稿の削除、アカウントの一時停止または削除を行うことがあります。
        </p>
      </Sec>
      <Sec h="第5条（依頼と支払い）">
        <ul className="list-disc pl-5">
          <li>有償の依頼は18歳以上の利用者のみ利用できます。</li>
          <li>
            依頼料は依頼確定時に前払いします。納品後、依頼者とクリエイターの双方が受け取りを承認した時点でクリエイターへ送金します。
          </li>
          <li>手数料は売上の10%です。</li>
        </ul>
      </Sec>
      <Sec h="第6条（納期遅延時の減額・返金）">
        <DelayTerms />
      </Sec>
      <Sec h="第7条（著作権侵害の申立て）">
        <p>
          権利侵害を発見した場合は、通報・削除申立フォームから申し立ててください。運営は内容を確認し、必要に応じて投稿を削除します。
        </p>
      </Sec>
    </Doc>
  );
}

export function PrivacyPage() {
  return (
    <Doc title="プライバシーポリシー" testId="privacy-page">
      <Sec h="1. 取得する情報">
        <ul className="list-disc pl-5">
          <li>
            Google アカウントの識別子（sub）、表示名、プロフィール画像の
            URL（メールアドレスは取得・保存しません）
          </li>
          <li>利用者が入力・投稿した情報（プロフィール、作品、メッセージ、依頼内容）</li>
          <li>
            年齢確認の結果（18歳以上であるかどうかと確認日時。生年月日そのものは保存しません）
          </li>
          <li>閲覧数・保存数などの利用状況、セキュリティのためのアクセス情報</li>
          <li>
            決済の記録（金額・決済サービス上の識別子。カード番号は当サービスでは保持しません）
          </li>
        </ul>
      </Sec>
      <Sec h="2. 利用目的">
        <p>
          本サービスの提供、本人確認、不正利用の防止、依頼と決済の処理、問い合わせ対応、サービス改善のために利用します。
        </p>
      </Sec>
      <Sec h="3. 第三者提供・外部サービス">
        <ul className="list-disc pl-5">
          <li>Google LLC（ログイン認証）</li>
          <li>
            Cloudflare, Inc.（ホスティング、データ保存、Workers AI による翻訳・タグ生成・検索補助）
          </li>
          <li>Stripe, Inc.（決済処理・クリエイターへの送金）</li>
        </ul>
        <p>法令に基づく場合を除き、上記以外の第三者に個人情報を提供しません。</p>
      </Sec>
      <Sec h="4. 保存期間">
        <p>
          アカウント情報は削除まで保存します。決済に関する記録は、法令で定められた期間保存します。
        </p>
      </Sec>
      <Sec h="5. 削除請求">
        <p>
          設定画面の「アカウントを削除」から、プロフィール・作品・お気に入り等を削除できます。その他の開示・訂正・削除の請求は、特定商取引法に基づく表記に記載の連絡先までご連絡ください。
        </p>
      </Sec>
    </Doc>
  );
}

export function TokushohoPage() {
  const q = useQuery({
    queryKey: ['business'],
    queryFn: () =>
      api<{
        name: string | null;
        address: string | null;
        phone: string | null;
        contact: string | null;
        feeRate: number;
        premiumPriceJpy: number;
        premiumTaxLabel: string;
      }>('/api/legal/business'),
  });
  if (q.isPending) return <PageSkeleton variant="detail" />;
  const b = q.data;
  const pending = '公開前に記載します';
  const rows: [string, ReactNode][] = [
    ['事業者の名称', b?.name ?? pending],
    ['所在地', b?.address ?? pending],
    ['電話番号', b?.phone ?? pending],
    ['連絡先', b?.contact ?? pending],
    [
      '販売価格',
      '各クリエイターが依頼ごとに提示する金額。プレミアム会員は月額 ' +
        (b ? `${yen(b.premiumPriceJpy)}（${b.premiumTaxLabel}）` : ''),
    ],
    ['手数料', b ? `依頼料の${Math.round(b.feeRate * 100)}%（クリエイターの売上から控除）` : ''],
    ['支払時期', '依頼確定時に前払い'],
    ['支払方法', 'クレジットカード等（Stripe による決済）'],
    ['提供時期', '依頼ごとに定めた納期まで'],
    [
      'キャンセル・返金',
      '納期を過ぎた場合、依頼者は全額返金でキャンセルできます。遅延時の減額条件は利用規約をご確認ください。',
    ],
  ];
  return (
    <Doc title="特定商取引法に基づく表記" testId="tokushoho-page">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ink-soft">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Doc>
  );
}
