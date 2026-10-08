# Research Engine — Phase 3 (relationship graph)

Adds the generic entity relationship graph — the connective tissue
the whole engine was designed around: a research item can now link to
another research item, or to an *existing* casino, country, category,
or payment method row, without ever duplicating that row's data (the
spec's explicit, repeated requirement in sections 16/24/26).

Purely additive. No existing table, route, or function's prior
behavior changed. Verified with the full test suite after every
change (201/201, unchanged throughout).

## What this ships

- **`research_relations`** — one row per directed link:
  `(from_type, from_id) --[relation_type]--> (to_type, to_id)`, where
  each side can independently be a `research_item`, `casino`,
  `country`, `category`, or `payment_method`. A controlled 24-value
  `relation_type` registry (`regulated_by`, `located_in`, `covers`,
  `cites`, `available_in`, ...) — never free text from the admin UI,
  per spec section 14.
- Relationships can be **qualified** (spec section 10): each row can
  carry `valid_from`/`valid_until` and an optional `source_id`
  pointing at a Phase 2 source, so "Casino X available_in Netherlands
  (2025–2026, per regulator filing)" is representable, not just the
  bare fact.
- Because SQLite can't express a polymorphic foreign key, referential
  integrity and the public link/label for each side are resolved in
  `research-relations.js`, not the schema — `resolveEntities()`
  batches lookups per entity type (one query per type touched, not
  one per relation).
- **Bidirectional reads from one row.** A relation is only ever
  stored once, from whichever side made sense to enter it — but
  `getRelationsTo()` shows it from the *other* side too, using an
  inverse-relation map (`regulated_by` ↔ `regulates`,
  `part_of` ↔ `contains`, etc.), so a country page could eventually
  list "Casinos regulated here" without a second insert. (Phase 3
  wires this into the research item page only — see "Deferred"
  below for surfacing it on casino/country/category pages too.)
- Admin: a **Relationships** panel on the research item form
  (appears once the item is saved, same pattern as Phase 2's Claims
  panel) with a live, debounced entity search across all 5 types —
  the admin searches by name ("Kansspelautoriteit", "Netherlands",
  "Example Casino"), not by typing raw ids, per spec section 24's
  explicit requirement ("Use searchable entity pickers. Do not make
  administrators manually type IDs").
- Public: a new **"Related"** section on research item pages, grouped
  by relation type, linking out to the real casino/country/category/
  payment-method/research-item pages. Entries whose target no longer
  resolves (e.g. a linked casino was later deleted) are silently
  skipped rather than rendering a dead link.

## Files changed

**New files**
- `en/migrations/0047_research_relations.sql`
- `en/worker/database/research-relations.js`

**Modified files** (additive only)
- `en/worker/controllers.js` — new import; new `RELATION_TYPE_LABEL`
  map and `renderResearchRelated()` helper; `renderResearchItem()` now
  also fetches `getAllRelationsForEntity()` and passes `related_html`
  into the template.
- `en/worker/api.js` — new `readResourceMap`/`resourceMap` entries for
  `research_relations`, inserted **before** the generic
  `/api/v1/research` entry (same first-match-wins prefix trap flagged
  in the Phase 2 notes — this is the third and last resource under
  that prefix, so the ordering is now `research-sources` /
  `research-claims` / `research-relations` / `research`, all
  double-checked against each other for prefix collisions); new
  `/api/v1/research-relations/{create,delete,list-for-entity,
  search-entities}` endpoints.
- `en/templates/pages/research.html` — 1 new conditional block
  (`related_html`).
- `en/templates/pages/admin/research.html` — new Relationships panel
  (entity search box, relation-type select, relations table) plus a
  small scoped `<style>` block for the autocomplete dropdown (kept
  local to this template rather than touching the shared
  `dashboard.css`, since the classes are new and only used here).
- `en/static/js/admin.js` — a new, self-contained Relationships
  section (debounced search-as-you-type against
  `/research-relations/search-entities`, relation-type dropdown,
  create/delete); `editResearch()`/`cancelResearchEdit()` each get 1
  more line to show/hide the new panel, the only touch to Phase-1/2
  code in this phase.

## Explicitly deferred to later phases

- **Surfacing incoming relations on casino/country/category/payment-
  method pages themselves** (e.g. a "Research" box on a country page
  listing research items that cover it). The data already supports
  this — `getRelationsTo("country", code)` returns exactly that list
  — but wiring it in means editing `renderCountry`/`renderCasino`/
  etc., which Phase 3 deliberately avoided touching to keep this
  phase's risk to zero on existing pages. Worth doing as a focused,
  reviewable follow-up once you're happy with how relations look on
  the research side.
- Content versioning (`research_item_versions`) — Phase 4.
- Review-queue dashboard, broken-relationship/broken-source-URL
  health checks — Phase 5.
- Reusable datasets and report composition — Phase 6.
- A visual graph view (spec section 25/34) — the relational data is
  authoritative regardless; still lower priority than the above.

## Deploying this migration

```bash
wrangler d1 execute levelcasino-db --remote --file=en/migrations/0047_research_relations.sql
```

Run after `0045` and `0046` (the `source_id` column references
`research_sources`). No changes to `wrangler.jsonc`, bindings,
secrets, or any other tenant.

## Verification performed

- `node --check` on every new/modified `.js` file — all pass.
- Migration `0047` applied on top of the same realistic
  `schema.sql` + incremental chain + `0045` + `0046` reconstruction
  used for Phases 1–2, then exercised in `node:sqlite`:
  - `UNIQUE(from_type, from_id, to_type, to_id, relation_type)` fires
    on a duplicate relation
  - `CHECK(relation_type IN (...))` and `CHECK(from_type IN (...))`
    both fire on invalid values
  - a relation between a research item (integer id) and a country
    (text code) stored correctly side-by-side with one between a
    research item and a casino (integer id) — confirming the
    TEXT-column polymorphic id design actually works, not just
    compiles
  - the 4 `editor` permission rows land
- **Went further than schema validation this time**: built a minimal
  D1-compatible shim over `node:sqlite` (`.prepare().bind().all()/
  .first()/.run()`) and imported `research-relations.js` directly to
  run its actual exported functions against seeded data — this is
  the part that would have caught a wrong column name or a broken
  JOIN that schema-level testing can't:
  - `getRelationsFrom()` correctly resolved and labeled all 3 target
    types (casino, country, category) with correct public URLs
  - `getRelationsTo("casino", id)` correctly returned the relation
    from the casino's side, inverted (`covers` → `covered_by`)
  - `searchEntities()` correctly matched across both `research_items`
    and `countries` for an ambiguous query ("netherl" matched both
    the research item titled "Netherlands Regulation" and the
    country "Netherlands")
  - `resolveEntities()` correctly returned `exists: false` for a
    nonexistent id instead of throwing
- Full existing test suite: **201/201 passing, 0 failures**.
