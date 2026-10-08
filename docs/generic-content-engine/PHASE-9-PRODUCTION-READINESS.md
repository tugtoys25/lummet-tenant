# Phase 9 — Production Readiness Pass

**Date:** 2026-09-21. Built on top of the deployed, migrated state (commit `04a2f6e`,
all 7 environments migrated with `0051`/`0052`).

Closes the gaps explicitly flagged as deferred in Phases 2-8: Update/Edit for every
resource, a settings UI (no more raw SQL for `content_types_enabled`), create UI for
generic (non-casino) reviews, and sample seed data.

## What's new

### Settings UI — `/en/dashboard/settings/content-types`
Replaces the raw-SQL `UPDATE settings ...` workflow entirely. Admin-only (checked
explicitly in the API handler, not just via the standard permission-row system —
a site-wide visibility toggle is a different trust level than ordinary content
editing). Casino can never be disabled, even if sent as `false`. Changes are live
immediately — the page says so.

### Update/Edit for every resource
- **Content items** (`/en/dashboard/content-item/edit/{type}/{slug}`) — full edit
  form, including custom field *values* now (Phase 8 only had field *definitions*).
  Slug changes aren't supported (create a new item instead) — flagged in the form
  itself, not a silent limitation.
- **Custom content types** (`/en/dashboard/custom-type/edit/{slug}`) — edit
  label/plural label/icon/review-comparison flags, and *add* new field definitions.
  Removing or reordering existing fields still isn't supported — doing so safely
  means deciding what happens to already-stored values for a removed field, which
  is a real product decision, not a small addition.
- **Comparisons** (`/en/dashboard/comparison/edit/{type}/{slug}`) — edit
  metadata, and fully replace the item list and criteria.
- Every list page (Content Items, Custom Types, Comparisons) now has an **Edit**
  button alongside Delete/View.

### Generic review creation — `/en/dashboard/review/generic/create`
The one gap I flagged most prominently in the testing guide: there was no way to
create a sportsbook/affiliate-partner/custom review except raw SQL. Now has a real
form — content-type dropdown, item picker populated from real data, title/slug/
content/pros/cons/rating/verdict.

**The `casino_slug` sentinel** (read `POST-DEPLOYMENT-FIX-0052.md` first if you
haven't): the live `reviews.casino_slug` column is still `NOT NULL` — making it
nullable would mean another table rebuild, and the last one nearly caused data loss
before being caught. Rather than risk that a second time for this feature, generic
reviews are written with `casino_slug = ''` (empty string), never `NULL`, never a
real slug — verified in tests to never collide with a real `WHERE casino_slug = ?`
lookup anywhere in the app. This is a documented, reversible workaround. The correct
long-term fix — a carefully planned, separately reviewed nullable-column migration —
is still the right thing to do eventually; this unblocks the feature without
re-running that risk now.

### Sample seed data — `en/seeds/seed_generic_content_engine_sample_data.sql`
Deliberately kept OUT of `en/migrations/` — that directory gets scanned by both the
real deployment tooling and this repo's own test harness
(`test/support/d1-shim.js`'s `applyMigrations()`, which excludes rollback scripts
but would otherwise apply anything else in that folder automatically). A seed file
sitting in `migrations/` risks being auto-applied somewhere it shouldn't be, on a
schedule nobody intended. Caught this exactly that way: the first version of this
file was placed in `migrations/`, and it silently made itself part of every single
test's baseline data across the whole suite (three unrelated tests failed with
wrong row counts before this was traced back and fixed) — moved to its own
`en/seeds/` directory instead, which nothing scans automatically.

Not a numbered migration (touches no schema) — pure `INSERT`s, safe to run
manually on any environment already on `0051`/`0052`. Seeds 2 sportsbook items, 1 unlinked affiliate
partner, 1 custom type (Payment Provider) with 2 typed fields and 1 item with real
field values, 1 comparison, 4 review-criteria templates, and 1 fully-scored generic
review. Includes a verification query and commented-out cleanup `DELETE`s. Does
**not** enable any content type — that stays a deliberate choice via the new
Settings page.

## Testing

`en/test/generic-content-engine-crud.test.js` — 21 new tests against the real
`handleAPI()` router, covering: partial updates (only sent fields change), 404 on
a nonexistent target, custom-field-value round-tripping, custom-type field
additions (with duplicate-key and permission checks), comparison item replacement,
the settings endpoint's admin-only enforcement (including that `casino: false` is
silently ignored), and the review sentinel's correctness — including a direct
`WHERE casino_slug = ''` query proving it never collides with a real slug lookup.

**Full suite: 259/259 passing** (238 previous + 21 new).

## What's still deferred (stated plainly, not hidden)

- **No item-level (`user_item_access`) scoping** for any of the new resources —
  role-based only, same gap as every prior phase.
- **No field removal/reordering** for custom types (only additive).
- **No comparison item search widget** — still raw numeric ID entry (the edit form
  at least now shows existing items pre-filled, which the create form doesn't).
- **`casino_slug` is still not properly nullable** — the sentinel workaround above
  is real but not the final design.
- **No related-items caching, GEO badges, or analytics view-logging** for
  sportsbook/affiliate-partner/custom detail pages.
- **No bulk operations, CSV import, or preview-before-publish** for any new resource.

None of these block real usage — they're the next layer of polish, not missing
foundations.
