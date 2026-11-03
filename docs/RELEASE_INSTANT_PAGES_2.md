# Release: Instant pages, part 2 (tenant v22.62)

Built on v22.61. **No migration.** Control plane: no change in this release.

1. **Campaign links share the cached page.** `?utm_*`, `fbclid`, `gclid`, `msclkid` and similar are ignored for caching (`cacheSearch` in `worker/page-cache.js`). Any other query string (`?page=2`, `?geo=CA`) is still never cached.
2. **An admin save no longer causes slow visits.** A page stored before the save is served to anonymous visitors at once (`x-page-cache: stale`) and re-rendered in the background; the next visitor gets the new page. Signed-in visitors (cookie `session`) always get a fresh render. `PAGE_CACHE_STRICT=1` restores the old "retire at once" behaviour. A moved or deleted page is dropped when its refresh sees it; "not found" copies are never served stale.
3. **One stylesheet for public pages.** `static/css/public.css` is the same files `base.html` links, in the same order, joined and minified. It is generated: **never edit it**. The separate source files stay the only thing you edit; the dashboard still links them. After changing any CSS run **`npm run build:assets`** (build-css, then build-public-css, then asset-version). A test fails if it is out of date.
4. **Sidebar lists load sooner.** Public pages preload the four sidebar requests (same URLs `app.js` fetches), and `<meta charset>` is now first in the head.
5. **Early hint.** Public HTML carries `Link: </static/css/public.css?v=...>; rel=preload; as=style`.
6. `/` to `/en` redirect is cacheable for an hour.

Tests: 1471 pass (new: public CSS, preloads, early hint, campaign links, stale-after-save, strict mode, deleted pages).
