# Release: review page look settings (tenant v19.7)

Built on tenant v19.6. Control plane untouched. Nothing removed, no migration.

## What changed

- New admin form **Review page look** (Admin, Reviews, "All reviews" tab, bottom): accent, card background, card text, heading and border colours, corner roundness, card shadow, and one accent for all parts or a colour per part. Live preview; Save publishes it to casino, sportsbook, partner and custom review pages.
- Only strict `#rrggbb` colours are accepted. "Back to defaults" restores the standard look.
- Tests: 3 added. Details: `docs/PLATFORM_UPGRADES.md` section 23.

## Numbers

Counted with `git diff --numstat` against v19.6, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **11** | **167** | **0** |

New: 2, modified: 9, deleted: 0. Tests: 1017 pass (full suite); focused set (4 files) 145 pass. Migrations: **none**.
Deleted files: **none**.

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/static/js/review-look-admin.js` | 50 | 0 |
| `en/worker/review-style.js` | 38 | 0 |

## Modified files (9)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/static/css/header-hero.css` | 11 | 0 |
| `en/static/css/review-sections.css` | 10 | 0 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/reviews.html` | 24 | 0 |
| `en/templates/pages/generic-review.html` | 1 | 0 |
| `en/templates/pages/review.html` | 1 | 0 |
| `en/test/generic-review-editor.test.js` | 22 | 0 |
| `en/worker/controllers.js` | 5 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-7-review-look.patch
git apply ~/storage/downloads/lummet-tenant-v19-7-review-look.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-7-review-look-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-7-review-look-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-7-review-look-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.7: review page look settings"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 145`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
