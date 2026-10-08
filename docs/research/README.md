# Research Engine

Structured, source-cited, versioned research content — regulatory research,
market data, and comparative reports — as a first-class content type alongside
casinos, news, and (as of the 2026-09-20 merge) the Generic Content Engine.
Built across 10 delivery rounds; see `CHANGES-*.md` in this folder for the
full narrative of each. This file is the consolidated reference.

Integrated onto the `contentmybestversion` snapshot (the branch carrying the
Generic Content Engine) on 2026-09-21. See "Integration history" below for
exactly what that merge touched and how it was verified.

## Architecture at a glance

```
                         RESEARCH ENGINE
                               |
        +----------+----------+----------+----------+
        |          |          |          |          |
   research_    research_  research_  research_  research_
     items       sources    claims    relations   datasets
        |          |          |          |          |
        |          +----research_claim_sources-----+
        |                     |
        +----research_item_versions
        |
   content_json
   (typed blocks: rich_text, statistic, timeline, table,
    fact_card, faq, source_citation, research_reference,
    dataset_table, image, heading, internal_links)
```

**Nothing about the existing site was migrated or altered.** Every table is
new (`CREATE TABLE IF NOT EXISTS`), every route is new
(`/en/research/...`), and a research item can *reference* an existing
`casinos`/`countries`/`categories`/`payment_methods` row via
`research_relations` — never duplicate it.

## Database (migrations `0045`-`0050`)

| Migration | Adds |
|---|---|
| `0045_research_core.sql` | `research_items` — the core entity. 7 types (`report`, `country`, `regulator`, `topic`, `development`, `legislation`, `licence`), full SEO/lifecycle fields, `content_json` for structured content blocks. |
| `0046_research_sources_claims.sql` | `research_sources` (a global, reusable source library — never duplicated per item), `research_claims`, `research_claim_sources` — claim-level, source-attributed facts. |
| `0047_research_relations.sql` | `research_relations` — a polymorphic graph linking research items to each other *or* to existing `casinos`/`countries`/`categories`/`payment_methods` rows, with a controlled 24-value relation-type registry. |
| `0048_research_versions.sql` | `research_item_versions` — automatic, deduplicated snapshotting on every real content change to a published item, with diff and restore. |
| `0049_research_review_queue.sql` | One `system_settings` feature-flag row for the (default-off) source-health-check cron job. No new tables — the review queue is computed live from `0045`-`0048`'s data. |
| `0050_research_datasets.sql` | `research_datasets`, `research_dataset_versions` — reusable, versioned tabular data (e.g. a tax-rate-by-year table) embeddable in any research item via a `dataset_table` content block. |

All deployed with:
```bash
wrangler d1 execute levelcasino-db --remote --file=en/migrations/0045_research_core.sql
# ... 0046 through 0050, in order
```
Each references tables the previous one created, so they must run in order;
each is independently safe to re-run (`IF NOT EXISTS` / `INSERT OR IGNORE`
throughout).

## Routes

| Type | Route |
|---|---|
| Hub | `/en/research` |
| Type listing | `/en/research/{type}` (e.g. `/en/research/country`) |
| Item | `/en/research/{type}/{slug}` |
| Sitemap | `/en/sitemap-research.xml` |
| Admin: items | `/en/dashboard/research` |
| Admin: review queue | `/en/dashboard/research/review-queue` |
| Admin: datasets | `/en/dashboard/research/datasets` |

Route is always derived from `(type, slug)` — the admin never types a URL
(data-first, not route-first).

## Content model

**A research item is not a blob of HTML.** `content_json` is an ordered list
of typed blocks (`{"sections": [...]}`), each rendered by
`renderResearchSections()` in `controllers.js`:

| Block type | Purpose |
|---|---|
| `heading`, `rich_text`, `image`, `fact_card` | Prose content (rich text uses the site's real WYSIWYG editor in the admin, not raw HTML) |
| `statistic` | One highlighted figure with label/context |
| `timeline` | Dated events |
| `table` | A plain, admin-authored table (columns as strings, rows as arrays) |
| `dataset_table` | Embeds a `research_datasets` row — `version: "latest"` always reflects the live dataset; a specific version number stays frozen even after the dataset is later edited |
| `source_citation` | Inline attribution, resolves to a numbered footnote against a real `research_sources` row |
| `faq`, `internal_links` | Standard supporting content |
| `research_reference` | Composes a report from other research items — `mode: "live"` always shows that item's current state; `mode: "snapshot"` freezes a copy captured at authoring time |

**Claims** (`research_claims`) are separate from prose — one verifiable
statement per row, with a status (`unverified`/`verified`/`disputed`/
`superseded`), an optional jurisdiction and validity window, and one or more
attached `research_sources` via `research_claim_sources`. This is what
renders as the "Key facts" section on a published item.

**Relations** (`research_relations`) are a single directed edge —
`(from_type, from_id) --[relation_type]--> (to_type, to_id)` — read from
*either* side (`getRelationsFrom`/`getRelationsTo`/`getRelationsFromMany`),
so a relation stored once ("Netherlands `regulated_by` KSA") renders
correctly on both the Netherlands page and, inverted ("KSA `regulates`
Netherlands"), anywhere KSA's incoming relations are shown.

## Admin dashboard

- **`/en/dashboard/research`** — the research item editor. Content is built
  with a **visual section builder** (12 pickable block types, each a proper
  form — no JSON, ever), including a searchable entity picker for claims/
  relations and a real WYSIWYG editor (the same one used elsewhere in this
  CMS) for rich-text bodies. Four one-click templates (Country Report,
  Regulator Profile, Sourced Claim, Report Composition) insert a pre-built
  group of sections to start from.
- **Sources, Claims, Relationships, Version History** panels appear once an
  item is saved (each needs a real item id to attach to).
- **`/en/dashboard/research/datasets`** — a real spreadsheet-style grid
  (click a cell and type, or paste a whole table copied from Excel/Google
  Sheets) instead of JSON textareas. Works purely positionally internally;
  the `{key, label}` shape the database actually stores is derived fresh
  from column labels only at save time.
- **`/en/dashboard/research/review-queue`** — 6 live-computed categories
  (overdue verification, broken/stale sources, missing citations, missing
  SEO, broken relationships), each with a one-click fix action.

## Public-facing features

- **Branded PDF export** — every research item page has a Download PDF
  button. Generated **client-side** (jsPDF, loaded from cdnjs) because this
  Worker has no build step to bundle a server-side PDF library into. Each
  page embeds its own structured data as JSON
  (`#research-pdf-data`); "merge related research" works by fetching
  *another item's own public page* and reading the same block back out of
  it via `DOMParser` — no new API endpoint was needed for this feature.
- **Share** — native Web Share API with a clipboard fallback.
- **Hub search & classification** (`/en/research`) — a search bar plus
  filters for type, country, and "related to" (populated from real
  `research_relations` data), all operating client-side on the
  already-server-rendered cards — the page works identically with
  JavaScript disabled.
- **Source health monitoring** — reuses the *existing* generic link-health
  checker (`worker/tracking/health-check.js`) rather than a second
  implementation; a source blocked by bot-detection (403/429) is never
  mis-flagged as broken.

## Permissions

New resources, each independently permission-gated (all granted to the
`editor` role by the migrations above; `admin` bypasses the permission table
entirely, same as every other resource in this system):
`research`, `research_sources`, `research_claims`, `research_relations`,
`research_datasets`.

## File manifest

See `MANIFEST-CHANGED-FILES-research-engine.txt` for the file list as of the
initial 6-phase build, and the per-round `MANIFEST-CHANGED-FILES-round*.txt`
files for everything added since (visual builder, datasets grid, styling
fix, PDF export & hub search). Current full set, by area:

```
en/migrations/0045_research_core.sql .. 0050_research_datasets.sql
en/worker/database/research.js
en/worker/database/research-sources.js
en/worker/database/research-claims.js
en/worker/database/research-relations.js
en/worker/database/research-versions.js
en/worker/database/research-review-queue.js
en/worker/database/research-datasets.js
en/worker/research/source-health.js
en/worker/controllers.js          (modified — additive)
en/worker/api.js                  (modified — additive)
en/worker/index.js                (modified — additive)
en/worker/routes.js                (modified — additive)
en/worker/sitemap.js              (modified — additive)
en/worker/breadcrumbs.js          (modified — additive)
en/templates/pages/research.html
en/templates/pages/research-list.html
en/templates/pages/admin/research.html
en/templates/pages/admin/research-datasets.html
en/templates/pages/admin/research-review-queue.html
en/templates/layout/admin-nav.html (modified — additive)
en/templates/layout/base.html      (modified — additive: data-site-logo attribute)
en/static/js/admin.js              (modified — additive)
en/static/js/research-pdf-export.js
en/static/js/research-directory-filter.js
en/static/css/research.css
```

## Integration history

| Date | What happened |
|---|---|
| Phases 1-6 | Core engine built and deployed: entities, sources/claims, relationship graph, versioning, review queue, datasets. |
| Round 7 | Visual section builder replaced the raw-JSON content editor. |
| Round 8 | Datasets admin replaced JSON columns/rows with a spreadsheet grid. |
| Round 9 | `research.css` written (public pages had zero styling until this point) + type-aware table cell rendering. |
| Round 10 | Branded PDF export + hub search/classification. |
| **2026-09-21 merge** | This round: integrated Rounds 1-10 onto the `contentmybestversion` snapshot, which had independently gained the Generic Content Engine (comparisons, custom content types) in the interim. **`worker/controllers.js` and `worker/database/research-relations.js` were the only two files both efforts touched** — merged surgically (targeted patches re-applied against the current file content, not a whole-file overwrite) after confirming byte-for-byte that the Generic Content Engine's own changes to those files didn't overlap with the Research Engine's functions. `api.js`, `routes.js`, `index.js`, `sitemap.js`, `breadcrumbs.js` needed no changes for this round — the Research Engine's Round 10 delta never touched them, so the Generic Content Engine's own additions to those files were already complete and untouched. Verified with the full test suite: **238/238 passing** (201 pre-existing + 8 new Generic Content Engine suites also included), both before and after the merge. |
| **2026-09-22 merge** | A separate upload (`newstopnightmybestversion_8`) turned out to predate the 2026-09-21 merge — it had Research Engine Rounds 1-9 and the Generic Content Engine, but not Round 10 (PDF export/hub search) — and had independently gained a large **Newsroom** feature (migrations `0053`-`0058`, ~35 new test files) in the interim. Re-applied the same Round-10 delta onto this snapshot using the identical surgical-patch method: confirmed `controllers.js`/`research-relations.js` byte-for-byte against the pre-Round-10 baseline first, then re-applied only the Research Engine's own diff. See `MANIFEST-CHANGED-FILES-research-pdf-hub-integration-2026-09-22.txt` for the full accounting, including a note on an unrelated feature in this codebase that happens to also be internally labeled "round 10" — no connection to this project's own round numbering. Full test suite: **554/554 passing** across 126 suites (the jump from 238 is Newsroom's own extensive coverage). |

## Known, deliberately-deferred items

- `dataset_table` sections resolve their rows live server-side on the public
  page; a client-side-only PDF export has no way to do the same round-trip,
  so the PDF prints a note pointing back to the live page for that table
  instead of faking the data. A real fix (one new read-only endpoint) is
  scoped but not built.
- `resolveDatasetData()` doesn't check a dataset's own `published` flag for
  `version: "latest"` — a draft dataset still renders wherever it's
  embedded. Flagged, not fixed — a deliberate product decision, not a bug.
- The SEO Research Planner / keyword clustering feature and a visual
  relationship-graph UI, both mentioned in the original spec, remain
  out of scope — no real editorial content existed yet to design them
  against when that call was made.
