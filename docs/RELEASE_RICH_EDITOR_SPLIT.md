# Release: rich editor split into ES modules (tenant v22.18)

Built on tenant v22.17. Control plane untouched. **No migration.** `en/static/js/rich-editor.js` stays as a small entry module; its body moves into 12 modules in `en/static/js/rich-editor/`.

## Why

`en/static/js/rich-editor.js` was 1,927 lines in one closure (about 60 private functions: TinyMCE setup, image and video dialogs, ad inserter, callout box, internal links, the public `RichEditor` API). Fifth step of the restructuring (API v22.14, controllers v22.15, admin script v22.16, dashboard script v22.17).

Unlike the admin and dashboard scripts, this file cannot become plain scripts: its names are private, and as globals they could collide with other admin scripts. So the parts are **ES modules** with explicit imports.

## What changed

- **12 new modules in `en/static/js/rich-editor/`** (config, utils, autosave, image-upload, editor-config, image-dialog, video, ad-inserter, callout, internal-link, tinymce-init, api). No part imports the entry.
- **`en/static/js/rich-editor.js`** is the entry: the header comment, the form hook, bootstrap and `window.RichEditor = RichEditor`.
- **`en/templates/layout/base.html`**: an import map and `<script type="module" src="/static/js/rich-editor.js">`, in the admin-only block where the old script was. Public pages are unaffected.
- **`en/worker/static-assets.js`**: `versionAssetUrls` also puts `?v=<hash>` on the import map values, so parts are versioned and cached like every other asset (a release never mixes old and new parts).
- `en/worker/asset-version.js` is regenerated. `docs/ARCHITECTURE_RICH_EDITOR.md` lists every part and its imports. `docs/PLATFORM_UPGRADES.md` section 56.
- Tests: new `test/rich-editor-structure.test.js` (5 tests); a new import-map test in `perf-assets.test.js` (and the blocking-script check accepts module scripts); `generic-review-editor.test.js` reads all parts through `test/support/rich-editor-source.js`.

## Proof the behaviour is the same

- A tokenizer check: every top-level statement of the old file exists once in the new files, **token for token**. Only `import`/`export` were added, the 4-space indent was removed, and four shared state variables moved next to the one function that assigns them.
- Imports were generated from scope analysis (every reference to a name owned by another part), not by hand; a write to an imported name would have stopped the build.
- **Headless Chromium, 60 admin pages (10 with an editor)**, old vs new, with TinyMCE replaced by a recording stub: the same `RichEditor` API, the same **374 TinyMCE calls and options**, the same global functions, and the same console messages (the only differences are service-worker noise from the test setup, which varies between runs).

## Compatibility

ES modules and import maps need Chrome 89+, Edge 89+, Firefox 108+ or Safari 16.4+. Only admin pages load the editor, and TinyMCE 7 needs a similarly recent browser anyway. Public pages load no module.

## Numbers

Counted with `git diff --numstat` against v22.17, excluding the three generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **22** | **2076** | **1887** |

New: 15, modified: 7, deleted: 0. Tests: **1,183 pass** (full suite: 1,177 before + 5 structure + 1 import map). Migrations: **none**.

## New files (15)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_RICH_EDITOR.md` | 51 | 0 |
| `en/static/js/rich-editor/ad-inserter.js` | 298 | 0 |
| `en/static/js/rich-editor/api.js` | 157 | 0 |
| `en/static/js/rich-editor/autosave.js` | 51 | 0 |
| `en/static/js/rich-editor/callout.js` | 169 | 0 |
| `en/static/js/rich-editor/config.js` | 28 | 0 |
| `en/static/js/rich-editor/editor-config.js` | 125 | 0 |
| `en/static/js/rich-editor/image-dialog.js` | 111 | 0 |
| `en/static/js/rich-editor/image-upload.js` | 92 | 0 |
| `en/static/js/rich-editor/internal-link.js` | 250 | 0 |
| `en/static/js/rich-editor/tinymce-init.js` | 292 | 0 |
| `en/static/js/rich-editor/utils.js` | 99 | 0 |
| `en/static/js/rich-editor/video.js` | 167 | 0 |
| `en/test/rich-editor-structure.test.js` | 60 | 0 |
| `en/test/support/rich-editor-source.js` | 16 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 11 | 0 |
| `en/static/js/rich-editor.js` | 64 | 1883 |
| `en/templates/layout/base.html` | 20 | 1 |
| `en/test/generic-review-editor.test.js` | 2 | 1 |
| `en/test/perf-assets.test.js` | 9 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |
| `en/worker/static-assets.js` | 3 | 0 |

## Install (Termux)

Needs v22.17 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-18-rich-editor-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-18-rich-editor-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/rich-editor-structure.test.js test/perf-assets.test.js test/generic-review-editor.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.18: rich editor split into ES modules"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current`, the focused set to pass, and the full suite `pass 1183`, `fail 0`. Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, open a page with an editor in a private tab (Dashboard -> News -> create, or a Review) and check: the editor toolbar appears, the image button opens the dialog, the source-code button works, and the browser console shows no red errors. Hard refresh once if the toolbar is missing.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
