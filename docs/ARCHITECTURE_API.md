# Architecture: the API (`/api/v1/*`)

Since v22.14 the API is no longer one 6,000-line file. `en/worker/api.js` is a 52-line entry that decides the order things happen in; the endpoints live in small files grouped by area.

## What happens to a request

```
worker/api.js  handleAPI(request, env, path, user)
  1. api/public.js     routes that work signed out: login, register, newsletter, public lists, postback
  2. api/gate.js       signed-in check (401) and role permission checks (403)
  3. api/platform.js   dashboard, AI Studio, Geo Manager
  4. api/routes/*.js   every other route, one file per area (the list below), tried in the order of routes/index.js
  5. nothing matched   404 {"success": false, "error": "Endpoint not found"}
```

Steps 1 to 3 run outside the error handler, as before. Step 4 runs inside it: an error thrown by a route becomes `500 {"success": false, "error": "<message>"}`.

Every route is an exact `path === "/api/v1/..."` match (with an optional method check), and a path + method pair exists in one place only. `test/api-structure.test.js` checks that, so the order of the groups never changes what a request does.

## Files

| File | Area | Route blocks | Lines |
|---|---|---:|---:|
| `routes/casinos.js` | Casinos: create, update, delete, list, get | 5 | 214 |
| `routes/content-items.js` | Generic content items, sports and currencies lists, enabled content types | 11 | 356 |
| `routes/landing-pages.js` | Content landing pages | 5 | 110 |
| `routes/custom-types.js` | Custom content types | 5 | 105 |
| `routes/comparisons.js` | Comparisons | 6 | 115 |
| `routes/generic-reviews.js` | Generic reviews | 5 | 111 |
| `routes/reviews.js` | Reviews and review blocks | 9 | 165 |
| `routes/news.js` | News and the newsroom | 5 | 153 |
| `routes/pages.js` | Pages | 4 | 95 |
| `routes/categories.js` | Categories | 6 | 77 |
| `routes/settings.js` | Site settings | 2 | 81 |
| `routes/stats.js` | Dashboard statistics | 3 | 44 |
| `routes/platform-updates.js` | Platform updates | 4 | 184 |
| `routes/seo-pages.js` | SEO landing pages | 9 | 205 |
| `routes/geo.js` | Geo rules | 3 | 64 |
| `routes/ai.js` | AI review, chat and feedback | 5 | 77 |
| `routes/payment-methods.js` | Payment methods | 10 | 101 |
| `routes/countries.js` | Countries | 6 | 74 |
| `routes/research.js` | Research items, sources, claims, relations, versions, review queue, datasets | 35 | 430 |
| `routes/components.js` | Page components and the component studio | 16 | 187 |
| `routes/ad-rules.js` | Ad rules | 5 | 86 |
| `routes/seo.js` | SEO meta | 4 | 42 |
| `routes/authors.js` | Authors | 6 | 57 |
| `routes/media.js` | Media library, folders and uploads | 16 | 189 |
| `routes/nav.js` | Navigation and geo navigation | 7 | 150 |
| `routes/permissions.js` | Role permissions | 4 | 61 |
| `routes/item-access.js` | Item-level access and assignments | 10 | 45 |
| `routes/user-dashboard.js` | Signed-in user: bookmarks, inquiries, notifications, submissions, profile | 12 | 106 |
| `routes/admin.js` | Admin: users, notifications, subscribers, email campaigns, submissions, inquiries | 14 | 240 |
| `routes/affiliate-partners.js` | Affiliate partners and contacts | 7 | 138 |
| `routes/affiliate-programs.js` | Affiliate programs | 8 | 147 |
| `routes/affiliate-accounts.js` | Affiliate accounts | 5 | 92 |
| `routes/commercial-terms.js` | Commercial terms | 5 | 96 |
| `routes/postback-configs.js` | Postback configurations | 8 | 132 |
| `routes/imports.js` | Conversion report imports | 3 | 70 |
| `routes/provider-adapters.js` | Provider adapters | 6 | 99 |
| `routes/offers.js` | Offers | 9 | 148 |
| `routes/tracking-links.js` | Tracking links | 10 | 182 |
| `routes/analytics.js` | Analytics overview, time series, geo, cron health, manual jobs | 7 | 146 |
| `routes/analytics-alerts.js` | Analytics alerts and alert rules | 6 | 89 |
| `routes/campaigns.js` | Campaigns | 4 | 89 |
| `routes/reports.js` | Reports and schedules | 9 | 261 |
| `routes/banners.js` | Banners | 4 | 40 |
| `helpers.js` | `json`, `success`, `failure`, `validate`, `requireAdmin`, the `NOT_HANDLED` marker | | |

Handler functions that only one area uses (for example `createCasino`) sit at the bottom of that area's file. Anything used by two or more areas is in `helpers.js`.

## Adding or changing an endpoint

1. Open the file for the area (`routes/offers.js` for offers).
2. Add an `if (path === "/api/v1/offer/archive" && request.method === "POST") { ... return json(...); }` block before the final `return NOT_HANDLED;`.
3. A route must return a `Response`. If it does not match, do nothing: the group ends with `return NOT_HANDLED;` and the next group is tried.
4. Permissions: add the path prefix to the read map (GET) or write map (POST/PUT/DELETE) in `api/gate.js`. A path with no entry is open to every signed-in user.
5. A new area gets its own file in `routes/`, an `import` and an entry in `routes/index.js`. Keep a file under 600 lines (a test enforces it); split by area when it grows.

## What did not change

Paths, methods, permissions, the response bodies and the status codes are the same. The one difference is described in `docs/RELEASE_API_SPLIT.md` (validation errors in 18 create/update/delete endpoints).

## Next in the restructuring

`worker/controllers.js` (page rendering, 6,779 lines), `static/js/admin.js` (8,051 lines), then `worker/index.js` routing, `worker/site-settings.js` and `static/js/dashboard.js`. Same method: move code verbatim into modules by area, prove the behaviour is unchanged, keep the tests green after every step.
