# Migrations

`en/migrations/` is one ordered, complete, forward-only set. There are no rollback files.
It builds the **final** schema (125 tables, 229 indexes, 2 triggers) and the seed data of a new tenant database.

## Layout

| Files | Content |
|---|---|
| `0001` identity and settings | users, sessions, roles/permissions, settings |
| `0002` media library | media, folders |
| `0003` catalog | casinos, categories, countries and related tables |
| `0004` pages, reviews, news | pages, reviews (with `author`, `author_title`, `reviewed_at`), news |
| `0005` components and ads | components, ad slots |
| `0006` affiliate network | affiliates, tracking, postbacks, reconciliation |
| `0007` analytics and campaigns | events, campaigns, alerts |
| `0008` reporting and email | reports, schedules, email |
| `0009` research | research engine |
| `0010` generic content engine | content items, relations, taxonomy |
| `0011` newsroom | newsroom tables |
| `0012` content landing pages | landing pages |
| `0013` AI assistant | conversations, rate limits, free-tier usage, studio history, feedback |
| `0014` platform operations | platform updates, performance samples, operations |
| `0015` triggers | the two rating triggers between `casinos` and `reviews` |
| `0016`–`0020` seeds | permissions (189), settings, navigation and media folders, payment methods, newsroom sections and regions |

## Rules (enforced by `test/migrations.test.js`)

- File names are `NNNN_name.sql`, contiguous from `0001`, which is what `d1-migrate-file.yml` accepts.
- Schema files contain only `CREATE ... IF NOT EXISTS`. Seed files contain only `INSERT OR IGNORE` or `INSERT ... WHERE NOT EXISTS`.
- No `ALTER`, `DROP`, `DELETE`, `UPDATE` or `PRAGMA`. Running the whole folder twice changes nothing.
- Each table is defined once. Navigation links are guarded by `url + location`, so a renamed link is not added again.
- To add a table or index, put it in the file of its domain (or add a new numbered file) and keep it idempotent.

## New database

```bash
for f in en/migrations/00*.sql; do
  npx wrangler d1 execute <db-name> --config wrangler.jsonc --remote --file="$f"
done
```

## Existing (live) database

The files are safe to run on a live database: tables and indexes that exist are skipped. **Do not run the seed files (`0016`–`0020`) on a live site**: a row you deleted on purpose would come back. Run only schema files.

`CREATE TABLE IF NOT EXISTS` does not add a missing column. To see what a database is behind on:

```bash
npx wrangler d1 export <db-name> --remote --no-data --output=/tmp/db.sql
node en/scripts/check-schema.mjs /tmp/db.sql          # report
node en/scripts/check-schema.mjs /tmp/db.sql --fix    # repair SQL: CREATE ... IF NOT EXISTS, ALTER TABLE ADD COLUMN
node en/scripts/check-schema.mjs --self               # migrations apply twice cleanly
```

A column SQLite cannot add (for example `UNIQUE` or `NOT NULL` without a default) is printed as `-- needs a manual step`, never guessed.

The export of `levelcasino-db` from 2026-10-19 (`test/fixtures/production-schema-2026-10-19.sql`) differs only by the tables from the newest migrations: `ai_feedback`, `ai_studio_history`, `perf_samples` and their five indexes. Run `0013` and `0014` on it.

## One-time data scripts

`en/ops/` holds scripts that fix data once (`invalidate_sessions.sql`, `reviews_generic_backfill.sql`, `platform_updates_featured_image_cleanup.sql`). They are not migrations. See `en/ops/README.md`.

## What changed in the rewrite

- Gaps (no `0001`, `0009`, `0011`, `0015`), three `0008` variants, rollback files and `schema.sql` are gone.
- Tables that lived only outside the folder (`schema-lummet.sql`: `ai_conversations`, `ai_rate_limits`, `ai_free_tier_usage`) are in `0013`.
- Objects that production had but the old files lacked are now defined: `reviews.author*`, five indexes, two triggers.
- The old navigation seed doubled its rows when run twice (27 to 54). It no longer does.
- The test shim applies the files strictly: any error fails the test (it used to ignore "already exists").
- Equality with production was checked table by table: columns and order, foreign keys, index and trigger SQL.
