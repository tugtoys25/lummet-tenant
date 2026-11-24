-- Newsroom content import (additive only). The switch ships OFF. Imported articles are always created as drafts.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_import', 'false', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS news_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_format TEXT NOT NULL,                 -- rss, wordpress, csv
  filename TEXT,
  created_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Where each imported article came from, so old addresses can be mapped to new ones.
CREATE TABLE IF NOT EXISTS news_import_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES news_imports(id) ON DELETE CASCADE,
  news_id INTEGER REFERENCES news(id) ON DELETE SET NULL,
  title TEXT,
  source_url TEXT,
  new_slug TEXT,
  outcome TEXT NOT NULL,                       -- created or skipped
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_news_import_items_import ON news_import_items(import_id);
