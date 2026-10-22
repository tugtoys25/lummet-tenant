-- One-time data repair for the generic review model (formerly migration 0052).
--
-- The columns reviewed_content_type and reviewed_content_id and their index are
-- now part of migrations/0004_pages_reviews_news.sql. This script only fills them
-- in for reviews written before they existed. Safe to run more than once: it
-- only touches rows that are still empty.
--
-- Check afterwards (with_content_id should equal total; if it is lower, some
-- casino_slug values match no casino. Look at those rows, do not force a value):
--   SELECT COUNT(*) AS total, COUNT(reviewed_content_type) AS with_type,
--          COUNT(reviewed_content_id) AS with_content_id FROM reviews;
UPDATE reviews
SET reviewed_content_type = 'casino',
    reviewed_content_id = (SELECT c.id FROM casinos c WHERE c.slug = reviews.casino_slug)
WHERE reviewed_content_type IS NULL;
