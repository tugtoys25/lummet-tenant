# Release: super API handlers split into modules (tenant v22.21)

Built on tenant v22.20. Control plane untouched. **No migration.** `en/worker/super/handlers.js` (1,359 lines, 123 handlers) becomes a facade that re-exports the same handlers from 17 modules in `en/worker/super/handlers/`.

## Why

One file held the handlers of every super-admin API resource: casinos, reviews, news, pages, categories, research, payment methods, SEO, countries, authors, media, settings, users, components, permissions, ad rules, navigation, banners, updates, inbox, subscribers. Eighth step of the restructuring (API v22.14, controllers v22.15, admin script v22.16, dashboard script v22.17, rich editor v22.18, site settings v22.19, router v22.20).

## What changed

- **17 new modules in `en/worker/super/handlers/`**: helpers, system, casinos, reviews-news, pages-categories, research, payments-seo-meta, countries-authors, media, settings-users, components-blocks, permissions-access, review-blocks-ad-rules, nav-banners, platform-updates, seo-pages, inbox-subscribers. No import cycles; `helpers.js` is shared.
- **`en/worker/super/handlers.js`** keeps its path and exports the same 123 handlers as plain re-exports. `router.js` is unchanged.
- `docs/ARCHITECTURE_SUPER_HANDLERS.md` lists every part. `docs/PLATFORM_UPGRADES.md` section 59.
- New `test/super-handlers-structure.test.js` (4 tests).

## Proof the behaviour is the same

- Token for token: every top-level statement of the old file exists once in the new files; only `import`/`export` lines were added. Imports were generated from scope analysis.
- **All 123 handlers called 3,075 ways** (5 ids x 5 request bodies, including empty, invalid JSON and a settings update with a secret key) against a seeded test database, old vs new: identical status and body every time.

## Numbers

Counted with `git diff --numstat` against v22.20, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **21** | **1477** | **1351** |

New: 19, modified: 2, deleted: 0. Tests: **1,196 pass** (1,192 before + 4 new). Migrations: **none**.

## New files (19)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_SUPER_HANDLERS.md` | 36 | 0 |
| `en/test/super-handlers-structure.test.js` | 44 | 0 |
| `en/worker/super/handlers/casinos.js` | 113 | 0 |
| `en/worker/super/handlers/components-blocks.js` | 70 | 0 |
| `en/worker/super/handlers/countries-authors.js` | 67 | 0 |
| `en/worker/super/handlers/helpers.js` | 63 | 0 |
| `en/worker/super/handlers/inbox-subscribers.js` | 94 | 0 |
| `en/worker/super/handlers/media.js` | 148 | 0 |
| `en/worker/super/handlers/nav-banners.js` | 67 | 0 |
| `en/worker/super/handlers/pages-categories.js` | 77 | 0 |
| `en/worker/super/handlers/payments-seo-meta.js` | 86 | 0 |
| `en/worker/super/handlers/permissions-access.js` | 107 | 0 |
| `en/worker/super/handlers/platform-updates.js` | 42 | 0 |
| `en/worker/super/handlers/research.js` | 47 | 0 |
| `en/worker/super/handlers/review-blocks-ad-rules.js` | 83 | 0 |
| `en/worker/super/handlers/reviews-news.js` | 86 | 0 |
| `en/worker/super/handlers/seo-pages.js` | 122 | 0 |
| `en/worker/super/handlers/settings-users.js` | 60 | 0 |
| `en/worker/super/handlers/system.js` | 38 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/super/handlers.js` | 17 | 1351 |

## Install (Termux)

Needs v22.20 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-21-super-handlers-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-21-super-handlers-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/super-*.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.21: super API handlers split into worker/super/handlers/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1196`, `fail 0`. Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, check the super API still answers (for example the handshake and a list call from the tool that uses it) and open a dashboard page that edits casinos or news.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
