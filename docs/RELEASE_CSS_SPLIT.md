# Release: stylesheets generated from source parts (tenant v22.29)

Built on tenant v22.28. Control plane untouched. **No migration.** `main.css` (2,559 lines), `dashboard.css` (2,069) and `supportive.css` (1,948) are now written as 26 parts in `en/css-src/` and generated into the same single files by a script.

## Why

CSS depends on source order, and a split into several `<link>` files would mean more requests on every page. So the served files stay exactly as they are (one per stylesheet, same URL, same bytes, same `?v=` hash), and only the way they are written changes. No build step is added at deploy: the generated files are committed, like `worker/asset-version.js`.

## What changed

- **`en/css-src/main/`** (11 parts), **`dashboard/`** (8), **`supportive/`** (7): each part starts at a top-level comment between two rules and is at most 308 lines. Parts are joined in file-name order, which is the cascade order. The folder is not served.
- **`en/scripts/build-css.mjs`**: writes `static/css/<name>.css` from the parts; `--check` fails if a generated file is stale.
- **`en/test/css-build.test.js`** (11 tests): generated file = concatenation of parts, numbering and size of parts, every part brace-balanced (one documented exception), the scripts' `--check` pass. Editing a part without running the script fails the suite.
- `docs/ARCHITECTURE_CSS.md`, `en/css-src/README.md`, `docs/PLATFORM_UPGRADES.md` section 67.
- The three `static/css/*.css` files are **not in this patch**: they are unchanged.

## Proof the behaviour is the same

- The three generated files are **byte-identical** to the v22.28 files (`cmp`), so every page gets the same CSS as before. `node scripts/asset-version.mjs --check` passes with the same hash, so browsers keep their cached copies.

## Found, not changed: a brace missing in `supportive.css`

Line 403 of `supportive.css` opens `@media (max-width:520px){` and never closes it. The browser therefore treats the last ~1,540 lines (sections 31.1 to 32.24: core typography, readability, section spacing, forms) as part of that media query, so they apply only on screens 520px wide or narrower, not on desktop or tablet. Checked in Chromium (the last top-level rule is that media rule with 131 nested rules). The split keeps this exactly as it was; closing the brace would change how the live site looks on desktop and needs a visual check, so it is a separate release. See `docs/ARCHITECTURE_CSS.md`.

## Numbers

Counted with `git diff --numstat` against v22.28, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **31** | **6779** | **0** |

New: 30, modified: 1, deleted: 0. Tests: **1,231 pass** (1,220 before + 11 new). Migrations: **none**.

## New files (30)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_CSS.md` | 77 | 0 |
| `en/css-src/README.md` | 10 | 0 |
| `en/css-src/dashboard/01-admin-shell.css` | 223 | 0 |
| `en/css-src/dashboard/02-media-library.css` | 264 | 0 |
| `en/css-src/dashboard/03-media-cards.css` | 240 | 0 |
| `en/css-src/dashboard/04-media-picker-dark-mode.css` | 281 | 0 |
| `en/css-src/dashboard/05-editor-base-and-states.css` | 291 | 0 |
| `en/css-src/dashboard/06-editor-chrome-and-dialogs.css` | 290 | 0 |
| `en/css-src/dashboard/07-editor-content-responsive.css` | 246 | 0 |
| `en/css-src/dashboard/08-editor-dark-mode-and-forms.css` | 234 | 0 |
| `en/css-src/main/01-foundation-header-hero.css` | 222 | 0 |
| `en/css-src/main/02-homepage-hero.css` | 116 | 0 |
| `en/css-src/main/03-cards-sidebar-detail-pages.css` | 242 | 0 |
| `en/css-src/main/04-utilities-and-patches.css` | 242 | 0 |
| `en/css-src/main/05-content-pages.css` | 191 | 0 |
| `en/css-src/main/06-footer-review-summary-faq.css` | 285 | 0 |
| `en/css-src/main/07-components-banners-overflow.css` | 181 | 0 |
| `en/css-src/main/08-sitemap.css` | 272 | 0 |
| `en/css-src/main/09-platform-updates.css` | 299 | 0 |
| `en/css-src/main/10-news-articles-responsive.css` | 201 | 0 |
| `en/css-src/main/11-news-cards-theme-seo-pages.css` | 308 | 0 |
| `en/css-src/supportive/01-foundation-header-components.css` | 298 | 0 |
| `en/css-src/supportive/02-responsive-print-core-typography.css` | 261 | 0 |
| `en/css-src/supportive/03-content-metadata-news-cards.css` | 281 | 0 |
| `en/css-src/supportive/04-cards-sidebar-tables-forms-footer.css` | 285 | 0 |
| `en/css-src/supportive/05-mobile-contrast-links-section-rhythm.css` | 279 | 0 |
| `en/css-src/supportive/06-spacing-and-rhythm.css` | 285 | 0 |
| `en/css-src/supportive/07-forms-dashboard-mobile-spacing.css` | 259 | 0 |
| `en/scripts/build-css.mjs` | 46 | 0 |
| `en/test/css-build.test.js` | 60 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (1)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |

## Install (Termux)

Needs v22.28 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-29-css-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-29-css-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/build-css.mjs --check && node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/css-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.29: big stylesheets generated from css-src parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1231`, `fail 0`.

After deploy open the home page, a casino page, a news article and a dashboard page (Media library, a page with the rich editor). They must look exactly as before, because the CSS bytes are the same.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
