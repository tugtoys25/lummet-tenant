# Release: AI Studio and a wider public assistant (tenant v20.0)

Built on tenant v19.9. Control plane untouched. Nothing removed, no migration.

## What changed

- New **AI Studio** page (Administration menu, `/en/dashboard/ai-studio`) with 16 tools: copy, SEO, FAQs and reviews for casinos, sportsbooks, affiliate partners and custom items; compare items; research drafting, claim extraction, fact-check and source briefs (can read up to 3 web addresses); news drafts, headlines and social posts; translation, rewrite modes, summaries; SEO packs and tags; and a no-AI content audit. The old AI Generator stays.
- The AI never publishes. Saving creates an unpublished news draft, a research draft, unverified claims, or fills SEO/description fields on an item you pick.
- The public Lummet AI now also finds published sportsbooks, partners and custom items (only for countries allowed to see them) and published research (verified claims only).
- Admin AI JSON answers are read even when wrapped in code fences.
- Guards: facts-only prompts, source text treated as data, web address checks, per-tool permissions, 40 model calls per user per 15 minutes, every generation logged. Details: `docs/PLATFORM_UPGRADES.md` section 26.

## Numbers

Counted with `git diff --numstat` against v19.9, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **15** | **1441** | **4** |

New: 4, modified: 11, deleted: 0. Tests: 1064 pass (full suite); focused set (7 files) 203 pass. Migrations: **none**.
Deleted files: **none**.

## New files (4)

| File | + | - |
|---|---:|---:|
| `en/static/js/ai-studio.js` | 277 | 0 |
| `en/templates/pages/admin/ai-studio.html` | 10 | 0 |
| `en/test/ai-studio.test.js` | 281 | 0 |
| `en/worker/ai/studio.js` | 701 | 0 |

## Modified files (11)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 23 | 0 |
| `en/static/css/header-hero.css` | 20 | 0 |
| `en/templates/layout/admin-nav.html` | 1 | 0 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/test/dashboard-shell.test.js` | 1 | 1 |
| `en/worker/ai/retrieval.js` | 110 | 2 |
| `en/worker/ai/understand.js` | 3 | 1 |
| `en/worker/api.js` | 6 | 0 |
| `en/worker/controllers.js` | 3 | 0 |
| `en/worker/index.js` | 3 | 0 |
| `en/worker/routes.js` | 1 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v20-0-ai-studio.patch
git apply ~/storage/downloads/lummet-tenant-v20-0-ai-studio.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v20-0-ai-studio-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v20-0-ai-studio-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v20-0-ai-studio-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v20.0: AI Studio"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 203`. Hard-refresh after the deploy. The AI service (Workers AI binding) must be connected on the site, or the tools say so and only the audit works.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
