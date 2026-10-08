# Integration onto friday1version.zip (upstream at cc360d9)

Your uploaded codebase already had pass 1 and pass 2 committed (commit `288cf50`),
plus 4 newer upstream commits unrelated to this work:

- `74995e2` Analytics parity: Super API v15 (GEO, health, manual runs, dimension names)
- `21bfb91` Add Account 2 deployment configuration
- `7c08bab` Turnstile: read sitekey from env.TURNSTILE_SITEKEY instead of hardcoding
- `cc360d9` Add Blucca to Account 2 deployment

Pass 3 (the 7 "not built yet" items) was merged on as a 3-way patch rather than
a file copy, specifically so none of the above would be lost. Only one file
overlapped: `en/worker/controllers.js`, where upstream added the Turnstile
sitekey to `renderLogin`/`renderRegister`. That edit is confirmed intact in
the merged file — verified line-for-line against the upstream commit, not
assumed.

Full suite on the merged tree: **764/764 passing** (756 from pass 3 + 8 new
upstream tests from the Super API v15 commit).

## Stats for this integration

- **31 files changed**
- **9 new files**
- **22 modified files**
- **1799 lines added, 40 lines deleted**
- **2 new migrations**: `0060_content_items_media_tracking.sql`,
  `0061_content_landing_pages.sql`

New files:
- `docs/generic-content-engine/CHANGES-pass3.md`
- `en/migrations/0060_content_items_media_tracking.sql`
- `en/migrations/0061_content_landing_pages.sql`
- `en/templates/pages/admin/content-landing-page-create.html`
- `en/templates/pages/admin/content-landing-page-edit.html`
- `en/templates/pages/admin/content-landing-pages.html`
- `en/templates/pages/admin/generic-review-edit.html`
- `en/test/generic-content-engine-remaining-gaps.test.js`
- `en/worker/database/content-landing-pages.js`

Modified files: `docs/generic-content-engine/README.md`, `en/static/js/author-admin.js`,
`en/static/js/dashboard.js`, `en/templates/layout/admin-nav.html`,
`en/templates/pages/admin/{comparison-create,comparison-edit,comparisons,
content-item-create,content-item-edit,content-items,custom-types,generic-reviews}.html`,
`en/worker/{api,breadcrumbs,controllers,index,routes}.js`,
`en/worker/database/{analytics,comparisons,content-items,custom-types,generic-reviews}.js`.

## What your system can do now, after deploying this and applying the 2 migrations

**Public site**
- Sportsbook, affiliate-partner, and custom content items are never visible
  while in draft — neither at their own URL nor inside a published
  comparison, review, or related-items block.
- Each sportsbook/affiliate-partner/custom detail page shows a GEO
  availability badge, a Related Items block (cached 5 minutes), and
  (sportsbook) the license and a "Bet Now"/tracked outbound link if one is
  set.
- Every detail-page view logs a `CONTENT_VIEW` analytics event; every click
  on the tracked outbound link logs a `CONTENT_CLICK` event — both joinable
  to the item via `analytics_events.content_item_id`.
- New landing pages at `/en/best/:slug` — a curated or auto-generated grid
  of sportsbook/affiliate-partner/custom items, GEO-filtered, with its own
  SEO fields.

**Admin**
- Full CRUD (create/read/update/delete) for content items, custom types
  (including full field replace/reorder), comparisons, and generic reviews
  — including structured, titled content blocks on a review, author
  assignment, and a one-click publish/unpublish toggle.
- Content items: searchable category checkboxes, a per-country GEO rules
  editor, logo/hero image pickers (the same media library picker used
  elsewhere), and a tracking-URL field.
- Comparison builder: every item picker (including the single "Editorial
  Pick") is search-by-name, no more raw numeric IDs.
- All four admin list pages (content items, custom types, comparisons,
  generic reviews) are paginated instead of loading everything at once.
- A dedicated Landing Pages admin section: list, create, edit, delete, with
  the same searchable item picker.
- Every GET list/detail endpoint in this system now enforces the same
  role permissions as the write endpoints (several had none before pass 2).

## What's still not built

Documented in `docs/generic-content-engine/README.md`'s "Pass 3" section and
`GENERIC-CONTENT-ENGINE-GAPS-AND-BUGS.md`'s status table — as of this
integration, every item from the original audit is built. The one
deliberate scope boundary that remains: the new sportsbook tracking link
(`/en/go-content/...`) is **not** wired into the casino `tracking_links` /
`click_id` / postback / commission-attribution pipeline. That pipeline is
the protected commercial-affiliate system; folding sportsbook clicks into it
is a revenue-attribution decision that needs your explicit sign-off, not
something to add inside a gap-closing pass.
