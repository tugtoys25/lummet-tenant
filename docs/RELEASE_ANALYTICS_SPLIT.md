# Release: analytics module written as parts (tenant v22.50)

Built on tenant v22.49. Control plane untouched. **No migration. No behaviour change.** `en/worker/database/analytics.js` (604 lines) is now a facade over `analytics/events.js`, `metrics.js`, `conversions.js` and `aggregation.js`. It re-exports the same 12 names, so no importer changes. Docs: `docs/ARCHITECTURE_ANALYTICS.md`, `docs/PLATFORM_UPGRADES.md` section 88. New `test/analytics-structure.test.js` (6 tests).

## Proof the behaviour is the same

- Every export was run old against new on a seeded database: about 1,000 calls with valid and hostile inputs, six users with different item-access scopes, daily aggregation and backfill (including the 92-day cap), a throwing database and the page-cache capture. All results and the resulting tables are identical.
- Mutation checks on each part (event type list, bot flag, capture suppression, sort order, scope fallback, duplicate handling, click ordering, backfill cap, default date, conversion dimensions) were all detected by the harness.

## Numbers

Counted with `git diff --numstat` against v22.49. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **660** | **587** |

New: 6, modified: 2, deleted: 0. Tests: **1,320 pass** (1,314 before + 6 new). Migrations: **none**.

## New files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ANALYTICS.md` | 14 | 0 |
| `en/test/analytics-structure.test.js` | 45 | 0 |
| `en/worker/database/analytics/aggregation.js` | 176 | 0 |
| `en/worker/database/analytics/conversions.js` | 95 | 0 |
| `en/worker/database/analytics/events.js` | 82 | 0 |
| `en/worker/database/analytics/metrics.js` | 234 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/worker/database/analytics.js` | 5 | 587 |

## Install (Termux)

Needs v22.49 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-50-analytics-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-50-analytics-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/analytics-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.50: analytics module split into 4 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1320`, `fail 0`.

Nothing visible changes. To confirm, open the dashboard analytics page and a casino page, then click an affiliate link: the numbers and redirect work as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
