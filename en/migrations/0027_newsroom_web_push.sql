-- Newsroom web push notifications (additive only). Both switches ship OFF.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_web_push', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_push_auto', 'false', CURRENT_TIMESTAMP);

-- One row per browser that agreed to notifications. The endpoint is the browser vendor's push address.
CREATE TABLE IF NOT EXISTS news_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- active, gone (the browser vendor says it no longer exists), unsubscribed
  failures INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_ok_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_news_push_subs_status ON news_push_subscriptions(status, id);

-- One row per announcement. Sending runs in small batches (cursor) so a large audience never overruns one request.
CREATE TABLE IF NOT EXISTS news_push_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER REFERENCES news(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',     -- manual or auto
  cursor INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  gone INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_push_sends_open ON news_push_sends(done, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_push_sends_auto_article ON news_push_sends(news_id) WHERE trigger = 'auto';
