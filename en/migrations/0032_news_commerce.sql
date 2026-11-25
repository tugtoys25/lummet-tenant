-- News commerce layer (additive only): affiliate / product-review widgets, mobile sticky buy bar, photo gallery and for-sale inquiry form.
-- Every switch ships OFF, and an article only changes once its mode is set to something other than 'editorial'.
-- New tables only: the news table is not altered.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_commerce', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_commerce_widgets', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_commerce_sticky_bar', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_commerce_gallery', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_commerce_inquiry', 'false', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS news_commerce (
  news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'editorial' CHECK (mode IN ('editorial', 'review', 'listing', 'blog')),
  cta_label TEXT,
  disclosure_text TEXT,
  sticky_enabled INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_widgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('top', 'bottom', 'below', 'sticky')),
  widget_type TEXT NOT NULL CHECK (widget_type IN ('buy', 'product', 'price', 'inquiry', 'cta')),
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  subtitle TEXT,
  badge TEXT,
  price_text TEXT,
  cta_label TEXT,
  image_url TEXT,
  tracking_link_id INTEGER REFERENCES tracking_links(id) ON DELETE SET NULL,
  go_code TEXT,
  settings_json TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  starts_at DATETIME,
  ends_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_widgets_news ON news_widgets (news_id, slot, position);
CREATE INDEX IF NOT EXISTS idx_news_widgets_link ON news_widgets (tracking_link_id);

CREATE TABLE IF NOT EXISTS news_gallery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media_library(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  UNIQUE (news_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_news_gallery_news ON news_gallery_items (news_id, position);

CREATE TABLE IF NOT EXISTS news_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  widget_id INTEGER,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'spam')),
  country TEXT,
  ip_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_inquiries_news ON news_inquiries (news_id, created_at);
CREATE INDEX IF NOT EXISTS idx_news_inquiries_ip ON news_inquiries (ip_hash, created_at);
