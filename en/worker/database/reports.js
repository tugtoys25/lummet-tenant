// worker/database/reports.js
// Phase 7-9: Report execution engine.
//
// Hard rule, same as analytics.js: report_definitions.filters_json is a
// saved convenience only, never an authorization boundary. Every runReport()
// call re-resolves the REQUESTING user's item-access at execution time via
// the same helpers analytics.js uses -- a saved report cannot leak data the
// runner no longer has access to (see 0030_reporting.sql header comment).
//
// "No fake completion" (brief §44): report types with no real underlying
// data source (seo_performance -- no Search Console/SEO API integration
// exists in this codebase) throw a clear, specific error rather than
// returning fabricated or all-zero rows dressed up as real data.

// The code lives in reports/*.js (see docs/ARCHITECTURE_DATABASE_REPORTS.md); this file keeps the public import path.
export { isValidReportType, getReportColumnOptions, getAllReportDefinitions } from "./reports/columns.js";
export { runReport } from "./reports/run.js";
export { toCsv, toHtml } from "./reports/export.js";
export { executeReportRun, runDueReportSchedules, runDueReportSchedulesNow } from "./reports/scheduling.js";
