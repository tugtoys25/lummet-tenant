# Release: Speed, server side (tenant v22.1)

Built on tenant v22.0. Control plane untouched. Nothing removed. **No migration.**

## What changed

- **Public page cache.** Content pages are served from KV, one copy per country, instead of about 15 database queries per view. Fresh for 5 minutes, refreshed in the background, never older than 15 minutes.
- **Analytics unchanged.** The view events a page fires are recorded when it is rendered and replayed on every cache hit with the visitor's own country, city and referrer.
- **Edits show at once.** Any successful admin save retires every cached page.
- **Faster chat.** Greetings skip the model; a repeated first question reuses its plan.
- **Fix:** the banner cache from v22.0 used a 30 s TTL, below KV's 60 s minimum, so it never stored; now 60 s.
- Optional Cloudflare settings (smart placement, static files bypassing the Worker) are described, not applied: `docs/PLATFORM_UPGRADES.md` section 39.

## Numbers

Counted with `git diff --numstat` against v22.0, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **454** | **4** |

New: 3, modified: 5, deleted: 0. Tests: 1136 pass (full suite); focused set (5 files) 53 pass. Migrations: **none**.
Deleted files: **none**.

## New files (3)

| File | + | - |
|---|---:|---:|
| `en/test/ai-understand-speed.test.js` | 44 | 0 |
| `en/test/page-cache.test.js` | 133 | 0 |
| `en/worker/page-cache.js` | 202 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 17 | 0 |
| `en/worker/ai/understand.js` | 32 | 1 |
| `en/worker/database/analytics.js` | 12 | 0 |
| `en/worker/index.js` | 12 | 1 |
| `en/worker/render.js` | 2 | 2 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-1-speed-server.patch
git apply ~/storage/downloads/lummet-tenant-v22-1-speed-server.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-1-speed-server-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-1-speed-server-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-1-speed-server-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache.test.js test/ai-understand-speed.test.js test/perf-assets.test.js test/ai-studio.test.js test/lummet-subdomain-parity.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.1: Speed, server side (page cache, faster chat)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 53`. No migration is needed. After deploying, open a casino page twice: the second response should carry `x-page-cache: hit` (browser Network tab, response headers). Then edit that casino in the dashboard and reload; the change should show immediately.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up.
