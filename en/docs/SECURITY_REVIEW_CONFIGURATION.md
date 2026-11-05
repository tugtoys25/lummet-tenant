# Security review: configuration and setup (Phase 10, tenant)

Status: review done by reading code, with fixes and regression tests written in `test/config-security-hardening.test.js` (23 tests). That file passed 23/23 when it was run once, before the last doc edits. Existing suites that touch the changed routes were **not** run (see the notes). Nothing here was tested against a real browser, real D1 or a live network.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Admin-only writes on every configuration endpoint | OK | Live profile, switch, settings, setup/complete: `requireRole(user,"admin")` in `worker/api/routes/site-profile.js`. Publish, rollback, discard, presets, shares: `permissionsFor` / `transferPermissions` in the versions and transfer routes. Editors may only save the draft, export, dry-run and import into the draft. Test: "an editor cannot write ..." |
| 2 | CSRF on state-changing routes | **Fixed** | `site-profile.js` (live writes) had no Origin check; added. `crossSite()` now also refuses `Sec-Fetch-Site: cross-site`; the versions route uses the shared helper. Session cookie is `SameSite=Lax`. Tests: "the live profile write ... refused cross-site", "every other state-changing route ..." |
| 3 | Rate limits on export/import/setup/clone | **Fixed** | `worker/api/config-limits.js`: per person, 10-minute window, rows in `auth_attempts` (no migration). Limits: export 20, plan 30, apply 15, fetch 10, presets 30, shares 20, setup 10, publish 20, rollback 10. 429 `rate_limited` + `Retry-After`. Tests in "rate limits". The public share export keeps its own failure-based limiter. |
| 4 | Input validation and size caps | **Fixed** | Bodies are size-checked before parsing: 64 KB default, 512 KB draft, 2 MB import (`config-http.js` `readJsonCapped`, 413 `payload_too_large`). The 900 KB envelope cap (`MAX_IMPORT_BYTES`) still applies inside `parseEnvelope` and to the clone download. |
| 5 | Sections whitelist | OK, tightened | `cleanSectionList` keeps only known ids, collapses duplicates, now looks at 64 entries at most; a given list with no valid id exports/imports nothing. Route `idList` also capped at 64. |
| 6 | No secrets in logs, audit, export | OK | Export is built from owned setting keys only (`readLiveDocument`); tests show a secret key and the master switch key are absent. Share codes: only the hash is stored and the audit text never contains the code. 4xx bodies carry a code and a message only. No `console` calls in the configuration modules. |
| 7 | Clone (outgoing request) | OK | `normalizeSourceUrl`: https only, no IP/port/credentials/private names, not self; `redirect: "manual"`, 8 s timeout, streamed 900 KB cap. Existing tests: `site-profile-transfer-store.test.js`. |
| 8 | Super API signing path unchanged | OK (by diff) | `en/worker/super/auth.js` is not in the patch. Check: `git diff <baseline> -- en/worker/super/auth.js` is empty. HMAC, timestamp window, nonce and per-credential rate limit are the existing ones. |
| 9 | Control plane staff routes super-admin only; org isolation | NOT REVIEWED here | Control plane has no changes in this package. Belongs to the control plane step. |

## Residual risk
- Rate limiting fails open if `auth_attempts` is unreadable (staff are authenticated and role-checked; the operations are bounded).
- Draft autosave and the read-only preview POST are not rate limited on purpose; they are bounded by the 512 KB cap and the draft revision check.
- `Origin`/`Sec-Fetch-Site` are not sent by non-browser clients; those rely on the role checks and the session cookie.
- `POST /en/api/super/site-setup` has no extra limiter beyond the Super API credential limiter and its idempotency.
- Not verified: real browsers, real D1 behaviour under concurrency (the limiter's insert-then-count can briefly allow a few extra requests under a burst).
