-- Newsroom reader comments (additive only). Both switches ship OFF; with comments on and open posting off, every comment waits for an editor.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_comments', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_comments_open_posting', 'false', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS news_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES news_comments(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,                                -- never shown publicly
  body TEXT NOT NULL,                               -- plain text; escaped when shown
  status TEXT NOT NULL DEFAULT 'pending',           -- pending, approved, rejected, spam
  ip_hash TEXT,
  moderated_by INTEGER REFERENCES users(id),
  moderated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_comments_article ON news_comments(news_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_news_comments_status ON news_comments(status, created_at);

-- Articles whose discussion an editor has closed. No row = open (when comments are on).
CREATE TABLE IF NOT EXISTS news_comments_closed (
  news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
  closed_by INTEGER REFERENCES users(id),
  closed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
