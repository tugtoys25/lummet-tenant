-- Image focal point and translations (additive; both off). New tables and switches only.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_image_focus', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_translations', 'false', CURRENT_TIMESTAMP);

-- Where the subject of a picture is, as a percentage from the top-left corner. Cards and headers keep this point in view when they crop.
CREATE TABLE IF NOT EXISTS media_focus (
  media_id INTEGER PRIMARY KEY REFERENCES media_library(id) ON DELETE CASCADE,
  x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 100),
  y INTEGER NOT NULL CHECK (y BETWEEN 0 AND 100),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Articles that are translations of each other share a group; each has one language. Articles are never merged or removed.
CREATE TABLE IF NOT EXISTS news_language (
  news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  UNIQUE (group_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_news_language_group ON news_language(group_id);
