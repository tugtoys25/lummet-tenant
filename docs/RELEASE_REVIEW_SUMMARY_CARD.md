# Release: review summary card (tenant v19.2)

Built on tenant v19.1. Control plane untouched. Nothing removed, no migration.

## What changed

- The casino review "Review Summary" table is now a modern card: rating block with star fill, facts row (Casino, Reviewed by, Updated) and tiles for Best for, License, Payment methods and Bonuses.
- Long entries show a 150-character preview with a "Read more / Show less" toggle. Empty fields are skipped; the card disappears when nothing is filled. The hide/show checkbox for the summary still works.
- Details: `docs/PLATFORM_UPGRADES.md` section 18.

## Numbers

Counted with `git diff --numstat` against v19.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **56** | **17** |

New: 0, modified: 5, deleted: 0. Tests: 1016 pass (full suite); focused set (4 files) 141 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/static/css/review-sections.css` | 27 | 0 |
| `en/templates/pages/review.html` | 2 | 4 |
| `en/test/generic-review-editor.test.js` | 2 | 2 |
| `en/worker/controllers.js` | 21 | 11 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-2-review-summary-card.patch
git apply ~/storage/downloads/lummet-tenant-v19-2-review-summary-card.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-2-review-summary-card-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-2-review-summary-card-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-2-review-summary-card-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.2: review summary card"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 141`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
