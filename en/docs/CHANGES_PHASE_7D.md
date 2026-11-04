# Phase 7D: store, API and public-endpoint tests, safety fix, screen CSS, button-class fix (built on 7C). PARTLY DONE.

## Verified
- Full tenant suite on the 7C tree, run before any 7D change: 129 files, 1,706 tests, all green.
- After the 7D test and `transfer.js` changes, only these files were run (each green when last run):
  - `site-profile-transfer-store.test.js`: 57 tests
  - `site-profile-transfer-api.test.js`: 51 tests
  - `site-profile-transfer.test.js` + `site-profile-transfer-plan.test.js` (7C files, one test updated): 71 tests
- The CSS and button-class changes were made AFTER those runs and are UNTESTED: no `npm test`, no `css-build` or
  `admin-js-structure` test, no browser. The stylesheet was built with `node scripts/build-css.mjs`, the asset version
  regenerated, and `configuration-transfer.js` checked with `node --check` only.
- The FULL suite was NOT re-run after 7D. `npm test` has not been run on the 7D tree.
- The zips and patches were built from the tree as it stands; patches were dry-run applied.

## Done
- **Safety fix** in `worker/site-profile/transfer.js` (`buildExport`): a section list that was given but held no valid id
  (`[]`, or only unknown ids) used to export EVERYTHING. Now only an absent list means everything; a given list is honoured
  exactly. This closes a path where a share link whose stored sections were damaged to `[]` would have exported the whole
  configuration, brand sections included. API effect: `GET /export?sections=nope` is now a 422 "nothing to export".
  The 7C test that pinned the old behaviour was rewritten to the new rule.
- `test/site-profile-transfer-store.test.js` (new, 57): missing-migration 503s, presets (save, name rules and clash, limit 50,
  live vs draft, rename, delete, bad ids, ordering, damaged rows), share links (hashed token, hours and uses clamping,
  limit 10 counted in the database, status list, revoke), the public side (counting, last-use race, expiry, identical refusals,
  audit), `normalizeSourceUrl` (protocols, credentials, ports, IP notations, private names, self site), `fetchShared`
  (fixed path, no redirects, status messages, size cap by header and by stream, timeout, network errors, bad bodies) and an
  end-to-end share between two in-memory sites.
- `test/site-profile-transfer-api.test.js` (new, 51): role matrix (viewer, editor, admin, unknown roles), cross-site write
  refusal, `/state`, export as JSON and as download (headers, no caching, file names), plan and apply (draft only, stale
  revision 409, server re-plan, chosen sections only), `/fetch` with an injected fetch, presets and shares over the API,
  and the public share endpoint (405, identical 403s, 429 after 5 wrong tries per address, retry hint, fail-open when the
  limiter is unreachable, wiring through the public router).
- **CSS for the transfer screen**: new `css-src/dashboard/09-config-transfer.css` covering notice and messages, pill tabs,
  form fields, the section picker with tags, tables, share status chips, the one-time share code box, the review card
  (facts grid, notes, impact) and a phone layout (scrolling tabs, 44 px targets, stacked facts). It uses the dashboard
  tokens and translucent tints so it follows the site theme. `static/css/dashboard.css` rebuilt (9 parts);
  `worker/asset-version.js` regenerated (version 34c6f2e37f).
- **Button class fixed**: `configuration-transfer.js` now uses `btn--sm` (defined by the stylesheets) in all 3 places.
- `docs/CHANGES_PHASE_7D.md` (same text as these notes).

## Missing (not done)
- **Screen script tests**: `configuration-transfer.js` still has no fake-DOM test; it has never been run in a browser.
- **CSS never seen in a browser**: light and dark mode, the phone layout and table scrolling are unchecked. The
  `css-build` and `admin-js-structure` tests may need attention because the generated stylesheet and asset version changed.
- `static/js/ai-studio.js` still uses the wrong class `btn--small` in several places (predates this work, untouched).
- Migration `0011_config_transfer.sql` not run on real D1. Cross-site clone over real hostnames unverified.
  Control plane suite not run.
- Content packs (the blueprint says "optionally") not started. Phases 8, 9, 10 not started.
- Phase 7 is therefore not fully closed: Phase 7E = screen tests, a browser pass, and anything `npm test` reports.

## Before using
1. Run `0011_config_transfer.sql` on D1.
2. `npm test` in `en/` (the full suite has not run on this tree).
3. Open Configuration > 9. Export, import and presets in a browser, light and dark, desktop and phone.
