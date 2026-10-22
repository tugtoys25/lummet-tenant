# Release: Geo Rules section (tenant v19.9)

Built on tenant v19.8. Control plane untouched. Nothing removed, no migration.

## What changed

- New **Geo Rules** group in the admin menu, after Insights, with six pages: Rules (the v19.8 manager, now also taking typed codes), **Default rules**, **Bulk changes**, **Import & export**, **Presets**, **Country lookup**. The Reviews tab from v19.8 stays and links to the full section.
- **Default rules:** per type, choose what a newly registered item with no country rules gets: not available (today's behaviour), available to everyone, or available to everyone except a list. Applies on creation of casinos and content items; "Apply to items without rules" does the same for existing ones, with count and confirmation. Rules entered on the form always win.
- **Bulk changes:** pick items (ticked, all, only without rules, only with rules); set, add, remove, copy, give the default, or clear; type country codes separated by commas; preview, then confirm.
- Visitor evaluation is unchanged. No migration. Tests: 7 added. Details: `docs/PLATFORM_UPGRADES.md` section 25.

## Numbers

Counted with `git diff --numstat` against v19.8, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **15** | **637** | **23** |

New: 2, modified: 13, deleted: 0. Tests: 1037 pass (full suite); focused set (6 files) 179 pass. Migrations: **none**.
Deleted files: **none**.

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/static/js/geo-rules-pages.js` | 263 | 0 |
| `en/templates/pages/admin/geo-rules.html` | 19 | 0 |

## Modified files (13)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 13 | 0 |
| `en/static/css/header-hero.css` | 20 | 0 |
| `en/static/js/geo-rules-admin.js` | 61 | 10 |
| `en/templates/layout/admin-nav.html` | 11 | 0 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/reviews.html` | 1 | 0 |
| `en/test/dashboard-shell.test.js` | 1 | 1 |
| `en/test/geo-manager.test.js` | 97 | 1 |
| `en/worker/api.js` | 2 | 0 |
| `en/worker/controllers.js` | 13 | 0 |
| `en/worker/geo-manager.js` | 130 | 11 |
| `en/worker/index.js` | 3 | 0 |
| `en/worker/routes.js` | 2 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-9-geo-section.patch
git apply ~/storage/downloads/lummet-tenant-v19-9-geo-section.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-9-geo-section-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-9-geo-section-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-9-geo-section-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.9: Geo Rules section"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 179`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
