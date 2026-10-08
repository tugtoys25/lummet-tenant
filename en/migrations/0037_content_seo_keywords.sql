-- =====================================================
-- 0037_content_seo_keywords.sql
--
-- Adds a `seo_keywords` column to every content table that
-- already carries seo_title/seo_description, so meta keywords
-- can be filled directly on each content's own admin form
-- (casino, review, news, page, country, category, platform
-- update, and the seo_pages-backed country-custom /
-- category-country landing pages) instead of only through the
-- separate generic seo_meta admin page.
--
-- Purely additive: no existing column, row, or table is touched.
-- =====================================================

ALTER TABLE casinos ADD COLUMN seo_keywords TEXT;
ALTER TABLE reviews ADD COLUMN seo_keywords TEXT;
ALTER TABLE news ADD COLUMN seo_keywords TEXT;
ALTER TABLE categories ADD COLUMN seo_keywords TEXT;
ALTER TABLE pages ADD COLUMN seo_keywords TEXT;
ALTER TABLE countries ADD COLUMN seo_keywords TEXT;
ALTER TABLE platform_updates ADD COLUMN seo_keywords TEXT;
ALTER TABLE seo_pages ADD COLUMN seo_keywords TEXT;
