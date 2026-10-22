const REPORT_TYPES = [
  'executive_performance', 'affiliate_performance', 'partner_performance',
  'program_performance', 'account_performance', 'offer_performance',
  'tracking_link_performance', 'casino_performance', 'geo_performance',
  'content_performance', 'traffic_performance', 'conversion_funnel',
  'revenue_commission', 'seo_performance', 'operational_health', 'reconciliation',
  'cohort_analysis', 'ltv_analysis'
];

export function isValidReportType(type) {
  return REPORT_TYPES.includes(type);
}

// ── Column manifests ─────────────────────────────────
// Single source of truth for each report type's available columns.
// Handlers below reference these constants directly (never inline a
// duplicate array) so the "available columns" the UI offers can never
// drift from what a handler actually returns. `summable: true` marks
// columns that are safe to subtotal when grouping (raw counts/amounts);
// ratios (CTR/CVR/EPC/etc.), IDs, and labels are never summed.
// `groupable: true` marks categorical columns worth grouping rows by --
// deliberately not offered on IDs or continuous metrics, where grouping
// wouldn't reduce anything (grouping by a unique ID just reproduces the
// original ungrouped rows).

export const DIMENSION_REPORT_COLUMNS = (label) => [
  { key: 'dimensionId', label: `${label} ID` },
  { key: 'currency', label: 'Currency', groupable: true },
  { key: 'views', label: 'Views', summable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true },
  { key: 'ctr', label: 'CTR' }, { key: 'cvr', label: 'CVR' },
  { key: 'epc', label: 'EPC' }, { key: 'rpc', label: 'RPC' }, { key: 'cpa', label: 'CPA' }
];

export const AFFILIATE_PERFORMANCE_COLUMNS = [
  { key: 'level', label: 'Level', groupable: true },
  { key: 'dimensionId', label: 'ID' },
  { key: 'currency', label: 'Currency', groupable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true },
  { key: 'cvr', label: 'CVR' }, { key: 'epc', label: 'EPC' }, { key: 'cpa', label: 'CPA' }
];

export const GEO_PERFORMANCE_COLUMNS = [
  { key: 'country', label: 'Country', groupable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true },
  { key: 'cvr', label: 'CVR' }, { key: 'epc', label: 'EPC' }
];

export const CONTENT_PERFORMANCE_COLUMNS = [
  { key: 'contentType', label: 'Content Type', groupable: true },
  { key: 'dimensionId', label: 'ID' },
  { key: 'views', label: 'Views', summable: true }
];

export const TRAFFIC_PERFORMANCE_COLUMNS = [
  { key: 'date', label: 'Date', groupable: true },
  { key: 'views', label: 'Views (all content)', summable: true },
  { key: 'clicks', label: 'Affiliate Clicks', summable: true },
  { key: 'ctr', label: 'CTR' },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true }
];

export const EXECUTIVE_PERFORMANCE_COLUMNS = [
  { key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }
];

export const CONVERSION_FUNNEL_COLUMNS = [
  { key: 'casinoId', label: 'Casino ID' },
  { key: 'views', label: 'Views', summable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'viewToClick', label: 'View → Click %' }, { key: 'clickToConversion', label: 'Click → Conversion %' }
];

export const REVENUE_COMMISSION_COLUMNS = [
  { key: 'casino_id', label: 'Casino ID' },
  { key: 'currency', label: 'Currency', groupable: true },
  { key: 'status', label: 'Status', groupable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true }
];

export const OPERATIONAL_HEALTH_COLUMNS = [
  { key: 'section', label: 'Section', groupable: true }, { key: 'detail', label: 'Detail' }
];

// brief §12: "Show: Casino, Partner, Program, Account, GEO, Period,
// Clicks, Registrations, FTD, Deposits, Revenue, Expected Commission,
// Reported Commission, Difference, Difference %". Period is the
// filters.startDate/endDate range itself (same one-range-per-run
// convention every other report in this file already uses -- see
// handleRevenueCommission -- rather than a new multi-bucket concept).
export const RECONCILIATION_COLUMNS = [
  { key: 'casino_id', label: 'Casino ID', groupable: true },
  { key: 'account_id', label: 'Account ID', groupable: true },
  { key: 'currency', label: 'Currency', groupable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'registrations', label: 'Registrations', summable: true },
  { key: 'ftd', label: 'FTD', summable: true },
  { key: 'deposits', label: 'Deposits', summable: true },
  { key: 'unattributed_conversions', label: 'Unattributed Conversions', summable: true },
  { key: 'internal_revenue', label: 'Revenue (Internal)', summable: true },
  { key: 'expected_commission', label: 'Expected Commission', summable: true },
  { key: 'reported_revenue', label: 'Revenue (Reported)', summable: true },
  { key: 'reported_commission', label: 'Reported Commission', summable: true },
  { key: 'difference', label: 'Difference', summable: true },
  { key: 'difference_pct', label: 'Difference %' },
  { key: 'status', label: 'Status', groupable: true }
];

// brief §17: registration-to-FTD, FTD-to-deposit, revenue/commission by
// acquisition date, and GEO/casino/campaign cohorts. One shared column
// set across all three cohortMetric variants -- whichever columns don't
// apply to the metric you asked for come back as `null` (see
// handleCohortAnalysis), never a fabricated 0, per brief §29.
export const COHORT_ANALYSIS_COLUMNS = [
  { key: 'cohort_date', label: 'Cohort Date', groupable: true },
  { key: 'casino_id', label: 'Casino ID', groupable: true },
  { key: 'country_code', label: 'GEO', groupable: true },
  { key: 'campaign_id', label: 'Campaign ID', groupable: true },
  { key: 'cohort_size', label: 'Cohort Size', summable: true },
  { key: 'converted_count', label: 'Converted', summable: true },
  { key: 'conversion_rate_pct', label: 'Conversion Rate %' },
  { key: 'avg_days_to_convert', label: 'Avg Days to Convert' },
  { key: 'revenue', label: 'Revenue (cohort-to-date)', summable: true },
  { key: 'commission', label: 'Commission (cohort-to-date)', summable: true }
];

// brief §18. One row per external_player_id -- the provider's OWN
// player/customer reference (migration 0036), never derived or
// enriched by this platform. `note` is ONLY ever populated on the
// single synthetic row returned when this tenant has no
// external_player_id data at all yet (see handleLtvAnalysis) --
// every numeric column on that row is null, not 0, since "no players
// with this data" is not the same claim as "players who happened to
// generate zero revenue" (brief §29).
export const LTV_ANALYSIS_COLUMNS = [
  { key: 'external_player_id', label: 'Player Reference', groupable: true },
  { key: 'casino_id', label: 'Casino ID', groupable: true },
  { key: 'first_seen_at', label: 'Acquired At' },
  { key: 'ftd_value', label: 'FTD Value', summable: true },
  { key: 'deposit_value', label: 'Deposit Value', summable: true },
  { key: 'revenue_7d', label: 'Revenue (7-day)', summable: true },
  { key: 'revenue_30d', label: 'Revenue (30-day)', summable: true },
  { key: 'total_revenue', label: 'Revenue (to date)', summable: true },
  { key: 'total_commission', label: 'Commission (to date)', summable: true },
  { key: 'note', label: 'Note' }
];

// Public manifest lookup -- used both by the API (to offer choices to
// the UI) and internally by runReport() (to validate/apply a saved
// selection). seo_performance intentionally has no entry, matching it
// having no handler -- see runReport() below.
const REPORT_COLUMN_MANIFESTS = {
  casino_performance: DIMENSION_REPORT_COLUMNS('Casino'),
  offer_performance: DIMENSION_REPORT_COLUMNS('Offer'),
  tracking_link_performance: DIMENSION_REPORT_COLUMNS('Tracking Link'),
  partner_performance: DIMENSION_REPORT_COLUMNS('Partner'),
  program_performance: DIMENSION_REPORT_COLUMNS('Program'),
  account_performance: DIMENSION_REPORT_COLUMNS('Account'),
  affiliate_performance: AFFILIATE_PERFORMANCE_COLUMNS,
  geo_performance: GEO_PERFORMANCE_COLUMNS,
  content_performance: CONTENT_PERFORMANCE_COLUMNS,
  traffic_performance: TRAFFIC_PERFORMANCE_COLUMNS,
  executive_performance: EXECUTIVE_PERFORMANCE_COLUMNS,
  conversion_funnel: CONVERSION_FUNNEL_COLUMNS,
  revenue_commission: REVENUE_COMMISSION_COLUMNS,
  operational_health: OPERATIONAL_HEALTH_COLUMNS,
  reconciliation: RECONCILIATION_COLUMNS,
  cohort_analysis: COHORT_ANALYSIS_COLUMNS,
  ltv_analysis: LTV_ANALYSIS_COLUMNS
};

/**
 * Returns the full column manifest for a report type, for the API/UI to
 * offer choices from -- without running the report. Returns null for
 * seo_performance and any unrecognized type (both are "nothing to
 * offer", not an error the caller needs to distinguish here).
 */
export function getReportColumnOptions(reportType) {
  return REPORT_COLUMN_MANIFESTS[reportType] || null;
}

/**
 * Unscoped list of every report_definitions row -- for the Super API
 * only (the tenant dashboard's own /reports/list endpoint uses the
 * item-access-scoped query in api.js instead; this is a separate,
 * deliberately tenant-wide function, same "unscoped is fine here" model
 * as every other Super API resource).
 */
export async function getAllReportDefinitions(db, { status = 'active' } = {}) {
  const statusClause = status ? 'WHERE status = ?' : '';
  const result = await db.prepare(`
    SELECT * FROM report_definitions ${statusClause} ORDER BY created_at DESC
  `).bind(...(status ? [status] : [])).all();
  return result.results || [];
}
