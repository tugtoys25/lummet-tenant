# Release: Page cache fixes (tenant v22.7)

Built on tenant v22.6. Control plane untouched. Nothing removed. **No migration.**

## Why

Live headers after v22.6: the home page hit the cache (5 ms), but a casino page was a `miss` on every visit (1-2 s), and `x-page-store` showed `kv`, meaning the Cache API was not being used.

## What changed

- Pages with a banner component were never cached: the banner's view event carries a plain `metadata` block that the cache refused. Plain metadata is now replayed on each hit; nested or visitor-specific fields still stop caching.
- `x-page-cache` now says why a page is not cached (`skip:event-field-<name>`, `skip:status`, `skip:type`).
- The Cache API uses your own domain in its keys, needs two missed read-backs before it is switched off, and `x-page-store` says `kv:probe-failed` or `kv:no-cache-api` when KV is used.
- Details: `docs/PLATFORM_UPGRADES.md` section 45.

## Numbers

Counted with `git diff --numstat` against v22.6, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **100** | **23** |

New: 0, modified: 5, deleted: 0. Tests: 1149 pass (full suite); focused set (3 files) 24 pass. Migrations: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

Deleted files: **none**.

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/page-cache-local.test.js` | 2 | 2 |
| `en/test/page-cache.test.js` | 22 | 3 |
| `en/worker/cache.js` | 27 | 12 |
| `en/worker/page-cache.js` | 39 | 6 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-7-page-cache-fix.patch
git apply ~/storage/downloads/lummet-tenant-v22-7-page-cache-fix.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-7-page-cache-fix-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-7-page-cache-fix-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-7-page-cache-fix-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache-local.test.js test/page-cache.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.7: Page cache fixes (banner pages cacheable, skip reasons)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 24`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
