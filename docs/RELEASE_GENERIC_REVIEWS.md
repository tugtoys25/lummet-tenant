# Release: reviews for generic content (tenant v18.4)

Built on tenant v18.3. Control plane untouched. Nothing removed, no migration.

## What changed

- **One route.** List, add and edit are all on `/en/dashboard/reviews/generic` (`?new=1`, `?edit=ID`). The old add and
  edit addresses redirect there.
- **Content uses the rich editor** (old plain-text reviews still read the same).
- **Sections are real:** a builder with the full editor per section, quick-add chips, move/duplicate/collapse/remove,
  and they now **show on the public review page** (before, they were saved but never printed).
- **Pickers** in every rich editor: **Page** (link to any page/item) and **Items** (links with pictures, or a picture).
- Safer saving (sanitized output, slug and empty-body checks), sections removed with their review, unsaved-changes
  guard, Ctrl/Cmd+S, SEO length counters. Details: `docs/PLATFORM_UPGRADES.md` section 11.

## Numbers

Counted with `git diff --numstat` against v18.3, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **807** | **34** |

Tests: 1000 pass; 9 new. Migrations: **none** (sections use the existing `review_blocks` table). Deleted files: **none**.
The old `generic-review-create.html` / `generic-review-edit.html` templates stay in the repo, unused.

## New files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/generic-review-admin.js` | 370 | 0 |
| `en/test/generic-review-editor.test.js` | 112 | 0 |
| `en/worker/generic-review-sections.js` | 58 | 0 |

## Modified files (10)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/css/header-hero.css` | 38 | 0 |
| `en/static/js/dashboard.js` | 2 | 1 |
| `en/static/js/rich-editor.js` | 55 | 1 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/generic-reviews.html` | 109 | 26 |
| `en/templates/pages/generic-review.html` | 2 | 0 |
| `en/worker/api.js` | 25 | 3 |
| `en/worker/controllers.js` | 20 | 3 |
| `en/worker/database/generic-reviews.js` | 3 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-4-generic-reviews.patch
git apply ~/storage/downloads/lummet-tenant-v18-4-generic-reviews.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-4-generic-reviews-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-4-generic-reviews-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-4-generic-reviews-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.4: generic reviews, one route, rich editor, sections"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 80`. Hard-refresh after the deploy (old scripts and styles may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
