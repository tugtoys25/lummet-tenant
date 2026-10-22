# Release: API split into modules (tenant v22.14)

Built on tenant v22.13 (with the migration-workflow fix). Control plane untouched. **No migration. Nothing deleted. No page, style or script changed.**

## Why

`en/worker/api.js` was one function of about 5,500 lines (325 route blocks in a row) plus 800 lines of helpers. Nobody can find, review or safely change an endpoint in that. This is the first step of the restructuring: the API, split by area.

## What changed

- `en/worker/api.js` is now a **52-line entry** that only decides the order: public routes, sign-in and permission checks, platform routes, then the route groups.
- **45 new files in `en/worker/api/routes/`**: 43 route groups (casinos, news, research, media, analytics, reports, ...) and `index.js` that lists them in order.
- `en/worker/api/`: `public.js` (signed-out routes), `gate.js` (sign-in and role permission checks), `platform.js` (dashboard, AI Studio, Geo Manager), `helpers.js` (response builders, validation).
- Route blocks were moved without editing them. Imports of each file list only what it uses (checked with a linter: no undefined names, no unused imports).
- `docs/ARCHITECTURE_API.md` explains the layout and how to add an endpoint. `docs/PLATFORM_UPGRADES.md` section 52.
- Tests: new `test/api-structure.test.js` (9 tests: every group registered, one place per route, entry file small, files under 600 lines, plus behaviour). Seven older tests that read the API as source text now read all its files through `test/support/api-source.js`.

## Proof the behaviour is the same

The same 3,392 requests (424 paths, 4 roles: signed out, admin, editor, user, with GET and POST) were sent to the old and the new code on an empty test database. **3,365 answers are identical** (status and body).

**One deliberate difference (27 of the 3,392 answers, 18 endpoints):** a validation error such as "slug is required" used to escape the API's error handler and reach the site-wide maintenance fallback, so the admin saw the maintenance page. It now answers like every other API error: `500 {"success": false, "error": "slug is required"}`. Endpoints: `casino/create|update|delete`, `news/create|update|delete`, `page/create|update`, `review/create|update`, `platform-updates/create|update|delete`, `seo-pages/create|update|delete|generate-draft`, `ai/review`.

## Numbers

Counted with `git diff --numstat` against v22.13, excluding the three generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **60** | **6690** | **6007** |

New: 51 (44 route files + 7 others), modified: 9, deleted: 0. Tests: **1,162 pass** (full suite: 1,153 before + 9 new). Migrations: **none**.

## New files (51)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_API.md` | 85 | 0 |
| `en/test/api-structure.test.js` | 86 | 0 |
| `en/test/support/api-source.js` | 19 | 0 |
| `en/worker/api/gate.js` | 321 | 0 |
| `en/worker/api/helpers.js` | 56 | 0 |
| `en/worker/api/platform.js` | 47 | 0 |
| `en/worker/api/public.js` | 370 | 0 |
| `en/worker/api/routes/ad-rules.js` | 84 | 0 |
| `en/worker/api/routes/admin.js` | 239 | 0 |
| `en/worker/api/routes/affiliate-accounts.js` | 91 | 0 |
| `en/worker/api/routes/affiliate-partners.js` | 137 | 0 |
| `en/worker/api/routes/affiliate-programs.js` | 146 | 0 |
| `en/worker/api/routes/ai.js` | 72 | 0 |
| `en/worker/api/routes/analytics-alerts.js` | 88 | 0 |
| `en/worker/api/routes/analytics.js` | 145 | 0 |
| `en/worker/api/routes/authors.js` | 56 | 0 |
| `en/worker/api/routes/banners.js` | 39 | 0 |
| `en/worker/api/routes/campaigns.js` | 88 | 0 |
| `en/worker/api/routes/casinos.js` | 208 | 0 |
| `en/worker/api/routes/categories.js` | 75 | 0 |
| `en/worker/api/routes/commercial-terms.js` | 95 | 0 |
| `en/worker/api/routes/comparisons.js` | 114 | 0 |
| `en/worker/api/routes/components.js` | 186 | 0 |
| `en/worker/api/routes/content-items.js` | 352 | 0 |
| `en/worker/api/routes/countries.js` | 71 | 0 |
| `en/worker/api/routes/custom-types.js` | 104 | 0 |
| `en/worker/api/routes/generic-reviews.js` | 110 | 0 |
| `en/worker/api/routes/geo.js` | 59 | 0 |
| `en/worker/api/routes/imports.js` | 69 | 0 |
| `en/worker/api/routes/index.js` | 92 | 0 |
| `en/worker/api/routes/item-access.js` | 44 | 0 |
| `en/worker/api/routes/landing-pages.js` | 109 | 0 |
| `en/worker/api/routes/media.js` | 188 | 0 |
| `en/worker/api/routes/nav.js` | 147 | 0 |
| `en/worker/api/routes/news.js` | 148 | 0 |
| `en/worker/api/routes/offers.js` | 147 | 0 |
| `en/worker/api/routes/pages.js` | 90 | 0 |
| `en/worker/api/routes/payment-methods.js` | 99 | 0 |
| `en/worker/api/routes/permissions.js` | 60 | 0 |
| `en/worker/api/routes/platform-updates.js` | 177 | 0 |
| `en/worker/api/routes/postback-configs.js` | 131 | 0 |
| `en/worker/api/routes/provider-adapters.js` | 98 | 0 |
| `en/worker/api/routes/reports.js` | 260 | 0 |
| `en/worker/api/routes/research.js` | 428 | 0 |
| `en/worker/api/routes/reviews.js` | 158 | 0 |
| `en/worker/api/routes/seo-pages.js` | 195 | 0 |
| `en/worker/api/routes/seo.js` | 41 | 0 |
| `en/worker/api/routes/settings.js` | 77 | 0 |
| `en/worker/api/routes/stats.js` | 43 | 0 |
| `en/worker/api/routes/tracking-links.js` | 180 | 0 |
| `en/worker/api/routes/user-dashboard.js` | 105 | 0 |

Deleted files: **none**.

## Modified files (9)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/ai-feedback.test.js` | 2 | 1 |
| `en/test/ai-studio.test.js` | 2 | 1 |
| `en/test/component-hero.test.js` | 2 | 1 |
| `en/test/component-studio.test.js` | 4 | 3 |
| `en/test/header-hero.test.js` | 2 | 1 |
| `en/test/newsroom-api.test.js` | 4 | 3 |
| `en/test/newsroom-public.test.js` | 3 | 2 |
| `en/worker/api.js` | 32 | 5995 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-14-api-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-14-api-split.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-14-api-split-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-14-api-split-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-14-api-split-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/api-structure.test.js test/newsroom-api.test.js test/ai-studio.test.js test/generic-content-engine-api.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.14: API split into modules (worker/api/)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current`, the focused set to pass, and the full suite `pass 1162`, `fail 0` (a few minutes on a phone). Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, open the admin dashboard, a list page (Casinos, News) and save one item to confirm.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
