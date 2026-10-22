# Release: newsroom admin script written as parts (tenant v22.57)

Built on tenant v22.56. Control plane untouched. **No migration. No behaviour change.** `en/static/js/newsroom-admin.js` (519 lines, one function wrapper) is now generated from `_head.js`, seven numbered parts and `_tail.js` in `en/js-src/newsroom-admin/` by `scripts/build-js.mjs`. It stays one file, loaded only by the newsroom admin page, so no request is added. Parts: core, tabs and queues, article, taxonomy and homepage, search and analytics, authors, flags and policies, start. Docs: `docs/ARCHITECTURE_JS.md`, `docs/PLATFORM_UPGRADES.md` section 95. `test/js-build.test.js` now covers five scripts (13 tests).

## Proof the behaviour is the same

- The generated `static/js/newsroom-admin.js` is **byte-identical** to the old file (`cmp`): same URL, same bytes, same asset version. No other browser file changed.
- Each part is checked inside the wrapper, the newsroom admin page still loads exactly one `newsroom-admin.js` and no part files, and the two existing tests that read the script (safety rules, and a vm end-to-end run of the real file) pass unchanged, and `build-js.mjs --check`, `build-css.mjs --check` and `asset-version.mjs --check` pass. A deliberate edit to one part makes the tests fail.

## Numbers

Counted with `git diff --numstat` against v22.56. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **552** | **6** |

New: 9, modified: 5, deleted: 0. Tests: **1,349 pass** (1,347 before + 2 for the fifth script). Migrations: **none**.

## New files (9)

| File | + | - |
|---|---:|---:|
| `en/js-src/newsroom-admin/01-core.js` | 47 | 0 |
| `en/js-src/newsroom-admin/02-tabs-and-queues.js` | 43 | 0 |
| `en/js-src/newsroom-admin/03-article.js` | 143 | 0 |
| `en/js-src/newsroom-admin/04-taxonomy-and-homepage.js` | 84 | 0 |
| `en/js-src/newsroom-admin/05-search-and-analytics.js` | 92 | 0 |
| `en/js-src/newsroom-admin/06-authors-flags-policies.js` | 96 | 0 |
| `en/js-src/newsroom-admin/07-start.js` | 7 | 0 |
| `en/js-src/newsroom-admin/_head.js` | 6 | 0 |
| `en/js-src/newsroom-admin/_tail.js` | 1 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_JS.md` | 19 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/js-src/README.md` | 1 | 1 |
| `en/scripts/build-js.mjs` | 1 | 1 |
| `en/test/js-build.test.js` | 3 | 3 |

## Install (Termux)

Needs v22.56 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-57-newsroom-admin-js-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-57-newsroom-admin-js-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/js-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.57: newsroom admin script written as 7 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1349`, `fail 0`.

Nothing visible changes (same script bytes). To confirm, open Dashboard > Newsroom after a hard refresh: switch through the tabs (queues, article, taxonomy, homepage, search, analytics, authors, flags, policies).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
