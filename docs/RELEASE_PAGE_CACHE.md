# Release: Page cache off KV (tenant v22.6)

Built on tenant v22.5. Control plane untouched. Nothing removed. **No migration.**

## Why

Your home page header showed `x-page-cache: stale` on every visit and never `hit`. Cause: the free Cloudflare KV plan allows 1,000 writes a day; once used, saving a fresh copy of a page fails, so visitors keep getting an old copy and each visit starts a useless re-render.

## What changed

- Rendered pages and banners are saved in Cloudflare's Cache API (free, no write limit) instead of KV. Each data centre has its own copy.
- Admin saves still retire every cached page at once (one small KV value, written only when you save).
- Fallback to KV where the Cache API does not work (workers.dev); the first save is read back to check.
- New `x-page-store` header (`cache`, `kv`, `failed`, `none`) shows what the last save did.
- Details: `docs/PLATFORM_UPGRADES.md` section 44.

## Numbers

Counted with `git diff --numstat` against v22.5, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **164** | **12** |

New: 1, modified: 4, deleted: 0. Tests: 1148 pass (full suite); focused set (3 files) 23 pass. Migrations: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/test/page-cache-local.test.js` | 71 | 0 |

Deleted files: **none**.

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/worker/cache.js` | 65 | 0 |
| `en/worker/page-cache.js` | 12 | 9 |
| `en/worker/render.js` | 4 | 3 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-6-page-cache.patch
git apply ~/storage/downloads/lummet-tenant-v22-6-page-cache.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-6-page-cache-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-6-page-cache-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-6-page-cache-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache-local.test.js test/page-cache.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.6: Page cache off KV (Cache API, x-page-store header)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 23`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
