# Architecture: the page controllers

Since v22.15 the page controllers are no longer one 6,779-line file. `en/worker/controllers.js` is a re-export file (the same 117 names as before); the code lives in `en/worker/controllers/`, one file per area. Nothing that imports `./controllers.js` had to change.

## How a page is served

`worker/index.js` asks `worker/routes.js` which page type a URL is, then calls the matching controller (`renderCasino`, `renderNews`, `renderDashboardUsers`, ...). Each controller loads its data, fills a template through `Renderer` and returns a `Response`.

## Files

| File | Holds | Lines |
|---|---|---:|
| `controllers/ads.js` | Inline ad insertion: rule matching, insertion points, ad components. | 425 |
| `controllers/affiliates.js` | Affiliate partner pages and affiliate redirect page. | 231 |
| `controllers/auth-pages.js` | Login, register, forgot password and reset password pages. | 145 |
| `controllers/authors.js` | Author page and author list. | 304 |
| `controllers/casino-cards.js` | Casino cards, geo status and bonus display used by casino, review, country and category pages. | 451 |
| `controllers/casinos.js` | Casino page and casino list. | 257 |
| `controllers/categories.js` | Category page and category list. | 120 |
| `controllers/comparisons.js` | Comparison list and comparison page. | 229 |
| `controllers/content-items.js` | Sportsbook and custom content type list and item pages. | 377 |
| `controllers/countries.js` | Country page and country list. | 175 |
| `controllers/dashboard.js` | Admin dashboard pages (one small function per admin page) and the dashboard stats API. | 407 |
| `controllers/dynamic-pages.js` | Pages built from the Pages table (dynamic pages). | 106 |
| `controllers/generic-reviews.js` | Generic review page. | 230 |
| `controllers/home.js` | Home page. | 133 |
| `controllers/landing-pages.js` | Content landing pages. | 102 |
| `controllers/news.js` | News article, news list and news taxonomy pages. | 684 |
| `controllers/payment-methods.js` | Payment method list and page. | 119 |
| `controllers/platform-updates.js` | Platform updates list and update page. | 284 |
| `controllers/redirects.js` | Affiliate and tracked redirects and click recording. | 238 |
| `controllers/research.js` | Research hub, research type list, research item page and site search page. | 669 |
| `controllers/reviews.js` | Review page and review list. | 439 |
| `controllers/seo-pages.js` | SEO landing pages: country custom pages and category + country pages. | 426 |
| `controllers/shared.js` | Small helpers shared by the page controllers (escaping, dates, country names, timing). | 324 |
| `controllers/system-pages.js` | robots.txt, 404 page and the HTML sitemap page. | 87 |
| `controllers/user-pages.js` | Signed-in user pages (dashboard, submissions, inquiries, profile, notifications, bookmarks). | 67 |

Two kinds of files:

- **Page areas** (`casinos`, `news`, `research`, ...): the exported page functions of one area plus the helpers only that area uses.
- **Shared parts** (`shared`, `ads`, `casino-cards`, `redirects`): code used by several areas. `shared.js` has the small helpers (escaping, dates, country names, timing) and anything used by three or more areas; the others each hold one clear job.

Import direction: page areas import from the shared parts, never the other way round and never from each other except `categories`/`countries` using `seo-pages`. No file imports `controllers.js` (a test checks it).

## Changing a page

1. Find the area in the table (`routes.js` shows which controller serves a URL).
2. Edit that file. A helper used only there stays private to the file.
3. A helper needed by a second area moves to `shared.js` (or the matching shared part) and gets `export`.
4. A new page: add the function to its area file, `export` it, and add the name to the matching `export { ... } from "./controllers/<area>.js"` block in `controllers.js` so `index.js` can import it.

## What did not change

The code was moved without editing it. Names, outputs, headers and status codes are the same; see `docs/RELEASE_CONTROLLERS_SPLIT.md` for how that was checked.

Still in the file but unused (candidates for a later clean-up): `resolveCriterionValue` and `formatCriterionCellValue` (comparisons), the variable `hasManualMarkers` (ads) and an unused `url` in the news file.

## Next in the restructuring

`static/js/admin.js` (8,051 lines), then `worker/index.js` routing, `worker/site-settings.js`, `static/js/dashboard.js`, `static/js/rich-editor.js`.
