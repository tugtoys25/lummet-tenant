# Release: Super API route table written as 5 files (tenant v22.59)

Built on tenant v22.58. Control plane untouched. **No migration. No behaviour change.** `en/worker/super/router.js` (513 lines) held the 227 routes of the Super API allowlist and the dispatcher. The routes now live in `en/worker/super/routes/{core,affiliate,analytics,ai-newsroom,research}.js`; `router.js` (162 lines) joins them in the old order and keeps `matchRoute`, `actionForMethod` and `handleSuperApi` (still its only export). Docs: `docs/ARCHITECTURE_SUPER_ROUTER.md`, `docs/PLATFORM_UPGRADES.md` section 97. New `test/super-router-structure.test.js` (5 tests) and `test/fixtures/super-routes-v22.58.json` (the old table).

## Proof the behaviour is the same

- The table (order, method, path, handler, resource) is identical to the old one, and about 1,050 signed requests were run through `handleSuperApi` old against new on a real schema with a fixed clock and seeded randomness: every route with several ids, queries and bodies, wrong methods, no configuration (503), missing and wrong credentials, stale, future and invalid timestamps, a bad signature, a replayed nonce, and a burst that hits the rate limit (429). Every status, header and body, and the whole audit log table, are identical.
- Mutation checks (resource names, a deleted route, a changed path, a swapped handler, id decoding, the 429 message, the audit action and success flag, body reading, the internal error message) were all detected, apart from swapping the order of two groups that share no path, which changes nothing. `test/super-router-structure.test.js` compares the joined table with the old one; three tests that read the router's source now read it through `test/support/super-router-source.js`.

## Numbers

Counted with `git diff --numstat` against v22.58. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **733** | **369** |

New: 9, modified: 5, deleted: 0. Tests: **1,355 pass** (1,350 before + 5). Migrations: **none**.

## New files (9)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_SUPER_ROUTER.md` | 18 | 0 |
| `en/test/fixtures/super-routes-v22.58.json` | 227 | 0 |
| `en/test/super-router-structure.test.js` | 60 | 0 |
| `en/test/support/super-router-source.js` | 13 | 0 |
| `en/worker/super/routes/affiliate.js` | 70 | 0 |
| `en/worker/super/routes/ai-newsroom.js` | 61 | 0 |
| `en/worker/super/routes/analytics.js` | 46 | 0 |
| `en/worker/super/routes/core.js` | 178 | 0 |
| `en/worker/super/routes/research.js` | 33 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/test/handlers-affiliate-structure.test.js` | 2 | 1 |
| `en/test/super-api-analytics-parity.test.js` | 2 | 4 |
| `en/test/super-handlers-structure.test.js` | 2 | 1 |
| `en/worker/super/router.js` | 12 | 363 |

## Install (Termux)

Needs v22.58 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-59-super-router-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-59-super-router-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/super-router-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.59: Super API route table split into 5 files"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1355`, `fail 0`.

Nothing visible changes on the website. The control plane talks to this API, so after deploy open a tenant's casinos and reviews lists in the control plane to confirm it still answers.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
