# Architecture: stylesheets (`en/css-src/` + `scripts/build-css.mjs`)

Since v22.29 the largest stylesheets (`header-hero.css` since v22.42, `responsive.css` since v22.43) are written as source parts and generated into the same single files as before:

| Served file (unchanged URL) | Lines | Source parts |
|---|---:|---|
| `static/css/main.css` | 2,559 | 11 in `css-src/main/` |
| `static/css/dashboard.css` | 2,069 | 8 in `css-src/dashboard/` |
| `static/css/supportive.css` | 1,948 (2,019 since v22.30) | 8 in `css-src/supportive/` |
| `static/css/header-hero.css` | 812 | 8 in `css-src/header-hero/` |
| `static/css/responsive.css` | 742 | 6 in `css-src/responsive/` |

The browser still gets **one file per stylesheet**: no extra requests, no `@import`, no build step at deploy (the generated files are committed, like `worker/asset-version.js`). `css-src/` is outside `/static/`, so it is not served.

## Working with it

```bash
# edit a part in css-src/<name>/, then:
node scripts/build-css.mjs          # rewrites static/css/<name>.css
node scripts/asset-version.mjs      # new ?v= hash
node scripts/build-css.mjs --check  # CI/test: fails if a generated file is stale
```

- Parts are joined in file-name order, and CSS depends on order, so a rule that must win goes in a later part.
- A part starts at a top-level comment, between two rules. Keep it under about 320 lines; add a new numbered part rather than growing one (a test checks size, numbering and that the generated file matches).
- A new stylesheet that is small does not need parts; add its name to `BUNDLES` in the script only when it grows.

## Parts

### main.css

| File | Lines |
|---|---:|
| `css-src/main/01-foundation-header-hero.css` | 222 |
| `css-src/main/02-homepage-hero.css` | 116 |
| `css-src/main/03-cards-sidebar-detail-pages.css` | 242 |
| `css-src/main/04-utilities-and-patches.css` | 242 |
| `css-src/main/05-content-pages.css` | 191 |
| `css-src/main/06-footer-review-summary-faq.css` | 285 |
| `css-src/main/07-components-banners-overflow.css` | 181 |
| `css-src/main/08-sitemap.css` | 272 |
| `css-src/main/09-platform-updates.css` | 299 |
| `css-src/main/10-news-articles-responsive.css` | 201 |
| `css-src/main/11-news-cards-theme-seo-pages.css` | 308 |

### dashboard.css

| File | Lines |
|---|---:|
| `css-src/dashboard/01-admin-shell.css` | 223 |
| `css-src/dashboard/02-media-library.css` | 264 |
| `css-src/dashboard/03-media-cards.css` | 240 |
| `css-src/dashboard/04-media-picker-dark-mode.css` | 281 |
| `css-src/dashboard/05-editor-base-and-states.css` | 291 |
| `css-src/dashboard/06-editor-chrome-and-dialogs.css` | 290 |
| `css-src/dashboard/07-editor-content-responsive.css` | 246 |
| `css-src/dashboard/08-editor-dark-mode-and-forms.css` | 234 |

### supportive.css

| File | Lines |
|---|---:|
| `css-src/supportive/01-foundation-header-components.css` | 298 |
| `css-src/supportive/02-responsive-print-core-typography.css` | 261 |
| `css-src/supportive/03-content-metadata-news-cards.css` | 281 |
| `css-src/supportive/04-cards-sidebar-tables-forms-footer.css` | 285 |
| `css-src/supportive/05-mobile-contrast-links-section-rhythm.css` | 273 |
| `css-src/supportive/06-spacing-and-rhythm.css` | 285 |
| `css-src/supportive/07-forms-dashboard-mobile-spacing.css` | 259 |
| `css-src/supportive/08-theme-text-on-dark-surfaces.css` | 50 |

## The `supportive.css` brace (fixed in v22.30)

Until v22.29 line 403 of `supportive.css` opened `@media (max-width:520px){` and never closed it, so the browser parsed the last ~1,540 lines (sections 31.1 to 32.24: typography, readability, spacing, forms) inside that media query: they applied only at 520px and below. Closing it makes them apply everywhere, as the file intended. Those sections were written for a light page, while the site theme is dark (`--theme-text` is forced to white in `main.css`), so v22.30 also adds part `08-theme-text-on-dark-surfaces.css`: headings, section intros, admin headings and form labels that sit directly on the page background use the theme text colours, and the white dashboard cards keep dark text (the card list is at the top of that part). In v22.30 `.main-content a` link colours were also made low-specificity (`:where(...)`), so component links (breadcrumbs, tabs) keep their own colours.

Checked with a contrast audit of every visible text element on 88 pages at 1280, 768 and 390px (264 page views): 1,379 elements that were unreadable (for example white on white card titles on desktop, dark on dark headings on phones) are now readable and none got worse; no new horizontal overflow. When you add a new white card to the dashboard and its text is hard to read, add its class to the card list in part 08.

## Next in the restructuring

`header-hero.css` (812 lines) and `responsive.css` (742) if wanted.
