-- =====================================================
-- seed_generic_content_engine_sample_data.sql
--
-- Lives in en/seeds/, deliberately NOT en/migrations/ -- that folder
-- is scanned by both real deployment tooling and this repo's test
-- harness (test/support/d1-shim.js), either of which would otherwise
-- auto-apply this file somewhere it was never meant to run. Run it
-- manually, only when and where you actually want sample data.
--
-- OPTIONAL sample data for exercising the generic content engine on
-- a test/staging environment. Pure INSERT statements, safe to run on
-- any environment that already has migrations 0051/0052 applied.
-- Console-safe (no BEGIN TRANSACTION).
--
-- Does NOT enable any content type -- that stays an explicit choice,
-- made via /en/dashboard/settings/content-types (or the settings
-- table directly) after you've looked at what this seeds.
--
-- Safe to re-run: every INSERT either has a UNIQUE constraint that
-- will reject a duplicate slug cleanly, or is guarded so re-running
-- doesn't double up. If you get a "UNIQUE constraint failed" on a
-- second run, that's expected -- it means the seed is already there.
--
-- To remove all seeded data later, see the DELETE statements at the
-- bottom of this file (commented out by default).
-- =====================================================

-- ---- Sportsbook: two items ----
INSERT INTO content_items (content_type, slug, name, title, description, website, rating, license, license_country, live_betting, pre_match, cashout, mobile_app, featured, sort_order, status, published, seo_title, seo_description)
VALUES
  ('sportsbook', 'sample-bet365-sport', 'Bet365 Sportsbook (Sample)', 'Bet365 Sportsbook Review',
   'A leading global sportsbook with extensive market coverage and competitive odds.', 'https://example.com/bet365',
   4.7, 'UKGC', 'United Kingdom', 1, 1, 1, 1, 1, 10, 'published', 1,
   'Bet365 Sportsbook Review — Sample Data', 'Sample sportsbook entry for testing the generic content engine.'),
  ('sportsbook', 'sample-draftkings-sport', 'DraftKings Sportsbook (Sample)', 'DraftKings Sportsbook Review',
   'A major US-facing sportsbook known for its mobile app and same-game parlays.', 'https://example.com/draftkings',
   4.3, 'NJDGE', 'United States', 1, 1, 1, 1, 0, 20, 'published', 1,
   'DraftKings Sportsbook Review — Sample Data', 'Sample sportsbook entry for testing the generic content engine.');

-- ---- Affiliate Partner: one item, deliberately unlinked (Phase 28: must render fine with no commercial link) ----
INSERT INTO content_items (content_type, slug, name, description, rating, status, published, seo_title, seo_description)
VALUES ('affiliate_partner', 'sample-network-x', 'Network X (Sample)',
   'A sample affiliate network entry, not linked to any real commercial affiliate_partners record.',
   4.0, 'published', 1, 'Network X Review — Sample Data', 'Sample affiliate partner entry, editorial-only, no commercial link.');

-- ---- Custom type: Payment Provider, with two typed fields ----
INSERT INTO custom_content_types (slug, label, plural_label, icon, review_enabled, comparison_enabled)
VALUES ('sample-payment-provider', 'Payment Provider (Sample)', 'Payment Providers (Sample)', '💳', 1, 1);

INSERT INTO custom_field_definitions (custom_type_slug, field_key, label, field_type, required, display_order)
VALUES
  ('sample-payment-provider', 'settlement_time', 'Settlement Time', 'text', 0, 0),
  ('sample-payment-provider', 'api_available', 'API Available', 'boolean', 0, 10);

INSERT INTO content_items (content_type, custom_type_slug, slug, name, description, rating, status, published, seo_title, seo_description)
VALUES ('custom', 'sample-payment-provider', 'sample-stripe', 'Stripe (Sample)',
   'A sample payment provider entry demonstrating the custom content type system.',
   4.5, 'published', 1, 'Stripe Review — Sample Data', 'Sample custom-type entry.');

INSERT INTO custom_field_values (content_item_id, field_key, value)
SELECT id, 'settlement_time', '2 business days' FROM content_items WHERE slug = 'sample-stripe';
INSERT INTO custom_field_values (content_item_id, field_key, value)
SELECT id, 'api_available', '1' FROM content_items WHERE slug = 'sample-stripe';

-- ---- Comparison: the two sample sportsbooks ----
INSERT INTO comparisons (content_type, slug, title, description, criteria_json, status, seo_title, seo_description)
VALUES ('sportsbook', 'sample-bet365-vs-draftkings', 'Bet365 vs DraftKings (Sample)',
   'A sample head-to-head comparison for testing the comparison engine.',
   '[{"key":"license","label":"License"},{"key":"rating","label":"Rating"},{"key":"live_betting","label":"Live Betting"}]',
   'published', 'Bet365 vs DraftKings — Sample Comparison', 'Sample comparison entry.');

INSERT INTO comparison_items (comparison_id, item_content_type, item_id, position)
SELECT c.id, 'sportsbook', ci.id, 0 FROM comparisons c, content_items ci
WHERE c.slug = 'sample-bet365-vs-draftkings' AND ci.slug = 'sample-bet365-sport';
INSERT INTO comparison_items (comparison_id, item_content_type, item_id, position)
SELECT c.id, 'sportsbook', ci.id, 1 FROM comparisons c, content_items ci
WHERE c.slug = 'sample-bet365-vs-draftkings' AND ci.slug = 'sample-draftkings-sport';

-- ---- Review criteria templates for sportsbook (used by the weighted-rating engine) ----
INSERT INTO review_criteria_templates (content_type, criterion_key, label, weight, display_order)
VALUES
  ('sportsbook', 'odds', 'Odds Quality', 30, 0),
  ('sportsbook', 'markets', 'Market Coverage', 25, 10),
  ('sportsbook', 'mobile_experience', 'Mobile Experience', 20, 20),
  ('sportsbook', 'payments', 'Payment Speed', 25, 30);

-- ---- A generic review for the first sample sportsbook, with scores ----
-- Uses the casino_slug = '' sentinel documented in
-- worker/database/generic-reviews.js -- see
-- docs/generic-content-engine/POST-DEPLOYMENT-FIX-0052.md for why.
INSERT INTO reviews (casino_slug, slug, title, content, pros, cons, rating, verdict, published, reviewed_content_type, reviewed_content_id)
SELECT '', 'sample-bet365-sport-review', 'Bet365 Sportsbook Review (Sample)',
  'This is a sample full-length review body for testing the generic review engine, including its criteria-scoring breakdown section.',
  '["Wide market coverage","Competitive odds","Reliable mobile app"]',
  '["Customer support can be slow","Some markets restricted by region"]',
  4.6, 'A strong all-around choice for sports bettors, particularly for live betting.',
  1, 'sportsbook', id
FROM content_items WHERE slug = 'sample-bet365-sport';

INSERT INTO review_criteria_scores (review_id, criterion_key, score)
SELECT r.id, 'odds', 4.5 FROM reviews r WHERE r.slug = 'sample-bet365-sport-review';
INSERT INTO review_criteria_scores (review_id, criterion_key, score)
SELECT r.id, 'markets', 4.8 FROM reviews r WHERE r.slug = 'sample-bet365-sport-review';
INSERT INTO review_criteria_scores (review_id, criterion_key, score)
SELECT r.id, 'mobile_experience', 4.7 FROM reviews r WHERE r.slug = 'sample-bet365-sport-review';
INSERT INTO review_criteria_scores (review_id, criterion_key, score)
SELECT r.id, 'payments', 4.2 FROM reviews r WHERE r.slug = 'sample-bet365-sport-review';

-- =====================================================
-- Verification query -- run after the inserts above:
--
-- SELECT 'content_items' AS what, COUNT(*) AS n FROM content_items WHERE slug LIKE 'sample-%'
-- UNION ALL SELECT 'custom_content_types', COUNT(*) FROM custom_content_types WHERE slug LIKE 'sample-%'
-- UNION ALL SELECT 'comparisons', COUNT(*) FROM comparisons WHERE slug LIKE 'sample-%'
-- UNION ALL SELECT 'generic_reviews', COUNT(*) FROM reviews WHERE slug LIKE 'sample-%';
--
-- Expect: content_items 4, custom_content_types 1, comparisons 1, generic_reviews 1
-- =====================================================

-- ---- To remove all sample data later, uncomment and run: ----
-- DELETE FROM review_criteria_scores WHERE review_id IN (SELECT id FROM reviews WHERE slug LIKE 'sample-%');
-- DELETE FROM reviews WHERE slug LIKE 'sample-%';
-- DELETE FROM review_criteria_templates WHERE content_type = 'sportsbook' AND criterion_key IN ('odds','markets','mobile_experience','payments');
-- DELETE FROM comparison_items WHERE comparison_id IN (SELECT id FROM comparisons WHERE slug LIKE 'sample-%');
-- DELETE FROM comparisons WHERE slug LIKE 'sample-%';
-- DELETE FROM custom_field_values WHERE content_item_id IN (SELECT id FROM content_items WHERE slug LIKE 'sample-%');
-- DELETE FROM content_items WHERE slug LIKE 'sample-%';
-- DELETE FROM custom_field_definitions WHERE custom_type_slug LIKE 'sample-%';
-- DELETE FROM custom_content_types WHERE slug LIKE 'sample-%';
