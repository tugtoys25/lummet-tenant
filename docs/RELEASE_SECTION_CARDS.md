# Release: enterprise section cards (tenant v19.5)

Built on tenant v19.4. Control plane untouched. Nothing removed, no migration.

## What changed

- Review fields and sections render as modern white cards: accent edge, icon chip, title with divider, readable body, check-mark lists, numbered steps, styled tables and quotes. Verdict is highlighted; pros and cons are green and red cards; FAQ items are tidy. Casino and generic reviews share the look.
- All section ids are kept, so the sticky bar and jump links are unchanged. A stray pair of curly braces printed on casino reviews was removed.
- One test added. Details: `docs/PLATFORM_UPGRADES.md` section 21.

## Numbers

Counted with `git diff --numstat` against v19.4, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **139** | **24** |

New: 0, modified: 5, deleted: 0. Tests: 1015 pass (full suite); focused set (4 files) 143 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/static/css/review-sections.css` | 93 | 0 |
| `en/templates/pages/generic-review.html` | 6 | 6 |
| `en/templates/pages/review.html` | 29 | 18 |
| `en/test/generic-review-editor.test.js` | 7 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v19-5-section-cards.patch
git apply ~/storage/downloads/lummet-tenant-v19-5-section-cards.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v19-5-section-cards-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v19-5-section-cards-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v19-5-section-cards-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v19.5: section cards"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 143`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
