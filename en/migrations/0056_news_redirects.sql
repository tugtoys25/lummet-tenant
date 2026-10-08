-- =====================================================
-- 0056_news_redirects.sql
-- Additive. When an editor changes an article's slug, its old URL used to
-- return 404 (losing indexed URLs and inbound links). This table remembers
-- old slugs so the public route can answer 301 -> the article's CURRENT slug.
--
-- Stores news_id (not the new slug) so chains resolve automatically:
-- a -> b -> c needs no row rewriting, and "renaming back" simply makes the
-- article's own slug win. Re-runnable (IF NOT EXISTS). Deleting an article
-- removes its redirects (ON DELETE CASCADE): the URL then correctly 404s.
-- =====================================================
CREATE TABLE IF NOT EXISTS news_redirects (
    old_slug TEXT PRIMARY KEY,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_redirects_news ON news_redirects(news_id);
