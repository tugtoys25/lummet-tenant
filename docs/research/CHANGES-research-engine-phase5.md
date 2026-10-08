# Research Engine — Phase 5 (review queue & source health)

Adds the daily-driver admin dashboard: a Review Queue surfacing
everything that needs a human editor's attention — overdue
verification, broken/stale sources, published items with no
citations or no SEO metadata, and relationships pointing at deleted
records — plus automated source URL health checking.

Purely additive, with one deliberate reuse: this phase does **not**
reimplement URL health checking. `worker/tracking/health-check.js`
already has a generic, well-tested redirect-following/timeout/
classification implementation (used for affiliate tracking links);
Phase 5 imports its exported `checkTrackingLinkHealth()` function
directly rather than writing a second copy. This is exactly what the
original brief asked for: "If an existing component can be extended
safely, extend it."

Verified with the full test suite after every change (201/201,
unchanged throughout).

## What this ships

- **No new content tables.** Every review-queue list is computed live
  from data Phases 1–3 already store (`research_items.next_review_at`,
  `research_sources.status`, `research_claims`, `research_relations`)
  — there's nothing new to keep in sync or go stale itself.
- **`worker/database/research-review-queue.js`** — 6 queries:
  overdue verification, broken sources, stale sources (not checked in
  180+ days), published items with zero claims, published items
  missing SEO title/description, and relationships whose target no
  longer resolves (a linked casino/country/etc. row was deleted).
- **`worker/research/source-health.js`** — reuses the existing generic
  checker; deliberately does *not* flip a source to `broken` on a
  403/429/451 (bot-detection/GEO-gating), matching the exact same
  caution the tracking-link checker already applies, for the exact
  same reason: an automated block isn't a dead source. A previously-
  broken source that now resolves is automatically un-flagged back to
  `active`.
- A scheduled batch job, `runScheduledResearchSourceHealthChecks()`,
  wired into the existing `scheduled()` handler behind a new
  `system_settings` feature flag (`research_source_health_cron_enabled`,
  default **off** — same convention as every other cron job in this
  codebase; nothing runs automatically until you explicitly enable it).
- Admin: a new **`/en/dashboard/research/review-queue`** page — 6
  clickable count cards, each expanding into the underlying list,
  with a "Check now" button per stale/broken source (manual, on-
  demand health check) and a "Remove" button per broken relationship.

## Files changed

**New files**
- `en/migrations/0049_research_review_queue.sql` (one feature-flag row
  — no new tables)
- `en/worker/database/research-review-queue.js`
- `en/worker/research/source-health.js`
- `en/templates/pages/admin/research-review-queue.html`

**Modified files** (additive only)
- `en/worker/routes.js` — 1 new admin route.
- `en/worker/controllers.js` — 1 new `renderDashboardResearchReviewQueue`
  function (a plain `renderAdminPage` call, same as every other admin
  page).
- `en/worker/index.js` — new imports; new dispatch case; the
  `scheduled()` handler gets one more `ctx.waitUntil(...)` block for
  the source-health cron, following the exact same
  feature-flag-gated, `.catch(() => {})`-wrapped pattern as every
  existing scheduled job in this handler.
- `en/worker/api.js` — new `readResourceMap` entries for
  `research-review-queue/{summary,list}` (both reuse the existing
  `research` permission — read-only, nothing new to gate); new
  `/api/v1/research-review-queue/{summary,list}` endpoints and
  `/api/v1/research-sources/check-health` (manual single-source
  check — falls under the already-registered `research-sources`
  prefix from Phase 2, so no new resourceMap ordering risk).
- `en/templates/layout/admin-nav.html` — 1 new `<a>` link.
- `en/static/js/admin.js` — a new, self-contained review-queue
  section (summary cards, per-category detail view, manual
  health-check trigger, orphan-relation removal); no edits to any
  earlier phase's JS this time — the review queue is a standalone
  page, not a panel bolted onto the research item form.

## Explicitly deferred to later phases

- Reusable datasets and report composition — Phase 6, the last item
  on the original roadmap.
- A history table for source health checks (this phase keeps only
  the current status snapshot on `research_sources`, same "current
  state" approach the table already used in Phase 2 — a full
  `research_source_health_checks` log, mirroring
  `tracking_link_health_checks`, would be a natural but separate
  follow-up if per-check history becomes useful).
- Broken-source-URL checks currently only look at `research_sources`;
  a `research_relations.source_id` pointing at a source doesn't get
  a distinct check from a claim's — both just benefit from the same
  source being periodically verified.

## Deploying this migration

```bash
wrangler d1 execute levelcasino-db --remote --file=en/migrations/0049_research_review_queue.sql
```

No changes to `wrangler.jsonc`, bindings, or secrets. The scheduled
job requires **both** this flag set to `'true'` in `system_settings`
**and** an active cron trigger in `wrangler.jsonc` — it ships default-off,
exactly like the tracking-link health checks it's modeled on, so
merging this does not start making outbound requests to any source
URLs on its own.

## Verification performed

- `node --check` on every new/modified `.js` file — all pass.
- Migration `0049` applied on the same realistic full-chain
  reconstruction used for Phases 1–4; the feature-flag row confirmed
  present with the correct default (`'false'`).
- **Exercised the real review-queue and health-check logic** via the
  D1 shim, with seeded data specifically designed to include both
  positive and negative cases:
  - an overdue item, a no-citations/no-SEO item, and a **fully
    compliant item** (has a claim, has SEO fields) were all created
    together — confirmed the compliant item does **not** appear in
    either the missing-citations or missing-SEO lists, which is the
    check that actually matters (a query that flags everything isn't
    useful; one that correctly excludes the good case is)
  - a relation pointing at a nonexistent casino id was correctly
    surfaced by `getOrphanRelations()`
  - broken vs. stale vs. healthy sources were correctly bucketed
  - `checkAndRecordSourceHealth()` was exercised with a **mocked
    fetch** (no real network calls) across three scenarios: a
    previously-broken source that now returns 200 → correctly
    un-flagged to `active`; a previously-active source that now
    returns 404 → correctly flagged `broken`; a previously-active
    source that returns 403 → correctly stays `active` (confirmed the
    bot-detection carve-out actually works, not just documented)
- Full existing test suite: **201/201 passing, 0 failures**.
