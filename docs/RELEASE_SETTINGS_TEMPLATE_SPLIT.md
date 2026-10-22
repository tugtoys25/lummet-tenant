# Release: template includes, and the settings page split (tenant v22.23)

Built on tenant v22.22. Control plane untouched. **No migration.** Templates can now include other templates, and `en/templates/pages/admin/settings.html` (1,275 lines) becomes a 54-line skeleton over 17 part files.

## Why

The admin settings page was one 1,275-line template with 14 unrelated sections (general, analytics, branding, favicons, theme, layout, homepage, responsible gambling, footer, ads and more) plus its script. Tenth step of the restructuring (API v22.14, controllers v22.15, admin script v22.16, dashboard script v22.17, rich editor v22.18, site settings v22.19, router v22.20, super handlers v22.21, AI retrieval v22.22).

## What changed

- **Renderer** (`en/worker/render.js`): `<!--@include pages/admin/settings/general.html-->` on its own line is replaced by that file's exact text when a template is loaded (`expandIncludes`). Parts go through the same per-request template cache, can nest (4 levels), and a missing part or a loop throws an error instead of rendering a broken page.
- **`en/templates/pages/admin/settings.html`**: the page wrapper, the contents bar, the form opening, 17 include lines, the closing tags.
- **17 new parts in `en/templates/pages/admin/settings/`**: general, analytics, gpwa, branding, favicons, theme, layout, theme-preview, hero, homepage-content, responsible-gambling, footer, compliance-logos, news-ads, form-end, ad-rules, scripts.
- `docs/ARCHITECTURE_TEMPLATE_INCLUDES.md`; `docs/PLATFORM_UPGRADES.md` section 61.
- New `test/template-includes.test.js` (7 tests). Three older tests that read the settings page as text now use `test/support/template-source.js`.

## Proof the behaviour is the same

- The expanded template is **byte-identical** to the old file (checked while splitting).
- **298 rendered pages** (anonymous and admin), old vs new, including `/en/dashboard/settings`: identical (status, content type, redirect target, body hash).

## Numbers

Counted with `git diff --numstat` against v22.22, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **26** | **1396** | **1243** |

New: 20, modified: 6, deleted: 0. Tests: **1,206 pass** (1,199 before + 7 new). Migrations: **none**.

## New files (20)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_TEMPLATE_INCLUDES.md` | 45 | 0 |
| `en/templates/pages/admin/settings/ad-rules.html` | 86 | 0 |
| `en/templates/pages/admin/settings/analytics.html` | 21 | 0 |
| `en/templates/pages/admin/settings/branding.html` | 27 | 0 |
| `en/templates/pages/admin/settings/compliance-logos.html` | 20 | 0 |
| `en/templates/pages/admin/settings/favicons.html` | 86 | 0 |
| `en/templates/pages/admin/settings/footer.html` | 15 | 0 |
| `en/templates/pages/admin/settings/form-end.html` | 20 | 0 |
| `en/templates/pages/admin/settings/general.html` | 68 | 0 |
| `en/templates/pages/admin/settings/gpwa.html` | 65 | 0 |
| `en/templates/pages/admin/settings/hero.html` | 16 | 0 |
| `en/templates/pages/admin/settings/homepage-content.html` | 45 | 0 |
| `en/templates/pages/admin/settings/layout.html` | 168 | 0 |
| `en/templates/pages/admin/settings/news-ads.html` | 58 | 0 |
| `en/templates/pages/admin/settings/responsible-gambling.html` | 49 | 0 |
| `en/templates/pages/admin/settings/scripts.html` | 70 | 0 |
| `en/templates/pages/admin/settings/theme-preview.html` | 190 | 0 |
| `en/templates/pages/admin/settings/theme.html` | 222 | 0 |
| `en/test/support/template-source.js` | 18 | 0 |
| `en/test/template-includes.test.js` | 57 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/templates/pages/admin/settings.html` | 17 | 1239 |
| `en/test/component-studio.test.js` | 2 | 1 |
| `en/test/header-hero.test.js` | 2 | 1 |
| `en/test/site-title-description.test.js` | 2 | 1 |
| `en/worker/render.js` | 18 | 1 |

## Install (Termux)

Needs v22.22 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-23-settings-template-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-23-settings-template-split.patch
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
| **Total** | **26** | **1396** | **1243** |

New: 20, modified: 6, deleted: 0. Tests: **1,199 pass** (1,196 before + 3 new). Migrations: **none**.

## New files (20)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_TEMPLATE_INCLUDES.md` | 45 | 0 |
| `en/templates/pages/admin/settings/ad-rules.html` | 86 | 0 |
| `en/templates/pages/admin/settings/analytics.html` | 21 | 0 |
| `en/templates/pages/admin/settings/branding.html` | 27 | 0 |
| `en/templates/pages/admin/settings/compliance-logos.html` | 20 | 0 |
| `en/templates/pages/admin/settings/favicons.html` | 86 | 0 |
| `en/templates/pages/admin/settings/footer.html` | 15 | 0 |
| `en/templates/pages/admin/settings/form-end.html` | 20 | 0 |
| `en/templates/pages/admin/settings/general.html` | 68 | 0 |
| `en/templates/pages/admin/settings/gpwa.html` | 65 | 0 |
| `en/templates/pages/admin/settings/hero.html` | 16 | 0 |
| `en/templates/pages/admin/settings/homepage-content.html` | 45 | 0 |
| `en/templates/pages/admin/settings/layout.html` | 168 | 0 |
| `en/templates/pages/admin/settings/news-ads.html` | 58 | 0 |
| `en/templates/pages/admin/settings/responsible-gambling.html` | 49 | 0 |
| `en/templates/pages/admin/settings/scripts.html` | 70 | 0 |
| `en/templates/pages/admin/settings/theme-preview.html` | 190 | 0 |
| `en/templates/pages/admin/settings/theme.html` | 222 | 0 |
| `en/test/support/template-source.js` | 18 | 0 |
| `en/test/template-includes.test.js` | 57 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/templates/pages/admin/settings.html` | 17 | 1239 |
| `en/test/component-studio.test.js` | 2 | 1 |
| `en/test/header-hero.test.js` | 2 | 1 |
| `en/test/site-title-description.test.js` | 2 | 1 |
| `en/worker/render.js` | 18 | 1 |

## Install (Termux)

Needs v22.21 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-23-settings-template-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-23-settings-template-split.patch
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
