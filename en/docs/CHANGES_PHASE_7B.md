# Phase 7B: screen for export, import, presets, clone and share (built on 7A). PARTLY TESTED.

## Verified
- Baseline before any change: full tenant suite on 7A = 127 files, 1,635 tests, all green.
- After 7B: `node --check` on every changed JS file, plus these files re-run and green: admin-js-structure, css-build, api-structure,
  site-profile-screen, site-profile-versions (92 tests). The full suite was NOT re-run after 7B.

## Done
- `static/js/admin/configuration-transfer.js` (new): section 9 "Export, import and presets" with five tabs.
  - Export: pick sections, live or draft, name, description; download a file; admin can save as preset.
  - Import a file: choose a file or paste; dry-run review card (file facts, per-section tick boxes with counts, notes/skips,
    impact and high-risk acknowledgement, every change grouped by area); "Add to my draft" re-plans on the server, saves to the
    draft only, then reloads the page.
  - Presets: list, review and apply, download, rename, delete (admin).
  - Copy from another site: address + share code, fetch, same review card.
  - Share this site (admin): create code (shown once, copy button), list, revoke.
  - Tabs follow roles (editor: export, import, presets, clone; admin: also save/rename/delete presets and shares). Keyboard arrows move between tabs.
  - All file-derived text is rendered with textContent, never as markup.
- `configuration.html`: new section 9; version history is now 10, activity log 11. `base.html`: script tag. `admin-js-structure.test.js`: ORDER updated.
- `configuration-draft.js`: controller gains `flush()` and `revision()` so the import waits for pending autosaves and passes the draft revision.
- Backend hardening:
  - Public share endpoint is rate limited per address (429 after repeated wrong codes), using the existing sign-in limiter; fails open if the limiter is unreachable.
  - New `GET /api/v1/config/transfer/presets/:id/download` (editor+, audited).
  - Active share links are counted in the database (the 10 limit could previously miss an older active link).
- `worker/asset-version.js` regenerated.

## Missing (not done)
- **No tests written for 7B**: envelope round trip, validators, planner edge cases, roles, share expiry/revoke/limits, URL and fetch safety, API, the new rate limit, preset download, and the screen script. The screen script has never been run in a browser or a fake DOM.
- No CSS: the new `xfer-*` classes are not styled yet (the panel works but looks plain, like the other Configuration lists). Needs a new `css-src/dashboard/09-*.css`, then `node scripts/build-css.mjs` and `node scripts/asset-version.mjs`.
- Full tenant and control-plane suites not re-run. Migration 0011 still not run on real D1. No browser check. Cross-site clone over real hostnames unverified.
- Content packs, Phase 8, 9, 10 not started. Known 7A limits unchanged (category/country-scoped menu links, SEO structured data, missing components/placements are skipped).

## Before using
1. Run migration `0011_config_transfer.sql` on D1 (presets and share links need it; export/import by file do not).
2. `npm test` in `en/`, fix anything, then write the 7B tests and CSS (Phase 7C).
