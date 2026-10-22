# Release: admin script split into files (tenant v22.16)

Built on tenant v22.15. Control plane untouched. **No migration.** One file is deleted: `en/static/js/admin.js`, replaced by 27 files in `en/static/js/admin/` that, joined in order, are identical to it.

## Why

`en/static/js/admin.js` was 8,051 lines (202 functions: reviews, news, pages, settings, homepage builder, research, payment methods, platform updates, ad rules, SEO pages). Third step of the restructuring (after the API in v22.14 and the controllers in v22.15).

## What changed

- **27 new plain scripts in `en/static/js/admin/`** (`reviews.js`, `news.js`, `homepage-builder.js`, `research-*.js`, `ad-rules.js`, ...). Cut only between top-level statements; each file parses on its own.
- **`en/templates/layout/base.html`** loads them in the admin-only block, in the old order, where `admin.js` was. Public pages are unaffected.
- **`en/scripts/asset-version.mjs`** hashes sub-folders too, so a changed part gets a new `?v=` URL. `en/worker/asset-version.js` is regenerated.
- `docs/ARCHITECTURE_ADMIN_JS.md` explains the order rules and lists every file. `docs/PLATFORM_UPGRADES.md` section 54.
- Tests: new `test/admin-js-structure.test.js` (5 tests). Three older tests that read the admin script as text now read all the parts through `test/support/admin-js-source.js`; one script-order assertion in `test/perf-assets.test.js` now names the first part.

## Proof the behaviour is the same

- The 27 files joined in order are **byte-identical** to the old file (checked while splitting).
- **Headless Chromium, 59 admin pages** (dashboard, every list and form page, research, settings, ...) loaded with the old single file and with the 27 parts: the same **439 global functions** on every page, **no page errors**, all inline `onclick` handlers resolve. The only console messages are test-environment ones (no TinyMCE, no live API) and identical for both.

## Cost

An admin page loads 26 more small script files than before. They are cached for a year per release (`?v=` hash), so only the first visit after a deploy pays. Say so if you want them concatenated back into one served file later.

## Numbers

Counted with `git diff --numstat` against v22.15, excluding the three generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **38** | **8239** | **8065** |

New: 30, modified: 7, deleted: 1. Tests: **1,172 pass** (full suite: 1,167 before + 5 new). Migrations: **none**.

## New files (30)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ADMIN_JS.md` | 51 | 0 |
| `en/static/js/admin/ad-rules.js` | 241 | 0 |
| `en/static/js/admin/ai-generator.js` | 68 | 0 |
| `en/static/js/admin/categories.js` | 166 | 0 |
| `en/static/js/admin/category-country-pages.js` | 254 | 0 |
| `en/static/js/admin/content-edit-actions.js` | 515 | 0 |
| `en/static/js/admin/countries.js` | 191 | 0 |
| `en/static/js/admin/country-pages.js` | 236 | 0 |
| `en/static/js/admin/homepage-builder.js` | 1175 | 0 |
| `en/static/js/admin/html-escape.js` | 21 | 0 |
| `en/static/js/admin/init.js` | 32 | 0 |
| `en/static/js/admin/news.js` | 228 | 0 |
| `en/static/js/admin/pages.js` | 109 | 0 |
| `en/static/js/admin/payment-methods.js` | 288 | 0 |
| `en/static/js/admin/platform-updates-init.js` | 24 | 0 |
| `en/static/js/admin/platform-updates.js` | 793 | 0 |
| `en/static/js/admin/research-content-builder.js` | 705 | 0 |
| `en/static/js/admin/research-datasets.js` | 367 | 0 |
| `en/static/js/admin/research-relations.js` | 161 | 0 |
| `en/static/js/admin/research-review-queue.js` | 144 | 0 |
| `en/static/js/admin/research-sources-claims.js` | 314 | 0 |
| `en/static/js/admin/research-versions.js` | 107 | 0 |
| `en/static/js/admin/research.js` | 147 | 0 |
| `en/static/js/admin/reviews.js` | 135 | 0 |
| `en/static/js/admin/seo-pages.js` | 402 | 0 |
| `en/static/js/admin/settings-form.js` | 675 | 0 |
| `en/static/js/admin/settings.js` | 380 | 0 |
| `en/static/js/admin/theme-presets.js` | 173 | 0 |
| `en/test/admin-js-structure.test.js` | 65 | 0 |
| `en/test/support/admin-js-source.js` | 17 | 0 |

## Deleted files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/admin.js` | 0 | 8051 |

## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/scripts/asset-version.mjs` | 10 | 8 |
| `en/templates/layout/base.html` | 28 | 1 |
| `en/test/component-studio.test.js` | 3 | 2 |
| `en/test/header-hero.test.js` | 2 | 1 |
| `en/test/perf-assets.test.js` | 1 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-16-admin-js-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-16-admin-js-split.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-16-admin-js-split-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-16-admin-js-split-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-16-admin-js-split-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/admin-js-structure.test.js test/perf-assets.test.js test/component-studio.test.js test/header-hero.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.16: admin script split into static/js/admin/"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current`, the focused set to pass, and the full suite `pass 1172`, `fail 0` (about 12 minutes on a phone). Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, hard-refresh the dashboard (or open it in a private tab) and check: Reviews list, News list, Settings (homepage sections and theme presets), Research, Ad rules, Country pages. Browser console should show no red errors.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
