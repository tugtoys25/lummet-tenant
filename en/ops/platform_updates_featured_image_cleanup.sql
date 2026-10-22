-- One-time data repair for platform update featured images (formerly migration 0044).
--
-- platform_updates.featured_image is an INTEGER pointing at media_library.id, but
-- the old dashboard form let editors type a URL or path into it, so some rows
-- hold text and the image never rendered. This re-points those rows at the
-- media_library row whose url ends with the stored text, and sets the value to
-- NULL where nothing matches (the row had no working image before either).
-- It does not change the schema. Safe to run more than once.
--
-- See which rows it will change first:
--   SELECT id, slug, featured_image FROM platform_updates
--   WHERE featured_image IS NOT NULL AND typeof(featured_image) = 'text';
-- The stored text can be a partial path ("updates/169-abc.jpeg"), so the match
-- is on the end of media_library.url. If two uploads share a url, one is chosen.
UPDATE platform_updates
SET featured_image = (
  SELECT m.id FROM media_library m
  WHERE m.url LIKE '%' || platform_updates.featured_image
  LIMIT 1
)
WHERE featured_image IS NOT NULL
  AND typeof(featured_image) = 'text';
