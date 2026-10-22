# Release: header-hero stylesheet in parts (tenant v22.42)

Built on tenant v22.41. Control plane untouched. **No migration. No behaviour change.** `en/static/css/header-hero.css` (812 lines) is now generated from eight parts in `en/css-src/header-hero/` by `scripts/build-css.mjs` (a fourth bundle next to `main`, `dashboard` and `supportive`). Parts: header and announcement bar, hero layout and colours, hero media and video, hero parts, admin hero editor, admin panels and search, generic reviews and section builder, geo rules and AI Studio. Docs: `docs/ARCHITECTURE_CSS.md`, `docs/PLATFORM_UPGRADES.md` section 80.

## Proof the behaviour is the same

- The generated `static/css/header-hero.css` is **byte-identical** to the old file (`cmp`). The browser gets the same bytes from the same URL, and the asset version does not change.
- `test/css-build.test.js` now covers four bundles: numbering, size, brace balance, and "generated file is up to date". `build-css.mjs --check` and `asset-version.mjs --check` pass.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **827** | **81** |

New: 8, modified: 4, deleted: 1. Tests: **1,282 pass** (1,279 before + 3 for the new bundle). Migrations: **none**.

## New files (8)

| File | + | - |
|---|---:|---:|
| `en/css-src/header-hero/01-header-and-announcement.css` | 89 | 0 |
| `en/css-src/header-hero/02-hero-layout-and-colours.css` | 64 | 0 |
| `en/css-src/header-hero/03-hero-media-and-video.css` | 140 | 0 |
| `en/css-src/header-hero/04-hero-parts.css` | 35 | 0 |
| `en/css-src/header-hero/05-admin-hero-editor.css` | 128 | 0 |
| `en/css-src/header-hero/06-admin-panels-and-search.css` | 139 | 0 |
| `en/css-src/header-hero/07-generic-reviews-and-builder.css` | 147 | 0 |
| `en/css-src/header-hero/08-geo-rules-and-ai-studio.css` | 70 | 0 |

## Deleted files (1)

| File | + | - |
|---|---:|---:|
| `docs/RELEASE_SETTINGS_FORM_SPLIT.md` | 0 | 76 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_CSS.md` | 2 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/scripts/build-css.mjs` | 2 | 2 |
| `en/test/css-build.test.js` | 2 | 2 |

## Install (Termux)

Needs v22.41 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-42-header-hero-css-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-42-header-hero-css-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/css-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.42: header-hero stylesheet in 8 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1282`, `fail 0`.

Nothing visible changes (same CSS bytes). To confirm, open the home page and Admin, Header & Hero once after a hard refresh.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
