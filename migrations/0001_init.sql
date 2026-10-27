-- Initial schema. Personal data is minimised: only Google `sub`, display name
-- and avatar URL are stored (no e-mail). See docs/SECURITY.md.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  bio_lang TEXT NOT NULL DEFAULT 'ja',
  is_creator INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'glass',
  decoration TEXT NOT NULL DEFAULT '',
  accepting_requests INTEGER NOT NULL DEFAULT 1,
  monthly_capacity INTEGER NOT NULL DEFAULT 3,
  age_confirmed_adult INTEGER NOT NULL DEFAULT 0,
  age_confirmed_at TEXT,
  premium_until TEXT,
  stripe_account_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE creator_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  price_list TEXT NOT NULL DEFAULT '[]',
  sample_post_ids TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  production_days INTEGER NOT NULL DEFAULT 14,
  payment_terms TEXT NOT NULL DEFAULT '依頼確定時に前払い',
  retake_count INTEGER NOT NULL DEFAULT 2
);

CREATE TABLE request_templates (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_templates_creator ON request_templates(creator_id);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'ja',
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'text')),
  media_key TEXT,
  field TEXT NOT NULL,
  ai_assisted INTEGER NOT NULL DEFAULT 0,
  is_promoted_until TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  save_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_field ON posts(field, created_at DESC);

CREATE TABLE post_hashtags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);
CREATE INDEX idx_hashtags_tag ON post_hashtags(tag);

-- Full text search (trigram works for Japanese without a tokenizer).
CREATE VIRTUAL TABLE posts_fts USING fts5(post_id UNINDEXED, title, body, tags, tokenize = 'trigram');

CREATE TABLE post_daily_stats (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, day)
);

CREATE TABLE favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE folder_items (
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (folder_id, post_id)
);

CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, creator_id)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'delivered', 'completed', 'cancelled_refunded', 'cancelled')),
  delay_terms_agreed_at TEXT NOT NULL,
  checkout_session_id TEXT,
  payment_intent_id TEXT,
  paid_at TEXT,
  delivered_at TEXT,
  delivery_note TEXT,
  client_approved_at TEXT,
  creator_approved_at TEXT,
  reduction_amount INTEGER NOT NULL DEFAULT 0,
  payout_amount INTEGER,
  platform_fee INTEGER,
  payout_status TEXT NOT NULL DEFAULT 'none' CHECK (payout_status IN ('none', 'transferred', 'not_applicable')),
  transfer_id TEXT,
  refund_amount INTEGER NOT NULL DEFAULT 0,
  refund_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_requests_creator ON requests(creator_id, created_at DESC);
CREATE INDEX idx_requests_client ON requests(client_id, created_at DESC);
CREATE INDEX idx_requests_status ON requests(status, due_date);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_request ON messages(request_id, created_at);

-- Reduction stop flags per justified reason (CLAUDE.md 3-5-4).
CREATE TABLE delay_pauses (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('creator_force_majeure', 'client_material_delay', 'client_approval_wait', 'platform_outage')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pauses_request ON delay_pauses(request_id);

-- Daily delay evaluation history (CLAUDE.md 3-5-5).
CREATE TABLE delay_adjustments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  evaluated_on TEXT NOT NULL,
  overdue_days INTEGER NOT NULL,
  excused_days INTEGER NOT NULL,
  chargeable_days INTEGER NOT NULL,
  reduction_rate_bp INTEGER NOT NULL,
  reduction_amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (request_id, evaluated_on)
);

CREATE TABLE rankings (
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  scope TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (period, scope, post_id)
);
CREATE INDEX idx_rankings_scope ON rankings(period, scope, rank);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'user', 'message')),
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('derivative', 'copyright', 'ai_undeclared', 'abuse', 'other')),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'active', 'ended', 'cancelled')),
  label TEXT NOT NULL DEFAULT 'PR',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE premium_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')),
  price_jpy INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  current_period_end TEXT NOT NULL,
  provider_ref TEXT
);

-- Digital sales: framework only (fee rate setting, no checkout yet).
CREATE TABLE digital_products (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'listed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Retained for legally required periods even after account deletion.
CREATE TABLE payment_records (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('charge', 'refund', 'transfer', 'premium')),
  amount INTEGER NOT NULL,
  provider_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
