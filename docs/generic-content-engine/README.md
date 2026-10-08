# Generic Content Engine

Evolves the Casino + Review architecture into a reusable content/review/comparison
platform supporting Casino, Sportsbook, Affiliate Partner, and Custom content types,
without changing any existing casino behavior, route, or data.

Built across 8 phases (see `CHANGES-phase*.md` in this folder for the full narrative
of each), then integrated into the `cssnight`/Research-Engine branch on 2026-09-20
(see `INTEGRATION-cssnight-merge.md`).

## Architecture at a glance

```
                    CONTENT ENGINE
                         |
          +--------------+--------------+
          |              |              |
       CASINO        SPORTSBOOK      AFFILIATE PARTNER
    (casinos table)  (content_items)  (content_items)
          |              |              |
          +--------------+--------------+
                         |
                       CUSTOM
                   (content_items,
              custom_content_types,
              custom_field_definitions/values)
                         |
              +----------+----------+
              |                     |
           REVIEWS              COMPARISONS
        (reviews table,       (comparisons,
      reviewed_content_type/  comparison_items)
      reviewed_content_id)
```

**Casino data was never migrated.** `casinos` stays exactly as it was. A new
`content_items` table holds sportsbook/affiliate_partner/custom data only. An
application-level resolver (`worker/content-resolver.js`) normalizes both into one
shape for shared rendering code, without copying casino data anywhere.

## Database (migrations `0051`, `0052`)

> Originally authored as `0045`/`0046`. Renumbered during the 2026-09-20 integration
> because the parallel Research Engine work had already claimed `0045`-`0050` on the
> branch this was merged into. See `INTEGRATION-cssnight-merge.md` for the full story.

New tables (all additive — `CREATE TABLE IF NOT EXISTS`, nothing dropped or altered
outside `reviews`):

| Table | Purpose |
|---|---|
| `content_items` | sportsbook / affiliate_partner / custom item storage |
| `content_categories`, `content_geo` | generic parallels to `casino_categories`/`geo_rules` (those two are untouched) |
| `sports`, `content_sports` | sportsbook sports coverage (normalized, not JSON) |
| `currencies`, `content_currencies` | supported currencies (normalized) |
| `content_payment_methods` | generic join onto the *existing* `payment_methods` table |
| `custom_content_types`, `custom_field_definitions`, `custom_field_values` | tenant-defined content types with typed fields |
| `comparisons`, `comparison_items` | persistent, SEO-indexable comparison pages |
| `review_criteria_templates`, `review_criteria_scores` | weighted review scoring, computed centrally (never in frontend JS) |

One non-additive change: `reviews.casino_slug` needed to become nullable in the
original design, and two new nullable columns were needed:
`reviewed_content_type`, `reviewed_content_id`. **Deployed as an `ALTER TABLE ADD
COLUMN` + backfill `UPDATE`, not a table rebuild** — see
`POST-DEPLOYMENT-FIX-0052.md` in this folder for why: the Cloudflare D1 web console
rejects `BEGIN TRANSACTION`/`COMMIT`, and while fixing that, live schema inspection
found production `reviews` tables carry columns (`author`, `author_title`,
`reviewed_at`) never captured in this repo's migration history — a table-rebuild
approach would have silently dropped them. `casino_slug` is therefore **not**
nullable in the deployed schema (it still has its original `NOT NULL`); that's fine
since nothing yet creates a review for a non-casino content type. Every existing
review was backfilled to `reviewed_content_type = 'casino'`, pointing at that
review's casino — verified with zero data loss on the first deployed environment.
See `rollback_0052_reviews_generic_rebuild.sql` for the (also console-safe) rollback.

## Routes

| Type | Routes |
|---|---|
| Casino (unchanged) | `/en/casino`, `/en/casino/{slug}`, `/en/review/{slug}` |
| Sportsbook | `/en/sportsbook`, `/en/sportsbook/{slug}`, `/en/sportsbook/review/{slug}` |
| Affiliate Partner | `/en/affiliate-partner`, `/en/affiliate-partner/{slug}`, `/en/affiliate-partner/review/{slug}` |
| Custom | `/en/custom/{typeSlug}`, `/en/custom/{typeSlug}/{slug}`, `/en/custom/{typeSlug}/review/{slug}` |
| Comparisons | `/en/compare/{type}`, `/en/compare/{type}/{slug}` |

`/en/affiliate/{slug}` (the pre-existing affiliate **marketing** page) is untouched
and deliberately not reused — Affiliate Partner **content** lives under
`/en/affiliate-partner/...` specifically to avoid colliding with it.

All new routes are registered before the `FALLBACK DYNAMIC PAGE ENGINE` catch-all in
`worker/routes.js` (`/en/(.+)`, which matches multi-segment paths) — required, or
they'd be silently swallowed by the dynamic-page lookup instead.

## Content-type enablement

`worker/content-types.js` reads a `content_types_enabled` JSON value from the
existing `settings` table (seeded by migration `0051`, defaulted to
`{"casino":true,"sportsbook":false,"affiliate_partner":false,"custom":false}` on
every environment — nothing new appears anywhere until a site explicitly turns a
type on). Checked consistently at: routing, listings, sitemaps, and the admin API —
not only route resolution.

## Admin

`/en/dashboard/content-items`, `/en/dashboard/custom-types`, `/en/dashboard/comparisons`
(+ their `/create` forms), wired through the existing `renderAdminPage()` auth
pattern (role check, no new auth code) and the existing `permissions` table (new
resource strings: `content_items`, `custom_content_types`, `comparisons` — role-based
with item-level (`user_item_access`) scoping on content items and comparisons).
API endpoints under `/api/v1/content-item*`, `/api/v1/custom-type*`,
`/api/v1/comparison*`, `/api/v1/generic-review*` in the shared `worker/api.js` router.
Full CRUD (create / read / update / delete) exists for content items, custom types
(incl. full field replace/reorder), comparisons and generic reviews. See
`CHANGES-pass2.md` for the latest additions (GEO, categories, related items,
CONTENT_VIEW analytics).

## Testing

`en/test/generic-content-engine*.test.js` — added to this repo's existing
`node --test` suite (`npm test`), using its own `test/support/d1-shim.js` +
`fixtures.js`. Covers: content-item CRUD, cross-type resolver normalization,
custom-type/field definitions, cross-item comparisons, weighted-rating math, and —
the most rigorous layer — real RBAC checks against the actual `handleAPI()` router
(an editor with the right permission row succeeds, a role with none gets a real 403).

A dedicated security suite (`generic-content-engine-security.test.js`) exists because
custom fields render admin-entered values as public HTML: every field type is tested
against script-tag injection, `javascript:` URLs, and attribute-breakout payloads.
One real vulnerability was found and fixed this way during development — a URL field
sanitized its scheme but not its quote characters, allowing attribute breakout — see
that test file's "regression" test for the exact payload that used to get through.

As of this integration: **238/238 tests pass** (the pre-existing 201 + 37 new),
confirmed by actually running `npm test` against the merged repository.

## Pass 3 (on top of pass 2 / CHANGES-pass2.md)

All 7 previously-open items are now built. Full suite: 756/756.

- **SEO landing pages for generic types** (migration 0061, `content_landing_pages`)
  -- a deliberately smaller, separate system from the casino `seo_pages` one
  (one item grid per page, manual or auto selection, public URL `/en/best/:slug`).
- **Sportsbook tracking/affiliate URL** -- added `content_items.tracking_url`
  (migration 0060) rather than reusing `linked_affiliate_partner_id` (that
  column means a different thing: a link to a commercial AffiliatePartner
  relationship). Outbound clicks go through `/en/go-content/:type/:slug`,
  which logs a `CONTENT_CLICK` analytics event and redirects -- deliberately
  **not** wired into the casino `tracking_links`/`click_id`/postback
  pipeline, which is the protected commercial-attribution system; this is a
  lighter editorial tracked-link, not a new revenue-attribution entry point.
  If you want sportsbook clicks in that pipeline later, that's a deliberate
  follow-up decision, not something this pass made silently.
- **Logo and hero image media pickers** -- wired to the existing
  `MediaPicker.openImagePicker()` component on both content-item forms.
- **Editorial Pick picker** -- now the same searchable picker the
  comparison **items** list already used, single-select.
- **Structured review content** -- wired the existing
  `/api/v1/review-blocks/*` endpoints (already generic, keyed by the
  globally-unique `reviews.slug`) into the new review edit page below.
  No backend work was needed; it was pure admin-UI wiring.
- **Admin list pagination** -- `page`/`per_page` query params on
  content-items, custom-types, comparisons and generic-reviews list
  endpoints; omitted = unbounded (every existing caller is unaffected).
- **A full edit page for generic reviews** -- `/en/dashboard/generic-review/edit/:id`,
  with the structured-blocks editor above, author, SEO fields, and delete.

A real bug was found and fixed along the way: `CONTENT_CLICK` (the new
tracked-link event) was missing from `analytics.js`'s event-type whitelist,
so it logged nothing and raised no error -- added, with a regression test
guarding the whitelist itself.

See `CHANGES-pass3.md` for the full breakdown.

## What's NOT built yet

Verified against the code on the pass-2 integration (see `GENERIC-CONTENT-ENGINE-GAPS-AND-BUGS.md`
for the per-item audit and its status table):

- **SEO landing-page generation** (country+category combinations) for the new types.
  The existing system (migration 0019, `seo-landing.html`, `casino_grid` /
  `casino_editorial` / `casino_spotlights` sections, `casino_mode`) is casino-specific
  end to end; extending it is its own feature.
- **Affiliate/tracking URL for sportsbook items** (audit #7) — needs a design decision
  (new column vs. reusing `linked_affiliate_partner_id`) because it touches tracked
  monetization links.
- **Media picker** for `logo_media_id` / `featured_image_media_id` (audit #5, #6).
- **Editorial-pick item picker** in the comparison forms (audit #8; the *items* list
  uses a searchable picker, the single "Editorial Pick" ID is still a number input).
- Structured review content (audit #14), admin-list pagination (audit #15),
  a full edit page for generic reviews (publish/unpublish/delete/author exist).
