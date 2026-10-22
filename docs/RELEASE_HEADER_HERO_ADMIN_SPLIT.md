# Release: Header & Hero admin script split (tenant v22.33)

Built on tenant v22.32. Control plane untouched. **No migration.** `en/static/js/header-hero-admin.js` (811 lines, one IIFE) becomes a 76-line ES-module entry plus six parts in `en/static/js/header-hero-admin/`. Behaviour is unchanged (three small documented code changes, below).

## What changed

- Parts: `state`, `fields`, `validate`, `repeater`, `preview`, `actions`. The import map in `templates/layout/base.html` lists them, and the entry is loaded with `<script type="module">`; the worker versions each part with `?v=<hash>`.
- Three deliberate code changes: `if (!form) return;` became `if (form) { ... }` (a module cannot `return` at top level; `repeater.js` is guarded the same way), `setMobilePreview()` is the only writer of `mobilePreview`, and `"use strict"` is implicit in modules.
- New `test/header-hero-admin-structure.test.js` (5 tests) and `test/support/header-hero-admin-source.js`; `test/header-hero.test.js` reads the entry plus the parts; the import-map test also lists the new parts.
- Docs: `docs/ARCHITECTURE_HEADER_HERO_ADMIN.md`, `docs/PLATFORM_UPGRADES.md` section 71, `docs/ARCHITECTURE_ADMIN_JS.md`.

## Proof the behaviour is the same

- **Tokens:** everything in the old file is in the new files except `"use strict"` and the guard's `!` and `return`; additions are import/export lines, the `if` and `setMobilePreview`.
- **Headless Chromium on `/en/dashboard/header-hero`, old vs new:** 117 snapshots (all 66 form fields changed, every preset, every repeater add and row button, colour clear, token insert, mobile/desktop, resize, invalid save, reset, discard, valid save) are **identical**, and so is the save request body. A one-word change in a status message is detected.
- The first draft did not build the repeaters (nothing imported `repeater.js`). This run caught it; the entry now imports it, and a test guards it.
- **59 admin pages:** same output and same errors as before.

## Numbers

Counted with `git diff --numstat` against v22.32, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **16** | **911** | **752** |

New: 9, modified: 7, deleted: 0. Tests: **1,241 pass** (1,236 before + 5 new). Migrations: **none**.

## New files (9)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_HEADER_HERO_ADMIN.md` | 21 | 0 |
| `en/static/js/header-hero-admin/actions.js` | 127 | 0 |
| `en/static/js/header-hero-admin/fields.js` | 47 | 0 |
| `en/static/js/header-hero-admin/preview.js` | 277 | 0 |
| `en/static/js/header-hero-admin/repeater.js` | 196 | 0 |
| `en/static/js/header-hero-admin/state.js` | 17 | 0 |
| `en/static/js/header-hero-admin/validate.js` | 127 | 0 |
| `en/test/header-hero-admin-structure.test.js` | 43 | 0 |
| `en/test/support/header-hero-admin-source.js` | 16 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ADMIN_JS.md` | 2 | 0 |
| `docs/PLATFORM_UPGRADES.md` | 13 | 0 |
| `en/static/js/header-hero-admin.js` | 10 | 745 |
| `en/templates/layout/base.html` | 7 | 1 |
| `en/test/header-hero.test.js` | 5 | 4 |
| `en/test/rich-editor-structure.test.js` | 2 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.32 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-33-header-hero-admin-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-33-header-hero-admin-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/header-hero-admin-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.33: Header and Hero admin script split into ES modules"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1241`, `fail 0`.

After deploy (hard refresh once) open Dashboard -> Header & Hero. The form must fill with your saved values and the preview must update: try a style, add and remove a slide and a card, switch mobile/desktop, then Save and reload.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
