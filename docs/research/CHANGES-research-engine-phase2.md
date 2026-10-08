# Research Engine — Phase 2 (sources & claims)

Adds claim-level, source-attributed research on top of Phase 1's
`research_items`. This is the feature that makes the Research Engine a
research platform rather than a CMS content type: every factual
statement can now be an independently verifiable, independently
sourced row, not just prose.

Purely additive, same discipline as Phase 1: no existing table,
route, or function was changed in a way that alters its prior
behavior. Verified with the full existing test suite after every
change (201/201 passing throughout — same as before Phase 1).

## What this ships

- **`research_sources`** — a global, reusable source library (a
  regulator page, a piece of legislation, a court judgment...). The
  same source can be cited by many claims and many research items; it
  is never duplicated per-item, per the original spec's explicit
  requirement.
- **`research_claims`** — one factual statement per row, scoped to a
  single research item, with its own status
  (`unverified`/`verified`/`disputed`/`superseded`), optional
  jurisdiction (linked to the existing `countries` table), and
  optional validity window (`valid_from`/`valid_until`) for
  time-bound regulatory facts like tax rates.
- **`research_claim_sources`** — the many-to-many join actually
  attaching evidence to a claim, with room for citation context and
  an exact quoted passage.
- Admin: a **Sources** library (global add/edit/delete, reusable
  across every research item) and a **Claims** panel that appears
  under the research item form once an item is saved — add a claim,
  then attach one or more existing sources to it from a dropdown.
- Public rendering: `source_citation` content blocks can now cite a
  real `source_id` and render as a numbered `[1]` footnote linking
  down to a proper "Sources" list at the bottom of the page (falls
  back to the old plain-label form from Phase 1 if no `source_id` is
  given, so existing Phase 1 content keeps rendering unchanged). A
  new **"Key facts"** section lists the item's claims with their
  status badge and cited sources.
- Two independent citation pools — sources cited via claims, and
  sources cited directly in a content block — are merged before
  footnote numbers are assigned, so a source referenced only inline
  (with no claim yet) still resolves correctly.
- Two new permission resources, `research_sources` and
  `research_claims` (kept separate from `research` rather than folded
  in, so access can be tuned independently later — e.g. a
  fact-checker role that can edit claims/sources but not publish
  items).

## Files changed

**New files**
- `en/migrations/0046_research_sources_claims.sql`
- `en/worker/database/research-sources.js`
- `en/worker/database/research-claims.js`

**Modified files** (additive only)
- `en/worker/controllers.js` — new imports; `renderResearchSections()`
  now accepts an optional `citations` accumulator and resolves
  `source_id` on `source_citation` blocks to numbered footnotes; two
  new render helpers, `renderResearchSourcesFootnotes()` and
  `renderResearchClaims()`; `renderResearchItem()` now fetches claims
  and both citation pools and passes `claims_html` /  `sources_html`
  into the template alongside the existing `sections_html`.
- `en/worker/api.js` — new `readResourceMap`/`resourceMap` entries for
  `research_sources` and `research_claims` (inserted **before** the
  existing `/api/v1/research` entry in the write-permission map, since
  that map matches by prefix and first-match-wins — `/api/v1/research`
  would otherwise have shadowed `/api/v1/research-sources` and
  `-claims`); new `/api/v1/research-sources/{create,update,delete,
  list,get}` and `/api/v1/research-claims/{create,update,delete,
  list-for-item,attach-source,detach-source}` endpoints, same
  lazy-import + `validate`/`success`/`failure`/`json` conventions as
  every other resource.
- `en/templates/pages/research.html` — 2 new conditional blocks
  (`claims_html`, `sources_html`) after the existing content body.
- `en/templates/pages/admin/research.html` — new Claims panel (hidden
  until a research item is loaded/saved) and a new global Sources
  library section, both below the existing research item form.
- `en/static/js/admin.js` — 2 more calls added to the
  `DOMContentLoaded` handler; a new, self-contained Sources +
  Claims section; `editResearch()`/`cancelResearchEdit()` (from Phase
  1) extended by 1 line each to show/hide the new claims panel —
  the only edits Phase 2 makes to Phase-1-authored code, and both are
  additive calls, not behavior changes to what those functions already
  did.

## Explicitly deferred to later phases

- Content versioning (`research_item_versions`) — Phase 3 in the
  original plan, renumbered to Phase 4 in the phased breakdown you
  approved.
- The generic cross-entity relationship graph (`research_relations`)
  linking research items to casinos/categories/payment methods — next
  up (Phase 3).
- Review-queue dashboard, source URL health checks — Phase 5.
- A drag-and-drop claim/source picker richer than the current
  dropdown-based UI — worth revisiting once there's real editorial
  volume to see what's actually clunky.

## Deploying this migration

```bash
wrangler d1 execute levelcasino-db --remote --file=en/migrations/0046_research_sources_claims.sql
```

Run after `0045_research_core.sql` (it references `research_items`).
No changes to `wrangler.jsonc`, bindings, secrets, or any other tenant.

## Verification performed

- `node --check` on every new/modified `.js` file — all pass.
- `en/worker/controllers.js` re-loaded as an ES module standalone to
  confirm the new imports resolve with no import-cycle/reference
  errors.
- Migration `0046` applied on top of the same realistic
  `schema.sql` + full incremental chain + `0045` reconstruction used
  for Phase 1, then exercised end-to-end in `node:sqlite`:
  - inserted a source, a claim, and a claim↔source link
  - `UNIQUE(claim_id, source_id)` fires correctly on a duplicate
    attach
  - `CHECK(status IN (...))` on claims and `CHECK(source_type IN
    (...))` on sources both fire correctly on invalid values
  - `ON DELETE CASCADE` verified for real: deleting a research item
    cascades to delete its claims, which cascades to delete their
    claim_sources rows — confirmed empty, not just assumed from the
    schema
  - the 4 `editor` permission rows for each of `research_sources` and
    `research_claims` land correctly
- Full existing test suite: **201/201 passing, 0 failures** — same as
  after Phase 1, confirming this phase changed nothing about existing
  behavior.

## A real bug this caught before it shipped

The write-permission map in `api.js` matches by `path.startsWith(prefix)`
with **first-match-wins** ordering. My first pass added
`"/api/v1/research-sources"` and `"/api/v1/research-claims"` *after*
the existing `"/api/v1/research"` entry — which would have made every
sources/claims write request match the generic `research` permission
instead of its own, silently granting/denying the wrong resource.
Caught by re-reading the matching loop rather than assuming
dictionary-key order was irrelevant; fixed by moving the two specific
prefixes before the general one.
