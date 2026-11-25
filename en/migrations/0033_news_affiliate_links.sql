-- News affiliate links (additive only): the newsroom's OWN outbound links for any marketplace or affiliate programme
-- (Amazon, Alibaba, AliExpress, eBay, Jumia ...). Served at /en/go/<code> ONLY when no casino tracking link or casino slug
-- uses that code, so the existing tracking system is never touched. New tables only.
CREATE TABLE IF NOT EXISTS news_affiliate_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  label TEXT NOT NULL,
  network TEXT,
  destination_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL REFERENCES news_affiliate_links(id) ON DELETE CASCADE,
  news_id INTEGER,
  widget_id INTEGER,
  country TEXT,
  device TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_link_clicks_link ON news_link_clicks (link_id, created_at);
CREATE INDEX IF NOT EXISTS idx_news_link_clicks_news ON news_link_clicks (news_id, created_at);
