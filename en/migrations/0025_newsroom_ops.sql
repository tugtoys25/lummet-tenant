-- Newsroom operations tools (additive only): web vitals, section digests, CSV export, per-section ad targeting.
-- Nothing here changes an existing table or row. Every switch ships OFF.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_lazy_images', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_web_vitals', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_section_digests', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_csv_export', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_section_ads', 'false', CURRENT_TIMESTAMP);

-- Real-user Core Web Vitals, stored as daily counts only (no IP, no user id, no per-visitor rows).
CREATE TABLE IF NOT EXISTS news_web_vitals (
  day TEXT NOT NULL,                 -- YYYY-MM-DD (UTC)
  page TEXT NOT NULL,                -- 'article' or 'list'
  device TEXT NOT NULL,              -- 'mobile' or 'desktop'
  metric TEXT NOT NULL,              -- LCP, CLS, INP, FCP, TTFB
  good INTEGER NOT NULL DEFAULT 0,
  needs_improvement INTEGER NOT NULL DEFAULT 0,
  poor INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  sum_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page, device, metric)
);

-- Which sections a subscriber wants a digest of, and how often.
CREATE TABLE IF NOT EXISTS news_digest_prefs (
  subscriber_id INTEGER NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES news_sections(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'weekly',      -- daily or weekly
  last_sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (subscriber_id, section_id)
);
CREATE INDEX IF NOT EXISTS idx_news_digest_prefs_section ON news_digest_prefs(section_id, frequency);

-- Section targeting for ad rules. A rule with no rows here keeps showing everywhere, exactly as before.
CREATE TABLE IF NOT EXISTS ad_rule_sections (
  rule_id INTEGER NOT NULL REFERENCES ad_rules(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES news_sections(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, section_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_rule_sections_section ON ad_rule_sections(section_id);
