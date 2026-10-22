# Release: research controller split (tenant v22.44)

Built on tenant v22.43. Control plane untouched. **No migration. No behaviour change.** `en/worker/controllers/research.js` (668 lines) becomes a one-line facade over three parts in `en/worker/controllers/research/`: `sections.js` (content section renderers, footnotes, claims, related), `directory.js` (sort options and card markup) and `pages.js` (hub, type list, item page, site search). Dependencies run one way: sections, directory, pages. `worker/controllers.js` is unchanged. Docs: `docs/ARCHITECTURE_RESEARCH_CONTROLLER.md`, `docs/PLATFORM_UPGRADES.md` section 82. New `test/research-controller-structure.test.js` (5 tests).

## Proof the behaviour is the same

- **Tokens:** nothing is missing from the new files except the import paths; no new code.
- **Page-level differential through `worker.fetch`, old vs new:** 244 requests (hub with every sort key and a bad one; seven type lists plus unknown and wrongly cased types; 14 item pages including a draft, bad JSON content and a bare array; every section type with valid and empty data; claims with sources; relations; a dataset table; site search with empty, short, long, markup and null-byte queries; with and without a session; GET and HEAD). Status, headers and a hash of the body: **0 differences** (200 and 404 covered). Changing one class name in each of the three parts is detected.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **732** | **741** |

New: 5, modified: 2, deleted: 1. Tests: **1,290 pass** (1,285 before + 5 new). Migrations: **none**.

## New files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_RESEARCH_CONTROLLER.md` | 11 | 0 |
| `en/test/research-controller-structure.test.js` | 40 | 0 |
| `en/worker/controllers/research/directory.js` | 90 | 0 |
| `en/worker/controllers/research/pages.js` | 251 | 0 |
| `en/worker/controllers/research/sections.js` | 328 | 0 |

## Deleted files (1)

| File | + | - |
|---|---:|---:|
| `docs/RELEASE_RESPONSIVE_CSS_PARTS.md` | 0 | 76 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/controllers/research.js` | 2 | 665 |

## Install (Termux)

Needs v22.43 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-44-research-controller-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-44-research-controller-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/research-controller-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.44: research controller split into 3 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1290`, `fail 0`.

After deploy open /en/research, a research type list (for example /en/research/country), one research item, and /en/search?q=report. All must load as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
