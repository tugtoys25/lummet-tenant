-- =====================================================
-- 0041_news_og_image.sql
--
-- Adds an optional `og_image` column to `news`, following the
-- same convention as the existing `featured_image` column
-- (an INTEGER foreign key into media_library.id).
--
-- og_image lets an editor set a dedicated social-sharing image
-- for a news article, independent of the Featured Image shown
-- on the article page itself. When og_image is NULL, the
-- application layer falls back to featured_image, then to the
-- site default image — see worker/render.js buildSEO() and
-- worker/controllers.js renderNews().
--
-- Purely additive: no existing column, row, or table is touched.
-- No existing article's featured_image or content is modified.
-- =====================================================

ALTER TABLE news ADD COLUMN og_image INTEGER REFERENCES media_library(id);
