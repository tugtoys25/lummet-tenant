# Release: summary card on generic reviews (tenant v19.3)

Built on tenant v19.2. Control plane untouched. Nothing removed, no migration.

## What changed

- Sportsbook, affiliate-partner and custom reviews now show the same modern summary card as casino reviews: rating with star fill, then Item/Product, Reviewed by and Updated. Empty facts are skipped.
- One test added. Details: `docs/PLATFORM_UPGRADES.md` section 19.

## Numbers

Counted with `git diff --numstat` against v19.2, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **26** | **5** |

New: 0, modified: 4, deleted: 0. Tests: 1014 pass (full suite); focused set (4 files) 142 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/templates/pages/generic-review.html` | 2 | 5 |
| `en/test/generic-review-editor.test.js` | 8 | 0 |
| `en/worker/controllers.js` | 12 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-3-generic-summary-card.patch
git apply ~/storage/downloads/lummet-tenant-v19-3-generic-summary-card.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-3-generic-summary-card-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-3-generic-summary-card-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-3-generic-summary-card-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.3: summary card on generic reviews"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 142`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
