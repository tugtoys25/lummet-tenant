# Release: research home, comparison, site-wide search, dashboard add panel (tenant v18)

Built on tenant v17.3. Control plane untouched. Nothing removed, no migration.
The full description of every change is in `docs/PLATFORM_UPGRADES.md`.

## What changed

1. **Research home** now has a Featured research block (editor's picks) and an All research list
   with every published item, plus a sort choice (newest, oldest, recently updated, A to Z, Z to A).
   Search and filters work as before.
2. **Comparison pages**: in the dashboard a criterion is picked from the fields that type can be
   compared on (with "Add all comparable fields" and a "Custom key" fallback). The public page has
   header cards, star ratings with a Best marker, typed cells (ticks, chips, links), every other
   filled field under More details, and a "Show differences only" switch. Phones keep a real table.
3. **Site search** searches casinos, reviews, research, news, platform updates, sportsbooks,
   affiliate partners, authors and pages, grouped under a title each, with a See all results page
   at `/en/search`.
4. **Dashboard**: the add/edit form of 25 list pages moves into a side panel opened by an
   "+ Add ..." button at the top. Edit opens it too. The form is moved, not rebuilt.

## Numbers

Counted with `git diff --numstat` against v17.3, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **23** | **1237** | **81** |

Tests: 976 pass; 13 new. Migrations: **none**. Deleted files: **none**.

## New files (7)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 121 | 0 |
| `en/static/js/admin-add-panel.js` | 210 | 0 |
| `en/static/js/comparison.js` | 7 | 0 |
| `en/templates/pages/search.html` | 13 | 0 |
| `en/test/site-upgrades.test.js` | 123 | 0 |
| `en/worker/comparison-fields.js` | 187 | 0 |
| `en/worker/site-search.js` | 126 | 0 |

## Modified files (16)

| File | + | - |
|---|---:|---:|
| `en/static/css/component-blocks.css` | 77 | 0 |
| `en/static/css/header-hero.css` | 18 | 0 |
| `en/static/css/research.css` | 9 | 0 |
| `en/static/js/app.js` | 1 | 1 |
| `en/static/js/dashboard.js` | 73 | 11 |
| `en/static/js/research-directory-filter.js` | 33 | 2 |
| `en/static/js/search.js` | 56 | 47 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/comparison.html` | 13 | 10 |
| `en/templates/pages/research-list.html` | 8 | 1 |
| `en/worker/api.js` | 21 | 0 |
| `en/worker/breadcrumbs.js` | 4 | 0 |
| `en/worker/controllers.js` | 130 | 8 |
| `en/worker/index.js` | 4 | 0 |
| `en/worker/reserved-slugs.js` | 1 | 1 |
| `en/worker/routes.js` | 1 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-platform-upgrades.patch
git apply ~/storage/downloads/lummet-tenant-v18-platform-upgrades.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-platform-upgrades-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-platform-upgrades-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-platform-upgrades-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18: research sort, comparison fields, site search, dashboard add panel"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 56`. Hard-refresh after the deploy (old scripts and styles may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
