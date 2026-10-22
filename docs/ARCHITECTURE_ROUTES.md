# Tenant router (worker/routes.js, worker/routing/)

`getRoute(request)` used to be one 714-line function: a long list of `if (path matches) return {type...}` checks where the first match wins. It is now a 37-line entry plus four groups. Each group is a function `(path[, request])` holding the original statements in their original order; it returns the route object, or `null` so the next group is tried.

| File | Lines | Holds |
|---|---:|---|
| `worker/routes.js` | 37 | Trailing-slash and `/` handling, then the four groups, then `not_found`. |
| `worker/routing/public.js` | 220 | Home, listing pages, casino, sportsbook, affiliate partner, content landing pages, tracked links, custom types, generic reviews, comparisons. |
| `worker/routing/content.js` | 228 | Casino reviews, news, updates, countries, categories, payment methods, research, category x country, authors, affiliate, `/go`. |
| `worker/routing/dashboard.js` | 97 | Dashboard pages. |
| `worker/routing/system.js` | 187 | Login and user pages, media (GET only), favicon, super API, API, sitemaps, dynamic page catch-all. |

Order is the behaviour: a new specific route goes before the catch-all in `system.js`, and a route that could shadow another goes after it. `test/routes-structure.test.js` guards the order.
