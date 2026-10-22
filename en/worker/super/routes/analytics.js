// Super API routes: Analytics, reports, campaigns and alerts.
// Each entry: [METHOD, path-pattern, handler, resource-name]. Order matters (first match wins);
// router.js joins the groups in the order the table always had.
import * as anh from "../handlers-analytics.js";
import * as rh from "../handlers-reporting.js";

export const ANALYTICS_ROUTES = [
  // Analytics (v8) -- tenant-wide AGGREGATE data only, see
  // handlers-analytics.js header comment for exactly what is and
  // isn't exposed here and why.
  ["GET", "/en/api/super/analytics-overview", anh.handleAnalyticsOverview, "analytics"],
  ["GET", "/en/api/super/analytics-revenue", anh.handleAnalyticsRevenue, "analytics"],
  ["GET", "/en/api/super/tracking-health", anh.handleTrackingHealth, "analytics"],
  // v15: GEO breakdown, scheduled-job health, and the dashboard's manual runs.
  ["GET", "/en/api/super/analytics-geo", anh.handleAnalyticsGeo, "analytics"],
  ["GET", "/en/api/super/analytics-health", anh.handleAnalyticsHealth, "analytics"],
  ["POST", "/en/api/super/analytics-aggregate", anh.handleAnalyticsAggregate, "analytics"],
  ["POST", "/en/api/super/analytics-evaluate-alerts", anh.handleAnalyticsEvaluateAlerts, "analytics"],
  ["POST", "/en/api/super/analytics-run-due-reports", anh.handleAnalyticsRunDueReports, "analytics"],

  // Reports (v9) -- see handlers-reporting.js header comment for exactly
  // what's exposed and why report output is treated as the same trust
  // tier as the v8 analytics endpoints rather than a bigger exposure.
  ["GET", "/en/api/super/reports", rh.handleListReports, "reports"],
  ["GET", "/en/api/super/reports/:id", rh.handleGetReport, "reports"],
  ["POST", "/en/api/super/reports", rh.handleCreateReport, "reports"],
  ["POST", "/en/api/super/reports/:id/run", rh.handleRunReport, "reports"],
  ["GET", "/en/api/super/report-column-options", rh.handleReportColumnOptions, "reports"],

  // Campaigns (v9) -- full CRUD, campaign metadata only (no financial
  // or per-visitor data), same access level as other simple resources
  // already exposed through this API.
  ["GET", "/en/api/super/campaigns", rh.handleListCampaigns, "campaigns"],
  ["GET", "/en/api/super/campaigns/:id", rh.handleGetCampaign, "campaigns"],
  ["POST", "/en/api/super/campaigns", rh.handleCreateCampaign, "campaigns"],
  ["PUT", "/en/api/super/campaigns/:id", rh.handleUpdateCampaign, "campaigns"],

  // Alerts (v9) -- mirrors the tenant dashboard's own capability split
  // (rule create/delete is admin-only there; Super API's credential is
  // already tenant-wide-admin-equivalent, consistent with everywhere
  // else in this file).
  ["GET", "/en/api/super/alert-rules", rh.handleListAlertRules, "alerts"],
  ["POST", "/en/api/super/alert-rules", rh.handleCreateAlertRule, "alerts"],
  ["GET", "/en/api/super/alerts", rh.handleListAlerts, "alerts"],
  ["POST", "/en/api/super/alerts/:id/acknowledge", rh.handleAcknowledgeAlert, "alerts"],
];
