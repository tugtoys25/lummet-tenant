# Release: settings form script split (tenant v22.41)

Built on tenant v22.40. Control plane untouched. **No migration. No behaviour change.** `en/static/js/admin/settings-form.js` (675 lines, one function) becomes an entry plus three classic scripts: `settings-form-theme.js` (theme preset and live preview), `settings-form-sections.js` (the "add" buttons) and `settings-form-save.js` (the submit handler). They load right after the entry in `base.html`; the only shared value, the form element, is passed as an argument. Docs: `docs/ARCHITECTURE_SETTINGS_FORM.md`, `docs/PLATFORM_UPGRADES.md` section 79. New `test/settings-form-structure.test.js` (3 tests); `admin-js-structure.test.js` has the new load order and function count.

## Proof the behaviour is the same

- **Statements:** all 443 non-blank lines of the old function appear, in order, in the new files. Only the function wrappers are new.
- **Headless Chromium on `/en/dashboard/settings`, old vs new:** every theme preset, all 12 colour inputs, both radius inputs, mouse enter and leave on the preview buttons, the four "add" buttons (7 clicks), edited fields and four saves (success, HTTP error, `success:false`, success): 39 snapshots and the 4 posted bodies are **identical** (generated ids normalised). A changed alert message, and a changed preview value, are each detected.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **11** | **731** | **735** |

New: 5, modified: 5, deleted: 1. Tests: **1,279 pass** (1,276 before + 3 new). Migrations: **none**.

## New files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_SETTINGS_FORM.md` | 12 | 0 |
| `en/static/js/admin/settings-form-save.js` | 138 | 0 |
| `en/static/js/admin/settings-form-sections.js` | 82 | 0 |
| `en/static/js/admin/settings-form-theme.js` | 444 | 0 |
| `en/test/settings-form-structure.test.js` | 29 | 0 |

## Deleted files (1)

| File | + | - |
|---|---:|---:|
| `docs/RELEASE_HEADER_HERO_SPLIT.md` | 0 | 74 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/static/js/admin/settings-form.js` | 9 | 657 |
| `en/templates/layout/base.html` | 3 | 0 |
| `en/test/admin-js-structure.test.js` | 3 | 3 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.40 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-41-settings-form-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-41-settings-form-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/settings-form-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.41: settings form script split into 4 files"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1279`, `fail 0`.

After deploy (hard refresh once) open Admin, Settings: change a theme colour (the preview must follow), add a homepage section, save. The "saved successfully" message must appear.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
