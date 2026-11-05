# Operator guide: the configurable platform (Phase 10)

For whoever runs Lummet tenants. **Written from the code and tests; none of the steps below has been exercised on real Cloudflare, D1 or KV.**
Where a step says "check", it means look at the real system, because the author could not.

## 1. What can go wrong and what to press
| Symptom | First action | Where |
| --- | --- | --- |
| A site shows the wrong pages, or pages vanished after a change | Roll back to the previous version | Configuration, History, Roll back (administrator). API `POST /api/v1/config/rollback` |
| The configuration system itself is suspected (errors, slowness, wrong gating on many sites) | Switch the whole system off | section 2 |
| An owner locked themselves out of a page they need | Roll back, or switch the system off for that site | sections 1 and 2 |
| Staff see 429 "Too many ... requests" | Wait; it clears 10 minutes after their first request in the window | section 4 |
| Staff see 413 | The file or request is too large; shrink it | section 4 |

Rolling back or switching off **never deletes** stored configuration. Both are reversible.

## 2. The master switch
Two places hold it. The environment variable wins.

| Place | Name | Values | Who can change it |
| --- | --- | --- | --- |
| Worker environment | `CONFIGURABLE_PLATFORM` | `off`/`on` (also 0/1, false/true, disabled/enabled, no/yes) | whoever deploys the tenant release; needs a redeploy or variable change |
| Site setting | `configurable_platform` | same values | a site administrator, `PUT /api/v1/site-profile/system` with `{"enabled": false}`; works while the system is off, so it can be switched back on |

Anything missing, empty or unreadable means **on** (the behaviour before the switch existed).

**Off means:** the resolver serves the Full platform with no module gating; the Configuration menu entry, the welcome panel and the next-steps panel are hidden; every configuration write answers 403 `config_system_off`; the provisioning API answers 409 `config_system_off`. The stored profile, drafts and versions are untouched.
**Back on means:** the stored configuration applies again, exactly as saved.

Timing: a change through the API clears the cache for this isolate at once and KV immediately; other isolates can take up to 15 seconds (their in-memory copy), and the KV entry lives at most 60 seconds. A change of the environment variable needs the new deployment to be live.

Check the state: `GET /api/v1/site-profile/system` shows `enabled`, `source` (env, setting or default) and whether the environment overrides the setting. The control plane reads the same through Super API v17 `GET site-system`.

Open decision, not changed: a draft preview cookie still shows the draft while only the settings-key switch is off (the environment switch wins and disables it).

## 3. Rolling out
Recommended order (the control plane canary rollout that automates this is not built yet; do it by hand until it is):
1. Deploy to one staging tenant, run the staging procedure in `LOAD_HARNESS_CONFIGURATION.md`.
2. Deploy to one real, low-risk tenant. Watch for a day.
3. Deploy to all. Keep `CONFIGURABLE_PLATFORM=off` ready as the first response to a system-wide problem.
No database migration is needed for Phase 10. Deploy the tenant release **before** any control plane change that reads `site-system`.

## 4. Limits
| Limit | Value | Behaviour |
| --- | --- | --- |
| Request body | 64 KB default, 512 KB drafts, 2 MB imports | 413, refused before parsing |
| Requests per person per 10 minutes | export 20, plan 30, apply 15, clone fetch 10, presets 30, shares 20, setup confirm 10, publish 20, rollback 10 | 429 with `Retry-After` (600 s) |
| Sections list | 64 entries | extra entries ignored; a list with no valid id exports or imports nothing |

The request limiter stores rows in `auth_attempts` (action `cfg:<name>`), so no migration was needed. The sign-in limiter deletes rows older than 15 minutes; that is why the window is 10. If the table cannot be read the limiter lets the request through (fail open); look for that if limits seem not to apply.

## 5. Routine checks
- After every tenant release: `node scripts/build-css.mjs --check` and `node scripts/asset-version.mjs --check` in `en/` (both must say current).
- Offline budget check: `node tools/load/config-load-harness.mjs` (exit 0).
- Read `docs/SECURITY_REVIEW_CONFIGURATION.md` for the residual risks before widening access to the export, share and clone features.

## 6. Not covered by this guide
Control plane screens for presets and setup status, the retry sweep, canary rollout and the staff view of the switch are **not built** at the time of writing this file. See `NOTES_PHASE_10.md` for the current state.
