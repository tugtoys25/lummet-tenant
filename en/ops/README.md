# One-time operations

Scripts here are **not** migrations. They fix or reset data once, on a database that already exists,
and are run by hand:

```bash
cd en
npx wrangler d1 execute <db-name> --config ../wrangler.jsonc --remote --file=ops/<file>.sql
```

| File | What it does | When |
|---|---|---|
| `invalidate_sessions.sql` | Deletes every session and pending password-reset link. | After a credential exposure. Safe to repeat. |
| `reviews_generic_backfill.sql` | Fills `reviewed_content_type` / `reviewed_content_id` for old casino reviews. | On a database whose reviews predate the generic review model. Safe to repeat. |
| `platform_updates_featured_image_cleanup.sql` | Repairs `platform_updates.featured_image` rows that hold text instead of a media id. | On a database that has such rows. Safe to repeat. |

New databases need none of them: `migrations/` already creates the final schema.
