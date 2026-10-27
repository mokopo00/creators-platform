# TECH_DECISIONS（技術選定）

CLAUDE.md 5 の技術スタックについて、選定理由と代替案との比較を記録する。

| 領域 | 採用 | 選定理由 | 比較した代替案 |
|---|---|---|---|
| フロントエンド | React 19 + Vite + TypeScript（strict） | エコシステムが最大で、Framer Motion・TanStack Query と組み合わせやすい。Vite はビルドが高速 | Next.js（SSR が Workers 上で複雑になる）、SvelteKit（ライブラリの選択肢が少ない） |
| スタイル | Tailwind CSS v4 + CSS 変数 | ガラス表現のトークン（`--glass-bg` など）を CSS 変数で一元管理し、ユーティリティで組み立てられる。`@supports` でフォールバックを書ける | CSS Modules（トークン共有が冗長）、CSS-in-JS（CSP の `style-src` 制約と相性が悪い） |
| アニメーション | Framer Motion | ページ遷移・stagger・レイアウトアニメーションを宣言的に書ける。`MotionConfig reducedMotion="user"` で `prefers-reduced-motion` を一括で尊重できる | CSS のみ（stagger や退出アニメーションが煩雑）、GSAP（ライセンスと React 統合） |
| ルーティング | React Router 7 | SPA の標準。URL クエリで絞り込み状態を保持できる | TanStack Router（学習コスト） |
| データ取得 | TanStack Query | キャッシュ・再取得・`isPending` による全画面スケルトン切替が簡潔 | SWR（ミューテーション管理が弱い） |
| バリデーション | Zod 4（`src/shared/schemas.ts` をフロント・API で共有） | 同じスキーマでフロントの入力と API のサーバー側検証を行える | Valibot（チームの習熟度） |
| バックエンド | Hono on Cloudflare Workers | 軽量で Workers ネイティブ。`app.request()` で Node 上の単体テストが容易 | itty-router（ミドルウェアが少ない） |
| 配信 | 1 つの Worker + Workers Static Assets | 同一オリジンで Cookie・CSRF・CSP を単純化（D-003） | Cloudflare Pages + 別 Worker（クロスオリジン構成が必要） |
| DB | Cloudflare D1 + FTS5（trigram トークナイザ） | Workers から低レイテンシ。trigram で日本語を形態素解析なしに部分一致検索できる。3 文字未満はエスケープ済み LIKE にフォールバック | 外部 Postgres（接続管理・コスト）、外部検索サービス（データの第三者提供が増える） |
| クエリ | 素のプリペアドステートメント（D-004） | SQL を直接レビューでき、`prepare().bind()` 以外を使わないことを確認しやすい | Drizzle ORM |
| ファイル | Cloudflare R2 + Worker による HMAC 署名付きアップロード URL（D-009） | 保存前にマジックバイト検証と EXIF 除去を強制できる | R2 S3 互換プリサイン URL |
| セッション | KV + 署名付き `__Host-sid` Cookie（D-006） | サーバー側で即時失効でき、Cookie 改ざんを検出できる | JWT（失効が困難） |
| 認証 | Google OAuth 2.0 / OIDC（Authorization Code + PKCE S256 + state） | CLAUDE.md の指定。メールアドレスは要求しない（`openid profile`） | — |
| AI | Workers AI | Cloudflare 内で完結し、追加の第三者提供先を増やさない | 外部 LLM API |
| リアルタイム | Durable Objects（WebSocket Hibernation API） | 依頼ごとに 1 オブジェクトでブロードキャスト。メッセージは D1 に保存し、WebSocket が使えない環境では 15 秒ポーリングで補完 | ポーリングのみ |
| 定期処理 | Cron Triggers（毎日 15:00 UTC = 0:00 JST） | 遅延判定（`delay_adjustments`）とランキング集計 | Queues（今回の規模では不要） |
| 決済 | Stripe Checkout + Connect（Separate charges and transfers、テストモード）、Stripe REST を `fetch` で直接呼ぶ | SDK なしで Workers に載せられる。`sk_live_` は実行時に拒否 | Stripe SDK（Node 依存） |
| テスト | Vitest（`node:sqlite` 上の D1 互換アダプタ、D-005）+ Playwright（Chromium、`wrangler dev` に対して実行） | 実マイグレーションで SQL を検証しつつ高速に回せる。E2E は実ブラウザで受け入れ基準を確認 | `@cloudflare/vitest-pool-workers` |
| CI | GitHub Actions（lint・型チェック・Vitest・`npm audit --audit-level=high`・Playwright） | CLAUDE.md 6-13 | — |

## Workers AI モデル

確認日：**2026-10-27**（Cloudflare 公式ドキュメント `developers.cloudflare.com/workers-ai/models/` を参照）

| 用途 | モデル ID | 入力 / 出力 |
|---|---|---|
| テキスト生成（タグ候補・AI おすすめ検索のキーワード抽出・チャットボット・テンプレート作成） | `@cf/meta/llama-3.1-8b-instruct-fp8` | `messages` → `response` |
| 翻訳（投稿・プロフィール・チャット） | `@cf/meta/m2m100-1.2b` | `text`, `source_lang`, `target_lang`（言語コード）→ `translated_text` |
| 画像タグ付け（タグ候補の補助） | `@cf/microsoft/resnet-50` | `image`（バイト配列）→ `[{ label, score }]` |

- モデル ID は `src/server/lib/ai.ts` の `AI_MODELS` に集約している。変更時はここと本表を更新する。
- すべての呼び出しに 15 秒のタイムアウトとレート制限（30 回 / 10 分 / ユーザーまたは IP）を設定。失敗時は 503 とユーザー向けメッセージを返し、画面側はメッセージ表示のみで崩れない。AI おすすめ検索は失敗時にキーワード検索へフォールバックする。
- 開発・テスト環境で AI バインディングが無い場合は決定的なモック（`MockAiProvider`）を使う。入力に `__AI_FAIL__` を含めると失敗経路を再現できる（E2E で使用）。ステージング・本番ではモックは使わない。
