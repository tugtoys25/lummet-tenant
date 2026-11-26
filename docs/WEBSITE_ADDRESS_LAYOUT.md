# Website address layout (/en/, root or custom prefix)

Developer reference. Shipped in PR #110 (layout) and #111 (platform-built links). Source: `en/worker/url-layout.js`.

## What it is
Administrators choose where the public site lives: under `/en/` (default), at the root (`example.com/news`) or under a custom prefix (`example.com/us/news`), and may override single pages. The choice is made in **Settings > General > Website address** (administrators only).

**The internal shape never changes.** Every router, controller, template, cache key and test still sees `/en/<page>`. The layout is a translation layer at the Worker's front door; nothing that existed before was edited to support it, apart from the few hook points listed below.

## What keeps working (guarantees)
- **Default is a no-op.** Layout `en` with no page rules makes `withUrlLayout` return `inner(request)` untouched: the same request object in, the same response out, no body read.
- **Dashboard, admin and API stay on `/en/`** in every layout (`/en/dashboard/...`, `/en/admin...`, `/en/api/...`). Their scripts, fetch calls and webhooks are never rewritten or moved.
- **`/en/` always still answers.** A page that moved is still reachable at its `/en/` address (internal form). Browsers asking for HTML get a 301 to the new address (switch: `url_legacy_redirect`); `fetch()` and API calls get no redirect.
- **System routes win.** An address that already resolves to a route outside `/en/` (robots.txt, sitemap.xml, `/media`, `/static`, ...) is never translated, so a page named like a system route cannot shadow it. Custom prefixes cannot be `en, static, media, api, admin, dashboard, login, logout, robots.txt, sitemap.xml, favicon.ico, assets`.
- **Casino tracking, `/en/go/<code>`** and its redirects are untouched; in root layout the same links are also available at `/go/<code>` (it is a public page like any other) and `/en/go/...` keeps working.
- **Fail closed.** A bad stored value, a missing table or a database error yields the default layout. The layout is read at most once per 30 seconds per isolate.

## Settings (table `settings`, owner `core`)
| Key | Values | Notes |
|---|---|---|
| `url_layout` | `en` (default), `root`, `custom` | `custom` needs a valid prefix, otherwise treated as `en` |
| `url_custom_prefix` | 1 to 24 of a-z, 0-9, `-` | lower-cased; reserved names refused |
| `url_page_overrides` | one rule per line, `/page = root\|en\|custom` | a rule covers the page and everything below it; longest rule wins; max 200 rules |
| `url_legacy_redirect` | `1` (default) / `0` | 301 from the old `/en/` page address |

## Admin API
`GET|POST /en/api/v1/settings/url-layout`, administrators only (others get 403; the panel hides itself).
- GET returns `{ layout: { url_layout, url_custom_prefix, url_page_overrides, url_legacy_redirect }, examples: [{from,to}] }`.
- POST validates (known layout, prefix rules, every override line understood), saves the four keys, clears the 30 s layout cache, writes audit action `url_layout_changed`, clears the site-settings cache and bumps the page-cache epoch. Returns the saved values and fresh examples. Errors are 400 with a plain message.
- The general `/api/v1/settings/save` endpoint is unchanged and not used by the panel.

## How it works
1. **Inbound** (`toInternal`): the public path is mapped to `/en/...` when it belongs to a movable page under the active layout. Internal (`/en/...`) paths pass through.
2. **Outbound** (`rewriteBody`, `rewriteLocation`): for `text/html`, `text/xml`, `text/plain`, `application/xml|xhtml+xml|rss+xml|atom+xml|ld+json|manifest+json` and the `Location` header, every `/en/...` page address (relative, or same-origin absolute) becomes its public form. `/en/api`, `/en/admin`, `/en/dashboard`, other origins and look-alikes such as `/english` or `/static/en/` are left alone. Plain JSON API responses are not rewritten.
3. **Caches** store the internal form (the request is rewritten before the page cache), so switching layouts needs no cache purge beyond the epoch bump the API does.
4. **Platform-built links** (`worker/site-context.js`): `site.url(path)` now applies `publicUrl`, so links the platform generates in code (AI assistant answers and its link guard, emails, structured data, push URLs that use `site.url`) match the public addresses. Both sides of the AI link guard use the same function, so an allowed link stays allowed; a made-up old-style `/en/...` link in root layout is still replaced by the homepage link.

Hook points in existing code: `worker/index.js` (`fetch` now wraps the old body, moved unchanged to `fetchInner`), `worker/site-context.js` (`url()` x2), `worker/api/routes/settings.js` (new route), `worker/site-profile/ownership.js` (four keys registered), `templates/pages/admin/settings/general.html` and `templates/layout/base.html` (panel and script), `static/js/admin/url-layout.js` (new, in the pinned admin script order after `settings-ux`).

## Known limits
- Scripts that build `/en/...` links in the browser still work but take one redirect hop for HTML navigations.
- Pages cached by clients, CDNs or saved AI answers keep old-style links until they expire.
- Moving a live site changes its search-engine addresses; the 301 redirects carry ranking over, but plan Search Console and sitemap resubmission.
- Static files that embed `/en/` text (not served as HTML/XML) are not rewritten.
- Per-page rules match by path prefix of the internal page (`/news` also covers `/news/story`).

## Rollback
Settings > General > Website address > "Under /en/ (default)" > Save, or set `url_layout` to `en` in the `settings` table; takes effect within 30 seconds. Nothing is deleted by switching.

## Tests
`en/test/url-layout.test.js`: mapping both ways, reserved names, per-page precedence, body and redirect rewriting, 301 rules, POST bodies surviving, database failure fallback, admin API permissions and validation, `site.url`, AI link guard. `admin-js-structure.test.js` pins the admin script order and listener count.

## Not verified live
The panel in a browser; a real deploy in root and custom layouts (sitemap, robots, login, media); search-engine behaviour after a move.
