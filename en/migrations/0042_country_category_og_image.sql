-- =====================================================
-- 0042_country_category_og_image.sql
--
-- Adds an optional `og_image` column to `countries` and
-- `categories`, following the same convention as the `og_image`
-- column added to `news` in 0041 (an INTEGER foreign key into
-- media_library.id).
--
-- Neither country hub pages nor category hub pages had any
-- per-entity image in the data model before this migration —
-- their social-share metadata fell back to the site's default
-- logo unconditionally. This lets an editor set a dedicated
-- social-sharing image per country/category from the dashboard.
-- When empty, the application layer falls back to the site
-- default image — see worker/controllers.js renderCountry() and
-- renderCategory().
--
-- Purely additive: no existing column, row, or table is touched.
-- =====================================================

ALTER TABLE countries ADD COLUMN og_image INTEGER REFERENCES media_library(id);
ALTER TABLE categories ADD COLUMN og_image INTEGER REFERENCES media_library(id);
