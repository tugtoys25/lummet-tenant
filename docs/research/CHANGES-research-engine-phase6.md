# Research Engine — Phase 6 (datasets & report composition)

The final phase on the original roadmap: reusable, versioned datasets,
and report composition — a report research item that assembles
sections from other research items and datasets rather than
duplicating their content.

Purely additive. No existing table, route, or function's prior
behavior changed, with one internal refactor noted below (making
`renderResearchSections` async) that is invisible to callers outside
`controllers.js` — its one call site was updated in the same change.
Verified with the full test suite after every change (201/201,
unchanged throughout).

## What this ships

- **`research_datasets` + `research_dataset_versions`** — a reusable,
  named table of data (e.g. "European Casino Regulation Dataset
  2026") with the same "snapshot-on-publish-if-changed" versioning
  Phase 4 built for research items, applied here to a dataset's
  columns/rows instead of an item's fields.
- **Report composition needed no new join table.** A report is just
  a `research_item` whose `content_json` includes two new block
  types, handled by the same `renderResearchSections()` renderer
  every other block type already goes through:
  - **`research_reference`** — embeds another research item as a
    linked card. `mode: 'live'` always reflects that item's current
    published title/excerpt/verification date (a fresh, cheap lookup
    per reference); `mode: 'snapshot'` uses frozen text the editor
    captured at composition time and needs no database query at all.
  - **`dataset_table`** — embeds a dataset (`version: 'latest'` or a
    specific historical version number) as a rendered table. The
    same dataset can be embedded in a report section, a country
    page, and a comparison page simultaneously; editing it once
    updates every `'latest'` embed, while any embed pinned to a
    specific version stays frozen.
- This is exactly the spec's "live referenced sections vs. snapshot
  sections, editor's choice" requirement (section 17), implemented as
  a block property rather than a parallel section-management system.
- Admin: a new **`/en/dashboard/research/datasets`** page — create/
  edit datasets (columns and rows as documented JSON, consistent with
  every other content_json field in this engine since Phase 1) with
  version history. The research item content-block help text was
  extended to document the two new composition block types.

## Files changed

**New files**
- `en/migrations/0050_research_datasets.sql`
- `en/worker/database/research-datasets.js`
- `en/templates/pages/admin/research-datasets.html`

**Modified files**
- `en/worker/controllers.js` — new import; **`renderResearchSections`
  is now `async`** (it needs to query the DB for live references and
  dataset tables) — its single call site in `renderResearchItem` was
  updated to `await` it and pass `env.DB` in the same change, so this
  is not a breaking signature change left dangling anywhere. Two new
  `switch` cases (`research_reference`, `dataset_table`) added
  alongside the existing ones — no existing case was touched. New
  `renderDashboardResearchDatasets` function.
- `en/worker/api.js` — new `readResourceMap`/`resourceMap` entries
  for `research_datasets` (inserted before the generic
  `/api/v1/research` entry — sixth and final sibling prefix under
  that entry, double-checked against the other five for collisions);
  new `/api/v1/research-datasets/{create,update,delete,list,get,
  get-by-slug,versions}` endpoints.
- `en/worker/routes.js`, `en/worker/index.js` — 1 new admin route
  and dispatch case each.
- `en/templates/layout/admin-nav.html` — 1 new `<a>` link.
- `en/templates/pages/admin/research.html` — help text under the
  content-sections textarea extended to document
  `research_reference`/`dataset_table`; no other change.
- `en/static/js/admin.js` — a new, self-contained datasets admin
  section; no edits to any earlier phase's JS.

## Explicitly deferred (nothing left on the original 6-phase plan)

- A drag-and-drop report builder that assembles `research_reference`
  blocks visually, rather than composing them via the same
  documented-JSON textarea every content type has used since Phase 1.
  Worth it once there's real editorial volume showing the JSON
  approach is the bottleneck — the same judgment call made about the
  claims/relationships pickers, which *did* get dedicated search UIs
  because raw-ID entry was explicitly called out as unacceptable in
  the spec; free-text JSON authoring of prose sections was not.
  The SEO Research Planner / keyword clustering feature and the
  visual relationship-graph UI, flagged as lower-priority back in the
  Phase 1 plan, remain deferred for the same reason: no editorial
  content exists yet to plan keywords around or visualize a graph of.

## Deploying this migration

```bash
wrangler d1 execute levelcasino-db --remote --file=en/migrations/0050_research_datasets.sql
```

No changes to `wrangler.jsonc`, bindings, or secrets.

## Verification performed

- `node --check` on every new/modified `.js` file — all pass.
- `controllers.js` re-loaded as an ES module standalone after the
  `renderResearchSections` async refactor — confirmed it still
  imports and initializes cleanly.
- Migration `0050` applied on the same realistic full-chain
  reconstruction used for every prior phase; `CHECK(status IN (...))`,
  `UNIQUE(dataset_id, version_number)`, and `ON DELETE CASCADE`
  (dataset deletion cascades to its versions) all confirmed firing.
- **Exercised the real data-resolution logic** via the D1 shim end
  to end, specifically designed to catch the one bug class that
  matters most for versioned/composed content — stale data leaking
  where frozen data was expected, or vice versa:
  - created a dataset, published it (version 1 snapshot: NL tax rate
    30.5%), then updated its live rows (NL tax rate → 34%) and
    published again (version 2 snapshot)
  - confirmed `resolveDatasetData(id, 'latest')` returns **34%** (the
    current value) while `resolveDatasetData(id, 1)` returns the
    frozen **30.5%** — proving a `dataset_table` block pinned to
    `version: 1` genuinely stays frozen even after the live dataset
    changes, not just in theory
  - built an actual report `research_item` whose `content_json`
    composes a live `research_reference` to a real Netherlands
    research item, a `snapshot` reference with frozen text, and two
    `dataset_table` blocks (one `'latest'`, one pinned to `version: 1`)
    — confirmed the live reference correctly resolves the referenced
    item's current title/slug/route, and both dataset_table blocks
    independently resolved their correct (current vs. frozen) data
    from the same underlying dataset
- Full existing test suite: **201/201 passing, 0 failures** — the
  same result as after every prior phase, across a 6-phase, 6-migration
  build with zero regressions introduced at any point.

---

## All six phases, summarized

| Phase | What it added |
|---|---|
| 1 | Core `research_items` — 7 controlled types, structured content blocks, admin CRUD, sitemap |
| 2 | `research_sources` + `research_claims` — claim-level, source-attributed research |
| 3 | `research_relations` — the polymorphic entity graph (research ↔ casinos/countries/categories/payment methods) |
| 4 | `research_item_versions` — automatic, deduplicated snapshotting, diff, restore |
| 5 | Review queue (computed, no new tables) + reused source health checking |
| 6 | `research_datasets` + report composition via `research_reference`/`dataset_table` blocks |

Total: 6 migrations (`0045`–`0050`), all additive, all individually
deployable and rollback-able in order; zero changes to existing
routes, tables, or functions beyond the documented, reviewed
extension points; the full existing 201-test suite passing after
every single change across the whole build.
