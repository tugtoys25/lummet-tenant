# Release: Speed (tenant v22.0)

Built on tenant v21.5. Control plane untouched. Nothing removed. **No migration.**

## What changed

- **Public pages load about a third of the files.** 11 scripts and 12 stylesheets instead of about 70 and 14, none blocking. The dashboard and signed-in user area keep the full set.
- **Real caching.** CSS/JS get `?v=<hash>` URLs cached for a year, so repeat visits download nothing and a release shows at once. The service worker no longer serves stale scripts (cache v3).
- **Fewer repeat reads.** A 15 s in-memory layer in front of KV, and 30 s caching of active banners.
- After editing any file in `static/css` or `static/js`, run `node scripts/asset-version.mjs` (a test fails if you forget). Details: `docs/PLATFORM_UPGRADES.md` section 38.
- Dashboard or banner changes can take up to about 15-30 s to appear on public pages.

## Numbers

Counted with `git diff --numstat` against v21.5, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **10** | **354** | **80** |

New: 4, modified: 6, deleted: 0. Tests: 1128 pass (full suite); focused set (4 files) 58 pass. Migrations: **none**.
Deleted files: **none**.

## New files (4)

| File | + | - |
|---|---:|---:|
| `en/scripts/asset-version.mjs` | 48 | 0 |
| `en/test/perf-assets.test.js` | 130 | 0 |
| `en/worker/asset-version.js` | 3 | 0 |
| `en/worker/static-assets.js` | 42 | 0 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 11 | 0 |
| `en/static/sw.js` | 27 | 43 |
| `en/templates/layout/base.html` | 30 | 34 |
| `en/worker/cache.js` | 36 | 1 |
| `en/worker/index.js` | 2 | 1 |
| `en/worker/render.js` | 25 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-0-speed.patch
git apply ~/storage/downloads/lummet-tenant-v22-0-speed.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-0-speed-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-0-speed-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-0-speed-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/perf-assets.test.js test/dashboard-shell.test.js test/site-upgrades.test.js test/lummet-subdomain-parity.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.0: Speed (lean public assets, versioned caching, L1 cache)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 58`. No migration is needed. After deploying, hard-refresh once (the new service worker replaces the old one), then check a public page in the browser's Network tab: a repeat visit should show CSS/JS served from cache.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up.
