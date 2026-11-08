# Live banners (lummet-tenant, branch `live-banners`)

Adds a **Live banners** tab to Dashboard > Banner Management. Migration **0016_live_banners.sql** is included (additive; `banners` is untouched).

## What was built
- Tables `live_banners`, `live_banner_items` (references, FK cascade), `live_banner_stats` (one row per banner per day).
- `worker/live-banners/`: `escape`, `limits`, `validate` (allow-lists, unknown keys rejected, size caps), `templates` + `tpl-*` (11 templates), `target`, `load` (60s per-country cache, version-bumped on every admin write), `render`, `stats`, `hook`.
- API `worker/api/routes/live-banners.js` (`/api/v1/live-banners/list|templates`, `/api/v1/live-banner/get|create|update|publish|pause|duplicate|delete|reorder|preview`), gated to the `banners` permission. Public beacon `POST /en/api/v1/live-banner/event` (handled in `api/public.js`, off when feature banners is off).
- Public: `static/js/live-banners.js` (178 lines, no deps), CSS `12-live-banners.css`, `13-live-banners-templates.css`, new tokens in `base.html`.
- Admin: `static/js/live-banner-admin/01..06-*.js`, tablist (#live), dashboard CSS part 15.
- Old site bars: output is now escaped/validated and the admin table no longer uses innerHTML (separate commit, no schema or behaviour change).

## Deviations from the brief (please read)
- CSS parts are `12-` and `13-live-banners*.css`, not `08-`: `08-sitemap.css` exists and `css-build.test.js` enforces contiguous numbering.
- The picker's real entry point is `LummetPicker.open(opts, onPick)` (not `openPicker`).
- `isContentWrite()` in `page-cache.js` now ignores the visitor beacon; otherwise every beacon would bump the page-cache epoch and empty the cache. Admin writes bump it already through that same function (no extra code needed).
- `loadLiveBannerMarkup` lives in `live-banners/hook.js`, not on the Renderer: `render-structure.test.js` pins the Renderer to 25 members.
- Slider slides are items with `source_type: "slide"` (own picture/link in `overrides`); they are not copies of other content.
- Page type/slug are derived from the URL path (`/en/<type>/<slug>`, `/en` = home).

## Behaviour notes / [OPEN]
- [OPEN] **Signed-in/anonymous targeting**: stored and validated, but public pages are rendered without a user, so "signed-in only" banners do not show on them. Needs a decision (a browser-side marker, or ignore).
- [OPEN] **Rate limit** for the beacon is per Worker isolate (in memory). It protects D1 from one noisy client but is not a global limit. Views/clicks are batched by the browser (max 20 per request) and written as one upsert per banner per request; there is no per-impression row.
- Pre-existing, left alone: `/api/v1/banner/*` (old bars) has no write-permission mapping in `gate.js`; any signed-in user can call it. Live banners are mapped.
- Frequency semantics: "every page" = dismissal lasts that page view only; "session" / "days" = remembered in sessionStorage / localStorage, with an in-memory fallback if storage is blocked.
- Edge/floating/bar banners are hidden until the script admits them; without JavaScript only inline banners show.
- Chat-style template is scripted only. No assistant "open" action was added (not verified in `lummet-ai.js`).

## Evidence
Ran: full `npm test` on **Node 22.23.4** (see PR notes for counts), `node scripts/build-css.mjs --check`, `build-public-css --check`, `asset-version --check`, syntax checks of every new JS file.
NOT run: Node 24 (not installed here), any real browser, the live site, `wrangler` dry-run. The admin UI, stacking, modal focus trap, carousel, countdown and edge tabs are **untested in a browser**.
