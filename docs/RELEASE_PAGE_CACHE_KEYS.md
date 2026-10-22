# Release: Page cache keys (tenant v22.8)

Built on tenant v22.7. Control plane untouched. Nothing removed. **No migration.**

## Why

After v22.7, banner pages were cached, but `x-page-store` still showed `kv:probe-failed` / `kv:no-cache-api` (Cloudflare's cache did not keep the pages) and some hits took about 400 ms (cold KV reads).

## What changed

- Cache API keys use the visitor's own domain; `SITE_URL` is not set in the wrangler config, so v22.7 used a made-up domain.
- Pages stay fresh 30 minutes (was 10) before a background refresh; admin saves still retire pages at once. Fewer KV writes while KV is the fallback.
- If the last save failed, a stale page is served but no useless background re-render is started.
- Details: `docs/PLATFORM_UPGRADES.md` section 46.

## Numbers

Counted with `git diff --numstat` against v22.7, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **51** | **14** |

New: 0, modified: 5, deleted: 0. Tests: 1150 pass (full suite); focused set (3 files) 25 pass. Migrations: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

Deleted files: **none**.

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 11 | 0 |
| `en/test/page-cache-local.test.js` | 23 | 0 |
| `en/test/page-cache.test.js` | 1 | 1 |
| `en/worker/cache.js` | 9 | 7 |
| `en/worker/page-cache.js` | 7 | 6 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-8-page-cache-keys.patch
git apply ~/storage/downloads/lummet-tenant-v22-8-page-cache-keys.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-8-page-cache-keys-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-8-page-cache-keys-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-8-page-cache-keys-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache-local.test.js test/page-cache.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.8: Page cache keys on own domain, gentler KV use"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 25`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
