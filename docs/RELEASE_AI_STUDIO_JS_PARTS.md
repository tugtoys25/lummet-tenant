# Release: AI Studio admin script written as parts (tenant v22.56)

Built on tenant v22.55. Control plane untouched. **No migration. No behaviour change.** `en/static/js/ai-studio.js` (540 lines, one function wrapper) is now generated from `_head.js`, seven numbered parts and `_tail.js` in `en/js-src/ai-studio/` by `scripts/build-js.mjs`. It stays one file, loaded by the dashboard layout, so no request is added. Parts: core, screens and run, result, chat settings and gaps, chat feedback, history and audit, start. Docs: `docs/ARCHITECTURE_JS.md`, `docs/PLATFORM_UPGRADES.md` section 94. `test/js-build.test.js` now covers four scripts (11 tests).

## Proof the behaviour is the same

- The generated `static/js/ai-studio.js` is **byte-identical** to the old file (`cmp`): same URL, same bytes, same asset version. No other browser file changed.
- Each part is checked inside the wrapper, the dashboard layout still loads exactly one `ai-studio.js` and no part files, and `build-js.mjs --check`, `build-css.mjs --check` and `asset-version.mjs --check` pass. A deliberate edit to one part makes the tests fail.

## Numbers

Counted with `git diff --numstat` against v22.55. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **572** | **5** |

New: 9, modified: 5, deleted: 0. Tests: **1,347 pass** (1,345 before + 2 for the fourth script). Migrations: **none**.

## New files (9)

| File | + | - |
|---|---:|---:|
| `en/js-src/ai-studio/01-core.js` | 63 | 0 |
| `en/js-src/ai-studio/02-screens-and-run.js` | 121 | 0 |
| `en/js-src/ai-studio/03-result.js` | 69 | 0 |
| `en/js-src/ai-studio/04-chat-settings-and-gaps.js` | 86 | 0 |
| `en/js-src/ai-studio/05-chat-feedback.js` | 134 | 0 |
| `en/js-src/ai-studio/06-history-and-audit.js` | 58 | 0 |
| `en/js-src/ai-studio/07-start.js` | 5 | 0 |
| `en/js-src/ai-studio/_head.js` | 3 | 0 |
| `en/js-src/ai-studio/_tail.js` | 1 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_JS.md` | 19 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/js-src/README.md` | 1 | 1 |
| `en/scripts/build-js.mjs` | 1 | 1 |
| `en/test/js-build.test.js` | 2 | 2 |

## Install (Termux)

Needs v22.55 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-56-ai-studio-js-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-56-ai-studio-js-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/js-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.56: AI Studio admin script written as 7 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1347`, `fail 0`.

Nothing visible changes (same script bytes). To confirm, open Dashboard > AI Studio after a hard refresh: pick a tool, run it, and open the History and Content audit sections.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
