# Post-Deployment Fix: `0052_reviews_generic_rebuild.sql`

**Date:** 2026-09-21 (day of first real deployment, one environment in)

## What happened

The original `0052_reviews_generic_rebuild.sql` rebuilt `reviews` via
`CREATE TABLE reviews_new` / `INSERT ... SELECT` / `DROP TABLE reviews` /
`ALTER TABLE reviews_new RENAME TO reviews`, wrapped in `BEGIN TRANSACTION` /
`COMMIT` (needed because `DROP TABLE` + `RENAME` have to happen atomically with the
data copy).

Run through the **Cloudflare D1 web console**, it was rejected outright:

> To execute a transaction, please use the `state.storage.transaction()` or
> `state.storage.transactionSync()` APIs instead of the SQL `BEGIN TRANSACTION` or
> `SAVEPOINT` statements.

The console refuses explicit transaction control statements — it manages
transactions itself. The whole batch was refused before any statement in it ran.
`reviews` was left completely untouched: same 41 rows, original schema. No data was
lost. This was the console behaving safely, not luck.

## The more important discovery, made while diagnosing that rejection

Live inspection (`PRAGMA table_info(reviews)`) against the real environment showed
columns this project's migration history never accounted for:

```
22  author        TEXT
23  author_title  TEXT
24  reviewed_at   TEXT
```

These aren't in `schema.sql`, `0002_phase2_upgrade.sql`, or anywhere else in the
migration set this project was built against — they exist in production via some
path outside that history (a manual `ALTER TABLE`, a migration that was run and then
removed from the repo, or similar). Static analysis of the repository's migration
files could not have surfaced this; only a live query against the real database
could.

**This mattered a great deal.** The original `CREATE TABLE reviews_new` did not
include `author`, `author_title`, or `reviewed_at`. Had the transaction wrapper *not*
been rejected — had the D1 console, or `wrangler d1 execute`, accepted and run that
rebuild as written — it would have silently dropped all three columns, and their
data, for every one of the 41 existing reviews. That is exactly the kind of data loss
this entire project was built to avoid, and it was one console-compatibility quirk
away from actually happening.

## The fix

Replaced the table-rebuild with plain `ALTER TABLE ADD COLUMN`:

```sql
ALTER TABLE reviews ADD COLUMN reviewed_content_type TEXT;
ALTER TABLE reviews ADD COLUMN reviewed_content_id INTEGER;
UPDATE reviews SET reviewed_content_type = 'casino',
  reviewed_content_id = (SELECT c.id FROM casinos c WHERE c.slug = reviews.casino_slug)
WHERE reviewed_content_type IS NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_content ON reviews(reviewed_content_type, reviewed_content_id);
```

This is structurally safer than the rebuild it replaces, independent of the console
issue: `ADD COLUMN` can only ever add the two new columns. It cannot drop, rename, or
redefine anything else — so whatever a given environment's `reviews` table has
drifted to contain (the three columns above, or anything else) is preserved
automatically, without needing to be named or known in advance. It's also
console-compatible (no `BEGIN`/`COMMIT`).

The one thing this version does **not** do that the original design called for:
`casino_slug` stays `NOT NULL` (not made nullable). That was needed only to allow a
future review for a non-casino content type to omit `casino_slug` entirely — nothing
in the codebase creates such a review yet (every content type's enablement flag
defaults off), so this is deferred, not lost. It can be done later, correctly, via
`wrangler d1 execute --file=` (not the console, which can't run the transaction a
real column-drop-and-rebuild would need) once it's actually needed.

## Verified

Tested locally against a `reviews` table shape that includes the drifted
`author`/`author_title`/`reviewed_at` columns (via `node:sqlite`, same harness this
project has used throughout): all three survive the migration unchanged, and the
backfill computes correctly. Then confirmed for real, on the first live environment:

```
total: 41, with_type: 41, with_content_id: 41
broken_links (reviews pointing at a nonexistent casino): 0
```

Every one of the 41 reviews backfilled correctly with zero orphaned references.

## What this means for the other 6 environments

Each one needs its own `PRAGMA table_info(reviews);` check before running anything —
do not assume they match this environment or the original migration files.
Different environments may have accumulated different undocumented drift. The
`ALTER TABLE ADD COLUMN` approach tolerates that automatically; it just needs to be
confirmed each environment doesn't already have `reviewed_content_type` (which would
mean this migration already ran there, or something else added a same-named column
— check before running either way).

## File status

- `en/migrations/0052_reviews_generic_rebuild.sql` — rewritten in place to the
  `ALTER TABLE` version above. The filename is unchanged (it already shipped in a
  pushed commit as the rebuild version — this is a content correction to that same
  file, delivered as a new commit, not a rewritten git history).
- `en/migrations/rollback_0052_reviews_generic_rebuild.sql` — rewritten to match
  (`ALTER TABLE ... DROP COLUMN`, also console-safe).
- Full test suite re-verified: 238/238 passing with the corrected file.
