# Release: sections and sticky bar on casino reviews (tenant v18.6)

Built on tenant v18.5. Control plane untouched. Nothing removed, no migration.

## What changed

- **Public casino review** (`/en/review/slug`) prints all eight section types and shows the sticky section bar. The bar lists
  only what is really on the page, so there are no dead tabs. FAQ sections add FAQPage schema.
- **Casino Reviews dashboard** has a new **Review sections** panel: search and pick a review, build sections, Save.
  The classic one-block form stays below it.
- `review-blocks/sync` accepts `sections` and checks them; `review-blocks/list` also returns typed `sections`.
- Details: `docs/PLATFORM_UPGRADES.md` section 13.

## Numbers

Counted with `git diff --numstat` against v18.5, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **127** | **21** |

New: 1, modified: 7, deleted: 0. Tests: 1007 pass (full suite); focused set 87 pass. Migrations: **none**.
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/review-sections-admin.js` | 47 | 0 |

## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/reviews.html` | 18 | 1 |
| `en/templates/pages/review.html` | 6 | 15 |
| `en/test/generic-review-editor.test.js` | 19 | 0 |
| `en/worker/api.js` | 10 | 3 |
| `en/worker/controllers.js` | 17 | 2 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-6-casino-review-sections.patch
git apply ~/storage/downloads/lummet-tenant-v18-6-casino-review-sections.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-6-casino-review-sections-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-6-casino-review-sections-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-6-casino-review-sections-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.6: sections and sticky bar on casino reviews"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 87`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
