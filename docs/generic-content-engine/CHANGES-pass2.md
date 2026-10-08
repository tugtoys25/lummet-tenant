# Generic Content Engine — pass 2 (on top of ac25d8d / aa83ab2)

Full suite on the integrated tree: **708/708 passing** (upstream 626+40, + 42 new here).
One additive migration: `0059_analytics_content_item.sql`.

## Built
1. **GEO** — `content_geo` (migration 0051, previously unused): admin rule editor, badges on list cards, status line on detail pages. Same model as casino `geo_rules` (no rules ⇒ blocked; exact country wins; allow-only ⇒ others blocked; block-only ⇒ others allowed). Reuses existing `geo-badge*` CSS.
2. **Categories** — `content_categories` (also unused): read/write + admin checkboxes.
3. **Related items + KV cache** on sportsbook / affiliate-partner / custom pages. Mirrors `renderCasino()` (`env.CACHE`, 300 s, key `related_content:{type}:{id}:{country}`). Category-match scoring, rating/featured tiebreak, published + GEO-eligible only.
4. **CONTENT_VIEW analytics** per detail view (`ctx.waitUntil`, fire-and-forget). Migration 0059 adds nullable `analytics_events.content_item_id` + index (not `casino_id`: separate table, ids overlap).
5. **Audit-doc items**: generic-review delete/publish/author/View, content-item View link, license on the public sportsbook page (see the status table in `GENERIC-CONTENT-ENGINE-GAPS-AND-BUGS.md`).

## Bugs found and fixed
- `/api/v1/generic-review/update` accepted a **casino** review's id and edited it. Update/delete/list are now restricted to generic reviews at both API and DB layer (`casino_slug = ''` sentinel + non-casino type).
- `buildContentItemCards` (list cards, all 3 types) interpolated `name`/`description` unescaped → escaped.
- **Deploy-order hazard caught before shipping**: naming `content_item_id` in every `logEvent` INSERT would have silently dropped *all* existing analytics on any tenant where 0059 wasn't applied. The column is now only named for events that carry a content item; tested against a DB with the column removed.
- Deleting a content item left orphan rows in `content_sports/currencies/payment_methods/categories/geo` (polymorphic, no FK) → cleaned on delete.
- `generic-reviews/list` had no RBAC read gate → added.
- Admin forms cannot silently wipe categories/GEO when their option lists fail to load.
- GEO API: country must exist in `countries`; status only `allowed|blocked`; no duplicates; omitted `geo_rules` = untouched, `[]` = clear. `redirect_url`/`bonus_override` deliberately not accepted (nothing renders them; the URL would need its own sanitising).

## Know before deploying
- **An item with no GEO rules shows "Not Available" and is excluded from Related** (same default casinos have). Add ≥1 country rule to each live item.
- Visitors with no country header default to `RW` (existing `geo.js`).
- Related items are cached 300 s: an unpublished item can linger in another item's Related block for up to 5 minutes (same trade-off as casino).

## Migration (any order relative to code deploy — safe either way)
```
wrangler d1 execute <brand>-db --remote --file=en/migrations/0059_analytics_content_item.sql
# verify:
wrangler d1 execute <brand>-db --remote --command "SELECT name FROM pragma_table_info('analytics_events') WHERE name='content_item_id';"
```
Repeat per tenant DB (no automated migration tracking in this repo).

## Not done (see README "What's NOT built yet")
SEO landing pages for generic types; sportsbook tracking/affiliate URL (needs a design decision); logo/hero media pickers; Editorial-Pick picker; structured reviews; admin pagination; full generic-review edit page.
