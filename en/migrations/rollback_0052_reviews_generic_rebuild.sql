-- =====================================================
-- ROLLBACK for the revised 0052_reviews_generic_rebuild.sql
-- (ALTER TABLE ADD COLUMN version, not the original rebuild version)
--
-- Safe to run only while every review row still has a non-null
-- casino_slug -- i.e. before any sportsbook/affiliate_partner/custom
-- review has been created. Check first:
--   SELECT COUNT(*) FROM reviews WHERE casino_slug IS NULL;
-- Must return 0 before proceeding.
--
-- Uses ALTER TABLE ... DROP COLUMN (supported by D1/modern SQLite),
-- not a table rebuild, so it cannot disturb any other column --
-- including author/author_title/reviewed_at or anything else a
-- given environment's reviews table has drifted to contain.
-- Console-safe: no BEGIN TRANSACTION.
-- =====================================================

DROP INDEX IF EXISTS idx_reviews_reviewed_content;

ALTER TABLE reviews DROP COLUMN reviewed_content_type;

ALTER TABLE reviews DROP COLUMN reviewed_content_id;
