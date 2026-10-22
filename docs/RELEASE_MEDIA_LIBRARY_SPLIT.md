# Release: media library split into ES modules (tenant v22.25)

Built on tenant v22.24. Control plane untouched. **No migration.** `en/static/js/media-library.js` (1,036 lines, one closure) stays as a small entry module; its body moves into 6 modules in `en/static/js/media-library/`.

## Why

Same reasons and same technique as the rich editor (v22.18): one closure of about 30 private functions cannot become plain scripts without leaking names into the global scope, so the parts are ES modules with explicit imports, versioned through an import map.

## What changed

- **6 new modules in `en/static/js/media-library/`**: config (endpoints, page size, `state`), utils, actions (API calls and button actions), views (layout, sidebar, grid, pagination), modals, events (`attachEventListeners`, `init`). `actions`, `views`, `modals` and `events` call each other, so they import each other in a loop; that is fine for modules because every call happens after loading.
- **`en/static/js/media-library.js`**: the header comment and `window.MediaLibrary = { init, loadMedia, loadFolders }`. Same public API.
- **`en/templates/layout/base.html`**: one import map for both editors (rich editor and media library), now before the first module script; the media library is a `<script type="module">`.
- **`en/templates/pages/admin/media.html`**: loads the entry as a module (it cannot be a classic script now; same URL as in `base.html`, so it runs once).
- `docs/ARCHITECTURE_MEDIA_LIBRARY.md`; `docs/PLATFORM_UPGRADES.md` section 63.
- New `test/media-library-structure.test.js` (3 tests); `rich-editor-structure.test.js` was updated for the shared import map.

## Proof the behaviour is the same

- Token for token: every top-level statement of the old file exists once in the new files; only `import`/`export` were added and the indent removed.
- **Media page in headless Chromium with a mocked API**, old vs new: the same screen after each of 10 interactions (type filter, sort, search, clear, new-folder modal, close, page 2, item click, folder click, folder menu), the same 8 API requests, the same exports.
- **60 admin pages** (10 with an editor): the same global functions, editor API, TinyMCE calls and console messages.

## Compatibility

Needs a browser with import maps (Chrome/Edge 89+, Firefox 108+, Safari 16.4+), as the rich editor already does since v22.18.

## Numbers

Counted with `git diff --numstat` against v22.24, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **1131** | **1033** |

New: 8, modified: 6, deleted: 0. Tests: **1,209 pass** (1,206 before + 3 new). Migrations: **none**.

## New files (8)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_MEDIA_LIBRARY.md` | 27 | 0 |
| `en/static/js/media-library/actions.js` | 214 | 0 |
| `en/static/js/media-library/config.js` | 37 | 0 |
| `en/static/js/media-library/events.js` | 123 | 0 |
| `en/static/js/media-library/modals.js` | 243 | 0 |
| `en/static/js/media-library/utils.js` | 76 | 0 |
| `en/static/js/media-library/views.js` | 319 | 0 |
| `en/test/media-library-structure.test.js` | 39 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/js/media-library.js` | 8 | 1007 |
| `en/templates/layout/base.html` | 26 | 20 |
| `en/templates/pages/admin/media.html` | 1 | 1 |
| `en/test/rich-editor-structure.test.js` | 5 | 4 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.24 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.25: media library split into ES modules"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and the full suite `pass 1209`, `fail 0`.

After deploy, open Dashboard -> Media in a private tab: folders on the left, the grid with thumbnails, the search box, the type filter, the New Folder dialog, and an upload should all work. Also open a news article editor and use its image picker (it shares the library). Hard refresh once if the page looks empty.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
## Numbers

Counted with `git diff --numstat` against v22.23, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **1131** | **1033** |

New: 8, modified: 6, deleted: 0. Tests: **1,206 pass** (no new tests; the admin structure test was updated). Migrations: **none**.

## New files (8)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_MEDIA_LIBRARY.md` | 27 | 0 |
| `en/static/js/media-library/actions.js` | 214 | 0 |
| `en/static/js/media-library/config.js` | 37 | 0 |
| `en/static/js/media-library/events.js` | 123 | 0 |
| `en/static/js/media-library/modals.js` | 243 | 0 |
| `en/static/js/media-library/utils.js` | 76 | 0 |
| `en/static/js/media-library/views.js` | 319 | 0 |
| `en/test/media-library-structure.test.js` | 39 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/js/media-library.js` | 8 | 1007 |
| `en/templates/layout/base.html` | 26 | 20 |
| `en/templates/pages/admin/media.html` | 1 | 1 |
| `en/test/rich-editor-structure.test.js` | 5 | 4 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.23 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.24: homepage builder script cut in three"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and the full suite `pass 1206`, `fail 0`.

After deploy, open Dashboard -> Settings and the homepage content section: adding a section and a card should work, and Save should keep them.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
## Numbers

Counted with `git diff --numstat` against v22.22, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **1131** | **1033** |

New: 8, modified: 6, deleted: 0. Tests: **1,206 pass** (1,199 before + 7 new). Migrations: **none**.

## New files (8)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_MEDIA_LIBRARY.md` | 27 | 0 |
| `en/static/js/media-library/actions.js` | 214 | 0 |
| `en/static/js/media-library/config.js` | 37 | 0 |
| `en/static/js/media-library/events.js` | 123 | 0 |
| `en/static/js/media-library/modals.js` | 243 | 0 |
| `en/static/js/media-library/utils.js` | 76 | 0 |
| `en/static/js/media-library/views.js` | 319 | 0 |
| `en/test/media-library-structure.test.js` | 39 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/js/media-library.js` | 8 | 1007 |
| `en/templates/layout/base.html` | 26 | 20 |
| `en/templates/pages/admin/media.html` | 1 | 1 |
| `en/test/rich-editor-structure.test.js` | 5 | 4 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.22 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/template-includes.test.js test/header-hero.test.js test/component-studio.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.23: template includes, settings page split into parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1206`, `fail 0`. Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, open Dashboard -> Settings: all sections should be there, the contents bar should highlight as you scroll, and Save should work.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
## Numbers

Counted with `git diff --numstat` against v22.21, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **14** | **1131** | **1033** |

New: 8, modified: 6, deleted: 0. Tests: **1,199 pass** (1,196 before + 3 new). Migrations: **none**.

## New files (8)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_MEDIA_LIBRARY.md` | 27 | 0 |
| `en/static/js/media-library/actions.js` | 214 | 0 |
| `en/static/js/media-library/config.js` | 37 | 0 |
| `en/static/js/media-library/events.js` | 123 | 0 |
| `en/static/js/media-library/modals.js` | 243 | 0 |
| `en/static/js/media-library/utils.js` | 76 | 0 |
| `en/static/js/media-library/views.js` | 319 | 0 |
| `en/test/media-library-structure.test.js` | 39 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/js/media-library.js` | 8 | 1007 |
| `en/templates/layout/base.html` | 26 | 20 |
| `en/templates/pages/admin/media.html` | 1 | 1 |
| `en/test/rich-editor-structure.test.js` | 5 | 4 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.21 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-25-media-library-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-retrieval-structure.test.js test/ai-studio.test.js test/ai-feedback-fix.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.22: AI retrieval split into worker/ai/retrieval/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1199`, `fail 0`. Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, ask the AI assistant on the site a question about a casino (and one with a country) and check the answer still names the right casinos and links.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
