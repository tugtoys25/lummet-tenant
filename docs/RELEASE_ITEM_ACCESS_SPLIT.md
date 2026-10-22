# Release: item-access engine written as parts (tenant v22.51)

Built on tenant v22.50. Control plane untouched. **No migration. No behaviour change.** `en/worker/database/item-access.js` (469 lines) is now a facade over `item-access/registry.js`, `policy.js`, `assignments.js`, `access.js` and `items.js`. It re-exports the same 20 names (aliases included), so no importer changes. Docs: `docs/ARCHITECTURE_ITEM_ACCESS.md`, `docs/PLATFORM_UPGRADES.md` section 89. New `test/item-access-structure.test.js` (6 tests).

## Proof the behaviour is the same

- Every export was run old against new on a seeded database: about 5,000 calls: every resource, action and scope including invalid ones, 15 users (admin, viewer, editors with each scope, a missing user, string and zero ids), assignments, hostile slugs and ids and a throwing database. All results are identical.
- Mutation checks on each part (registry entries, owner columns, default scope, scope validation, admin bypass, unregistered resource, owner comparison, null owner, unknown scope, missing user, id lookup) were all detected by the harness.

## Numbers

Counted with `git diff --numstat` against v22.50. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **9** | **545** | **448** |

New: 7, modified: 2, deleted: 0. Tests: **1,326 pass** (1,320 before + 6 new). Migrations: **none**.

## New files (7)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ITEM_ACCESS.md` | 13 | 0 |
| `en/test/item-access-structure.test.js` | 47 | 0 |
| `en/worker/database/item-access/access.js` | 185 | 0 |
| `en/worker/database/item-access/assignments.js` | 65 | 0 |
| `en/worker/database/item-access/items.js` | 31 | 0 |
| `en/worker/database/item-access/policy.js` | 104 | 0 |
| `en/worker/database/item-access/registry.js` | 85 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/worker/database/item-access.js` | 6 | 448 |

## Install (Termux)

Needs v22.50 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-51-item-access-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-51-item-access-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/item-access-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.51: item-access engine split into 5 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1326`, `fail 0`.

Nothing visible changes. To confirm, log in as an admin and as a scoped editor: the casino list and the analytics page show the same items as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
