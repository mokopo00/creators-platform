# HANDOFF（作業の引き継ぎ）

最終更新：2026-10-28。次の作業を始める人（Claude Code を含む）は、`CLAUDE.md` → 本ファイル → `docs/DECISIONS.md` の順に読むこと。

## 現在の状態

| 項目                                        | 状態                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 実装（SPEC 第7章 Phase 0〜8）               | 完了                                                                                                              |
| 単体テスト（Vitest）                        | 85 / 85 合格                                                                                                      |
| E2E（Playwright、SPEC 第8章の受け入れ基準） | 22 / 22 合格                                                                                                      |
| GitHub                                      | Public 公開済み：https://github.com/mokopo00/creators-platform （secret scanning・push protection 有効、CI 合格） |
| デザイン                                    | SVG アイコンとサイズ体系に統一済み（D-027）                                                                       |
| Cloudflare ステージング                     | **未実施**（Wrangler 未ログイン。2026-10-27 の時点で、デプロイはせずローカル確認のみとする方針）                  |
| 本番公開                                    | 未実施（停止点。CLAUDE.md 8-4）                                                                                   |

## ローカルでの起動と確認

```bash
npm ci                      # 初回、または依存関係が変わったとき
npx playwright install chromium   # 初回のみ
node e2e/server.mjs         # ビルド → 空の DB にマイグレーション → http://localhost:8787 で起動
```

- 架空データを入れる場合：起動後、別ターミナルで次を実行する。
  `npx wrangler d1 execute DB --local --persist-to .wrangler/e2e --file scripts/seed-staging.sql`
- ログイン：`/login` の「開発・テスト環境専用のログイン」に任意のユーザー名（例：`test-user-01`）を入力する。
- 決済：テスト用の決済画面（`/checkout/mock/...`）で完了する。実際の請求は発生しない。
- AI 機能：ローカルではダミー応答。入力に `__AI_FAIL__` を含めると失敗時の表示を確認できる。
- 停止：起動したターミナルで Ctrl+C。データは次回起動時にリセットされる。

| コマンド                   | 内容                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run check`            | lint・型チェック・単体テスト（commit 前に必ず実行）               |
| `npm run test:e2e`         | E2E（サーバーを自動起動。8787 番が使用中ならそれを再利用する）    |
| `npx playwright test --ui` | E2E をブラウザ画面付きで 1 件ずつ確認                             |
| `npm run dev`              | 画面の即時反映モード（http://localhost:5173、API は 8787 を使用） |

## 次にやること（候補）

1. **ステージング公開（実施する場合のみ）**：`npx wrangler login` → `wrangler.jsonc` に `env.staging`（D1・KV・R2・Durable Objects・AI・Cron）を追加 → リソース作成 → マイグレーションと `scripts/seed-staging.sql` の投入 → secrets（`SESSION_SECRET` ほか）設定 → デプロイ → `E2E_BASE_URL=<URL> npx playwright test --config playwright.smoke.config.ts` → README に URL とステージングである旨を記載。
2. **法務確認**：`docs/LEGAL_TODO.md` の 15 項目はすべて未確認（専門家の確認が必要）。
3. **既知の残課題**（`docs/SECURITY.md`）：動画メタデータの除去、KV レート制限の厳密化。
4. **本番公開の前提**（人間の作業）：本番用 Google OAuth と Stripe の設定、`BUSINESS_*` の secrets 登録、運営アカウント（`ADMIN_HANDLES`）の指定。

## 注意事項

- git の `user.email` はこのリポジトリのみ noreply アドレスに設定済み。グローバル設定には個人のメールアドレスが残っているため、別の場所で clone した場合は再設定すること。
- スクリーンショット等の一時ファイルはリポジトリ外に保存すること（過去に誤ってリポジトリ内に保存し、push 前に除去した経緯がある）。
- E2E は `.wrangler/e2e` のローカル状態を使う。起動のたびに初期化される。
