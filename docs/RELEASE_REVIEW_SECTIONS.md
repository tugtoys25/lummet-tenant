# Release: review sections, sticky section bar, author hub (tenant v18.5)

Built on tenant v18.4. Control plane untouched. Nothing removed, no migration.

## What changed

- **One public address.** Sportsbook, partner and custom-type reviews no longer appear in `/en/review`, its lists, API or
  search. Each lives only at its dedicated path; old `/en/review/slug` links 301 to it.
- **Eight section types** with real pickers: Text, FAQ (questions and answers), Images + text (single, grids, fit, size,
  alignment), Payment methods (one by one or bulk, with text), Picked items (casinos, reviews, news, research, updates,
  pages, any source, or a URL), Cards and grids, Callout, Key figures.
- **Sticky section bar** built from every section header: stays on scroll, highlights the current section, scrolls
  smoothly, works on phones, reading-progress line.
- **Wide tables scroll** sideways inside their section.
- **Search-and-pick** for the casino slug (add review form) and the reviewed item (generic review form).
- **Author page** shows counts and full lists: casino and other reviews, research, news, updates, sportsbooks and partners,
  comparisons, country pages, best lists, pages.
- Details: `docs/PLATFORM_UPGRADES.md` section 12.

## Numbers

Counted with `git diff --numstat` against v18.4, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **23** | **1358** | **215** |

New: 6, modified: 17, deleted: 0. Tests: 1006 pass (full suite); focused set 86 pass. Migrations: **none** (sections use `review_blocks`).
Deleted files: **none**.

## New files (6)

| File | + | - |
|---|---:|---:|
| `en/static/css/review-sections.css` | 126 | 0 |
| `en/static/js/entity-picker.js` | 96 | 0 |
| `en/static/js/section-builder.js` | 340 | 0 |
| `en/static/js/section-nav.js` | 87 | 0 |
| `en/worker/author-hub.js` | 105 | 0 |
| `en/worker/review-urls.js` | 30 | 0 |

## Modified files (17)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 24 | 0 |
| `en/static/css/authors.css` | 26 | 0 |
| `en/static/css/header-hero.css` | 43 | 0 |
| `en/static/js/generic-review-admin.js` | 45 | 123 |
| `en/templates/layout/base.html` | 4 | 0 |
| `en/templates/pages/admin/generic-reviews.html` | 5 | 4 |
| `en/templates/pages/admin/reviews.html` | 1 | 1 |
| `en/templates/pages/author.html` | 3 | 39 |
| `en/templates/pages/generic-review.html` | 4 | 1 |
| `en/test/generic-review-editor.test.js` | 106 | 5 |
| `en/test/newsroom-authors-discovery.test.js` | 1 | 1 |
| `en/worker/api.js` | 5 | 5 |
| `en/worker/component-sources.js` | 4 | 2 |
| `en/worker/content-notifications.js` | 1 | 1 |
| `en/worker/controllers.js` | 31 | 6 |
| `en/worker/generic-review-sections.js` | 265 | 23 |
| `en/worker/site-search.js` | 6 | 4 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-5-review-sections.patch
git apply ~/storage/downloads/lummet-tenant-v18-5-review-sections.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-5-review-sections-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-5-review-sections-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-5-review-sections-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.5: review sections, sticky section bar, author hub"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 86`. Hard-refresh after the deploy (old scripts and styles may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
