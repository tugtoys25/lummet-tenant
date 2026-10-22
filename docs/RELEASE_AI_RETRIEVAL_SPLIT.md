# Release: AI retrieval split into modules (tenant v22.22)

Built on tenant v22.21. Control plane untouched. **No migration.** `en/worker/ai/retrieval.js` (1,230 lines) becomes a facade that re-exports the same 6 functions from 6 modules in `en/worker/ai/retrieval/`.

## Why

One file held the search itself (`retrieve`), its helpers, the prompt context builder, the URL guard and the geo/licensing fact guard. Ninth step of the restructuring (API v22.14, controllers v22.15, admin script v22.16, dashboard script v22.17, rich editor v22.18, site settings v22.19, router v22.20, super handlers v22.21).

## What changed

- **6 new modules in `en/worker/ai/retrieval/`**: match-helpers, retrieve, search-helpers, context-string, url-guard, geo-guard. No import cycles.
- **`en/worker/ai/retrieval.js`** keeps its path and exports the same 6 functions (`retrieve`, `buildContextString`, `extractContextUrls`, `sanitizeAnswerUrls`, `createStreamingUrlSanitizer`, `guardGeoFacts`) as plain re-exports. No importer changed.
- `retrieve` is still one 700-line function: moved, not rewritten. Cutting it up should be a separate step with tests per query path.
- `docs/ARCHITECTURE_AI_RETRIEVAL.md`; `docs/PLATFORM_UPGRADES.md` section 60.
- New `test/ai-retrieval-structure.test.js` (3 tests); `ai-studio.test.js` reads the parts through `test/support/retrieval-source.js`.

## Proof the behaviour is the same

- Token for token: every top-level statement of the old file exists once in the new files; only `import`/`export` lines were added. Imports were generated from scope analysis.
- **1,212 calls** old vs new against a seeded test database: 15 queries x 4 countries x 5 search plans through `retrieve`, `buildContextString`, `extractContextUrls` and `guardGeoFacts`, plus the URL sanitizer (plain and streaming) on 6 texts: identical results every time.

## Numbers

Counted with `git diff --numstat` against v22.21, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **12** | **1314** | **1225** |

New: 9, modified: 3, deleted: 0. Tests: **1,199 pass** (1,196 before + 3 new). Migrations: **none**.

## New files (9)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_AI_RETRIEVAL.md` | 29 | 0 |
| `en/test/ai-retrieval-structure.test.js` | 33 | 0 |
| `en/test/support/retrieval-source.js` | 11 | 0 |
| `en/worker/ai/retrieval/context-string.js` | 207 | 0 |
| `en/worker/ai/retrieval/geo-guard.js` | 77 | 0 |
| `en/worker/ai/retrieval/match-helpers.js` | 85 | 0 |
| `en/worker/ai/retrieval/retrieve.js` | 719 | 0 |
| `en/worker/ai/retrieval/search-helpers.js` | 61 | 0 |
| `en/worker/ai/retrieval/url-guard.js` | 75 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/ai-studio.test.js` | 2 | 1 |
| `en/worker/ai/retrieval.js` | 5 | 1224 |

## Install (Termux)

Needs v22.21 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-22-ai-retrieval-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-22-ai-retrieval-split.patch
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
