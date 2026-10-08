# Generic Content Engine — pass 3 (the 7 "not built yet" items)

Builds on pass 2. Full suite: **756/756 passing** (711 + 45 new). Two additive migrations.

## Migrations
- `0060_content_items_media_tracking.sql` — adds nullable `content_items.tracking_url`.
- `0061_content_landing_pages.sql` — new tables `content_landing_pages` / `content_landing_page_items`, plus RBAC rows (editor: read/create/update, no delete; admin: full) for a new `content_landing_pages` permission resource.

Apply both, any order relative to code deploy, same as migration 0059 in pass 2:
```sql
-- via Cloudflare dashboard D1 console, or wrangler d1 execute if you have it
-- paste the contents of each file, in order (0060 then 0061)
```
Verify:
```sql
SELECT name FROM pragma_table_info('content_items') WHERE name='tracking_url';
SELECT name FROM sqlite_master WHERE type='table' AND name='content_landing_pages';
```

## What was built
1. **SEO landing pages** (`/en/best/:slug`) — admin list/create/edit/delete, manual item picker or auto top-N, GEO-filtered, reuses `buildContentItemCards`.
2. **Sportsbook tracking URL** — `content_items.tracking_url` + `/en/go-content/:type/:slug` tracked redirect (`CONTENT_CLICK` analytics event). Deliberately separate from the casino `tracking_links`/postback pipeline — see README for the reasoning.
3. **Logo/hero media pickers** — wired to the existing `MediaPicker` component on both content-item forms.
4. **Editorial Pick picker** — single-select version of the same search picker comparison items already use.
5. **Structured review content** — the existing `/api/v1/review-blocks/*` endpoints (already generic) wired into the new review edit page. No backend change needed.
6. **Admin pagination** — `page`/`per_page` on content-items, custom-types, comparisons, generic-reviews lists. Omitted = unbounded, existing callers unaffected.
7. **Full generic-review edit page** — `/en/dashboard/generic-review/edit/:id`: all fields, author, SEO, structured blocks, delete. New `/api/v1/generic-review/get` endpoint (generic-only, same guard as update/delete).

## Bug found and fixed
`CONTENT_CLICK` was missing from `analytics.js`'s `VALID_EVENT_TYPES` whitelist — every tracked-link click logged nothing and raised no error (the logger silently drops unknown event types by design, for best-effort telemetry). Added to the whitelist; added a regression test that guards the whitelist itself, not just this one event type.

## Design decisions made without asking first (documented, not hidden)
- **`tracking_url` as a new column**, not reusing `linked_affiliate_partner_id` — they mean different things (a tracked outbound link vs. a link to a commercial partner relationship).
- **A new, separate landing-page system**, not an extension of the casino `seo_pages` system — that system is casino-specific end to end (country×category matrix, `casino_grid`/`casino_editorial`/`casino_spotlights`, `casino_mode`); extending it would mean rewriting it generic, a much bigger and riskier change than building a smaller parallel system.
- **`/en/go-content/...` is not wired into `tracking_links`/postback/commission attribution.** If sportsbook clicks should feed that system later, that is a revenue-attribution decision that deserves an explicit yes, not something to bolt on inside a doc-gap cleanup pass.

## Files changed
29 files: 2 new migrations, 1 new DB module (`content-landing-pages.js`), 5 new admin templates, 1 new test file (45 tests), plus `api.js`, `controllers.js`, `routes.js`, `index.js`, `breadcrumbs.js`, `dashboard.js`, `author-admin.js`, `analytics.js`, and the DB modules for content-items/comparisons/custom-types/generic-reviews (all additive: optional parameters, existing call signatures unchanged).
