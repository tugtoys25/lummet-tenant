# Release: Cleanup (tenant v22.5)

Built on tenant v22.4. Control plane untouched. **No migration.** Behaviour is unchanged.

## What was removed

- Patch files, `.zip` and backup copies (`*.backup`, `*.save`, `*.bak-*`, `*backup*.css/js`, `wrangler.jsonc.bestall`) and an old production dump in `docs/casinos/`.
- Unused modules and an old chat UI nothing loads.
- Functions named `...backup`, functions nothing references, unused imports, and long commented-out code in JS, CSS and templates (about 1,350 lines of JS alone). This includes three old public news routes (`newsbackup`).
- Old change notes were **moved** to `docs/history/`, not deleted.
- Git history keeps every removed file, so `git revert` brings anything back.

**Security:** the removed `docs/casinos/levelcasd1.sql` held sessions and password hashes. It stays in git history: rotate admin passwords and invalidate sessions. Details: `docs/PLATFORM_UPGRADES.md` section 43.

## Numbers

Counted with `git diff --numstat` against v22.4, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **101** | **454** | **34748** |

New: 7, modified: 47, deleted: 47. Tests: 1144 pass (full suite); focused set (3 files) 51 pass. Migrations: **none**.

## Deleted files (47)

- `0052-fix.patch`
- `CHANGES-delete-fk-fix.md`
- `CHANGES-research-datasets-visual-grid.md`
- `CHANGES-research-public-styling.md`
- `CHANGES-turnstile-sitekey-env.md`
- `INTEGRATION-NOTES.md`
- `MANIFEST-CHANGED-FILES.txt`
- `docs/casinos/levelcasd1.sql`
- `docs/casinos/levelcasd1.zip`
- `en/static/css/ai-chat.css`
- `en/static/css/mainbackup.css`
- `en/static/css/responsivebackup.css`
- `en/static/css/supportivebackup.css`
- `en/static/js/item-access-admin-backup.js`
- `en/static/js/level-ai.js`
- `en/static/js/lummet-ai.js.backup`
- `en/static/js/main.js.turnstile-backup`
- `en/static/js/media-library.js.backup`
- `en/templates/components/casino_grid.html.bak-20260823-223812`
- `en/templates/layout/sidebarstable.html`
- `en/templates/pages/author.html.backup`
- `en/worker/ai/assistant.js.backup`
- `en/worker/ai/context.js`
- `en/worker/ai/prompt.js.backup`
- `en/worker/ai/retrieval.js.backup`
- `en/worker/ai/router.js.save`
- `en/worker/ai/search.js`
- `en/worker/ai/understand.js.backup`
- `en/worker/auth.js.turndtile.backupp`
- `en/worker/bootstrap.js`
- `en/worker/controllers.js.author-backup`
- `en/worker/database.js`
- `en/worker/database/authors.js.author-backup`
- `en/worker/database/reviews.js.backup`
- `en/worker/indexnight.js.backup`
- `en/worker/item-access-test.js`
- `en/worker/lummet/router.js.backup`
- `en/worker/seo.js`
- `en/worker/seo.js.author-backup`
- `en/worker/site-context.js.backup`
- `en/worker/sitemap.js.save`
- `fix_duplicate_h1.sql`
- `generic-content-engine-integration.patch`
- `legacywrangler.jsonc.backup`
- `phase9b-item-access-and-newsroom-reconciliation.CORRECTED.patch`
- `turnstile-sitekey-env.patch`
- `wrangler.jsonc.bestall`

## Modified files (47)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/css/casino.css` | 0 | 17 |
| `en/static/css/main.css` | 1 | 17 |
| `en/static/js/admin.js` | 0 | 253 |
| `en/static/js/app.js` | 0 | 88 |
| `en/static/js/casino.js` | 0 | 35 |
| `en/static/js/component-admin.js` | 0 | 4 |
| `en/static/js/main.js` | 0 | 195 |
| `en/static/js/media-admin.js` | 0 | 30 |
| `en/static/js/rich-editor.js` | 0 | 35 |
| `en/static/js/user-dashboard.js` | 0 | 79 |
| `en/templates/components/news_feed.html` | 0 | 28 |
| `en/templates/pages/admin/settings.html` | 0 | 54 |
| `en/templates/pages/review.html` | 0 | 122 |
| `en/test/newsroom-public.test.js` | 2 | 3 |
| `en/worker/ai/api.js` | 1 | 1 |
| `en/worker/api.js` | 3 | 88 |
| `en/worker/asset-version.js` | 1 | 1 |
| `en/worker/auth.js` | 0 | 29 |
| `en/worker/breadcrumbs.js` | 0 | 1 |
| `en/worker/component-engine.js` | 0 | 10 |
| `en/worker/controllers.js` | 1 | 598 |
| `en/worker/database/affiliate-accounts.js` | 0 | 10 |
| `en/worker/database/affiliate-partners.js` | 0 | 16 |
| `en/worker/database/affiliate-programs.js` | 0 | 10 |
| `en/worker/database/audit.js` | 0 | 28 |
| `en/worker/database/authors.js` | 0 | 22 |
| `en/worker/database/casinos.js` | 0 | 17 |
| `en/worker/database/components.js` | 0 | 4 |
| `en/worker/database/content-items.js` | 0 | 6 |
| `en/worker/database/content-landing-pages.js` | 0 | 3 |
| `en/worker/database/custom-types.js` | 0 | 16 |
| `en/worker/database/faqs.js` | 0 | 22 |
| `en/worker/database/item-access-api.js` | 1 | 13 |
| `en/worker/database/item-access.js` | 0 | 19 |
| `en/worker/database/news.js` | 0 | 89 |
| `en/worker/database/payment-methods.js` | 0 | 4 |
| `en/worker/database/platform-updates.js` | 0 | 27 |
| `en/worker/database/reports.js` | 1 | 3 |
| `en/worker/database/review-criteria.js` | 0 | 12 |
| `en/worker/database/seo-pages.js` | 0 | 14 |
| `en/worker/database/stats.js` | 0 | 38 |
| `en/worker/database/tracking-links.js` | 0 | 4 |
| `en/worker/database/user_dashboard.js` | 0 | 7 |
| `en/worker/index.js` | 1 | 121 |
| `en/worker/site-context.js` | 0 | 1 |
| `en/worker/site-settings.js` | 0 | 32 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-5-cleanup.patch
git apply ~/storage/downloads/lummet-tenant-v22-5-cleanup.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-5-cleanup-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-5-cleanup-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-5-cleanup-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/newsroom-public.test.js test/perf-assets.test.js test/page-cache.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.5: Cleanup (backups, patches, zips, dead code)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 51`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
