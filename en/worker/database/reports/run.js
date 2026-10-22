import { handleAffiliatePerformance, handleContentPerformance, handleConversionFunnel, handleDimensionReport, handleExecutivePerformance, handleGeoPerformance, handleRevenueCommission, handleTrafficPerformance } from "./handlers-core.js";
import { handleReconciliation } from "./reconciliation.js";
import { handleCohortAnalysis, handleLtvAnalysis } from "./cohort-ltv.js";
import { handleOperationalHealth } from "./operational-health.js";

const REPORT_HANDLERS = {
  casino_performance: (db, user, f) => handleDimensionReport(db, user, f, 'casino', 'Casino'),
  offer_performance: (db, user, f) => handleDimensionReport(db, user, f, 'offer', 'Offer'),
  tracking_link_performance: (db, user, f) => handleDimensionReport(db, user, f, 'tracking_link', 'Tracking Link'),
  partner_performance: (db, user, f) => handleDimensionReport(db, user, f, 'partner', 'Partner'),
  program_performance: (db, user, f) => handleDimensionReport(db, user, f, 'program', 'Program'),
  account_performance: (db, user, f) => handleDimensionReport(db, user, f, 'account', 'Account'),
  affiliate_performance: handleAffiliatePerformance,
  geo_performance: handleGeoPerformance,
  content_performance: handleContentPerformance,
  traffic_performance: handleTrafficPerformance,
  executive_performance: handleExecutivePerformance,
  conversion_funnel: handleConversionFunnel,
  revenue_commission: handleRevenueCommission,
  operational_health: handleOperationalHealth,
  reconciliation: handleReconciliation,
  cohort_analysis: handleCohortAnalysis,
  ltv_analysis: handleLtvAnalysis,
  // seo_performance deliberately has NO handler -- see runReport() below.
};

/**
 * Executes a report definition's report_type against real, item-access-
 * scoped data. Never reads report_definitions.filters_json as anything
 * more than a starting point the caller may override -- `filters` here
 * is what actually runs.
 */
/**
 * Executes a report definition's report_type against real, item-access-
 * scoped data. Never reads report_definitions.filters_json as anything
 * more than a starting point the caller may override -- `filters` here
 * is what actually runs.
 *
 * `filters.selectedColumns` (array of column keys) and `filters.groupBy`
 * (a single groupable column key) are both OPTIONAL and applied AFTER
 * the handler runs, never passed into the handler's own queries --
 * column selection is a display concern, not a data-access concern, so
 * it can never be used to widen what a handler returns.
 */
export async function runReport(db, user, reportType, filters) {
  if (reportType === 'seo_performance') {
    throw new Error(
      'SEO performance reporting requires a Search Console (or equivalent) ' +
      'integration that is not configured for this tenant. Internally ' +
      'measured page-view metrics for SEO landing pages are available via ' +
      'the content_performance report type instead.'
    );
  }
  const handler = REPORT_HANDLERS[reportType];
  if (!handler) {
    throw new Error(`Unknown or unimplemented report_type: ${reportType}`);
  }

  const result = await handler(db, user, filters);
  return applyColumnSelectionAndGrouping(result, filters);
}

/**
 * Applies (in order): column selection, then grouping+subtotals. Both
 * are validated against the report's OWN column manifest -- an unknown
 * or unavailable column key is silently ignored rather than throwing,
 * since a saved report's columns_json could reference a column from a
 * different report_type if hand-edited via the API; failing softly
 * here just means "show all columns" / "no grouping", never an error
 * that blocks viewing the report's real data.
 */
function applyColumnSelectionAndGrouping(result, { selectedColumns, groupBy } = {}) {
  let { columns, rows } = result;

  if (Array.isArray(selectedColumns) && selectedColumns.length > 0) {
    const available = new Set(columns.map(c => c.key));
    const filtered = columns.filter(c => selectedColumns.includes(c.key) && available.has(c.key));
    if (filtered.length > 0) columns = filtered;
  }

  if (groupBy) {
    const groupColumn = columns.find(c => c.key === groupBy && c.groupable);
    if (groupColumn) {
      rows = groupAndSubtotal(rows, columns, groupBy);
    }
  }

  return { columns, rows };
}

/**
 * Sorts rows by the group key and inserts a subtotal row after each
 * group, summing every column marked `summable: true` in the (possibly
 * already column-selected) column set. Non-summable columns in the
 * subtotal row are left blank rather than concatenated/guessed.
 */
function groupAndSubtotal(rows, columns, groupBy) {
  const summableKeys = columns.filter(c => c.summable).map(c => c.key);
  const groups = new Map();
  for (const row of rows) {
    const key = row[groupBy] ?? '(none)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const output = [];
  for (const [groupValue, groupRows] of groups) {
    output.push(...groupRows);
    const subtotal = { [groupBy]: `Subtotal: ${groupValue}`, __subtotal: true };
    for (const key of summableKeys) {
      if (key === groupBy) continue;
      subtotal[key] = groupRows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0);
    }
    output.push(subtotal);
  }
  return output;
}
