# Release: Page cache source header (tenant v22.10)

Built on tenant v22.9. Control plane untouched. Nothing removed. **No migration.**

## Why

After v22.9 the live headers could not show whether Cloudflare's cache or KV held a page (`x-page-store` only reports a save made in the same data centre that serves the request).

## What changed

- New `x-page-source` header on every cached response: `cache` or `kv`.
- The first (miss) response waits for its own save (a few ms), so its `x-page-store` reports it.
- Details: `docs/PLATFORM_UPGRADES.md` section 48.

## Numbers

Counted with `git diff --numstat` against v22.9, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **33** | **15** |

New: 0, modified: 4, deleted: 0. Tests: 1151 pass (full suite); focused set (3 files) 26 pass. Migrations: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

Deleted files: **none**.

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/page-cache-local.test.js` | 4 | 1 |
| `en/worker/cache.js` | 12 | 7 |
| `en/worker/page-cache.js` | 7 | 7 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-10-page-cache-source.patch
git apply ~/storage/downloads/lummet-tenant-v22-10-page-cache-source.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-10-page-cache-source-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-10-page-cache-source-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-10-page-cache-source-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache-local.test.js test/page-cache.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.10: Page cache source header"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 26`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
