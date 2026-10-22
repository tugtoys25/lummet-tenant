# Release: content edit actions script written as 4 files (tenant v22.58)

Built on tenant v22.57. Control plane untouched. **No migration. No behaviour change.** `en/static/js/admin/content-edit-actions.js` (515 lines, 14 global functions) is now four files loaded one after the other by `templates/layout/base.html`, the way the settings-form script was split in v22.41: `content-edit-actions.js` (deletes, review edit), `content-edit-news.js`, `content-edit-pages.js`, `content-edit-taxonomy.js` (category and country edit). They are admin-only scripts (inside the `@full` block), so public pages get no extra request. Docs: `docs/ARCHITECTURE_ADMIN_JS.md`, `docs/PLATFORM_UPGRADES.md` section 96. The asset version is updated.

## Proof the behaviour is the same

- The four files joined in load order are **byte-identical** to the old file (`cmp`), and loading them as four separate scripts in one context defines exactly the same 14 functions with identical source as loading the old file. The functions are only called from click handlers, so the order inside the group changes nothing; it is kept and tested anyway.
- `test/admin-js-structure.test.js` has the three new files in its load-order list, the total of 209 top-level functions is unchanged, and a new test checks which file holds which function and that each stays under 250 lines. `asset-version.mjs --check` passes.

## Numbers

Counted with `git diff --numstat` against v22.57. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **9** | **417** | **378** |

New: 3, modified: 6, deleted: 0. Tests: **1,350 pass** (1,349 before + 1). Migrations: **none**.

## New files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/admin/content-edit-news.js` | 101 | 0 |
| `en/static/js/admin/content-edit-pages.js` | 157 | 0 |
| `en/static/js/admin/content-edit-taxonomy.js` | 118 | 0 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ADMIN_JS.md` | 13 | 0 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/static/js/admin/content-edit-actions.js` | 0 | 376 |
| `en/templates/layout/base.html` | 3 | 0 |
| `en/test/admin-js-structure.test.js` | 15 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.57 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-58-content-edit-actions-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-58-content-edit-actions-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/admin-js-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.58: content edit actions script split into 4 files"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1350`, `fail 0`.

Nothing visible changes. After deploy, hard-refresh the dashboard and use Edit and Delete on a review, a news article, a page, a category and a country.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
