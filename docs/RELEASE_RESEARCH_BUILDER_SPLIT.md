# Release: research content builder split (tenant v22.36)

Built on tenant v22.35. Control plane untouched. **No migration. No behaviour change.** `en/static/js/admin/research-content-builder.js` (705 lines) becomes five classic scripts.

## What changed

- `research-content-builder.js` (94): section state, type lists, item and dataset caches, editor helpers. `-fields.js` (200): the per-type card renderers. `-sections.js` (146): card html, `renderResearchFormSections`, sync from the DOM, defaults. `-wire.js` (163): `wireResearchSectionBuilder`. `-init.js` (103): one-click templates and `initResearchForm`.
- Only the first part has top-level statements, so the cut is by line range. `templates/layout/base.html` loads the five in that order; `worker/asset-version.js` updated.
- `test/admin-js-structure.test.js`: new load order and one new test (each part defines its own functions). Docs: `docs/ARCHITECTURE_ADMIN_JS.md`, `docs/PLATFORM_UPGRADES.md` section 74.

## Proof the behaviour is the same

- **Bytes:** the five files joined in load order are identical to the old file (`cmp`).
- **Headless Chromium on `/en/dashboard/research`, old vs new:** all 12 section types added, fields edited, sync, every button in the cards (60 clicks), the four templates and an unknown one, and a submit: 65 snapshots and the request body are **identical**. A one-word change in a template is detected.

## Numbers

Counted with `git diff --numstat` against v22.35, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **10** | **646** | **614** |

New: 4, modified: 6, deleted: 0. Tests: **1,247 pass** (1,246 before + 1 new). Migrations: **none**.

## New files (4)

| File | + | - |
|---|---:|---:|
| `en/static/js/admin/research-content-fields.js` | 200 | 0 |
| `en/static/js/admin/research-content-init.js` | 102 | 0 |
| `en/static/js/admin/research-content-sections.js` | 146 | 0 |
| `en/static/js/admin/research-content-wire.js` | 163 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ADMIN_JS.md` | 5 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/static/js/admin/research-content-builder.js` | 0 | 611 |
| `en/templates/layout/base.html` | 4 | 0 |
| `en/test/admin-js-structure.test.js` | 15 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.35 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-36-research-builder-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-36-research-builder-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/admin-js-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.36: research content builder split into 5 files"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1247`, `fail 0`.

After deploy (hard refresh once) open Dashboard -> Research. Add sections of a few types, use a one-click template, move and remove a section, then save an item and reopen it.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
