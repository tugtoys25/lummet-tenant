# Release: page controllers split into modules (tenant v22.15)

Built on tenant v22.14. Control plane untouched. **No migration. Nothing deleted. No page, style or script changed.**

## Why

`en/worker/controllers.js` was 6,779 lines: 117 page functions and 87 helpers in one file. Second step of the restructuring (the first was the API in v22.14).

## What changed

- `en/worker/controllers.js` is now a **re-export file**: the same 117 names, so `index.js`, the other modules and the tests import it as before.
- **25 new files in `en/worker/controllers/`**: 21 page areas (home, casinos, reviews, news, research, dashboard, ...) and 4 shared parts (`shared`, `ads`, `casino-cards`, `redirects`).
- Code was moved without editing it. Each file imports only what it uses (linted: no undefined names; every module loads; the exports match).
- `docs/ARCHITECTURE_CONTROLLERS.md` explains the layout and how to change a page. `docs/PLATFORM_UPGRADES.md` section 53.
- Tests: new `test/controllers-structure.test.js` (5 tests). Eight older tests that read the controllers as source text now read all the files through `test/support/controllers-source.js`.

## Proof the output is the same

A seeded test database was served by the old and the new code: 149 URLs (home, lists, detail pages, login, sitemaps, robots, the dashboard pages, 404s), each fetched signed out and as admin. **All 298 responses are byte-identical** (status, content type, redirect target, body). 67 public pages and 131 admin responses are status 200, so the pages really render.

## Numbers

Counted with `git diff --numstat` against v22.14, excluding the three generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **38** | **7350** | **6787** |

New: 28, modified: 10, deleted: 0. Tests: **1,167 pass** (full suite: 1,162 before + 5 new). Migrations: **none**.

## New files (28)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_CONTROLLERS.md` | 61 | 0 |
| `en/test/controllers-structure.test.js` | 53 | 0 |
| `en/test/support/controllers-source.js` | 17 | 0 |
| `en/worker/controllers/ads.js` | 424 | 0 |
| `en/worker/controllers/affiliates.js` | 230 | 0 |
| `en/worker/controllers/auth-pages.js` | 144 | 0 |
| `en/worker/controllers/authors.js` | 303 | 0 |
| `en/worker/controllers/casino-cards.js` | 450 | 0 |
| `en/worker/controllers/casinos.js` | 256 | 0 |
| `en/worker/controllers/categories.js` | 119 | 0 |
| `en/worker/controllers/comparisons.js` | 228 | 0 |
| `en/worker/controllers/content-items.js` | 376 | 0 |
| `en/worker/controllers/countries.js` | 174 | 0 |
| `en/worker/controllers/dashboard.js` | 406 | 0 |
| `en/worker/controllers/dynamic-pages.js` | 105 | 0 |
| `en/worker/controllers/generic-reviews.js` | 229 | 0 |
| `en/worker/controllers/home.js` | 132 | 0 |
| `en/worker/controllers/landing-pages.js` | 101 | 0 |
| `en/worker/controllers/news.js` | 683 | 0 |
| `en/worker/controllers/payment-methods.js` | 118 | 0 |
| `en/worker/controllers/platform-updates.js` | 283 | 0 |
| `en/worker/controllers/redirects.js` | 237 | 0 |
| `en/worker/controllers/research.js` | 668 | 0 |
| `en/worker/controllers/reviews.js` | 438 | 0 |
| `en/worker/controllers/seo-pages.js` | 425 | 0 |
| `en/worker/controllers/shared.js` | 323 | 0 |
| `en/worker/controllers/system-pages.js` | 86 | 0 |
| `en/worker/controllers/user-pages.js` | 66 | 0 |

Deleted files: **none**.

## Modified files (10)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/component-page-types.test.js` | 2 | 1 |
| `en/test/component-studio.test.js` | 2 | 1 |
| `en/test/dashboard-shell.test.js` | 2 | 1 |
| `en/test/header-hero.test.js` | 2 | 1 |
| `en/test/newsroom-admin-ui.test.js` | 2 | 1 |
| `en/test/site-title-description.test.js` | 2 | 1 |
| `en/test/site-upgrades.test.js` | 3 | 2 |
| `en/test/xss-regression-content-pages.test.js` | 2 | 1 |
| `en/worker/controllers.js` | 188 | 6778 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-15-controllers-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-15-controllers-split.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-15-controllers-split-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-15-controllers-split-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-15-controllers-split-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/controllers-structure.test.js test/site-upgrades.test.js test/dashboard-shell.test.js test/xss-regression-content-pages.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.15: page controllers split into modules (worker/controllers/)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current`, the focused set to pass, and the full suite `pass 1167`, `fail 0` (about 8 minutes on a phone). Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, open the home page, a casino page, a news article, the login page, and one dashboard page.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
