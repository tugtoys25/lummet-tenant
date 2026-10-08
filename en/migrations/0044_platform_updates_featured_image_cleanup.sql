-- =====================================================
-- 0044_platform_updates_featured_image_cleanup.sql
--
-- BACKGROUND
-- `platform_updates.featured_image` is declared INTEGER (a foreign
-- key into media_library.id, same convention as news.featured_image).
-- However the dashboard form previously asked editors to type a raw
-- URL/path into this field as plain text, so any update saved through
-- that form has a URL string sitting in what should be a media_library
-- id -- meaning `LEFT JOIN media_library m ON m.id = pu.featured_image`
-- has never matched for those rows, and the image has silently never
-- rendered anywhere (visible page or og:image), regardless of what
-- was "set" in the dashboard.
--
-- This migration does NOT touch the schema. It's a best-effort,
-- non-destructive data repair:
--   1. For any row where featured_image is text rather than a valid
--      integer id, try to find a media_library row whose stored url
--      matches that text exactly, and re-point featured_image at its
--      real id.
--   2. Where no exact match is found (URL formatting differences,
--      relative vs absolute, typos, etc.), featured_image is set to
--      NULL -- restoring it to the same "no featured image" state it
--      was already effectively in, just without the dangling garbage
--      value. This never makes a previously-working image stop
--      working, because no image typed as text was ever resolving.
--
-- Recommended before running this on production: inspect
--   SELECT id, slug, featured_image FROM platform_updates
--   WHERE featured_image IS NOT NULL AND typeof(featured_image) = 'text';
-- to see how many rows are affected and what values they hold, so you
-- know in advance how many will end up NULL vs successfully matched.
--
-- NOTE: stored values here have been observed to be a partial path
-- (e.g. "updates/169-abc.jpeg") rather than the full media_library.url
-- (e.g. "https://level.casino/media/updates/169-abc.jpeg"). A plain
-- equality match against media_library.url therefore fails to find
-- anything even when the media clearly exists, so this uses a suffix
-- match instead. If more than one media_library row shares that same
-- URL (duplicate uploads), this picks one arbitrarily via LIMIT 1 --
-- harmless, but worth a manual look afterward if that matters to you.
-- =====================================================

UPDATE platform_updates
SET featured_image = (
  SELECT m.id FROM media_library m
  WHERE m.url LIKE '%' || platform_updates.featured_image
  LIMIT 1
)
WHERE featured_image IS NOT NULL
  AND typeof(featured_image) = 'text';
