-- =====================================================
-- 0052_reviews_generic_rebuild.sql   (REVISED — see below)
--
-- SUPERSEDES an earlier version of this file that used a
-- CREATE TABLE reviews_new / INSERT / DROP / RENAME table-rebuild,
-- wrapped in BEGIN TRANSACTION / COMMIT. That version was never
-- successfully applied anywhere: the Cloudflare D1 web console
-- rejects explicit BEGIN TRANSACTION / COMMIT outright ("please use
-- state.storage.transaction()..."), so the whole batch was refused
-- before any statement ran.
--
-- While diagnosing that rejection, live schema inspection
-- (PRAGMA table_info(reviews) against a real environment) surfaced
-- three columns -- author, author_title, reviewed_at -- that exist
-- in production but were never present in this repo's migration
-- history. The original CREATE TABLE reviews_new did not include
-- them. Had that rebuild actually executed, it would have silently
-- DROPPED those three columns (and their data) for every existing
-- review -- a real violation of "preserve every existing column"
-- that only failed to happen because the console rejected the
-- transaction wrapper first.
--
-- This revised migration achieves the identical end state
-- (reviewed_content_type / reviewed_content_id added and backfilled,
-- one new index) via ALTER TABLE ADD COLUMN instead of a table
-- rebuild. This is structurally safe regardless of what other
-- columns a given environment's `reviews` table has drifted to
-- contain -- it can only ever ADD the two new columns, never drop or
-- redefine anything else, so the author/author_title/reviewed_at
-- drift (or any other undocumented column on a given environment)
-- is preserved automatically without needing to be named here.
--
-- Console-safe: no BEGIN TRANSACTION, no CREATE TABLE, no DROP
-- TABLE. Each statement below was verified individually against the
-- Cloudflare D1 web console on one environment before being adopted
-- here.
--
-- NOT IDEMPOTENT: running this twice against the same database will
-- fail on the second run ("duplicate column name: reviewed_content_type").
-- That failure is a safe, obvious signal to stop -- it means this
-- migration already applied to that environment. Before running
-- against any environment, first confirm with:
--   PRAGMA table_info(reviews);
-- If reviewed_content_type/reviewed_content_id are already listed,
-- do not run this file again on that environment.
-- =====================================================

ALTER TABLE reviews ADD COLUMN reviewed_content_type TEXT;

ALTER TABLE reviews ADD COLUMN reviewed_content_id INTEGER;

UPDATE reviews
SET reviewed_content_type = 'casino',
    reviewed_content_id = (SELECT c.id FROM casinos c WHERE c.slug = reviews.casino_slug)
WHERE reviewed_content_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_content ON reviews(reviewed_content_type, reviewed_content_id);

-- Verification query -- run this after the four statements above.
-- with_content_id must equal total. If it's lower, some casino_slug
-- values don't match any row in `casinos` -- stop and investigate
-- those specific rows (SELECT id, casino_slug FROM reviews WHERE
-- reviewed_content_id IS NULL) before doing anything else; do not
-- force a value.
--
-- SELECT COUNT(*) AS total, COUNT(reviewed_content_type) AS with_type,
--        COUNT(reviewed_content_id) AS with_content_id FROM reviews;
