# Release: white section bar (tenant v19.6)

Built on tenant v19.5. Control plane untouched. Nothing removed, no migration.

## What changed

- The sticky section bar (casino and generic reviews, author pages, landing pages) is white with a soft shadow, dark tab text, a blue active tab and a blue progress line, matching the section cards.
- CSS only. Details: `docs/PLATFORM_UPGRADES.md` section 22.

## Numbers

Counted with `git diff --numstat` against v19.5, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **2** | **15** | **0** |

New: 0, modified: 2, deleted: 0. Tests: 1015 pass (full suite); focused set (4 files) 143 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/static/css/review-sections.css` | 11 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-6-white-section-bar.patch
git apply ~/storage/downloads/lummet-tenant-v19-6-white-section-bar.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-6-white-section-bar-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-6-white-section-bar-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-6-white-section-bar-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.6: white section bar"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 143`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
