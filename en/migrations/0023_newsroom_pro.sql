-- Newsroom pro tools (additive only): extra bylines, search-engine ping log, two new switches.
-- Nothing here changes an existing table or an existing row.

-- Reporter, editor, photographer and other credits shown next to the main author.
CREATE TABLE IF NOT EXISTS news_article_bylines (
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'co-author',
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (news_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_news_bylines_news ON news_article_bylines(news_id, display_order);

-- One row per IndexNow submission attempt, so editors can see what was sent and when.
CREATE TABLE IF NOT EXISTS news_index_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER,
  url TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  http_status INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_index_pings_news ON news_index_pings(news_id, created_at);

-- news_indexnow: off until the owner turns it on (it tells search engines about new and corrected articles).
-- news_revision_history: keeps a revision for every edit even when the editorial workflow is off.
-- Both ship OFF like every other newsroom switch; the owner turns them on in Newsroom > Flags.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_indexnow', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_revision_history', 'false', CURRENT_TIMESTAMP);
