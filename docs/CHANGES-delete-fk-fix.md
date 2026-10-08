# Fix: deleting news / generic reviews failed with a network error

Cause: analytics_events.news_id and review_id reference news(id) / reviews(id)
with no ON DELETE action, so any article or review with logged events hit
SQLITE_CONSTRAINT_FOREIGNKEY and the API returned a 500.

Changed (no migration needed, no schema change):
- en/worker/database/news.js            deleteNews: detach analytics_events, then delete (one batch)
- en/worker/database/generic-reviews.js deleteGenericReview: same
- en/worker/lummet/admin-api.js         "delete news older than YYYY": same
- en/worker/database/casinos.js         deleteCasino: detach analytics_events, analytics_conversions, news_entities, then delete (one batch)
- en/worker/api.js                         deleteCasino: clear 409 if commercial terms exist (like offers/tracking links)
- en/worker/super/handlers.js              handleDeleteCasino: FK error returns a 409 message instead of a 500
deleteReview (casino reviews) already did this.
- en/test/support/d1-shim.js              added db.batch() (transactional) so batch-based deletes run under test
- en/test/delete-fk-detach.test.js        new regression tests (foreign keys ON)
