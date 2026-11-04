# Lummet tenant: Phase 1-6 release (configurable platform)

Built on Phase 6F. This is the whole of Phases 1 to 6 on top of the tenant baseline (commit `fdbe0ef`), as one tree, one
patch and one changed-files set. It adds no feature beyond 6F; it adds tests and fixes four failing checks.

## What this release contains
Everything in `CHANGES_PHASE_*.md` and `PHASE6B_NOTES.md`: the site profile and Configuration screen, settings with
guidance, draft / preview / publish / history / rollback / audit (migrations 0009 and 0010), row lists for menus, page
layouts and search listings, SEO records, components and placement, page layouts (Standard, Wide, Landing) and menu-link
country rules.

## Changes since 6F
- `test/site-profile-rows.test.js` (new): the row layer. Page layouts and the allow-list, country-rule parsing and
  cleaning, preview against the live visibility rule (every combination compared with the live filter), publish and
  rollback of layouts and rules against a database, document version 2, patch limits, merge and diff, and the screen manifest.
- `test/site-profile-screen.test.js` (new): the "Menus, SEO and components" section. The real `configuration-rows.js` runs
  against a small fake DOM and a controller wired to the real config API and an in-memory database: tabs, layout
  drop-down, country rules (invalid and valid), debounced saves, remove, undo, disabled controls for read-only roles,
  adding a link, the "run migration 0009" notice, skipped lists, and the rows API (roles, conflict, cap).
- Fixed three failing checks (`css-build`, `js-build`, `perf-assets`): `worker/asset-version.js` was out of date after the
  6D-6F static file changes. Regenerated with `node scripts/asset-version.mjs`.
- Fixed `test/component-hero.test.js`: it looked for the hero settings rule in the API source; 6D moved it to
  `worker/component-settings-clean.js`. The test now reads that file. No product code changed for this.
- Phase notes 6D, 6E and 6F no longer say "NOT TESTED"; they point here.

## What was verified
| Check | Result |
|---|---|
| Tenant suite (`npm test` in `en/`), before the two new files were added | 125 files, 1565 tests, 0 failed |
| The two new files on their own | 70 tests, 0 failed |

## What was NOT verified
- The full tenant suite was **not re-run after the two new test files were added**. `test-timings.md` is the report of the
  run before them and does not list them.
- The control plane suite did not finish in the time available. The control plane was not changed in Phases 1-6.
- **No browser check.** The screen tests use a fake DOM. Layout, CSS, focus, real input events, autosave timing in a real
  browser, preview cookies and publish on a real tenant have not been exercised.
- Migrations 0009 and 0010 ran only against the in-memory test database, not against a real D1 database.
- Rendering of the Wide and Landing templates was checked by reading the files and the render call, not by loading a page.

## Before it goes live
1. Run `npm test` in `lummet-tenant/en` and `lummet-control-plane`.
2. On a test tenant: run migrations 0009 and 0010, open Dashboard > Configuration, then try one of each: change a page
   layout, add a page-menu link with country rules, preview the draft, publish, roll back.
3. Open a page with each layout and check it on a phone-width screen.

## Known limits (unchanged from 6F)
- Versions saved by 6D and 6E have no country-rule data; restoring one clears the rules of page-menu links.
- A list over its cap (for example more than 300 menu links) or over 150 KB is not versioned and is reported as skipped.
- The older save screens (menu, SEO, page update, component endpoints) still save straight to the live site for roles
  that can use them; 6D records those saves in history but does not block them.
- Still on their own screens: component content, creating or deleting components and pages, platform-generated category
  and country links, the SEO structured-data field, homepage sections, ad rules.
- The draft preview does not cover sitemaps, site search, the AI assistant or SEO landing pages. Affiliate pages ignore
  the layout choice.
- A menu link whose parent does not exist is saved as a top-level link (the parent is cleared), not refused.

## Not started
Phase 7 (export, import, clone, presets), Phase 8 (dashboard-wide search), Phase 9 (preset at tenant creation, touches the
control plane), Phase 10 (hardening, performance budget, accessibility, security review, in-app help, staged rollout).
