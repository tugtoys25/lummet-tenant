-- Newsroom audience and trust tools (additive only). Switches ship OFF like every newsroom switch.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_rss_feeds', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_rss_full_text', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_share_bar', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_trust_footer_links', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_copyright_reports', 'false', CURRENT_TIMESTAMP);

-- Copyright and takedown reports sent by the public. Kept even after they are resolved.
CREATE TABLE IF NOT EXISTS news_copyright_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER REFERENCES news(id) ON DELETE SET NULL,
  page_url TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  organisation TEXT,
  original_work TEXT NOT NULL,
  details TEXT NOT NULL,
  good_faith INTEGER NOT NULL DEFAULT 0,
  accuracy_confirmed INTEGER NOT NULL DEFAULT 0,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',            -- new, reviewing, actioned, rejected, withdrawn
  resolution TEXT,
  handled_by INTEGER REFERENCES users(id),
  ip_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_news_copyright_status ON news_copyright_reports(status, created_at);
