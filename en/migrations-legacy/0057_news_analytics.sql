-- =====================================================
-- 0057_news_analytics.sql
-- Additive. Supports the newsroom analytics dashboards.
--
-- 1. analytics_events had no index on news_id, so a per-article performance
--    view had to scan every event of that type in the date window. This index
--    makes it an index range scan. (On a very large production table, build
--    it in a quiet period; it is safe to re-run.)
-- 2. Registers the `news_analytics_enrichment` flag (OFF). When ON, news page
--    views also record a bot flag, device class and UTM parameters, so that
--    crawlers stop being counted as readers and campaign traffic can be
--    classified. It changes what is recorded from then on, never history.
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_analytics_events_news ON analytics_events(news_id, occurred_at);

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('news_analytics_enrichment', 'false');
