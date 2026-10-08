-- =====================================================
-- 0058_news_search.sql
-- Additive. Fast news search without scanning article bodies.
--
-- The existing search does `LIKE '%q%'` on title, excerpt, content and tags
-- of every article on every request: unindexable and O(articles x body size).
-- This adds a small inverted index maintained by the application:
--   news_search_terms(term, news_id, weight)   PRIMARY KEY (term, news_id)
-- so a query is an index seek per word (plus a range seek for the last,
-- prefix-matched word). news_search_docs stores a content hash so a
-- re-index skips unchanged articles.
--
-- Why not FTS5: virtual tables need triggers on the production `news` table,
-- and, as far as I know, D1's export tooling does not support databases that
-- contain virtual tables (verify against current Cloudflare docs before
-- switching). A plain table is exportable, trigger-free and works on any D1.
--
-- Nothing changes until the `news_search_v2` flag is turned on AND the index
-- is built (Newsroom -> Search -> Rebuild). Re-runnable (IF NOT EXISTS).
-- =====================================================
CREATE TABLE IF NOT EXISTS news_search_terms (
    term TEXT NOT NULL,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    weight INTEGER NOT NULL,
    PRIMARY KEY (term, news_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_news_search_terms_news ON news_search_terms(news_id);

CREATE TABLE IF NOT EXISTS news_search_docs (
    news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- (author / section / type / country filters already have indexes: idx_news_author, idx_news_section,
--  idx_news_article_type, idx_news_primary_country, idx_news_published_date)

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('news_search_v2', 'false');
