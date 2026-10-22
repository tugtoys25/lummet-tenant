# Release: homepage builder render function split (tenant v22.32)

Built on tenant v22.31. Control plane untouched. **No migration. No behaviour change.** `en/static/js/admin/homepage-builder-render.js` (854 lines, a single function) becomes a 28-line entry plus three files.

## Why

`renderHomepageSections` built the section card, its paragraphs and cards, and wired every button in one function. The four blocks share only `wrapper`, `section` and `sectionIndex`, so they could be cut without changing the code.

## What changed

- **`homepage-builder-section.js`**: `renderHomepageSectionShell(section, sectionIndex)`: the section card with its fields, returns the wrapper.
- **`homepage-builder-content.js`**: `renderHomepageParagraphs(wrapper, section)` and `renderHomepageCards(wrapper, section)`.
- **`homepage-builder-controls.js`**: `bindHomepageSectionControls(wrapper, section, sectionIndex)`: move up/down, duplicate, remove, add card and paragraph.
- **`homepage-builder-render.js`** (28 lines): `renderHomepageSections()` loops over the sections and calls the four functions, then appends the wrapper.
- Classic scripts sharing the global scope, as before. `templates/layout/base.html` loads them in the order items, section, content, controls, render, collect; `worker/asset-version.js` updated.
- `test/admin-js-structure.test.js` updated (new order, 206 top-level functions instead of 202, one new test). Docs: `docs/ARCHITECTURE_ADMIN_JS.md`, `docs/PLATFORM_UPGRADES.md` section 70.

## Proof the behaviour is the same

- **Tokens:** every token of the old file is in the new files. The only additions are the four function headers, their calls and one `return wrapper`. Template text is byte-identical (only code lines were re-indented).
- **Headless Chromium on the settings page, old vs new:** 8 section types rendered with quotes and HTML in the values, then 20 clicks (add/remove card and paragraph, move up/down, duplicate, remove section), a field edit and `collectHomepageSections()`. 23 snapshots of the HTML, the state and the collected data are **identical**. A one-character label change is detected.
- **59 admin pages:** same global functions, handlers, editor setup and errors, apart from the four new function names.

## Numbers

Counted with `git diff --numstat` against v22.31, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **9** | **883** | **836** |

New: 3, modified: 6, deleted: 0. Tests: **1,236 pass** (1,235 before + 1 new). Migrations: **none**.

## New files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/admin/homepage-builder-content.js` | 351 | 0 |
| `en/static/js/admin/homepage-builder-controls.js` | 160 | 0 |
| `en/static/js/admin/homepage-builder-section.js` | 330 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ADMIN_JS.md` | 5 | 2 |
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/static/js/admin/homepage-builder-render.js` | 5 | 831 |
| `en/templates/layout/base.html` | 3 | 0 |
| `en/test/admin-js-structure.test.js` | 18 | 2 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.31 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-32-homepage-builder-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-32-homepage-builder-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/admin-js-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.32: homepage builder render function split into 4 files"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1236`, `fail 0`.

After deploy (hard refresh once) open Dashboard -> Settings -> Homepage content. The sections must show as before: add and remove a card, add a paragraph, move a section up and down, duplicate one, then Save and reload.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
