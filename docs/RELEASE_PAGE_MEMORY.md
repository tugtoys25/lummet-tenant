# Release: Pages from memory (tenant v22.11)

Built on tenant v22.10. Control plane untouched. Nothing removed. **No migration.**

## Why

Live headers showed `x-page-store: kv:probe-failed(level.casino)` and `x-page-source: kv`: Cloudflare's own cache does not keep pages on this domain, so pages come from KV. That is fast when warm (6-12 ms) but a first read in a data centre takes 200-400 ms, and the scheduled warm-up did nothing because `SITE_URL` is not set.

## What changed

- A warm isolate serves a page from its own memory (`x-page-source: memory`), with no KV read, for up to 5 minutes; an admin save retires it at once.
- The save epoch is re-read at most every 30 seconds per isolate.
- The first (miss) response no longer waits for its save.
- The warm-up finds the site address from live traffic when `SITE_URL` is not set.
- Details: `docs/PLATFORM_UPGRADES.md` section 49.

## Numbers

Counted with `git diff --numstat` against v22.10, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **117** | **16** |

New: 0, modified: 4, deleted: 0. Tests: 1153 pass (full suite); focused set (3 files) 28 pass. Migrations: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

Deleted files: **none**.

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/test/page-cache-local.test.js` | 32 | 4 |
| `en/test/page-cache.test.js` | 6 | 5 |
| `en/worker/page-cache.js` | 67 | 7 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-11-page-memory.patch
git apply ~/storage/downloads/lummet-tenant-v22-11-page-memory.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-11-page-memory-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-11-page-memory-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-11-page-memory-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache-local.test.js test/page-cache.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.11: Pages from memory, warm-up without SITE_URL"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 28`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
