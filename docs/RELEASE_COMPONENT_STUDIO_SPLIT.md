# Release: Component Studio script split (tenant v22.45)

Built on tenant v22.44. Control plane untouched. **No migration. No server change.** `en/static/js/component-studio.js` (649 lines, one function) becomes an entry module plus eight parts in `en/static/js/component-studio/`: `context`, `preview`, `widgets`, `forms`, `content`, `data`, `section`, `main`. They are wired by the import map in `base.html` (as the Header & Hero admin script is), and the script tag is now `type="module"` in the same place. Docs: `docs/ARCHITECTURE_COMPONENT_STUDIO.md`, `docs/PLATFORM_UPGRADES.md` section 83. New `test/component-studio-structure.test.js` (8 tests) and `test/support/component-studio-source.js`.

## What changed in the code, and nothing else

- `S` and `busy`, the only values reassigned across parts, are now `st.S` and `st.busy` (one shared object).
- Three element lookups got a `form &&` guard so the module can load on a page that has no editor; the early `return` became a guard in the entry; the event wiring is one function, `initComponentStudio()`.
- Token check against the old file: the differences are exactly those, the imports and exports, and the removed `"use strict"` (modules are strict).

## Proof the behaviour is the same

- **Headless Chromium on `/en/dashboard/components`, old vs new** (clock and random fixed, picker and media library stubbed): all 14 types; every field filled and toggled; up to 70 button clicks per type (add, remove, move, link, rich text commands); Advanced on and off; raw Settings and Content edits; `component:loaded`; reset; the invalid-Settings submit alert; mobile and desktop preview; five preview answers (ok, error with and without a message, network failure, empty). **200 snapshots, 129 preview and resolve requests and 11 alerts are identical.** The old file run twice matches itself, so the check is stable. Changing one message in each of four parts is detected.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **18** | **863** | **720** |

New: 11, modified: 6, deleted: 1. Tests: **1,298 pass** (1,290 before + 8 new). Migrations: **none**.

## New files (11)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_COMPONENT_STUDIO.md` | 17 | 0 |
| `en/static/js/component-studio/content.js` | 50 | 0 |
| `en/static/js/component-studio/context.js` | 52 | 0 |
| `en/static/js/component-studio/data.js` | 86 | 0 |
| `en/static/js/component-studio/forms.js` | 73 | 0 |
| `en/static/js/component-studio/main.js` | 67 | 0 |
| `en/static/js/component-studio/preview.js` | 30 | 0 |
| `en/static/js/component-studio/section.js` | 106 | 0 |
| `en/static/js/component-studio/widgets.js` | 273 | 0 |
| `en/test/component-studio-structure.test.js` | 64 | 0 |
| `en/test/support/component-studio-source.js` | 16 | 0 |

## Deleted files (1)

| File | + | - |
|---|---:|---:|
| `docs/RELEASE_RESEARCH_CONTROLLER_SPLIT.md` | 0 | 73 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/static/js/component-studio.js` | 4 | 642 |
| `en/templates/layout/base.html` | 10 | 2 |
| `en/test/component-studio.test.js` | 2 | 1 |
| `en/test/rich-editor-structure.test.js` | 2 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.44 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-45-component-studio-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-45-component-studio-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/component-studio-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.45: Component Studio script split into 8 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1298`, `fail 0`.

After deploy (hard refresh once) open Admin, Components. Pick each type in turn: the form must appear, and the preview must update. Try Content grid ("Search and add"), Data table (add a row), Section (add a block), then save a component.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
