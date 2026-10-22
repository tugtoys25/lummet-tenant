# Release: Page cache read-back (tenant v22.9)

Built on tenant v22.8. Control plane untouched. Nothing removed. **No migration.**

## Why

After v22.8, `x-page-store` still showed `kv:probe-failed`: Cloudflare accepted a save but the immediate read-back found nothing, so pages fell back to KV (1,000 writes a day on the free plan).

## What changed

- The read-back now looks three times (now, +100 ms, +300 ms) before deciding the cache does not keep pages.
- If it still fails, the header names the domain used: `kv:probe-failed(level.casino)`.
- Details: `docs/PLATFORM_UPGRADES.md` section 47.

## Numbers

Counted with `git diff --numstat` against v22.8, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **3** | **36** | **4** |

New: 0, modified: 3, deleted: 0. Tests: 1151 pass (full suite); focused set (3 files) 26 pass. Migrations: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

Deleted files: **none**.

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/page-cache-local.test.js` | 15 | 1 |
| `en/worker/cache.js` | 11 | 3 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-9-page-cache-probe.patch
git apply ~/storage/downloads/lummet-tenant-v22-9-page-cache-probe.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-9-page-cache-probe-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-9-page-cache-probe-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-9-page-cache-probe-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache-local.test.js test/page-cache.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.9: Page cache patient read-back, host in header"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 26`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
