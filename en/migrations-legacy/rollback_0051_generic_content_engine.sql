-- =====================================================
-- ROLLBACK for 0051_generic_content_engine.sql
--
-- SAFE TO RUN ONLY IF no real data has been created in the new
-- tables yet (i.e. run this immediately after 0051 if Phase 2 needs
-- to be reverted before Phase 3 begins creating sportsbook/
-- affiliate_partner/custom content, comparisons, or custom types).
--
-- Before running: verify every new table is either empty or contains
-- only data you're intentionally discarding.
--   SELECT
--     (SELECT COUNT(*) FROM content_items) AS content_items,
--     (SELECT COUNT(*) FROM comparisons) AS comparisons,
--     (SELECT COUNT(*) FROM custom_content_types) AS custom_types;
-- If any of these are non-zero and you need that data, export it
-- before proceeding -- this rollback drops the tables outright.
--
-- Nothing here touches casinos, casino_categories, geo_rules, clicks,
-- affiliate_partners, affiliate_programs, affiliate_program_casinos,
-- affiliate_accounts, affiliate_commercial_terms, payment_methods,
-- categories, countries, or reviews (reviews is rolled back
-- separately -- see rollback_0052_reviews_generic_rebuild.sql).
-- =====================================================

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS review_criteria_scores;
DROP TABLE IF EXISTS review_criteria_templates;
DROP TABLE IF EXISTS comparison_items;
DROP TABLE IF EXISTS comparisons;
DROP TABLE IF EXISTS content_payment_methods;
DROP TABLE IF EXISTS content_currencies;
DROP TABLE IF EXISTS currencies;
DROP TABLE IF EXISTS content_sports;
DROP TABLE IF EXISTS sports;
DROP TABLE IF EXISTS content_geo;
DROP TABLE IF EXISTS content_categories;
DROP TABLE IF EXISTS custom_field_values;
DROP TABLE IF EXISTS custom_field_definitions;
DROP TABLE IF EXISTS content_items;           -- must drop after custom_field_values (FK) and before custom_content_types
DROP TABLE IF EXISTS custom_content_types;

DELETE FROM permissions WHERE resource IN ('content_items', 'comparisons', 'custom_content_types');
DELETE FROM settings WHERE key = 'content_types_enabled';

PRAGMA foreign_keys = ON;
