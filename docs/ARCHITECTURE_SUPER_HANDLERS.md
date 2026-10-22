# Architecture: super API handlers (`worker/super/handlers.js` + `worker/super/handlers/`)

Since v22.21 `worker/super/handlers.js` (1,359 lines) is a facade that re-exports its 123 handlers from 17 modules in `worker/super/handlers/`. `worker/super/router.js` still does `import * as h from "./handlers.js"` and nothing else changed. The other `handlers-*.js` files in `worker/super/` (affiliate, ai, analytics, newsroom, reporting, research) were already separate.

## Parts

| File | Holds | Exports | Lines |
|---|---|---:|---:|
| `handlers/helpers.js` | Response helpers (`json`, `ok`, `created`, `fail`), `readJsonBody`, `validateRequired`, `filterSafeSettings` | 0 | 63 |
| `handlers/system.js` | Handshake, health, capabilities | 3 | 38 |
| `handlers/casinos.js` | Casinos (and `listAllReviews`) | 6 | 113 |
| `handlers/reviews-news.js` | Reviews and news | 10 | 86 |
| `handlers/pages-categories.js` | Pages and categories | 10 | 77 |
| `handlers/research.js` | Research items | 5 | 47 |
| `handlers/payments-seo-meta.js` | Payment methods and SEO meta | 9 | 86 |
| `handlers/countries-authors.js` | Countries and authors | 10 | 67 |
| `handlers/media.js` | Media library and uploads | 7 | 148 |
| `handlers/settings-users.js` | Settings and users | 6 | 60 |
| `handlers/components-blocks.js` | Components and blocks | 10 | 70 |
| `handlers/permissions-access.js` | Permissions and per-user item access | 8 | 107 |
| `handlers/review-blocks-ad-rules.js` | Review blocks and ad rules | 8 | 83 |
| `handlers/nav-banners.js` | Navigation items and banners | 10 | 67 |
| `handlers/platform-updates.js` | Platform updates | 5 | 42 |
| `handlers/seo-pages.js` | SEO pages and country/category discovery | 9 | 122 |
| `handlers/inbox-subscribers.js` | Inquiries, submissions, notifications, newsletter subscribers | 8 | 94 |

`helpers.js` is shared by all the others (its helpers are not part of the facade). `reviews-news.js` also imports `listAllReviews` from `casinos.js`. No cycles (a test checks it).

## Rules

- A handler is `handleVerbThing(request, env, idOrSlug, bodyText)`. Add it to the part for its topic, re-export it by name in `worker/super/handlers.js`, and map it in `router.js`.
- Keep parts under 300 lines (a test checks it).

## Next in the restructuring

`worker/ai/retrieval.js` and the large admin template `templates/pages/admin/settings.html`.
