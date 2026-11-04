# Phase 7 final (7E): screen tests, confirmation fix, button class, full suite green (built on 7D)

Phase 7 = tenant Configuration > "9. Export, import and presets": export sections, import with a full dry-run review into the
DRAFT, presets library, share codes and copy from another site. This release closes it.

## Verified (run on this exact tree)
- Full tenant suite (`npm test` in `lummet-tenant/en`): 132 files, 1,861 tests, 0 failed, 0 forced exits. Includes `css-build`,
  `admin-js-structure`, `js-build` and the asset-version check.
- New `test/site-profile-transfer-screen.test.js` (47 tests) runs the REAL `configuration-transfer.js` against a fake DOM wired to
  the real transfer API and an in-memory database: roles and tabs (arrow keys), export (ticks, download request, file name,
  refusals), presets (save, rename, delete, download, editor limits, markup shown as text, missing migration), import (paste, file
  size limit, review, draft-only apply, stale revision, editor), a canned-server group (high-risk acknowledgement gate, notes and
  counts, change-list cap, markup as text, out-of-order answers ignored, network failure), copy from another site (password field,
  code cleared, refusal keeps code, private and own addresses) and share codes (shown once, active/revoked chips, revoke, limit).
  It also checks that every `xfer-` class the script uses has a rule in the stylesheet.

## Fixed
- **Confirmations vanished.** After "Save as preset", rename, delete or revoke the panel redrew at once and wiped the message.
  A flash line above the panel now keeps the confirmation until the next redraw.
- **"Read <file>" message was cleared** at once by the check that follows a chosen file; it now stays.
- **`btn--small` (undefined) -> `btn--sm`** in `js-src/ai-studio/*` and the rebuilt `static/js/ai-studio.js` (18 places).
- Asset version regenerated (d7837ad045).

## Not verified (cannot be done here)
- No real browser pass: light and dark mode, phone layout and table scrolling of the new styles have not been seen.
- `0011_config_transfer.sql` is idempotent and applies in the test database, but has NOT been run on real D1.
- Cross-site clone over real hostnames is untested (the tests use an injected fetch).
- Control plane (`lummet-control-plane`) is unchanged in Phase 7. Run in this sandbox its suite showed failures that come from the
  zip layout, not from this work: `load-d1-policies-6-5c` and `phase6-gate` read `PLACEHOLDERS.md` / `RELEASE_ID` from the folder
  ABOVE the repo, and `runbooks-restore-drill-6-5b` and `staging-checks` did not exit on their own. Run it in your normal setup.
- Content packs (optional in the blueprint) not started. Phase 8 not started.

## Before using
1. Run `0011_config_transfer.sql` on D1 (tenant-migrate).
2. `npm test` in `lummet-tenant/en`.
3. Open Configuration > 9 in a browser, light and dark, desktop and phone.
