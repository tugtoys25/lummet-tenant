# Release: show/hide checkboxes, reviews tabs, author look (tenant v18.8)

Built on tenant v18.7. Control plane untouched. Nothing removed, no migration.

## What changed

- **Show checkbox on every section** and on every built-in casino review part (Overview, Games, Bonuses, Payments, Licensing,
  More details, Verdict, Pros and cons, FAQ, Summary, Related casinos). Off = content and top-bar tab both disappear.
- **Casino Reviews screen** now has tabs: All reviews, Add / edit review, Sections & page parts (no more long page).
- **Author page look** is manageable: colours, roundness and shadow in Authors > Author page look, with a live preview.
- **Count tiles** on the author page (and the top bar) jump to the exact heading once and stay there; no hover shaking.
- **Dropdowns and pickers** in the admin are solid white with dark text.
- Details: `docs/PLATFORM_UPGRADES.md` section 15.

## Numbers

Counted with `git diff --numstat` against v18.7, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **21** | **429** | **51** |

New: 4, modified: 17, deleted: 0. Tests: 1014 pass (full suite); focused set 94 pass. Migrations: **none**.
Deleted files: **none**.

## New files (4)

| File | + | - |
|---|---:|---:|
| `en/static/js/author-appearance-admin.js` | 52 | 0 |
| `en/static/js/review-tabs.js` | 25 | 0 |
| `en/worker/author-style.js` | 37 | 0 |
| `en/worker/review-visibility.js` | 36 | 0 |

## Modified files (17)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 13 | 0 |
| `en/static/css/authors.css` | 12 | 12 |
| `en/static/css/header-hero.css` | 38 | 6 |
| `en/static/css/review-sections.css` | 1 | 0 |
| `en/static/js/admin.js` | 2 | 1 |
| `en/static/js/review-sections-admin.js` | 16 | 3 |
| `en/static/js/section-builder.js` | 10 | 5 |
| `en/static/js/section-nav.js` | 53 | 6 |
| `en/templates/layout/base.html` | 2 | 0 |
| `en/templates/pages/admin/authors.html` | 22 | 0 |
| `en/templates/pages/admin/reviews.html` | 18 | 2 |
| `en/templates/pages/author.html` | 1 | 0 |
| `en/templates/pages/review.html` | 1 | 1 |
| `en/test/generic-review-editor.test.js` | 53 | 1 |
| `en/worker/api.js` | 5 | 1 |
| `en/worker/controllers.js` | 19 | 2 |
| `en/worker/generic-review-sections.js` | 13 | 11 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-8-show-hide-author-look.patch
git apply ~/storage/downloads/lummet-tenant-v18-8-show-hide-author-look.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-8-show-hide-author-look-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-8-show-hide-author-look-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-8-show-hide-author-look-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.8: show checkboxes, reviews tabs, author look"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 94`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
