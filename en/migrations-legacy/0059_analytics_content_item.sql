-- Migration 0059: analytics_events content_item_id
--
-- Additive only: adds ONE nullable column to the existing
-- analytics_events table (migration 0027). No data is touched, no
-- table is rebuilt or dropped -- every existing row simply gets
-- content_item_id = NULL, same as it would for any other pre-existing
-- dimension column on this table.
--
-- Why this is needed: analytics_events already has dedicated FK
-- columns for casino_id/review_id/page_id/news_id, but nothing for
-- content_items (sportsbook/affiliate_partner/custom), which didn't
-- exist yet when 0027 was written. Without this column, a CONTENT_VIEW
-- for a sportsbook/affiliate-partner/custom item would have to be
-- logged with no queryable link back to the item at all (the
-- BANNER_VIEW precedent in component-engine.js does exactly that for
-- page_components, which have no real dimension row to reference --
-- but a content_items row DOES exist here, so it deserves a real,
-- joinable column rather than being buried in metadata_json).
--
-- Deliberately NOT reusing casino_id: a content_items row and a
-- casinos row can have the same numeric id (two separate tables, two
-- separate AUTOINCREMENT sequences) -- reusing casino_id would make a
-- sportsbook's view events indistinguishable from an unrelated
-- casino's, which is a strictly worse and actively misleading data
-- model, not just a stylistic preference.

ALTER TABLE analytics_events ADD COLUMN content_item_id INTEGER REFERENCES content_items(id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_content_item ON analytics_events(content_item_id);
