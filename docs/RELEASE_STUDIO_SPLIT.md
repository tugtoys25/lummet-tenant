# Release: AI Studio split into modules (tenant v22.31)

Built on tenant v22.30. Control plane untouched. **No migration. No behaviour change.** `en/worker/ai/studio.js` (878 lines) becomes a facade over 9 modules in `en/worker/ai/studio/`.

## Why

Next-largest hand-written file after the earlier splits. It mixed the task definitions and prompts, page fetching, the model call, saving results, the content audit, the history log and the HTTP routes.

## What changed

- **`worker/ai/studio.js`** keeps the header comment (the rules of the Studio) and re-exports its 24 public names, so `api/platform.js` and the tests still import it the same way.
- **`worker/ai/studio/`**: `config` (constants), `text-utils` (escaping, JSON reading, page fetching with the private-address guard), `facts`, `tasks` (the 16 tasks and their prompts), `run-task`, `apply-result` (saving drafts), `audit`, `history`, `http` (the routes). All under 190 lines. Generated with the same splitter as the other server modules; the code of every function is unchanged.
- `docs/ARCHITECTURE_STUDIO.md`, `docs/PLATFORM_UPGRADES.md` section 69. New `test/ai-studio-structure.test.js` (4 tests).

## Proof the behaviour is the same

- All 24 exports: same names, same function source text and length, same values (the `TASKS` object compared deeply).
- Old and new run side by side with a fake model and a seeded database: **1,249 calls** (every task with 5 inputs under 9 role/permission combinations, every route with GET and POST, `applyResult` with 6 targets, audit, history, feedback fix), comparing the response, every SQL statement with its bound values, every prompt sent to the model and every logged error: **all identical**. The same run detects a one-character change in a message.
- The 141 existing studio-related tests pass without changes.

## Numbers

Counted with `git diff --numstat` against v22.30, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **986** | **858** |

New: 11, modified: 2, deleted: 0. Tests: **1,235 pass** (1,231 before + 4 new). Migrations: **none**.

## New files (11)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_STUDIO.md` | 27 | 0 |
| `en/test/ai-studio-structure.test.js` | 45 | 0 |
| `en/worker/ai/studio/apply-result.js` | 125 | 0 |
| `en/worker/ai/studio/audit.js` | 84 | 0 |
| `en/worker/ai/studio/config.js` | 30 | 0 |
| `en/worker/ai/studio/facts.js` | 67 | 0 |
| `en/worker/ai/studio/history.js` | 36 | 0 |
| `en/worker/ai/studio/http.js` | 187 | 0 |
| `en/worker/ai/studio/run-task.js` | 99 | 0 |
| `en/worker/ai/studio/tasks.js` | 166 | 0 |
| `en/worker/ai/studio/text-utils.js` | 100 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/ai/studio.js` | 10 | 858 |

## Install (Termux)

Needs v22.30 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-31-studio-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-31-studio-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-studio-structure.test.js test/ai-studio.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.31: AI Studio split into worker/ai/studio/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1235`, `fail 0`.

After deploy open Dashboard -> AI Studio: run one task (for example Headlines on a news topic), open the History tab, and run the content Audit. Results should look as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
