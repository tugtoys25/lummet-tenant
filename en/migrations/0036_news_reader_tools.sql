-- Reader features (additive; all off): polls, live blogs, AMP pages. New tables and switches only.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_polls', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_liveblog', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_amp', 'false', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS news_polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER NOT NULL UNIQUE REFERENCES news(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  closes_at TEXT,
  closed INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS news_poll_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES news_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_news_poll_options_poll ON news_poll_options(poll_id, position);
-- One vote per reader per poll: the reader is a salted hash, never a stored address.
CREATE TABLE IF NOT EXISTS news_poll_votes (
  poll_id INTEGER NOT NULL REFERENCES news_polls(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  option_id INTEGER NOT NULL REFERENCES news_poll_options(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id, voter_hash)
);

CREATE TABLE IF NOT EXISTS news_live (
  news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'live',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  created_by INTEGER
);
-- Posts are never deleted: a mistake is hidden (and can be shown again), so the record stays complete.
CREATE TABLE IF NOT EXISTS news_live_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  edited_at DATETIME,
  created_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_news_live_posts ON news_live_posts(news_id, hidden, id);
