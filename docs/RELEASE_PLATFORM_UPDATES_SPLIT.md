# Release: platform updates admin script split (tenant v22.34)

Built on tenant v22.33. Control plane untouched. **No migration. No behaviour change.** `en/static/js/admin/platform-updates.js` (793 lines) becomes four classic scripts.

## What changed

- `platform-updates.js` (143): `loadPlatformUpdatesTable`. `platform-updates-form.js` (247): featured-image helpers and `initPlatformUpdateForm`. `platform-updates-edit.js` (206): `editPlatformUpdate`. `platform-updates-actions.js` (198): delete, cancel, reset, alert, `formatDateTimeLocal`.
- The old file held only top-level function declarations, so it was cut by line range. `templates/layout/base.html` loads the four in that order; `worker/asset-version.js` updated.
- `test/admin-js-structure.test.js`: new load order and one new test (each part defines exactly its functions). Docs: `docs/ARCHITECTURE_ADMIN_JS.md`, `docs/PLATFORM_UPGRADES.md` section 72.

## Proof the behaviour is the same

- **Bytes:** the four files joined in load order are identical to the old file (`cmp`).
- **Headless Chromium on `/en/dashboard/updates`, old vs new:** list, edit of two rows and a missing one, cancel, update submit, create submit, both alerts, delete, image set and clear, date formatting: 12 snapshots and the 3 request bodies are **identical**. A one-class change is detected. All 11 functions are still global.

## Numbers

Counted with `git diff --numstat` against v22.33, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **9** | **683** | **653** |

New: 3, modified: 6, deleted: 0. Tests: **1,242 pass** (1,241 before + 1 new). Migrations: **none**.

## New files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/admin/platform-updates-actions.js` | 197 | 0 |
| `en/static/js/admin/platform-updates-edit.js` | 206 | 0 |
| `en/static/js/admin/platform-updates-form.js` | 247 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ADMIN_JS.md` | 4 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/static/js/admin/platform-updates.js` | 0 | 650 |
| `en/templates/layout/base.html` | 3 | 0 |
| `en/test/admin-js-structure.test.js` | 15 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.33 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-34-platform-updates-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-34-platform-updates-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/admin-js-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.34: platform updates admin script split into 4 files"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1242`, `fail 0`.

After deploy (hard refresh once) open Dashboard -> Platform updates. The list must show; edit one (the form fills), cancel, save a change, create one and delete it.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
