# Release: site settings split into modules (tenant v22.19)

Built on tenant v22.18. Control plane untouched. **No migration.** `en/worker/site-settings.js` (1,771 lines) becomes a facade that re-exports the same 8 functions from 9 modules in `en/worker/site-settings/`.

## Why

`site-settings.js` mixed the defaults, the settings loader, the web manifest, homepage section rendering, analytics snippets, the compliance block and the theme CSS builder. Sixth step of the restructuring (API v22.14, controllers v22.15, admin script v22.16, dashboard script v22.17, rich editor v22.18).

## What changed

- **9 new modules in `en/worker/site-settings/`**: defaults, manifest, helpers, get-site-settings, homepage-cards, homepage-sections, analytics, compliance, theme. No import cycles.
- **`en/worker/site-settings.js`** keeps its path and its public API (`getSiteSettings`, `buildSiteManifest`, `buildHomepageSectionsHtml`, `buildGaScript`, `buildGpwaSeal`, `buildGpwaScript`, `buildComplianceHtml`, `buildThemeCss`) as plain re-exports. No importer changed.
- `docs/ARCHITECTURE_SITE_SETTINGS.md` lists every part. `docs/PLATFORM_UPGRADES.md` section 57.
- New `test/site-settings-structure.test.js` (4 tests).

## Proof the behaviour is the same

- Token for token: every top-level statement of the old file exists once in the new files; only `import`/`export` lines were added. Imports were generated from scope analysis.
- **6,535 calls** of the eight public functions old vs new, with each of the 61 settings replaced by 16 awkward values (script injection, bad colours, broken CSS, bad URLs, JSON) and 4 homepage-section variants loaded through `getSiteSettings`: **identical output**.
- **298 rendered pages** (anonymous and admin): identical.

## Numbers

Counted with `git diff --numstat` against v22.18, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **1850** | **1763** |

New: 11, modified: 2, deleted: 0. Tests: **1,187 pass** (1,183 before + 4 new). Migrations: **none**.

## New files (11)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_SITE_SETTINGS.md` | 36 | 0 |
| `en/test/site-settings-structure.test.js` | 40 | 0 |
| `en/worker/site-settings/analytics.js` | 72 | 0 |
| `en/worker/site-settings/compliance.js` | 44 | 0 |
| `en/worker/site-settings/defaults.js` | 201 | 0 |
| `en/worker/site-settings/get-site-settings.js` | 348 | 0 |
| `en/worker/site-settings/helpers.js` | 47 | 0 |
| `en/worker/site-settings/homepage-cards.js` | 163 | 0 |
| `en/worker/site-settings/homepage-sections.js` | 353 | 0 |
| `en/worker/site-settings/manifest.js` | 88 | 0 |
| `en/worker/site-settings/theme.js` | 441 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/site-settings.js` | 7 | 1763 |

## Install (Termux)

Needs v22.18 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-19-site-settings-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-19-site-settings-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/site-settings-structure.test.js test/site-title-description.test.js test/header-hero.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.19: site settings split into worker/site-settings/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1187`, `fail 0`. Deploy failures at "cron triggers" (code 10072) are the Free plan's limit of 5, not this release.

After deploy, open the home page and one casino page: logo, favicon, theme colours, homepage sections and the footer should look as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
