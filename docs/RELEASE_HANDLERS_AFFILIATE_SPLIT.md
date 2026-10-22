# Release: Super API affiliate handlers written as parts (tenant v22.55)

Built on tenant v22.54. Control plane untouched. **No migration. No behaviour change.** `en/worker/super/handlers-affiliate.js` (544 lines) is now a facade over `handlers-affiliate/shared.js`, `partners.js`, `commercial.js` and `integrations.js`. It re-exports the same 40 handlers, so `router.js` and everything else is unchanged. Docs: `docs/ARCHITECTURE_HANDLERS_AFFILIATE.md`, `docs/PLATFORM_UPGRADES.md` section 93. New `test/handlers-affiliate-structure.test.js` (6 tests).

## Proof the behaviour is the same

- Every handler was driven old against new through about 2,350 random operations on a real schema (create, edit, list with filters, get, delete, archive, rotate token) with valid, missing and hostile input, bad ids, bad JSON and foreign-key conflicts, with a fixed clock and seeded randomness. Every status, header and body (list order and SQLite's own timestamps normalised), the final table counts and the offer version history are identical. Every handler succeeded at least once.
- Mutation checks on each part (response status and header, required fields, dependent checks, own-domain rule, change reason, limits, token field) were all detected by the harness. The only ones not detected are default arguments that no caller uses.

## Numbers

Counted with `git diff --numstat` against v22.54. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **615** | **532** |

New: 6, modified: 2, deleted: 0. Tests: **1,345 pass** (1,339 before + 6 new). Migrations: **none**.

## New files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_HANDLERS_AFFILIATE.md` | 12 | 0 |
| `en/test/handlers-affiliate-structure.test.js` | 50 | 0 |
| `en/worker/super/handlers-affiliate/commercial.js` | 160 | 0 |
| `en/worker/super/handlers-affiliate/integrations.js` | 163 | 0 |
| `en/worker/super/handlers-affiliate/partners.js` | 190 | 0 |
| `en/worker/super/handlers-affiliate/shared.js` | 27 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/worker/super/handlers-affiliate.js` | 4 | 532 |

## Install (Termux)

Needs v22.54 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-55-handlers-affiliate-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-55-handlers-affiliate-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/handlers-affiliate-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.55: super API affiliate handlers split into 4 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1345`, `fail 0`.

Nothing visible changes. To confirm, nothing visible on the website changes; the super API (used by the control plane) answers the same. Open the control plane's affiliate partners list for a tenant to check.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
