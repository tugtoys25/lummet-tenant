# Release: Speed check (tenant v22.3)

Built on tenant v22.2. Control plane untouched. Nothing removed. **One migration: `0065_perf_samples.sql`.**

## What changed

- **Dashboard, Insights, Speed** (admins only): share of page views served from the page cache, typical and slowest-1-in-20 server times for cached and uncached pages, the slowest pages, and the asset version.
- About 1 in 10 public page views is sampled into a new `perf_samples` table after the response is sent (never slows a page); rows older than 14 days are removed automatically.
- **Migration `0065_perf_samples.sql` is needed on each site database.** Until it is applied the page says so and nothing is recorded; the site is unaffected.
- Details: `docs/PLATFORM_UPGRADES.md` section 41.

## Numbers

Counted with `git diff --numstat` against v22.2, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **291** | **2** |

New: 5, modified: 8, deleted: 0. Tests: 1142 pass (full suite); focused set (3 files) 29 pass. Migrations: **0065_perf_samples.sql** (one new table, nothing altered).
Deleted files: **none**.

## New files (5)

| File | + | - |
|---|---:|---:|
| `en/migrations/0065_perf_samples.sql` | 14 | 0 |
| `en/static/js/speed-admin.js` | 52 | 0 |
| `en/templates/pages/admin/speed.html` | 29 | 0 |
| `en/test/speed-check.test.js` | 79 | 0 |
| `en/worker/perf.js` | 83 | 0 |

## Modified files (8)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 13 | 0 |
| `en/templates/layout/admin-nav.html` | 1 | 0 |
| `en/test/dashboard-shell.test.js` | 1 | 1 |
| `en/worker/api.js` | 7 | 0 |
| `en/worker/asset-version.js` | 1 | 1 |
| `en/worker/controllers.js` | 4 | 0 |
| `en/worker/index.js` | 6 | 0 |
| `en/worker/routes.js` | 1 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-3-speed-check.patch
git apply ~/storage/downloads/lummet-tenant-v22-3-speed-check.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-3-speed-check-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-3-speed-check-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-3-speed-check-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/speed-check.test.js test/dashboard-shell.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.3: Speed check panel"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 29`. Apply the migration on every site database (D1 console, or `gh workflow run d1-migrate-file.yml -f file=0065_perf_samples.sql`; a second run says the table already exists, which is harmless). Then browse a few public pages and open Dashboard, Insights, Speed.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
The `perf_samples` table can stay (it is only read by the Speed page and prunes itself); to remove it: `DROP TABLE perf_samples;`.
