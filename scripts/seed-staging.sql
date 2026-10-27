-- Fictitious test data for the staging environment only. No real people.
INSERT OR IGNORE INTO users (id, google_sub, handle, display_name, bio, is_creator, accepting_requests, monthly_capacity)
VALUES
  ('5eed0000-0000-4000-8000-000000000001', NULL, 'test-creator-01', 'テストクリエイター01', '架空のテスト用クリエイターです。', 1, 1, 3),
  ('5eed0000-0000-4000-8000-000000000002', NULL, 'test-creator-02', 'テストクリエイター02', '架空のテスト用クリエイターです。', 1, 1, 2);

INSERT OR IGNORE INTO creator_settings (user_id, price_list, notes, production_days, payment_terms, retake_count)
VALUES
  ('5eed0000-0000-4000-8000-000000000001', '[{"name":"アイコン","price":5000,"description":"テスト用"},{"name":"立ち絵","price":15000,"description":"テスト用"}]', 'テスト用の注意事項です。', 14, '依頼確定時に前払い', 2);

INSERT OR IGNORE INTO posts (id, author_id, title, body, media_type, field)
VALUES
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000001', 'テスト作品：架空の短編', 'ステージング確認用の架空のテキスト作品です。', 'text', 'novel'),
  ('5eed0000-0000-4000-8000-0000000000a2', '5eed0000-0000-4000-8000-000000000002', 'テスト作品：架空の設定資料', 'ステージング確認用の架空のテキスト作品です。', 'text', 'other');

INSERT OR IGNORE INTO post_hashtags (post_id, tag) VALUES
  ('5eed0000-0000-4000-8000-0000000000a1', 'テスト'),
  ('5eed0000-0000-4000-8000-0000000000a2', 'テスト');

DELETE FROM posts_fts WHERE post_id IN ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-0000000000a2');
INSERT INTO posts_fts (post_id, title, body, tags)
SELECT id, title, body, 'テスト' FROM posts WHERE id IN ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-0000000000a2');
