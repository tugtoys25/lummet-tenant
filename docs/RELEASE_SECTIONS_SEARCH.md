# Release: comparison sections, payment methods and categories, remove item, list search (tenant v18.2)

Built on tenant v18.1. Control plane untouched. Nothing removed, no migration. The full description is in
`docs/PLATFORM_UPGRADES.md` (addendum, parts 7 to 10).

## What changed

1. **Comparison sections** below the table, written as text: headings, text, lists, notes, buttons, pictures,
   dividers and items picked from anywhere on the site. Built in the comparison editor.
2. **Payment methods and categories** are comparable rows for every item type.
3. **Remove an item** from the comparison on the public page (hides the column; Restore brings it back; two always stay).
4. **Search in every dashboard list**: search box, count, click-to-sort headings, "/" shortcut. Comparisons and
   generic reviews search on the server so every page is covered.

## Numbers

Counted with `git diff --numstat` against v18.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **16** | **691** | **33** |

Tests: 989 pass; 7 new. Migrations: **none**. Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/admin-list-search.js` | 172 | 0 |

## Modified files (15)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 49 | 0 |
| `en/static/css/component-blocks.css` | 26 | 0 |
| `en/static/css/header-hero.css` | 23 | 0 |
| `en/static/js/comparison-design.js` | 124 | 7 |
| `en/static/js/comparison.js` | 46 | 3 |
| `en/static/js/dashboard.js` | 13 | 2 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/comparison.html` | 3 | 0 |
| `en/test/site-upgrades.test.js` | 89 | 1 |
| `en/worker/api.js` | 2 | 2 |
| `en/worker/comparison-design.js` | 75 | 2 |
| `en/worker/comparison-fields.js` | 42 | 6 |
| `en/worker/controllers.js` | 7 | 3 |
| `en/worker/database/comparisons.js` | 6 | 1 |
| `en/worker/database/generic-reviews.js` | 13 | 6 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-2-sections-search.patch
git apply ~/storage/downloads/lummet-tenant-v18-2-sections-search.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-2-sections-search-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-2-sections-search-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-2-sections-search-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.2: comparison sections, related fields, remove item, list search"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 69`. Hard-refresh after the deploy (old scripts and styles may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
