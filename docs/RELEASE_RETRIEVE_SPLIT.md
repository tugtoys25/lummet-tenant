# Release: AI retrieval search split (tenant v22.28)

Built on tenant v22.27. Control plane untouched. **No migration.** The 719-line `retrieve` function in `en/worker/ai/retrieval/retrieve.js` is split into 15 search functions in 7 files in `en/worker/ai/retrieval/search/`.

## Why

This was the one step that could have changed behaviour, so it was done on its own: no code line was rewritten, only moved into functions, and the proof compares every database query before and after.

## What changed

- **`retrieval/retrieve.js`** (75 lines): works out the search parameters from the plan (or keywords) exactly as before, puts them in one `ctx` object, and calls the 15 searches in the old order.
- **`retrieval/search/*.js`** (7 files, all under 180 lines): `casinos`, `reviews` (reviews, news), `items` (content and research items), `platform-updates`, `pages` (pages, FAQs, authors), `catalog` (countries, categories, SEO pages, SEO meta), `site-structure` (payment methods, navigation, homepage sections). Each function is `searchX(ctx, results)`, checks its own table rule, runs its own queries in its own try/catch and fills its own part of `results`.
- Tests: `test/support/retrieval-source.js` now also reads `search/`; 4 new tests in `test/ai-retrieval-structure.test.js` (layout and sizes, call order and that `retrieve.js` runs no query, empty-result shape).
- Docs: `docs/ARCHITECTURE_AI_RETRIEVAL.md` updated, `docs/PLATFORM_UPGRADES.md` section 66.
- `docs/RELEASE_RENDERER_SPLIT.md` (the v22.27 note) is corrected: it had old numbers and v22.26 commands appended by mistake. Docs only.

## Proof the behaviour is the same

- Every code line of the old function is in the new files (checked line by line; only the wrappers, imports and `ctx` unpacking are new).
- Old and new run against a seeded test database with a recording wrapper: **12,792 cases** (26 questions x 4 countries x 40 plans, plus runs where each of 14 tables fails) comparing the returned results, every SQL statement with its bound values in order, and every logged error: **all identical**. The same run detects a swap of two calls, so it would notice an order change.

## Numbers

Counted with `git diff --numstat` against v22.27, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **838** | **1016** |

New: 7, modified: 6, deleted: 0. Tests: **1,220 pass** (1,216 before + 4 new). Migrations: **none**.

## New files (7)

| File | + | - |
|---|---:|---:|
| `en/worker/ai/retrieval/search/casinos.js` | 175 | 0 |
| `en/worker/ai/retrieval/search/catalog.js` | 86 | 0 |
| `en/worker/ai/retrieval/search/items.js` | 87 | 0 |
| `en/worker/ai/retrieval/search/pages.js` | 95 | 0 |
| `en/worker/ai/retrieval/search/platform-updates.js` | 115 | 0 |
| `en/worker/ai/retrieval/search/reviews.js` | 105 | 0 |
| `en/worker/ai/retrieval/search/site-structure.js` | 74 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_AI_RETRIEVAL.md` | 23 | 6 |
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `docs/RELEASE_RENDERER_SPLIT.md` | 0 | 335 |
| `en/test/ai-retrieval-structure.test.js` | 36 | 1 |
| `en/test/support/retrieval-source.js` | 4 | 2 |
| `en/worker/ai/retrieval/retrieve.js` | 28 | 672 |

## Install (Termux)

Needs v22.27 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-28-retrieve-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-28-retrieve-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-retrieval-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.28: AI retrieval search split into worker/ai/retrieval/search/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1220`, `fail 0`.

After deploy, ask the AI assistant on the site: about one casino by name, about casinos for a country (for example Kenya), for a list of casinos, and about payment methods. The answers should name the right casinos and links as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
