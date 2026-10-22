# Release: Instant home page (tenant v22.4)

Built on tenant v22.3. Control plane untouched. Nothing removed. **No migration.**

## What changed

- **Cause of the slow home page:** the public news list sent every published article in full (text included) to every visitor on every page, and the home page's own render loaded every article's full text from the database just to show 4 headlines. Both now read only a short, limited list.
- **A visitor never waits for a render that has happened before:** cached pages are served at once for up to a day and refreshed in the background after 10 minutes; before, an unrefreshed copy vanished after 15 minutes to an hour, so on a quiet site most visitors waited for a cold render.
- **Home page joins the common page cache** (retired by any admin save, view events replayed) and the refresh lock no longer writes to KV.
- **Warm-up:** the scheduled job re-renders the home page and the pages and countries visitors actually use, so even the first visitor after a quiet spell gets a cached page.
- **`Server-Timing` header** on cached pages shows server time and hit/stale/miss.
- Details: `docs/PLATFORM_UPGRADES.md` section 42.

## Numbers

Counted with `git diff --numstat` against v22.3, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **7** | **221** | **63** |

New: 0, modified: 7, deleted: 0. Tests: 1145 pass (full suite); focused set (4 files) 73 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/test/page-cache.test.js` | 70 | 1 |
| `en/worker/api.js` | 25 | 9 |
| `en/worker/controllers.js` | 5 | 42 |
| `en/worker/database/news.js` | 31 | 0 |
| `en/worker/index.js` | 16 | 2 |
| `en/worker/page-cache.js` | 62 | 9 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-4-instant-home.patch
git apply ~/storage/downloads/lummet-tenant-v22-4-instant-home.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-4-instant-home-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-4-instant-home-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-4-instant-home-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/page-cache.test.js test/newsroom-public.test.js test/newsroom-home.test.js test/perf-assets.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.4: Instant home page (slim news, stale-first cache, warm-up)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 73`. After deploying, open the home page twice. In the browser Network tab click the page request, then Timing (or `curl -sD - https://your-domain/en | grep -i server-timing`): the second visit should say `cache;desc="hit"` with a few milliseconds. The first visit after a deploy is a `miss` (a fresh render); the Speed page (Dashboard, Insights) then shows the numbers over the next days.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up.
