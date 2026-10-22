# Release: dashboard script split into files (tenant v22.17)

Built on tenant v22.16. Control plane untouched. **No migration.** One file is deleted: `en/static/js/dashboard.js`, replaced by 13 files in `en/static/js/dashboard/` that, joined in order, are identical to it.

## Why

`en/static/js/dashboard.js` was 1,995 lines (52 functions: casinos table and form, content items, comparisons, custom types, landing pages, generic reviews, stats). Fourth step of the restructuring (API v22.14, controllers v22.15, admin script v22.16).

## What changed

- **13 new plain scripts in `en/static/js/dashboard/`**, cut only between top-level statements; each parses on its own.
- **`en/templates/layout/base.html`** loads them in the admin-only block, in the old order, where `dashboard.js` was. Public pages are unaffected.
- `en/worker/asset-version.js` is regenerated (the hash script already covers sub-folders since v22.16).
- `docs/ARCHITECTURE_DASHBOARD_JS.md` lists every file. `docs/PLATFORM_UPGRADES.md` section 55.
- Tests: new `test/dashboard-js-structure.test.js` (5 tests). Three older test files that read the script as text now read all the parts through `test/support/dashboard-js-source.js`.

## Proof the behaviour is the same

- The 13 files joined in order are **byte-identical** to the old file (checked while splitting).
- **Headless Chromium, 59 admin pages** loaded with the old single file and with the 13 parts: the same **439 global functions** on every page, **no page errors**, all 71 inline handlers resolve. The only console messages come from the test setup (no TinyMCE, no live API) and are identical for both.

## Cost

An admin page loads 12 more small script files. They are cached for a year per release (`?v=` hash).

## Numbers

Counted with `git diff --numstat` against v22.16, excluding the three generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **24** | **2137** | **2004** |

New: 16, modified: 7, deleted: 1. Tests: **1,177 pass** (full suite: 1,172 before + 5 new). Migrations: **none**.

## New files (16)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_DASHBOARD_JS.md` | 27 | 0 |
| `en/static/js/dashboard/casinos.js` | 179 | 0 |
| `en/static/js/dashboard/comparisons.js` | 349 | 0 |
| `en/static/js/dashboard/content-item-form-parts.js` | 147 | 0 |
| `en/static/js/dashboard/content-items.js` | 278 | 0 |
| `en/static/js/dashboard/content-landing-pages.js` | 196 | 0 |
| `en/static/js/dashboard/content-type-settings.js` | 46 | 0 |
| `en/static/js/dashboard/custom-types.js` | 103 | 0 |
| `en/static/js/dashboard/edit-forms.js` | 321 | 0 |
| `en/static/js/dashboard/generic-review-edit.js` | 102 | 0 |
| `en/static/js/dashboard/generic-reviews.js` | 134 | 0 |
| `en/static/js/dashboard/init.js` | 27 | 0 |
| `en/static/js/dashboard/list-pager.js` | 37 | 0 |
| `en/static/js/dashboard/stats.js` | 76 | 0 |
| `en/test/dashboard-js-structure.test.js` | 63 | 0 |
| `en/test/support/dashboard-js-source.js` | 16 | 0 |

## Deleted files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/dashboard.js` | 0 | 1995 |

## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/templates/layout/base.html` | 14 | 1 |
| `en/test/generic-content-engine-audit-fixes.test.js` | 3 | 2 |
| `en/test/generic-content-engine-geo-related-analytics.test.js` | 2 | 1 |
| `en/test/generic-content-engine-remaining-gaps.test.js` | 3 | 2 |
| `en/test/site-upgrades.test.js` | 3 | 2 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-17-dashboard-js-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-17-dashboard-js-split.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-17-dashboard-js-split-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-17-dashboard-js-split-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-17-dashboard-js-split-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/dashboard-js-structure.test.js test/admin-js-structure.test.js test/perf-assets.test.js test/site-upgrades.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.17: dashboard script split into static/js/dashboard/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current`, the focused set to pass, and the full suite `pass 1177`, `fail 0` (about 12 minutes on a phone). Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, open the dashboard in a private tab and check: Casinos (list, create, edit), Content items (list, create), Comparisons, Custom types, Generic reviews, Landing pages. The browser console should show no red errors.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
