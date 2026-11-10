# Fix: deleting a page failed with D1_ERROR FOREIGN KEY constraint failed

## The problem
Deleting a page from Site Structure > Pages showed `D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY`.
`analytics_events.page_id` references `pages(id)` with no `ON DELETE` action, so any page that had been viewed or
clicked could not be deleted. It is the only table that references `pages`.

## The change
- `worker/database/pages.js` `deletePage`: one D1 batch that first sets `analytics_events.page_id = NULL` for that page,
  then deletes the page. Analytics history is kept; only the link to the removed page is dropped.
- No migration, no schema change, no static asset change.
- New test: `test/page-delete-fk.test.js` (4 cases).

## NOT VERIFIED
Only the new test file was run, on the local SQLite shim. Real D1 and the full tenant suite were not run.
