# Release: news controller split (tenant v22.38)

Built on tenant v22.37. Control plane untouched. **No migration. No behaviour change.** `en/worker/controllers/news.js` (683 lines) becomes a three-line facade over three parts in `en/worker/controllers/news/`.

## What changed

- `landing.js` (204): section, region, country, topic/entity/series pages and the search page. `article.js` (279): `renderNews`, one article page. `list.js` (212): the news home and `renderNewsList`. `article` and `list` import only from `landing`.
- `worker/controllers.js` and every other importer are unchanged: the facade re-exports `renderNews`, `renderNewsList` and `renderNewsTaxonomyPage`.
- `test/support/controllers-source.js` now also reads one level of sub-folders, so source-inspection tests see the parts. New `test/news-controller-structure.test.js` (4 tests). Docs: `docs/ARCHITECTURE_NEWS_CONTROLLER.md`, `docs/PLATFORM_UPGRADES.md` section 76.

## Proof the behaviour is the same

- **Tokens:** nothing is missing from the new files except the import paths; no new code.
- **Page-level differential through `worker.fetch`, old vs new:** 1,584 requests (36 URLs covering the news home with paging, search and filters, articles that are live, draft, scheduled or missing, a redirect, section, region, country, topic, entity and series pages; 11 flag settings: all off, all on, each flag alone; with and without a session; GET and HEAD). Status, headers and a hash of the body: **0 differences**, with 200, 301 and 404 all covered. Renaming one flag in a part is detected (40 differences).

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **766** | **681** |

New: 5, modified: 3, deleted: 0. Tests: **1,255 pass** (1,251 before + 4 new). Migrations: **none**.

## New files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_NEWS_CONTROLLER.md` | 11 | 0 |
| `en/test/news-controller-structure.test.js` | 41 | 0 |
| `en/worker/controllers/news/article.js` | 279 | 0 |
| `en/worker/controllers/news/landing.js` | 204 | 0 |
| `en/worker/controllers/news/list.js` | 212 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/support/controllers-source.js` | 5 | 1 |
| `en/worker/controllers/news.js` | 4 | 680 |

## Install (Termux)

Needs v22.37 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-38-news-controller-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-38-news-controller-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/news-controller-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.38: news controller split into 3 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1255`, `fail 0`.

After deploy (hard refresh once) open /en/news, a news article, a section page and a topic page under /en/news/. All must load as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
