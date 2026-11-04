# Phase 7A: export, import, presets, share links (backend only). NOT TESTED.

Built on Phase 6 (`lummet-phase1-6-full`). No test suite was run on this phase. No new tests were written. No UI exists yet.
Only `node --check` on each new file and one throw-away script (export from site A, dry run and import into site B,
both in-memory databases) were run. That script worked: 3 changes planned and saved to the draft.

## What is done
- `migrations/0011_config_transfer.sql`: tables `config_presets` and `config_shares` (idempotent). Run it manually on D1.
- `worker/site-profile/transfer.js`:
  - Export envelope (`format lummet-config`, version 1, SHA-256 checksum) by section: structure, one look-and-feel group, one list.
  - Parser/validator (size, format, newer-version refusal, checksum warning, unknown keys ignored, scripts/raw markup never imported).
  - Dry-run planner (`planImport`): per-section counts, every change, skipped items with reasons, impact preview, media-link warning.
  - `applyImport`: re-plans on the server, saves only to the DRAFT (publish, history, rollback and audit still apply), writes an audit entry.
  - Merge = choose sections. Import only adds or updates, never deletes. Menu links matched by menu+address, pages by slug, SEO by page,
    components by type+name, placements by page+component. Brand groups (identity, analytics, compliance) start unticked for files from another site.
- `worker/site-profile/transfer-store.js`: preset library (save, list, rename, delete; max 50), share links (hashed code, expiry 1h/24h/7d,
  use limit, revoke, max 10 active), clone fetch with locked-down outgoing request (https only, no IPs/local names/ports/redirects, 8 s, size cap).
- `worker/api/routes/site-profile-transfer.js`: `/api/v1/config/transfer/*` (state, export, plan, apply, fetch, presets, shares); roles:
  editor exports/plans/imports, admin manages presets and shares. Public `POST /api/v1/config-share/export` (Bearer code), wired in `api/public.js`.
- `worker/api/config-http.js`: shared helpers. `api/routes/index.js` registers the group.

## What is missing
- **No screen.** Nothing on the Configuration page uses this yet (export/import/presets/clone/share panels, `configuration-transfer.js`,
  `configuration.html` section, `base.html` script tag, update of `ORDER` in `admin-js-structure.test.js`).
- **No tests** (envelope round trip, validators, planner edge cases, roles, share expiry/revoke/limits, URL and fetch safety, API).
- Full tenant suite and control plane suite not run. Migration 0011 not run on real D1. No browser check.
- Cross-site clone over real Cloudflare hostnames is unverified.
- Content packs (articles, pages text) not built. Not designed in.
- Known limits: menu links scoped to a category/country, SEO structured data, components and placements that do not exist on the target are skipped.
- Phase 8, 9, 10 not started.

## Before using
Run `npm test` in `en/`, fix whatever fails, then build the screen and tests (Phase 7B).
