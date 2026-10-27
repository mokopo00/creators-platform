# [PROJECT_NAME]

クリエイターがオリジナル作品を投稿し、ユーザーがテイストの合うクリエイターを探してチャットで依頼できる Web プラットフォーム（開発中）。

> **本リポジトリは閲覧のみ可能で、利用には権利者の許諾が必要です。**
> 複製・改変・再配布・商用利用を含む一切の利用は許諾されていません。詳細は [LICENSE](./LICENSE) を参照してください。
> 外部からのプルリクエストは、権利者の書面による事前承認がない限り取り込みません。

## 構成

| ディレクトリ | 内容                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| `src/client` | React + Vite + TypeScript のフロントエンド                                              |
| `src/server` | Hono on Cloudflare Workers の API（D1 / KV / R2 / Durable Objects / Workers AI / Cron） |
| `src/shared` | フロントと API で共有する Zod スキーマ・減額計算                                        |
| `migrations` | D1 マイグレーション                                                                     |
| `tests/unit` | Vitest 単体テスト                                                                       |
| `e2e`        | Playwright E2E テスト                                                                   |
| `docs`       | 仕様・判断記録・法務 TODO・セキュリティ                                                 |

## 開発

```bash
npm ci
cp .env.example .dev.vars   # 値を設定（コミットしない）
npm run db:migrate:local
npm run preview              # ビルドして wrangler dev（http://localhost:8787）
npm test                     # 単体テスト
npm run test:e2e             # E2E（ローカルの wrangler dev に対して実行）
```

## ドキュメント

- [docs/HANDOFF.md](docs/HANDOFF.md) — 現在の状態と作業の再開方法
- [docs/SPEC.md](docs/SPEC.md) — 実装フェーズと受け入れ基準
- [docs/TECH_DECISIONS.md](docs/TECH_DECISIONS.md) — 技術選定
- [docs/DECISIONS.md](docs/DECISIONS.md) — 判断記録
- [docs/LEGAL_TODO.md](docs/LEGAL_TODO.md) — 公開前の法的確認事項
- [docs/SECURITY.md](docs/SECURITY.md) — セキュリティ設計
