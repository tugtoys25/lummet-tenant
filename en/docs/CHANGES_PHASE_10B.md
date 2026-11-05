# Phase 10, partial B (tenant)

Builds on partial A (master switch, Super API v17, a11y code, help). Not production ready; see NOTES_PHASE_10_PARTIAL_B.md in the package root.

## Changes
- `worker/site-profile/store.js`: `saveProfile` and `invalidateProfile` now use `invalidate()` from `worker/cache.js`, which clears KV **and this isolate's 15 s L1 copy**. A publish, rollback or master-switch flip is therefore visible at once in the isolate that made it. Other isolates still see it within the L1 TTL (15 s) at most.
- `test/config-system-flag.test.js`: round-trip snapshot excludes the `configurable_platform` row (test bug fixed); the KV test now matches the L1 decision.
- `css-src/dashboard/12-config-a11y.css`: the welcome panel has its own fixed ink (`--cfg-welcome-ink: #1a1a2e`). Reason: the panel background is fixed white with a 7 % tint, while `--dark` follows the public theme and turns light on a dark theme (unreadable). Assets rebuilt (`build-css`, `asset-version`).
- `templates/pages/admin/configuration.html`, `static/js/admin/configuration-draft.js`: the version history heading is focusable (`cfgHistoryTitle`) and is the focus fallback when the opener of the version panel is gone.

## New tests (run once each while writing; full suite NOT run)
- `test/config-performance-budget.test.js` (14): strict D1 statement counts, loose timing.
- `test/config-a11y-dom.test.js` (43): template attributes, contrast arithmetic, reduced-motion rule, focus/Escape/aria-live/redraw behaviour on a fake DOM (`test/support/fake-dom.js`).

## Measured (Node 22.23.4, in-memory SQLite and fake KV; NOT real D1/KV)
- cold resolver read: 1 D1 statement, about 0.09 ms
- cached resolver read: 0 statements, about 0.015 ms; `gate()` about 0.0003 ms
- warm public requests: `/en/news`, `/en/casino`, `/en/about` 0 statements; `/en/login` 1 (menu geo rules, not configuration). The configuration layer adds 0 on a warm request (same count with the system on and off).
- No extra configuration query was found, so nothing was changed for B1.

## Security hardening (B4)
New `worker/api/config-limits.js` (request-count rate limits), `worker/api/config-http.js` (`readJsonCapped`, stricter `crossSite`), Origin check added to the live profile route, sections list cap. Review and residual risk: `docs/SECURITY_REVIEW_CONFIGURATION.md`. Tests: `test/config-security-hardening.test.js` (23; passed once when written).

## Docs
`docs/super-api.md` now describes v16/v17.

## Not done in this package
Offline load harness (B2) and operator docs beyond partial A's help, and all control plane work. See the notes and PROMPT_NEXT.md.
