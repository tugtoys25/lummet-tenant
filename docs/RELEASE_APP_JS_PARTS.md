# Release: app.js written as parts (tenant v22.48)

Built on tenant v22.47. Control plane untouched. **No migration. No behaviour change.** `en/static/js/app.js` (622 lines) is now generated from five parts in `en/js-src/app/` by the new `scripts/build-js.mjs`, the script twin of the stylesheet build. It is built into the same single file, not loaded as five scripts, because every public page loads `app.js` and extra script tags would add requests (the public set is capped at 12 by `test/perf-assets.test.js`). Docs: `docs/ARCHITECTURE_JS.md`, `en/js-src/README.md`, `docs/PLATFORM_UPGRADES.md` section 86. New `test/js-build.test.js` (5 tests).

## Proof the behaviour is the same

- The generated `static/js/app.js` is **byte-identical** to the old file (`cmp`): same URL, same bytes, same asset version, one request.
- Each part is whole top-level statements and parses on its own (checked by the test), the parts joined equal the old file, and `build-js.mjs --check`, `build-css.mjs --check` and `asset-version.mjs --check` pass.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **10** | **749** | **0** |

New: 9, modified: 1, deleted: 0. Tests: **1,312 pass** (1,307 before + 5 new). Migrations: **none**.

## New files (9)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_JS.md` | 19 | 0 |
| `en/js-src/README.md` | 3 | 0 |
| `en/js-src/app/01-nav-and-sidebar.js` | 153 | 0 |
| `en/js-src/app/02-sidebar-countries-home-news-auth.js` | 160 | 0 |
| `en/js-src/app/03-mobile-search-nav-scroll-top.js` | 108 | 0 |
| `en/js-src/app/04-casino-bookmarks-init.js` | 62 | 0 |
| `en/js-src/app/05-bonus-toggle-and-bookmark-buttons.js` | 139 | 0 |
| `en/scripts/build-js.mjs` | 47 | 0 |
| `en/test/js-build.test.js` | 49 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (1)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |

## Install (Termux)

Needs v22.47 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-48-app-js-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-48-app-js-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/js-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.48: app.js written as 5 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1312`, `fail 0`.

Nothing visible changes (same script bytes). To confirm, open the home page on a phone width after a hard refresh: the menu, the sidebar and the scroll-to-top button must work.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
