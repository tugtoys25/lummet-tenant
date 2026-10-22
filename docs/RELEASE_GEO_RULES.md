# Release: geo rules manager (tenant v19.8)

Built on tenant v19.7. Control plane untouched. Nothing removed, no migration.

## What changed

- New **Geo rules** tab on the Reviews screen: one place to see and change country rules for casinos, sportsbooks, affiliate partners and custom content. List with mode and country count, "show status in a country", an editor (allow-list, block-list or custom per country, presets, casino bonus overrides, a live "check a country" box, unsaved-changes warning), bulk set / copy / clear, CSV export and checked import, and editable country presets.
- Same tables and same visitor decision as before; no change to how the public pages evaluate rules. No migration.
- Tests: 13 added. Details: `docs/PLATFORM_UPGRADES.md` section 24.

## Numbers

Counted with `git diff --numstat` against v19.7, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **9** | **839** | **1** |

New: 3, modified: 6, deleted: 0. Tests: 1030 pass (full suite); focused set (5 files) 158 pass. Migrations: **none**.
Deleted files: **none**.

## New files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/geo-rules-admin.js` | 339 | 0 |
| `en/test/geo-manager.test.js` | 145 | 0 |
| `en/worker/geo-manager.js` | 298 | 0 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 13 | 0 |
| `en/static/css/header-hero.css` | 29 | 0 |
| `en/static/js/review-tabs.js` | 1 | 1 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/reviews.html` | 7 | 0 |
| `en/worker/api.js` | 6 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-8-geo-rules.patch
git apply ~/storage/downloads/lummet-tenant-v19-8-geo-rules.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-8-geo-rules-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-8-geo-rules-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-8-geo-rules-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.8: geo rules manager"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 158`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
