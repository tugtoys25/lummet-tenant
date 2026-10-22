# Release: supportive.css brace fixed, text readable on the dark theme (tenant v22.30)

Built on tenant v22.29. Control plane untouched. **No migration.** This release changes how the site looks on desktop and tablet; phone width changes only where text was unreadable.

## Why

Found in v22.29: line 403 of `supportive.css` opened `@media (max-width:520px){` and never closed it, so about 1,540 lines (core typography, readability, spacing, forms) applied only on screens 520px wide or narrower. On desktop and tablet that left text invisible in several places, for example white titles on white cards (sidebar widgets, dashboard cards), and on phones other text was dark on the dark page.

## What changed

- **Brace closed** in `en/css-src/supportive/02-responsive-print-core-typography.css` (one character). The typography and spacing of sections 31.x and 32.x now apply at every width, as the file intended.
- **New part `en/css-src/supportive/08-theme-text-on-dark-surfaces.css`**: those sections assumed a light page, but the theme is dark. Headings, section intros, admin headings, admin form labels and notes that sit directly on the page now use the theme text colours (`--text-strong`, `--text-secondary`, `--text-body`); the white dashboard cards keep dark text (the card list is at the top of the part).
- **Link rule** `.main-content a` etc. in part `05-...` is wrapped in `:where()` so component links (breadcrumbs, tabs, cards) keep their own colours instead of all turning gold.
- `static/css/supportive.css` regenerated (2,019 lines), `worker/asset-version.js` updated, so browsers fetch the new file.
- `test/css-build.test.js`: every part and every generated stylesheet must now be brace-balanced (the known-exception list is gone), so an unclosed block fails the suite.
- Docs: `docs/ARCHITECTURE_CSS.md`, `docs/PLATFORM_UPGRADES.md` section 68.

## Proof

Every visible text element on 88 pages (public pages, login, register, sitemap, search, about 70 dashboard pages) at 1280, 768 and 390px, 264 page views, measured for contrast against its real background, old CSS vs new CSS:

- **1,379 elements** that were unreadable (contrast under 3:1) are readable now.
- **0 elements got worse**, at the 3:1 and the 4.5:1 thresholds. Getting there took three rounds: the plain one-character fix alone made about 440 headings and labels on dark pages unreadable, which is why part 08 exists.
- No new horizontal overflow. Page height changes between -62px and +248px on desktop/tablet (larger headings and card titles), and at most -7px on phone.
- Not measured by this audit: text over gradients and images (hero banner) and spacing aesthetics. Look at these after deploy.

## What you will see

Sidebar widget titles on the home page ("Top Rated Casinos", "Latest News", ...), dashboard card titles ("Top Casinos by Clicks"), and several admin labels were invisible on desktop and are now readable. Headings are a little larger and tighter (sections 31/32 now apply). The small badge above the home hero title is white instead of gold. Cards and layout are otherwise the same.

## Numbers

Counted with `git diff --numstat` against v22.29, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **127** | **32** |

New: 1, modified: 7, deleted: 0. Tests: **1,231 pass** (same count; one test now checks every stylesheet is balanced). Migrations: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/css-src/supportive/08-theme-text-on-dark-surfaces.css` | 50 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_CSS.md` | 7 | 6 |
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/css-src/supportive/02-responsive-print-core-typography.css` | 1 | 1 |
| `en/css-src/supportive/05-mobile-contrast-links-section-rhythm.css` | 2 | 8 |
| `en/static/css/supportive.css` | 53 | 9 |
| `en/test/css-build.test.js` | 3 | 7 |
| `en/worker/asset-version.js` | 1 | 1 |

## Install (Termux)

Needs v22.29 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-30-css-brace-fix.patch
git apply ~/storage/downloads/lummet-tenant-v22-30-css-brace-fix.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/build-css.mjs --check && node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/css-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.30: supportive.css brace closed, theme text colours on dark page"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1231`, `fail 0`.

After deploy (hard refresh once, or wait for the new `?v=` hash), open: the home page (sidebar widget titles, section headings), a casino page, a news article, the login page, the dashboard overview, Settings, and one long form (Add Casino) at desktop width and on your phone. Titles and labels must be readable everywhere. If one is not, send me the page URL and a screenshot; it is usually a white card missing from the card list in part 08.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
