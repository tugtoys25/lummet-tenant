# Phase 11D: quality gates (T5)

Tests plus one bug fix. No new capability ids, no migration, no static asset change.

## What changed
- `worker/sitemap.js`: the sitemap index now asks the router for each file's route type (`sitemapRouteType`).
  Before, it guessed the type from the file name. `news-sitemap.xml` and `sitemap-news-sections.xml` did not match, so
  sites without news (casino-list, casino-only, list-reviews, sportsbook, research, static) advertised two files that
  answer 404 once the news flags were on. Found by the new snapshot test.
- `test/preset-snapshots.test.js` + `test/support/preset-views.js` + `test/fixtures/preset-snapshots/*.txt`:
  per preset (8 presets, plus "full with all content types" and "full with one custom type off") the header, footer
  and mobile menus, sitemap index, URL list of every sitemap file, robots.txt, admin sidebar, and the module blocks kept
  on Overview, Analytics and Reports. `UPDATE_SNAPSHOTS=1` rewrites the files; a normal run fails with a line diff.
  Extra checks that do not use the stored files: every menu link, sitemap entry, robots line and sidebar link must answer.
- `test/manifest-completeness.test.js` + `worker/site-profile/ownership.js` (not imported at runtime): owners for
  dashboard screens, every `/api/v1/*` path, sitemap files, setting keys and configuration row sets. Each failure says
  where to register the new thing.

## Findings (nothing changed for these)
1. Admin APIs of switched-off MODULES are not refused. `apiGate` only knows feature prefixes and a few page prefixes.
   Listed in `UNGATED_MODULE_AREAS` (ownership.js). Gating them is a decision for the owner.
2. `admin/generic-review-create.html` and `admin/generic-review-edit.html` are never rendered (controller redirects).
   Listed in `KNOWN_UNUSED_ADMIN_TEMPLATES`.
3. Full platform lists no sportsbook, partner or custom sitemap unless the older `content_types_enabled` is on (11A design).
4. `site_hero_button_new_tab` is a key inside a hero component's JSON, not a settings row.

## Sidebar check fix
An unknown `/en/dashboard/...` path routes to the public `page` type, which is core and always passes the gate, so the
sidebar test could not catch a link to a screen that does not exist. The test now also requires a dashboard route type.
Checked by adding a link to `/en/dashboard/nowhere` to `admin-nav.html`: every preset failed with a clear message. The
template was restored afterwards.

## NOT VERIFIED / REMAINING
- Full suite not run. Ran here: preset-snapshots (65), manifest-completeness (16), and 31 existing files that mention
  sitemap, site-profile or content-types (796 tests in total, all passed).
- Row-set check covers the five versioned row sets only. Other config tables (banners, ad rules, geo rules, categories) are not covered.
- API scan covers `worker/api/**` only, not `worker/newsroom-api.js`, `worker/ai/*` or the super API.
- Snapshots lock current behaviour. They were read once for sanity, not reviewed against intent.
- Not done: control plane patch, T7 housekeeping (OPERATOR_CONFIGURATION.md sections 3 and 6), T3 (needs your decision), T6 design.
- No browser, screen reader, real D1 or live checks. The 11C release run 42160390731 failed once on `test (24)` and passed on rerun; not investigated.
