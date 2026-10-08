# Research Engine — Phase 1 (core entities)

Implements Phase 1 of the Level.casino Research Intelligence & Publishing
Engine: a working, admin-editable, source-attributable research content
type, publicly routed at `/en/research/...`, indexed in the sitemap,
integrated with the existing admin dashboard and RBAC.

Purely additive. No existing table, route, template, or JS function was
modified in a way that changes its existing behavior — every edit either
adds a new file or inserts a new, independent block into an existing one
(new `if` route branch, new `switch`/`case`, new function, new array
entry, new permission-map key). Verified by running the full existing
`node:test` suite (201/201 passing, 0 failures) after every change.

## What this ships

- A new content type, **Research Item**, with 7 controlled sub-types
  (`report`, `country`, `regulator`, `topic`, `development`,
  `legislation`, `licence`) — the type is picked by the admin, the route
  is derived from it, never admin-typed (data-first, not route-first,
  per the original spec).
- Public routes: `/en/research`, `/en/research/:type`,
  `/en/research/:type/:slug`.
- Admin: `/en/dashboard/research` — list + create/edit form, added to
  the admin nav, gated by the existing role/permission system (new
  `research` resource, `editor` role granted read/create/update/delete;
  `admin` role already bypasses the permission table).
- Structured content via `content_json` (identical shape/convention to
  `countries.content_json` / `seo_pages.content_json`), with a new,
  separate block renderer (`renderResearchSections`) supporting
  `rich_text`, `heading`, `image`, `statistic`, `timeline`, `table`,
  `source_citation`, `fact_card`, `faq`, `internal_links`. Does not
  modify the existing `renderSeoPageSections` used by countries/
  categories/SEO landing pages.
- A research item can link to an **existing** `countries` row
  (`country_id` → `countries.code`) and an **existing** `authors` row —
  it never duplicates country or author data.
- Sitemap: `/en/sitemap-research.xml`, added to `/en/sitemap.xml`'s
  index, with the same `published = 1 AND status != 'draft'` filter
  every other content type already uses (the exact filter whose absence
  caused the countries/categories draft-leak bug fixed earlier in this
  codebase — deliberately not repeating that mistake here).
- Full status workflow on the table (`draft → researching →
  source_review → fact_check → editorial_review → approved →
  published → needs_update → archived`) and `last_verified_at` /
  `next_review_at` columns, ready for the review-queue dashboard
  planned in a later phase; `getOverdueResearchItems()` is already
  exposed in the database layer for that.

## Files changed

**New files**
- `en/migrations/0045_research_core.sql`
- `en/worker/database/research.js`
- `en/templates/pages/research.html`
- `en/templates/pages/research-list.html`
- `en/templates/pages/admin/research.html`

**Modified files** (additive changes only — see below for exactly what
changed in each)
- `en/worker/routes.js` — 4 new route matches (`researchHub`,
  `researchTypeList`, `researchItem`, `dashboardResearch`) plus 2 new
  sitemap route matches (`sitemap-research.xml`).
- `en/worker/controllers.js` — new import, new
  `renderResearchSections()` block renderer, new `researchTypeLabel()`
  helper, new `renderResearchHub`, `renderResearchTypeList`,
  `renderResearchItem`, `renderDashboardResearch` functions.
- `en/worker/index.js` — new imports, new `switch` cases dispatching
  the 4 new route types to the controllers above, plus 1 new sitemap
  case.
- `en/worker/api.js` — 4 new `readResourceMap` entries, 1 new
  `resourceMap` entry (both for the `research` permission resource),
  and new `/api/v1/research/{create,update,delete,list,get-by-id,
  overdue}` endpoint handlers, following the same lazy
  `await import("./database/research.js")` + `validate`/`success`/
  `failure`/`json` helper conventions as every other resource in this
  file.
- `en/worker/sitemap.js` — 1 new sub-sitemap entry in
  `generateIndex()`, 1 new `type === "all" || type === "research"`
  block in `generate()`.
- `en/worker/breadcrumbs.js` — 2 new `switch` cases
  (`researchTypeList`, `researchItem`).
- `en/templates/layout/admin-nav.html` — 1 new `<a>` link.
- `en/static/js/admin.js` — 2 new calls in the `DOMContentLoaded`
  handler (`loadResearchTable()`, `initResearchForm()`) and one new,
  self-contained section (`loadResearchTable`, `populateResearchDropdowns`,
  `editResearch`, `cancelResearchEdit`, `deleteResearch`,
  `initResearchForm`) inserted after the existing countries-admin
  section, mirroring its structure function-for-function.

## Explicitly deferred to later phases (per the agreed plan)

- Claim-level sourcing (`research_sources`, `research_claims`,
  `research_claim_sources`) — Phase 2.
- The generic cross-entity relationship graph
  (`research_relations`) — Phase 3.
- Content versioning (`research_item_versions`) — Phase 4.
- The review-queue admin dashboard, broken-source-URL health checks,
  and the fuller status-transition UI — Phase 5.
- Reusable datasets and report composition (sections referencing other
  research items) — Phase 6.
- The SEO Research Planner / keyword clustering feature and the
  visual relationship-graph UI were flagged in the original plan as
  lower-priority, deferred indefinitely.

For now, the admin content editor exposes `content_json` as a
documented raw-JSON textarea rather than a drag-and-drop section
builder (the existing `wireSeoSectionBuilder()` is tightly coupled to
casino-oriented section types and country/category forms — extending
it for research's different section types is better done as its own
follow-up once real editorial usage shows which sections are actually
used day to day).

## Deploying this migration

Same manual, per-tenant process as every other migration in this repo
(no automated tracking — see `readme-dev.md`):

```bash
wrangler d1 execute levelcasino-db --remote --file=en/migrations/0045_research_core.sql
```

No changes to `wrangler.jsonc`, D1/KV/R2 bindings, secrets, or any
other environment's configuration.

## Verification performed

- `node --check` on every new/modified `.js` file — all pass.
- Migration `0045_research_core.sql` applied against an in-memory
  `node:sqlite` reconstruction of the full production schema
  (`schema.sql` + the real incremental migration chain) — applies
  cleanly; `UNIQUE(type, slug)` and `CHECK(type IN (...))` constraints
  verified to fire correctly; the 4 `editor` permission rows land.
- Full existing test suite: `cd en && npm test` → **201/201 passing,
  0 failures** (unchanged from before this change).
