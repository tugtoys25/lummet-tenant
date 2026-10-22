# Architecture: the request router (`worker/index.js` + `worker/app/`)

Since v22.20 `worker/index.js` (891 lines) is only the outer wrapper (page cache, timing header, content-write cache bump, static headers, maintenance fallback). The rest moved to `worker/app/`:

| File | What it does |
|---|---|
| `app/app-worker.js` | `appWorker.fetch`: Lummet subdomain, PWA manifest, static assets, then asks each route group in turn; the 404 page if none owns the route. `appWorker.scheduled` calls `scheduled.js`. |
| `app/scheduled.js` | `runScheduled`: the cron work (cleanups, aggregation, reports, health checks, cache warm-up). |
| `app/maintenance.js` | The static 503 maintenance page. |
| `app/routes/index.js` | `ROUTE_GROUPS`, the groups in the order they are tried. |
| `app/routes/not-handled.js` | `NOT_HANDLED`, what a group returns for a route type it does not own. |

## Route groups

| File | Function | Cases | Holds |
|---|---|---:|---|
| `app/routes/public-pages.js` | `handlePublicPages` | 33 | Public pages: home, sign-in and newsletter links, casinos, content types, comparisons, reviews, news, countries, research, categories, affiliate and go links |
| `app/routes/listings.js` | `handleListings` | 10 | Dashboard home and the public list pages |
| `app/routes/dashboard-content.js` | `handleDashboardContent` | 36 | Dashboard pages for content (casinos, items, types, comparisons, landing pages, reviews, news, settings, AI, research) |
| `app/routes/dashboard-admin.js` | `handleDashboardAdmin` | 37 | Authors, the rest of the dashboard and the signed-in user area |
| `app/routes/services.js` | `handleServices` | 5 | Media, favicon, super API, API, redirects |
| `app/routes/sitemaps.js` | `handleSitemaps` | 19 | Every sitemap |
| `app/routes/misc.js` | `handleMisc` | 3 | robots.txt, dynamic pages, 404 |

A group is one `switch (route.type)`; its `default` returns `NOT_HANDLED`, so the next group is tried. A route type is a case in exactly one group, so the order does not change any result (a test checks this, and that every type `getRoute()` can return has a case).

## Adding a page

Add the route in `worker/routes.js`, the `case` in the group where it belongs (call the controller, same as the cases around it), and import the controller in that group file. Nothing else.

## Next in the restructuring

`worker/super/handlers.js`, `worker/ai/retrieval.js` and the large admin template `templates/pages/admin/settings.html`.
