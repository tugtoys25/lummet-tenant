# Release: chat widget script written as parts (tenant v22.49)

Built on tenant v22.48. Control plane untouched. **No migration. No behaviour change.** `en/static/js/lummet-ai.js` (596 lines, one function wrapper) is now generated from `_head.js`, eight numbered parts and `_tail.js` in `en/js-src/lummet-ai/` by `scripts/build-js.mjs`, which now supports a wrapper kept in `_head.js` and `_tail.js`. It stays one file, so the widget costs no extra request on any page. Parts: state, session and suggestions, `init`, window and input, send and stream, sign-in gate and messages, feedback and follow-ups, typing, scrolling, clear and markdown. Docs: `docs/ARCHITECTURE_JS.md`, `docs/PLATFORM_UPGRADES.md` section 87. `test/js-build.test.js` now covers both scripts (7 tests).

## Proof the behaviour is the same

- The generated `static/js/lummet-ai.js` is **byte-identical** to the old file (`cmp`): same URL, same bytes, same asset version. `app.js` is unchanged.
- Each part is checked inside the wrapper (so one that closes a block it did not open fails), head and tail must go together, `base.html` still loads one of each script, and `build-js.mjs --check`, `build-css.mjs --check` and `asset-version.mjs --check` pass.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **15** | **650** | **11** |

New: 10, modified: 5, deleted: 0. Tests: **1,314 pass** (1,312 before + 2 for the second script). Migrations: **none**.

## New files (10)

| File | + | - |
|---|---:|---:|
| `en/js-src/lummet-ai/01-state.js` | 13 | 0 |
| `en/js-src/lummet-ai/02-session-and-suggestions.js` | 47 | 0 |
| `en/js-src/lummet-ai/03-init.js` | 106 | 0 |
| `en/js-src/lummet-ai/04-window-and-input.js` | 28 | 0 |
| `en/js-src/lummet-ai/05-send-and-stream.js` | 135 | 0 |
| `en/js-src/lummet-ai/06-auth-gate-and-messages.js` | 63 | 0 |
| `en/js-src/lummet-ai/07-feedback-and-follow-ups.js` | 82 | 0 |
| `en/js-src/lummet-ai/08-typing-scroll-clear-markdown.js` | 114 | 0 |
| `en/js-src/lummet-ai/_head.js` | 7 | 0 |
| `en/js-src/lummet-ai/_tail.js` | 1 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_JS.md` | 23 | 0 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/js-src/README.md` | 1 | 1 |
| `en/scripts/build-js.mjs` | 10 | 2 |
| `en/test/js-build.test.js` | 11 | 8 |

## Install (Termux)

Needs v22.48 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-49-lummet-ai-js-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-49-lummet-ai-js-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/js-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.49: chat widget script written as 8 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1314`, `fail 0`.

Nothing visible changes (same script bytes). To confirm, open any page after a hard refresh and use the chat widget: open it, send a question, give a thumbs up, clear the conversation.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
