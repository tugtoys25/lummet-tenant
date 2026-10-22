# Release: research PDF script written as parts (tenant v22.52)

Built on tenant v22.51. Control plane untouched. **No migration. No behaviour change.** `en/static/js/research-pdf-export.js` (573 lines, one function wrapper) is now generated from `_head.js`, five numbered parts and `_tail.js` in `en/js-src/research-pdf-export/` by `scripts/build-js.mjs`. It stays one file, loaded only by the research item page, so no request is added. Parts: helpers, drawing, sections, export, page buttons. Docs: `docs/ARCHITECTURE_JS.md`, `docs/PLATFORM_UPGRADES.md` section 90. `test/js-build.test.js` now covers three scripts (9 tests).

## Proof the behaviour is the same

- The generated `static/js/research-pdf-export.js` is **byte-identical** to the old file (`cmp`): same URL, same bytes, same asset version. No other browser file changed.
- Each part is checked inside the wrapper, the research page still loads exactly one `research-pdf-export.js` and no part files, and `build-js.mjs --check`, `build-css.mjs --check` and `asset-version.mjs --check` pass. A deliberate edit to one part makes the tests fail.

## Numbers

Counted with `git diff --numstat` against v22.51. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **12** | **610** | **9** |

New: 7, modified: 5, deleted: 0. Tests: **1,328 pass** (1,326 before + 2 for the third script). Migrations: **none**.

## New files (7)

| File | + | - |
|---|---:|---:|
| `en/js-src/research-pdf-export/01-helpers.js` | 95 | 0 |
| `en/js-src/research-pdf-export/02-drawing.js` | 128 | 0 |
| `en/js-src/research-pdf-export/03-sections.js` | 129 | 0 |
| `en/js-src/research-pdf-export/04-export.js` | 115 | 0 |
| `en/js-src/research-pdf-export/05-page.js` | 79 | 0 |
| `en/js-src/research-pdf-export/_head.js` | 26 | 0 |
| `en/js-src/research-pdf-export/_tail.js` | 1 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_JS.md` | 17 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/js-src/README.md` | 1 | 1 |
| `en/scripts/build-js.mjs` | 1 | 1 |
| `en/test/js-build.test.js` | 9 | 6 |

## Install (Termux)

Needs v22.51 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-52-research-pdf-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-52-research-pdf-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/js-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.52: research PDF script written as 5 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1328`, `fail 0`.

Nothing visible changes (same script bytes). To confirm, open a research item page after a hard refresh and press Download PDF.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
