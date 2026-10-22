# Release: comparison design, custom values, top save bar (tenant v18.1)

Built on tenant v18. Control plane untouched. Nothing removed, no migration.
The full description is in `docs/PLATFORM_UPGRADES.md` (addendum).

## What changed

1. **Comparison design**: colours (header, labels, cells, alternate rows, lines, highlight), font, text size and
   corner shape for the whole table, for each item column, and for each row. Managed in Comparisons > create / edit.
2. **Custom values**: a grid with a row per criterion and a box per item to type your own value for that item,
   plus **+ Add custom row** for a custom key and label. Empty boxes keep the real data.
3. **Top Save bar** on the big create/edit pages (casino, content items, reviews, comparisons, landing pages,
   custom types): the Save button stays in reach while scrolling.

Stored in the existing settings table; saved and cleaned on the server (colours `#rrggbb`, fixed font list, plain text).

## Numbers

Counted with `git diff --numstat` against v18, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **15** | **612** | **23** |

Tests: 982 pass; 6 new. Migrations: **none**. Deleted files: **none**.

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/static/js/comparison-design.js` | 219 | 0 |
| `en/worker/comparison-design.js` | 168 | 0 |

## Modified files (13)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 37 | 0 |
| `en/static/css/component-blocks.css` | 11 | 3 |
| `en/static/css/header-hero.css` | 18 | 0 |
| `en/static/js/admin-add-panel.js` | 23 | 0 |
| `en/static/js/dashboard.js` | 17 | 0 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/comparison-create.html` | 6 | 0 |
| `en/templates/pages/admin/comparison-edit.html` | 6 | 0 |
| `en/templates/pages/comparison.html` | 1 | 1 |
| `en/test/site-upgrades.test.js` | 66 | 0 |
| `en/worker/api.js` | 6 | 1 |
| `en/worker/comparison-fields.js` | 8 | 2 |
| `en/worker/controllers.js` | 25 | 16 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-1-comparison-design.patch
git apply ~/storage/downloads/lummet-tenant-v18-1-comparison-design.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-1-comparison-design-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-1-comparison-design-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-1-comparison-design-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.1: comparison design, custom values, top save bar"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 62`. Hard-refresh after the deploy (old scripts and styles may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
