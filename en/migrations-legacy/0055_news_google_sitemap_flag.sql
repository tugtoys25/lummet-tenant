-- =====================================================
-- 0055_news_google_sitemap_flag.sql
-- Additive: registers the feature flag for the Google News sitemap
-- (/en/news-sitemap.xml). Ships OFF. Re-runnable (INSERT OR IGNORE).
-- =====================================================
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('news_google_sitemap', 'false');
