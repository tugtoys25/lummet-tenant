# Release: newsroom database layer split (tenant v22.37)

Built on tenant v22.36. Control plane untouched. **No migration. No behaviour change.** `en/worker/database/newsroom.js` (704 lines) becomes a facade over four parts in `en/worker/database/newsroom/`.

## What changed

- `base.js` (86): vocabularies, flag check, text/slug helpers, URL validation, the shared `LIVE` SQL fragment. `editorial.js` (256): sources, revisions, corrections, workflow, fact check, sections. `public.js` (145): public loaders, flag cache, related, section pages. `discovery.js` (228): redirects, regions and countries, collection pages, topic/entity/series, article discovery, sitemap entries.
- The facade `newsroom.js` re-exports the same 59 names, so controllers, the sitemap and tests import it unchanged.
- One deliberate move: the `LIVE` constant went into `base.js` (exported) because two parts use it.
- New `test/newsroom-structure.test.js` (4 tests). Docs: `docs/ARCHITECTURE_NEWSROOM_DB.md`, `docs/PLATFORM_UPGRADES.md` section 75.

## Proof the behaviour is the same

- **Exports:** same names, same function source text and `length`.
- **Tokens:** nothing is missing from the new files except the two import paths (`./` became `../`).
- **Differential run, old vs new:** 8,801 calls on all 49 exported functions (many argument combinations, permissions, flags, state-changing calls in the same order) on a seeded database, with every SQL statement and bound value recorded: **0 differences**, 709 distinct outcomes. Changing one `ORDER BY` is detected (156 differences).

## Numbers

Counted with `git diff --numstat` against v22.36, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **780** | **687** |

New: 6, modified: 2, deleted: 0. Tests: **1,251 pass** (1,247 before + 4 new). Migrations: **none**.

## New files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_NEWSROOM_DB.md` | 12 | 0 |
| `en/test/newsroom-structure.test.js` | 41 | 0 |
| `en/worker/database/newsroom/base.js` | 85 | 0 |
| `en/worker/database/newsroom/discovery.js` | 227 | 0 |
| `en/worker/database/newsroom/editorial.js` | 255 | 0 |
| `en/worker/database/newsroom/public.js` | 144 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 11 | 0 |
| `en/worker/database/newsroom.js` | 5 | 687 |

## Install (Termux)

Needs v22.36 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-37-newsroom-db-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-37-newsroom-db-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/newsroom-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.37: newsroom database layer split into 4 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1251`, `fail 0`.

After deploy (hard refresh once) open a news article, a news section page, a country or topic page under /en/news/ and Dashboard -> Newsroom. All must load as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
