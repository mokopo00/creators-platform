# SECURITY

CLAUDE.md 第6章の要件と実装・確認状況。

| # | 要件 | 実装 | テスト |
|---|---|---|---|
| 1 | SQL インジェクション | すべての SQL は `prepare().bind()`（`src/server/lib/db.ts`）。動的な並び替えは許可リスト（`allow()`）。列名は固定値のみ。FTS5 入力は各語を `"…"` で引用し `"` を二重化、3 文字未満は `ESCAPE '\'` 付き LIKE | `tests/unit/discover.test.ts`（検索・パス・クエリ・本文への注入ペイロード） |
| 2 | 入力検証 | 全 API を Zod でサーバー側検証（`src/shared/schemas.ts`）。ファイルは MIME 許可リスト・拡張子・サイズ・マジックバイト | `posts.test.ts` |
| 3 | XSS | React のエスケープのみ使用。`dangerouslySetInnerHTML` は ESLint で禁止。CSP `default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'` | `auth.test.ts`（ヘッダー） |
| 4 | CSRF | 状態変更（POST/PUT/PATCH/DELETE）は `Origin` が `APP_ORIGIN` と一致しない場合 403。Cookie は SameSite=Lax。GET で状態を変えない（閲覧数の加算を除く） | `auth.test.ts` |
| 5 | 認可（IDOR） | 依頼は参加者のみ（非参加者には 404）、投稿の編集・削除は作者のみ、フォルダ・通知は所有者のみ、決済セッションは依頼者のみ、運営操作は `ADMIN_HANDLES` のみ | `posts.test.ts`・`requests.test.ts`・`discover.test.ts` |
| 6 | OAuth | Authorization Code + PKCE（S256）+ `state`（KV とブラウザ Cookie の両方で照合、使い捨て）。`redirect_uri` は `OAUTH_REDIRECT_URIS` の許可リストと一致必須。ログイン後の遷移先は相対パスのみ | `auth.test.ts` |
| 7 | レート制限 | KV 固定ウィンドウ：ログイン 20/10分、投稿 20/時、アップロード 30/10分、チャット 30/分、依頼作成 20/時、AI 30/10分、通報 5/時 | `ai.test.ts`・`discover.test.ts` |
| 8 | ファイル | Worker が HMAC 署名したアップロード URL（ユーザー・MIME・サイズ・10 分の期限に束縛）。画像 10MB・動画 50MB。JPEG/PNG/WebP の EXIF・XMP 等を除去 | `posts.test.ts` |
| 9 | 秘密情報 | `SESSION_SECRET`・`GOOGLE_CLIENT_SECRET`・`STRIPE_*`・`BUSINESS_*` は Wrangler secrets / `.dev.vars`（git 管理外）。エラーログは例外名のみで本文・トークンを出さない | — |
| 10 | 個人情報の最小化 | Google から `sub`・表示名・画像 URL のみ（スコープ `openid profile`）。メールアドレスは要求も保存もしない。年齢確認は結果のみ保存 | `extras.test.ts` |
| 11 | 決済情報 | カード情報は Stripe Checkout に委譲。`sk_live_` は実行時に拒否。Webhook は署名（5 分の許容）を検証し、`livemode` イベントを拒否 | `stripe.test.ts`・`requests.test.ts` |
| 12 | HTTP ヘッダー | `Strict-Transport-Security`・`X-Content-Type-Options: nosniff`・`Referrer-Policy`・`Permissions-Policy`・`X-Frame-Options: DENY`・COOP | `auth.test.ts` |
| 13 | 依存関係 | CI で `npm audit --audit-level=high` | CI |
| 14 | データ漏えい防止 | テストデータは架空値（`test-creator-01` など）のみ。公開前に `git grep` で個人情報・秘密情報の残存を確認（下記） | — |

## 残課題

- 動画ファイルのメタデータ（撮影位置等）は除去していない（D-010）。本番前に、動画のアップロード時にメタデータを含む `udta` ボックスを除去する処理、または注意喚起の表示を検討する。
- レート制限は KV の結果整合性に依存するため、厳密な上限ではない。本番では Cloudflare の Rate Limiting ルールの併用を検討する。
- ID トークンの署名は検証していない（D-007）。トークンエンドポイントから直接受け取る場合に限定している。
- 静的アセットにはセキュリティヘッダーが Worker を経由しないため付与されない。`public/_headers` で同等のヘッダーを付与している。

## 残存チェック（公開前に実施）

```bash
git grep -nIiE '(@gmail\.com|@outlook\.|@yahoo\.|@icloud\.com|sk_live_|sk_test_[0-9a-zA-Z]{10,}|whsec_[0-9a-zA-Z]{10,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)'
git log --format='%an <%ae>' | sort -u
git ls-files | grep -E '(^|/)\.(env|dev\.vars)($|\.)' | grep -v example
```
