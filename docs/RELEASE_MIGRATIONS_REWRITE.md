# Release: migrations rewrite (tenant v22.39)

Built on the uploaded tree (v22.38). Control plane untouched. **No behaviour change in the worker.** `en/migrations/` is replaced by 20 ordered, complete, idempotent files with no rollbacks. Description: `docs/MIGRATIONS.md`, `docs/PLATFORM_UPGRADES.md` section 77.

## What changed

- `0001`-`0015` schema by domain (125 tables, 229 indexes, 2 triggers), `0016`-`0020` seeds (189 permissions, settings, 27 navigation links, media folders, payment methods, newsroom sections and regions).
- Removed: the gaps and three `0008` variants, the rollback files, `schema.sql`, `worker/database/schema-lummet.sql`, `test/production-snapshot.test.js`, two stray `router.js.before-*` backups.
- New: `scripts/check-schema.mjs` (compare a D1 export with the migrations, print repair SQL), `ops/` (one-time data scripts moved out of migrations), `test/migrations.test.js` (18 tests) and the production export as a fixture.
- Workflows: `seed-admin.yml` reads `secrets.ADMIN_PASSWORD` (the password was written in the file; it stays in git history, so change it). `d1-migrate-ai-free-tier.yml` runs `0013_ai_assistant.sql` instead of `migrations apply`.

## Proof

- Production export vs the new migrations: tables, columns and order, foreign keys, index and trigger SQL: **0 differences**. Only the three newest tables and five indexes are missing from the export.
- Applying the folder twice (schema and data): no change. Applying it to the export: no error, then equal to the full schema.
- Seed rows equal what the old files produced (permission ids aside). The old navigation seed doubled on a second run; this one does not, and an edited link is not added again.
- Every SQL INSERT in `worker/` checked against the new schema: one known problem, `worker/lummet/admin-api.js` (`sessions.token`; it also reads `users.password`). Reported, not changed.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **115** | **4226** | **5641** |

New: 29, modified: 15, deleted: 71. Tests: **1,272 pass**. Migrations: **rewritten**, nothing to run on live databases.

## New files (29)

| File | + | - |
|---|---:|---:|
| `docs/MIGRATIONS.md` | 71 | 0 |
| `en/migrations/0001_identity_and_settings.sql` | 177 | 0 |
| `en/migrations/0002_media_library.sql` | 65 | 0 |
| `en/migrations/0003_catalog.sql` | 170 | 0 |
| `en/migrations/0004_pages_reviews_news.sql` | 301 | 0 |
| `en/migrations/0005_components_and_ads.sql` | 64 | 0 |
| `en/migrations/0006_affiliate_network.sql` | 257 | 0 |
| `en/migrations/0007_analytics_and_campaigns.sql` | 252 | 0 |
| `en/migrations/0008_reporting_and_email.sql` | 87 | 0 |
| `en/migrations/0009_research.sql` | 162 | 0 |
| `en/migrations/0010_generic_content_engine.sql` | 206 | 0 |
| `en/migrations/0011_newsroom.sql` | 257 | 0 |
| `en/migrations/0012_content_landing_pages.sql` | 37 | 0 |
| `en/migrations/0013_ai_assistant.sql` | 83 | 0 |
| `en/migrations/0014_platform_operations.sql` | 54 | 0 |
| `en/migrations/0015_triggers.sql` | 15 | 0 |
| `en/migrations/0016_seed_permissions.sql` | 254 | 0 |
| `en/migrations/0017_seed_settings.sql` | 31 | 0 |
| `en/migrations/0018_seed_navigation_and_media.sql` | 102 | 0 |
| `en/migrations/0019_seed_payment_methods.sql` | 21 | 0 |
| `en/migrations/0020_seed_newsroom.sql` | 33 | 0 |
| `en/ops/README.md` | 17 | 0 |
| `en/ops/invalidate_sessions.sql` | 7 | 0 |
| `en/ops/platform_updates_featured_image_cleanup.sql` | 22 | 0 |
| `en/ops/reviews_generic_backfill.sql` | 15 | 0 |
| `en/scripts/check-schema.mjs` | 103 | 0 |
| `en/scripts/sql-statements.mjs` | 26 | 0 |
| `en/test/fixtures/production-schema-2026-10-19.sql` | 1086 | 0 |
| `en/test/migrations.test.js` | 172 | 0 |

## Deleted files (71)

| File | + | - |
|---|---:|---:|
| `en/migrations/0002_phase2_upgrade.sql` | 0 | 34 |
| `en/migrations/0003_component_engine.sql` | 0 | 64 |
| `en/migrations/0004_component_injection.sql` | 0 | 5 |
| `en/migrations/0005_authors_integration.sql` | 0 | 9 |
| `en/migrations/0006_phase_ae.sql` | 0 | 148 |
| `en/migrations/0007_phase_f.sql` | 0 | 22 |
| `en/migrations/0008_media_r2_rollback.sql` | 0 | 29 |
| `en/migrations/0008_media_r2_upgrade.sql` | 0 | 52 |
| `en/migrations/0008_media_r2_upgrade1.sql` | 0 | 36 |
| `en/migrations/0010_ai_indexes.sql` | 0 | 14 |
| `en/migrations/0012_platform_updates.sql` | 0 | 55 |
| `en/migrations/0013_platform_updates_permissions.sql` | 0 | 16 |
| `en/migrations/0014_item_level_access.sql` | 0 | 106 |
| `en/migrations/0016_ad_rules.sql` | 0 | 31 |
| `en/migrations/0017_super_api.sql` | 0 | 47 |
| `en/migrations/0018_page_nav_geo.sql` | 0 | 72 |
| `en/migrations/0019_seo_landing_pages.sql` | 0 | 125 |
| `en/migrations/0020_country_category_seo_nav.sql` | 0 | 55 |
| `en/migrations/0021_hub_subpage_nav.sql` | 0 | 26 |
| `en/migrations/0022_seo_page_nav_label.sql` | 0 | 5 |
| `en/migrations/0023_affiliate_partners_programs.sql` | 0 | 242 |
| `en/migrations/0024_offers.sql` | 0 | 121 |
| `en/migrations/0025_tracking_links.sql` | 0 | 119 |
| `en/migrations/0026_country_directory_tiers.sql` | 0 | 26 |
| `en/migrations/0027_analytics_events.sql` | 0 | 134 |
| `en/migrations/0028_analytics_conversions.sql` | 0 | 75 |
| `en/migrations/0029_campaigns.sql` | 0 | 62 |
| `en/migrations/0030_reporting.sql` | 0 | 84 |
| `en/migrations/0031_alerts.sql` | 0 | 46 |
| `en/migrations/0032_notifications_extend.sql` | 0 | 23 |
| `en/migrations/0033_conversion_postback.sql` | 0 | 101 |
| `en/migrations/0034_reconciliation_and_imports.sql` | 0 | 77 |
| `en/migrations/0035_provider_adapters.sql` | 0 | 59 |
| `en/migrations/0036_player_ltv.sql` | 0 | 24 |
| `en/migrations/0037_content_seo_keywords.sql` | 0 | 22 |
| `en/migrations/0038_auth_password_reset_newsletter.sql` | 0 | 66 |
| `en/migrations/0039_email_campaigns_subscriptions.sql` | 0 | 63 |
| `en/migrations/0040_payment_methods.sql` | 0 | 76 |
| `en/migrations/0041_news_og_image.sql` | 0 | 19 |
| `en/migrations/0042_country_category_og_image.sql` | 0 | 22 |
| `en/migrations/0043_ai_free_tier_usage.sql` | 0 | 22 |
| `en/migrations/0044_platform_updates_featured_image_cleanup.sql` | 0 | 51 |
| `en/migrations/0045_research_core.sql` | 0 | 102 |
| `en/migrations/0046_research_sources_claims.sql` | 0 | 131 |
| `en/migrations/0047_research_relations.sql` | 0 | 73 |
| `en/migrations/0048_research_versions.sql` | 0 | 47 |
| `en/migrations/0049_research_review_queue.sql` | 0 | 18 |
| `en/migrations/0050_research_datasets.sql` | 0 | 82 |
| `en/migrations/0051_generic_content_engine.sql` | 0 | 350 |
| `en/migrations/0052_reviews_generic_rebuild.sql` | 0 | 67 |
| `en/migrations/0053_news_published_at_parity.sql` | 0 | 22 |
| `en/migrations/0054_newsroom_foundation.sql` | 0 | 340 |
| `en/migrations/0055_news_google_sitemap_flag.sql` | 0 | 6 |
| `en/migrations/0056_news_redirects.sql` | 0 | 17 |
| `en/migrations/0057_news_analytics.sql` | 0 | 16 |
| `en/migrations/0058_news_search.sql` | 0 | 38 |
| `en/migrations/0059_analytics_content_item.sql` | 0 | 29 |
| `en/migrations/0060_content_items_media_tracking.sql` | 0 | 1 |
| `en/migrations/0061_content_landing_pages.sql` | 0 | 61 |
| `en/migrations/0062_ai_studio_history.sql` | 0 | 22 |
| `en/migrations/0063_ai_feedback.sql` | 0 | 22 |
| `en/migrations/0064_ai_feedback_source.sql` | 0 | 8 |
| `en/migrations/0065_perf_samples.sql` | 0 | 14 |
| `en/migrations/0066_invalidate_sessions.sql` | 0 | 7 |
| `en/migrations/rollback_0051_generic_content_engine.sql` | 0 | 46 |
| `en/migrations/rollback_0052_reviews_generic_rebuild.sql` | 0 | 22 |
| `en/migrations/schema.sql` | 0 | 452 |
| `en/test/production-snapshot.test.js` | 0 | 283 |
| `en/worker/database/schema-lummet.sql` | 0 | 34 |
| `en/worker/lummet/router.js.before-fix-20260816-121616` | 0 | 400 |
| `en/worker/lummet/router.js.before-server-site-context` | 0 | 352 |

## Modified files (15)

| File | + | - |
|---|---:|---:|
| `.github/workflows/d1-migrate-ai-free-tier.yml` | 3 | 3 |
| `.github/workflows/d1-migrate-file.yml` | 2 | 2 |
| `.github/workflows/seed-admin.yml` | 8 | 1 |
| `README.md` | 1 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/test/ai-feedback-source.test.js` | 2 | 3 |
| `en/test/ai-feedback.test.js` | 4 | 2 |
| `en/test/ai-studio.test.js` | 1 | 1 |
| `en/test/auth-password-newsletter.test.js` | 1 | 1 |
| `en/test/auth-rehash.test.js` | 2 | 2 |
| `en/test/generic-content-engine-geo-related-analytics.test.js` | 7 | 5 |
| `en/test/generic-content-engine-remaining-gaps.test.js` | 7 | 15 |
| `en/test/newsroom-foundation.test.js` | 5 | 5 |
| `en/test/support/d1-shim.js` | 13 | 39 |
| `readme-dev.md` | 11 | 14 |

## Install (Termux)

Needs v22.38 applied first (your uploaded tree).

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-39-migrations-rewrite.patch
git apply ~/storage/downloads/lummet-tenant-v22-39-migrations-rewrite.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/migrations.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.39: migrations rewrite"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1272`, `fail 0`.

No site change is expected. Nothing needs to run on the databases. To bring `levelcasino-db` up to date (its export lacks `ai_feedback`, `ai_studio_history`, `perf_samples`): `gh workflow run d1-migrate-file.yml -f file=0013_ai_assistant.sql` and then `-f file=0014_platform_operations.sql`. Do not run the seed files on live databases.

Set the `ADMIN_PASSWORD` secret before using `seed-admin.yml`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
