# Research Engine — Phase 4 (version history)

Adds content versioning: important regulatory research is never
silently overwritten (spec section 15/16). A snapshot is taken
automatically whenever a save leaves the item published — never on
every autosave, and never when the save didn't actually change
anything.

Purely additive. No existing table, route, or function's prior
behavior changed except the 2 research endpoints noted below, which
gained an extra automatic step rather than having their existing
behavior altered. Verified with the full test suite after every
change (201/201, unchanged throughout).

## What this ships

- **`research_item_versions`** — one row per real content change to
  a published item: a full field-level snapshot (title, subtitle,
  excerpt, `content_json`, all SEO fields, status, etc. — not just
  the body copy), who saved it, an optional change summary, and
  whether it was itself created by restoring an earlier version.
- **Automatic, deduplicated snapshotting.** `createVersionIfChanged()`
  compares the new snapshot's JSON against the most recent existing
  one and only writes a new row if something actually differs — so
  re-saving an already-published item with no real edits doesn't
  spam the history with identical entries. Verified this dedup logic
  actually works (see below), not just assumed from reading the code.
- Wired into the **existing** `/api/v1/research/create` and
  `/api/v1/research/update` endpoints from Phase 1 — after the save
  succeeds, the endpoint re-fetches the saved row and calls
  `createVersionIfChanged()`. This is the one place in Phase 4 that
  touches earlier-phase code, and it's additive: the endpoints'
  existing request/response contract is unchanged, they just now also
  snapshot when appropriate.
- **Diff, not just a snapshot list.** `diffSnapshots()` does a
  shallow field-by-field comparison between any two snapshots (or a
  past snapshot and the live item) and returns only the fields that
  changed — no diff library needed, and the admin UI shows exactly
  what changed, not a wall of unchanged fields.
- **Restore that preserves history rather than rewriting it.**
  Restoring version 3 doesn't delete versions 4 and 5 or overwrite
  version 3 — it writes version 3's snapshot back onto the live row,
  then creates a *new* version (say, version 6) tagged
  `restored_from_version: 3`, so the timeline stays a complete,
  honest record of what happened and when.
- Admin: a **Version history** panel (same appears-once-saved pattern
  as the Claims/Relationships panels) listing every version with a
  "View changes" button (inline diff against current) and "Restore".
- No new permission resource — versioning is part of editing a
  research item, gated by the existing `research` permission from
  Phase 1.

## Files changed

**New files**
- `en/migrations/0048_research_versions.sql`
- `en/worker/database/research-versions.js`

**Modified files** (additive only, except the 2 endpoints noted above)
- `en/worker/api.js` — new `readResourceMap` entries for
  `research-versions/{list-for-item,get,diff}` and a new
  `resourceMap` prefix entry `/api/v1/research-versions` (inserted
  **before** the generic `/api/v1/research` entry — same
  first-match-wins trap as Phases 2–3, now checked against 4 sibling
  prefixes: `research-sources`, `research-claims`,
  `research-relations`, `research-versions`, none of which is a
  prefix of another); `/api/v1/research/create` and `/update` now
  call `createVersionIfChanged()` after a successful save; new
  `/api/v1/research-versions/{list-for-item,get,diff,restore}`
  endpoints.
- `en/templates/pages/admin/research.html` — new Version History
  panel (table + inline diff box).
- `en/static/js/admin.js` — a new, self-contained version-history
  section; `editResearch()`/`cancelResearchEdit()` each get 1 more
  line to show/hide the new panel — the only touch to earlier-phase
  admin JS.

## Explicitly deferred to later phases

- Review-queue dashboard, broken-source/broken-relationship health
  checks — Phase 5.
- Reusable datasets and report composition — Phase 6.
- Versioning claims/relations/sources themselves (only the research
  item's own fields are versioned right now — a claim or relation
  added later isn't "part of" a snapshot). Worth a look once there's
  real editorial volume showing whether that granularity is needed.

## Deploying this migration

```bash
wrangler d1 execute levelcasino-db --remote --file=en/migrations/0048_research_versions.sql
```

Run after `0045`–`0047` (the FK references `research_items`). No
changes to `wrangler.jsonc`, bindings, secrets, or any other tenant.

## Verification performed

- `node --check` on every new/modified `.js` file — all pass.
- Migration `0048` applied on the same realistic full-chain
  reconstruction used for Phases 1–3; `FOREIGN KEY(research_item_id)`,
  `UNIQUE(research_item_id, version_number)`, and
  `ON DELETE CASCADE` (deleting a research item cascades to delete
  its versions) all confirmed firing correctly.
- **Exercised the real logic end-to-end** via the same D1 shim used
  in Phase 3, running an actual create → publish → re-save →
  edit → diff → restore sequence against seeded data:
  - creating a **draft** (unpublished) item produced **no** version —
    confirmed, not assumed
  - the first publish correctly produced version 1
  - re-saving the same published content with **zero real changes**
    correctly produced **no** version 2 (the dedup check actually
    works)
  - changing the excerpt correctly produced version 2, with the
    change summary attached
  - `diffSnapshots()` correctly isolated *only* the `excerpt` field
    as changed between v1 and the current row — no other fields
    reported as different
  - `restoreVersion()` correctly reverted the excerpt back to v1's
    text on the live row, **and** created version 3 tagged
    `restored_from_version: 1` — so the full v1 → v2 → v3(restore)
    history is intact and inspectable afterward, not overwritten
- Full existing test suite: **201/201 passing, 0 failures**.
