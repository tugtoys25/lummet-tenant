# Release: report engine split into modules (tenant v22.26)

Built on tenant v22.25. Control plane untouched. **No migration.** `en/worker/database/reports.js` (1,014 lines) becomes a facade that re-exports the same 9 functions from 8 modules in `en/worker/database/reports/`.

## Why

One file held the report column manifests, the 18 report handlers, the registry and grouping, CSV/HTML export and the scheduled runs. Eleventh step of the restructuring (API v22.14 ... settings page v22.23, homepage builder v22.24, media library v22.25).

## What changed

- **8 new modules in `en/worker/database/reports/`**: columns, handlers-core, reconciliation, cohort-ltv, operational-health, run, export, scheduling. No import cycles.
- **`en/worker/database/reports.js`** keeps its path, its header comment (the hard rules) and exports the same 9 functions (`isValidReportType`, `getReportColumnOptions`, `getAllReportDefinitions`, `runReport`, `toCsv`, `toHtml`, `executeReportRun`, `runDueReportSchedules`, `runDueReportSchedulesNow`) as plain re-exports. No importer changed.
- One path is changed on purpose: the lazy `import('../reports/delivery.js')` in the scheduling part is now `../../reports/delivery.js`, because the file moved one folder deeper.
- `docs/ARCHITECTURE_DATABASE_REPORTS.md`; `docs/PLATFORM_UPGRADES.md` section 64.
- New `test/reports-structure.test.js` (3 tests), which also checks that every import, dynamic ones included, resolves.

## Proof the behaviour is the same

- Token for token: every top-level statement of the old file exists once in the new files; only `import`/`export` lines were added (and the one path above).
- **942 checks** old vs new on a seeded affiliate graph with conversions, an import batch and three saved reports: 19 report types (one unknown, one that must refuse) x 3 users x 6 filter sets, with CSV and HTML output, column options, report definitions, report runs, and both schedule runners. Identical every time. The first run of this comparison found the wrong lazy-import path, which is how it got fixed.

## Numbers

Counted with `git diff --numstat` against v22.25, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **12** | **1101** | **1000** |

New: 10, modified: 2, deleted: 0. Tests: **1,212 pass** (1,209 before + 3 new). Migrations: **none**.

## New files (10)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_DATABASE_REPORTS.md` | 33 | 0 |
| `en/test/reports-structure.test.js` | 39 | 0 |
| `en/worker/database/reports/cohort-ltv.js` | 175 | 0 |
| `en/worker/database/reports/columns.js` | 209 | 0 |
| `en/worker/database/reports/export.js` | 35 | 0 |
| `en/worker/database/reports/handlers-core.js` | 162 | 0 |
| `en/worker/database/reports/operational-health.js` | 49 | 0 |
| `en/worker/database/reports/reconciliation.js` | 112 | 0 |
| `en/worker/database/reports/run.js` | 117 | 0 |
| `en/worker/database/reports/scheduling.js` | 155 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/database/reports.js` | 5 | 1000 |

## Install (Termux)

Needs v22.25 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/reports-structure.test.js test/reconciliation-imports.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.26: report engine split into worker/database/reports/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1212`, `fail 0`.

After deploy, open Dashboard -> Reports, run one report (for example Casino performance), download its CSV, and run the Reconciliation report.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
## Numbers

Counted with `git diff --numstat` against v22.24, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **12** | **1101** | **1000** |

New: 10, modified: 2, deleted: 0. Tests: **1,209 pass** (1,206 before + 3 new). Migrations: **none**.

## New files (10)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_DATABASE_REPORTS.md` | 33 | 0 |
| `en/test/reports-structure.test.js` | 39 | 0 |
| `en/worker/database/reports/cohort-ltv.js` | 175 | 0 |
| `en/worker/database/reports/columns.js` | 209 | 0 |
| `en/worker/database/reports/export.js` | 35 | 0 |
| `en/worker/database/reports/handlers-core.js` | 162 | 0 |
| `en/worker/database/reports/operational-health.js` | 49 | 0 |
| `en/worker/database/reports/reconciliation.js` | 112 | 0 |
| `en/worker/database/reports/run.js` | 117 | 0 |
| `en/worker/database/reports/scheduling.js` | 155 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/database/reports.js` | 5 | 1000 |

## Install (Termux)

Needs v22.24 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
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
| **Total** | **12** | **1101** | **1000** |

New: 10, modified: 2, deleted: 0. Tests: **1,206 pass** (no new tests; the admin structure test was updated). Migrations: **none**.

## New files (10)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_DATABASE_REPORTS.md` | 33 | 0 |
| `en/test/reports-structure.test.js` | 39 | 0 |
| `en/worker/database/reports/cohort-ltv.js` | 175 | 0 |
| `en/worker/database/reports/columns.js` | 209 | 0 |
| `en/worker/database/reports/export.js` | 35 | 0 |
| `en/worker/database/reports/handlers-core.js` | 162 | 0 |
| `en/worker/database/reports/operational-health.js` | 49 | 0 |
| `en/worker/database/reports/reconciliation.js` | 112 | 0 |
| `en/worker/database/reports/run.js` | 117 | 0 |
| `en/worker/database/reports/scheduling.js` | 155 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/database/reports.js` | 5 | 1000 |

## Install (Termux)

Needs v22.23 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
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
| **Total** | **12** | **1101** | **1000** |

New: 10, modified: 2, deleted: 0. Tests: **1,206 pass** (1,199 before + 7 new). Migrations: **none**.

## New files (10)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_DATABASE_REPORTS.md` | 33 | 0 |
| `en/test/reports-structure.test.js` | 39 | 0 |
| `en/worker/database/reports/cohort-ltv.js` | 175 | 0 |
| `en/worker/database/reports/columns.js` | 209 | 0 |
| `en/worker/database/reports/export.js` | 35 | 0 |
| `en/worker/database/reports/handlers-core.js` | 162 | 0 |
| `en/worker/database/reports/operational-health.js` | 49 | 0 |
| `en/worker/database/reports/reconciliation.js` | 112 | 0 |
| `en/worker/database/reports/run.js` | 117 | 0 |
| `en/worker/database/reports/scheduling.js` | 155 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/database/reports.js` | 5 | 1000 |

## Install (Termux)

Needs v22.22 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
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
| **Total** | **12** | **1101** | **1000** |

New: 10, modified: 2, deleted: 0. Tests: **1,199 pass** (1,196 before + 3 new). Migrations: **none**.

## New files (10)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_DATABASE_REPORTS.md` | 33 | 0 |
| `en/test/reports-structure.test.js` | 39 | 0 |
| `en/worker/database/reports/cohort-ltv.js` | 175 | 0 |
| `en/worker/database/reports/columns.js` | 209 | 0 |
| `en/worker/database/reports/export.js` | 35 | 0 |
| `en/worker/database/reports/handlers-core.js` | 162 | 0 |
| `en/worker/database/reports/operational-health.js` | 49 | 0 |
| `en/worker/database/reports/reconciliation.js` | 112 | 0 |
| `en/worker/database/reports/run.js` | 117 | 0 |
| `en/worker/database/reports/scheduling.js` | 155 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/database/reports.js` | 5 | 1000 |

## Install (Termux)

Needs v22.21 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-26-reports-split.patch
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
