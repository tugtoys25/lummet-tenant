# Release: component admin script written as parts (tenant v22.60)

Built on tenant v22.59. Control plane untouched. **No migration. No behaviour change.** `en/static/js/component-admin.js` (512 lines, global functions, no wrapper) is now generated from five numbered parts in `en/js-src/component-admin/` by `scripts/build-js.mjs`. It stays one file at the same path, loaded once by the dashboard layout, so no request is added. Parts: components, assignments, SEO meta, edit actions, custom page types. Docs: `docs/ARCHITECTURE_JS.md`, `docs/PLATFORM_UPGRADES.md` section 98. `test/js-build.test.js` now covers six scripts (15 tests).

## Proof the behaviour is the same

- The generated `static/js/component-admin.js` is **byte-identical** to the old file (`cmp`): same URL, same bytes, same asset version. No other browser file changed.
- Each part is checked on its own (it must parse), the dashboard layout still loads exactly one `component-admin.js` and no part files, and the two existing tests that read the script (`component-hero`, `component-page-types`) pass unchanged, and `build-js.mjs --check`, `build-css.mjs --check` and `asset-version.mjs --check` pass. A deliberate edit to one part makes the tests fail.

## Numbers

Counted with `git diff --numstat` against v22.59. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **10** | **540** | **5** |

New: 5, modified: 5, deleted: 0. Tests: **1,371 pass** (1,369 before + 2 for the sixth script). Migrations: **none**.

## New files (5)

| File | + | - |
|---|---:|---:|
| `en/js-src/component-admin/01-components.js` | 150 | 0 |
| `en/js-src/component-admin/02-assignments.js` | 140 | 0 |
| `en/js-src/component-admin/03-seo-meta.js` | 103 | 0 |
| `en/js-src/component-admin/04-edit-actions.js` | 83 | 0 |
| `en/js-src/component-admin/05-custom-page-types.js` | 36 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_JS.md` | 15 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/js-src/README.md` | 1 | 1 |
| `en/scripts/build-js.mjs` | 1 | 1 |
| `en/test/js-build.test.js` | 2 | 2 |

## Install (Termux)

Needs v22.59 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-60-component-admin-js-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-60-component-admin-js-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/js-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.60: component admin script written as 5 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1371`, `fail 0`.

Nothing visible changes (same script bytes). To confirm, open the dashboard's Components page after a hard refresh: add and edit a component, assign it to a page, and save an SEO meta entry.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
