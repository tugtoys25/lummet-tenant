// worker/database/analytics.js
// Phase 2/4/5: Canonical event logging + KPI engine.
//
// Hard rule (audit §31 / brief §31): every scoped query in this file
// resolves the caller's accessible dimension IDs FIRST via the
// existing worker/database/item-access.js registry, then constrains
// the SQL WHERE clause with them, THEN aggregates. Never aggregate
// first and filter the result — that leaks totals across tenants'
// item-access boundaries even when individual rows are hidden.
//
// This module never runs an unscoped analytics query. If a future
// caller needs one (e.g. a true admin dashboard-wide summary), that
// still goes through getAccessibleWhereClause() — for an admin user
// item-access.js already returns 'all' access, so the SQL condition
// becomes unconditionally true rather than this module special-casing
// "is admin" itself. One code path, no shortcuts.

// The code lives in analytics/*.js (see docs/ARCHITECTURE_ANALYTICS.md); this file keeps the public import path.
export { eventCapture, logEvent } from "./analytics/events.js";
export { safeDivide, computeKpis, getScopedDimensionCondition, getDimensionPerformance, getTimeSeries, getGeoPerformance } from "./analytics/metrics.js";
export { recordConversion, getClickAttribution } from "./analytics/conversions.js";
export { aggregateAnalyticsDaily, backfillAnalyticsDaily } from "./analytics/aggregation.js";
