# Release: landing pages form, author pictures, no empty tabs (tenant v18.7)

Built on tenant v18.6. Control plane untouched. Nothing removed, no migration.

## What changed

- **Landing pages admin (add and edit)** rebuilt as five steps: what it is about, items (hand-picked or automatic), page sections
  (all eight section types), publishing with an author, and a search-result preview with counters. Ctrl/Cmd+S, unsaved-changes
  guard, slug made from the title.
- **Public landing page** (`/en/best/slug`) shows the author line, a sticky section bar and the sections; FAQ adds schema.
- **Author page** cards show pictures for research, platform updates and country pages.
- **Casino review**: Pros & Cons and empty summary rows (and their tabs) no longer show when nothing was entered.
- Details: `docs/PLATFORM_UPGRADES.md` section 14.

## Numbers

Counted with `git diff --numstat` against v18.6, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **443** | **175** |

New: 1, modified: 13, deleted: 0. Tests: 1010 pass (full suite); focused set 90 pass. Migrations: **none**.
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/landing-page-admin.js` | 137 | 0 |

## Modified files (13)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/static/css/header-hero.css` | 14 | 0 |
| `en/static/css/review-sections.css` | 3 | 0 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/content-landing-page-create.html` | 78 | 55 |
| `en/templates/pages/admin/content-landing-page-edit.html` | 73 | 50 |
| `en/templates/pages/category.html` | 5 | 1 |
| `en/templates/pages/review.html` | 2 | 53 |
| `en/test/generic-review-editor.test.js` | 58 | 3 |
| `en/worker/api.js` | 19 | 1 |
| `en/worker/author-hub.js` | 8 | 8 |
| `en/worker/controllers.js` | 30 | 3 |
| `en/worker/database/content-landing-pages.js` | 5 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-7-landing-pages.patch
git apply ~/storage/downloads/lummet-tenant-v18-7-landing-pages.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-7-landing-pages-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-7-landing-pages-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-7-landing-pages-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.7: landing pages form, author pictures, no empty tabs"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 90`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
