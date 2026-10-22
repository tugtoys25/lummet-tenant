# Release: show boxes on every casino review field, tabs that always open the form (tenant v19.0)

Built on tenant v18.9. Control plane untouched. Nothing removed, no migration.

## What changed

- Casino review form: a **Show on page** checkbox and a **Fold** button on every field, and **Show all / Hide all** at the top.
  Unticked parts leave the public page and the sticky top bar. Saved at once when editing, or right after a new review is created.
- **+ Add / edit review** tab and **+ Add review** button open the form from any tab, every time (the tab used to show an empty page).
- Details: `docs/PLATFORM_UPGRADES.md` section 16.

## Numbers

Counted with `git diff --numstat` against v18.9, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **7** | **111** | **7** |

New: 1, modified: 6, deleted: 0. Tests: 1015 pass (full suite); focused set 95 pass. Migrations: **none**.
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/review-field-toggles.js` | 73 | 0 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 8 | 0 |
| `en/static/css/header-hero.css` | 9 | 0 |
| `en/static/js/review-tabs.js` | 15 | 4 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/reviews.html` | 2 | 2 |
| `en/test/generic-review-editor.test.js` | 3 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-0-review-field-toggles.patch
git apply ~/storage/downloads/lummet-tenant-v19-0-review-field-toggles.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-0-review-field-toggles-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-0-review-field-toggles-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-0-review-field-toggles-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.0: review field show boxes, tabs open the form"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 95`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
