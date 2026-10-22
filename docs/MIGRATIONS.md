# Migrations

`en/migrations/` is one ordered, forward-only set. There are no rollback files and no `schema.sql`.
Applied in order to an empty database it builds the final tenant schema (126 tables, 304 indexes, 2 triggers)
plus the default rows of a new tenant.

## Layout

| File | Content |
|---|---|
| `0001_baseline.sql` | the full schema, generated from the live `lummet-tenant-db` export of 2026-10-19 |
| `0002_seed_defaults.sql` | default roles, permissions, settings, components, navigation (`INSERT OR IGNORE`, never overwrites edits) |
| `0003_rating_sync_triggers.sql` | the two rating triggers between `casinos` and `reviews` (own file because trigger bodies contain `;`) |
| `0004_ai_history_feedback_perf.sql` | `ai_studio_history`, `ai_feedback`, `perf_samples` and their indexes |

`en/migrations-legacy/` holds the old 0002..0061 chain for reference only. It is never applied.

## Rules (enforced by `test/migrations.test.js`)

- File names are `NNNN_name.sql`, contiguous from `0001`.
- Every statement is `CREATE ... IF NOT EXISTS` or an idempotent insert, so any file can run twice safely.
- New work is a new file (`0005_...`); never edit a file that has already run in production.

## Applying

New database: `node tenant-migrate.mjs --db <db-name> --remote` (runs every file in order).
Existing production database: the same command is safe; at minimum `0004` is needed if the database predates AI history/feedback.
Add `--dry-run` first to see what would run.

## Checking a live database against the migrations

```
npx wrangler d1 export <db-name> --remote --no-data --output=/tmp/db.sql
node en/scripts/check-schema.mjs /tmp/db.sql          # report
node en/scripts/check-schema.mjs /tmp/db.sql --fix    # print repair SQL
node en/scripts/check-schema.mjs --self               # migrations apply twice cleanly
```

The 2026-10-19 export of `levelcasino-db` (`test/fixtures/production-schema-2026-10-19.sql`) differs only by the tables in `0004`.

## One-time data scripts

`en/ops/` holds scripts that fix data once. They are not migrations. See `en/ops/README.md`.
