# Release: summary card in white (tenant v19.4)

Built on tenant v19.3. Control plane untouched. Nothing removed, no migration.

## What changed

- The review summary card (casino and generic reviews) is now white with dark text, light tiles, amber stars and a visible "Read more" link. Fixed colours, so it stays readable whatever the site theme.
- CSS only. Details: `docs/PLATFORM_UPGRADES.md` section 20.

## Numbers

Counted with `git diff --numstat` against v19.3, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **2** | **15** | **10** |

New: 0, modified: 2, deleted: 0. Tests: 1014 pass (full suite); focused set (4 files) 142 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/static/css/review-sections.css` | 11 | 10 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-4-summary-card-white.patch
git apply ~/storage/downloads/lummet-tenant-v19-4-summary-card-white.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-4-summary-card-white-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-4-summary-card-white-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-4-summary-card-white-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.4: summary card white"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 142`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
