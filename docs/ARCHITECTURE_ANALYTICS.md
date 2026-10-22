# Analytics (worker/database/analytics.js, worker/database/analytics/)

`analytics.js` (604 lines) is now a facade over four parts. It re-exports the same 12 names, so every importer (the affiliate, casino, review, news, redirect and content-item controllers, `worker/cron.js`) is unchanged.

| Part | Lines | Holds |
|---|---:|---|
| `analytics/events.js` | 82 | The list of valid event types, `logEvent` (best effort, never throws), `eventCapture` (records view events while a page is rendered for the cache) |
| `analytics/metrics.js` | 234 | `safeDivide`, `computeKpis`, and the permission-scoped reads: `getScopedDimensionCondition`, `getDimensionPerformance`, `getTimeSeries`, `getGeoPerformance` |
| `analytics/conversions.js` | 95 | `recordConversion` (looks the commercial term up itself), `getClickAttribution` (exact `click_id` match only) |
| `analytics/aggregation.js` | 176 | The daily roll-up into `analytics_daily`: `aggregateAnalyticsDaily` (cron, feature-flagged) and `backfillAnalyticsDaily` (manual, capped at 92 days) |

Dependencies: the four parts do not import each other. `metrics` uses `../item-access.js`, `conversions` uses `../affiliate-commercial-terms.js`.

The privacy rule stays where it was: every scoped read resolves the caller's accessible ids first, then filters the SQL, then aggregates. `test/analytics-structure.test.js` checks the layout and that only `metrics.js` touches item access.
