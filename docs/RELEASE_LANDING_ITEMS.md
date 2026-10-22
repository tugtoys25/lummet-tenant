# Release: landing pages show their items (tenant v19.1)

Built on tenant v19.0. Control plane untouched. Nothing removed, no migration.

## What changed

- Landing pages (`/en/best/...`), hand-picked and automatic: items are now displayed. Before, an item with no country rules was
  treated as blocked everywhere, so the page showed none. Now only an item that has rules and is blocked in the visitor's country
  is left out. Items without rules show, with no availability badge.
- One older test that encoded the previous default was updated to the new rule.
- Details: `docs/PLATFORM_UPGRADES.md` section 17.

## Numbers

Counted with `git diff --numstat` against v19.0, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **35** | **6** |

New: 0, modified: 4, deleted: 0. Tests: 1016 pass (full suite); focused set (4 files) 141 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 6 | 0 |
| `en/test/generic-content-engine-remaining-gaps.test.js` | 6 | 5 |
| `en/test/generic-review-editor.test.js` | 9 | 0 |
| `en/worker/controllers.js` | 14 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-1-landing-items.patch
git apply ~/storage/downloads/lummet-tenant-v19-1-landing-items.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-1-landing-items-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-1-landing-items-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-1-landing-items-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.1: landing pages show their items"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 141`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
