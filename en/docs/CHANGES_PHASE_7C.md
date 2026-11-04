# Phase 7C: tests for the transfer engine (built on 7B). PARTLY DONE, STOPPED EARLY.

## Verified
- Baseline: the full tenant suite on the 7B tree was run before any change: 127 files, 1,635 tests, all green.
- After 7C changes, ONLY the two new test files were run: `site-profile-transfer.test.js` (29 tests) and
  `site-profile-transfer-plan.test.js` (42 tests). 71 tests, all green.
- The full suite was NOT re-run after 7C. `npm test` has not been run on this tree.

## Done
- `test/support/transfer-fixtures.js` (new): two in-memory sites, seeding helpers, hand-made signed envelope.
- `test/site-profile-transfer.test.js` (new, 29 tests): section catalogue, brand sections, permissions, SHA-256 and checksum
  key order, export (section choice, markup never exported, scoped menu links left out, rows keyed by what they are, name and
  description cleaning, draft vs live, writes nothing, source version), parsing (garbage never throws, each refusal message,
  newer format refused, size limits, checksum none/mismatch, unknown and markup settings, damaged parts, metadata cleaning).
- `test/site-profile-transfer-plan.test.js` (new, 42 tests): dry run writes nothing, brand sections unticked for other sites,
  explicit section choice, settings validation, media warning, structure (impact, high risk acknowledgement, invalid blocked,
  unknown setup type, sticky header), menu links (match by menu+address, parents, loops, geo, one bad row, unsafe keys),
  pages, SEO, components, placements, apply (draft only, publish makes it live, never deletes, audit entry, nothing to import,
  server re-plans, chosen sections only, on top of existing draft, stale revision conflict, missing tables 503), full round trip
  between two sites, rollback after an import, audit helper.
- Code change found by the tests: `buildExport` now always writes sections in catalogue order, so the same choice gives the same
  file and checksum however it was picked (`worker/site-profile/transfer.js`).

## Missing (not done)
- No tests yet for: `transfer-store.js` (presets, share links: expiry, use limit, revoke, hashed token, max 10 active, max 50
  presets, name clash), `normalizeSourceUrl` and `fetchShared` (URL and fetch safety, size cap, redirects, timeout), the API
  route (roles, cross-site refusal, export download headers, preset download, `/state`, `/fetch`), the public share endpoint and
  its per-address rate limit, and the screen script `configuration-transfer.js` (fake DOM).
- No CSS for the `xfer-*` classes (new `css-src/dashboard/09-*.css`, then `node scripts/build-css.mjs` and
  `node scripts/asset-version.mjs`). The 7B screen is still unstyled.
- Known small bug NOT fixed: `configuration-transfer.js` uses the class `btn--small`, but the stylesheets define `btn--sm`.
  Rename it when the CSS is done.
- Migration `0011_config_transfer.sql` still not run on real D1. Nothing checked in a browser. Cross-site clone over real
  hostnames unverified. Control plane suite not run.
- Content packs and Phases 8, 9, 10 not started.

## Before using
1. Run `0011_config_transfer.sql` on D1.
2. `npm test` in `en/`.
3. Then Phase 7D: store/API/screen tests, CSS, `btn--sm` fix.
