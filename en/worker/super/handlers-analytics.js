// =====================================================
// SUPER API — HANDLERS (Analytics/Reporting/Alerting capabilities)
//
// Same convention as handlers.js/handlers-affiliate.js: thin wrappers,
// no duplicated business logic. Reuses worker/database/analytics.js
// and worker/database/reports.js exactly as the tenant dashboard does.
//
// Deliberate scope, per the original platform audit (§32): "Determine
// appropriate capability-based Super API endpoints... Expose only safe
// aggregated information unless raw data is explicitly necessary."
//
// - analytics_overview / analytics_revenue: TENANT-WIDE aggregates only
//   (analytics_daily rows, already pre-aggregated -- never
//   analytics_events, never a single visitor's data).
// - tracking_health: current STATUS counts + which links are currently
//   unhealthy -- never the raw tracking_link_health_checks history.
//
// Super API requests carry no per-user identity (single HMAC-signed
// tenant credential, see auth.js) -- consistent with every OTHER
// existing Super API handler in this codebase (handleListCasinos etc.
// call getAllCasinosAdmin() directly, with no item-access scoping at
// all). A synthetic { role: 'admin' } actor is passed into the shared
// analytics.js functions below so they resolve to their own
// unconditional "all" branch -- same tenant-wide-by-design model as
// everything else already exposed through this API, not a new or
// weaker access path introduced for analytics specifically.
//
// report_definitions/report_runs are NOT exposed through this API yet
// -- deferred, same as the original audit recommended, pending
// confirmation the control plane actually needs report data (not just
// analytics numbers) through this channel.
// =====================================================

import {
  getDimensionPerformance, getTimeSeries, getGeoPerformance, backfillAnalyticsDaily
} from "../database/analytics.js";
import { getCronHealth, recordCronRun } from "../database/cron-health.js";
import { evaluateAllRulesNow } from "../database/alerts.js";
import { runDueReportSchedulesNow } from "../database/reports.js";

// Synthetic tenant-wide actor -- see file header. Never constructed
// from request data; always this exact literal.
const SUPER_API_ACTOR = Object.freeze({ user_id: null, role: "admin" });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function ok(data = {}) { return json({ success: true, ...data }, 200); }
function fail(message, status = 400) { return json({ success: false, error: message }, status); }

function parseDateRange(url) {
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
}

// =====================================================
// ANALYTICS OVERVIEW
// =====================================================
// GET /en/api/super/analytics-overview?start_date=&end_date=&dimension_type=&currency=
// Tenant-wide performance-by-dimension summary. dimension_type defaults
// to 'casino'; any type getDimensionPerformance() supports is valid
// (casino/offer/tracking_link/partner/program/account/campaign/review/
// news/page). Reads analytics_daily (pre-aggregated), never raw events.
export async function handleAnalyticsOverview(request, env) {
  const url = new URL(request.url);
  const range = parseDateRange(url);
  if (!range) return fail("start_date and end_date are required");

  const dimensionType = url.searchParams.get("dimension_type") || "casino";
  const currency = url.searchParams.get("currency") || null;

  const rows = await getDimensionPerformance(env.DB, SUPER_API_ACTOR, {
    dimensionType, currency, ...range
  });

  // v15: additive `name` on every row (dimensionId is unchanged). The
  // tenant dashboard itself still shows the bare ID; a human-readable
  // label is what an operator managing many tenants centrally needs.
  const names = await resolveDimensionNames(env.DB, dimensionType, rows.map(r => r.dimensionId));
  return ok({
    dimension_type: dimensionType,
    rows: rows.map(r => ({ ...r, name: names.get(r.dimensionId) ?? null }))
  });
}

// Fixed table/column map -- names come only from this literal, never from
// request input (dimensionType outside the map simply yields no names).
const DIMENSION_NAME_SOURCES = {
  casino: { table: "casinos", column: "name" },
  offer: { table: "offers", column: "internal_name" },
  tracking_link: { table: "tracking_links", column: "internal_name" },
  partner: { table: "affiliate_partners", column: "name" },
  program: { table: "affiliate_programs", column: "name" },
  account: { table: "affiliate_accounts", column: "account_name" },
  campaign: { table: "campaigns", column: "name" },
  review: { table: "reviews", column: "title" },
  news: { table: "news", column: "title" },
  page: { table: "pages", column: "title" }
};

export async function resolveDimensionNames(db, dimensionType, ids) {
  const out = new Map();
  const src = DIMENSION_NAME_SOURCES[dimensionType];
  const clean = [...new Set((ids || []).filter(i => Number.isInteger(Number(i)) && i !== null).map(Number))];
  if (!src || !clean.length) return out;
  // D1 allows at most 100 bound parameters per statement.
  for (let i = 0; i < clean.length; i += 90) {
    const chunk = clean.slice(i, i + 90);
    try {
      const r = await db.prepare(
        `SELECT id, ${src.column} AS label FROM ${src.table} WHERE id IN (${chunk.map(() => "?").join(",")})`
      ).bind(...chunk).all();
      for (const row of r.results || []) out.set(row.id, row.label);
    } catch (_) { /* a missing/renamed table degrades to "no names", never a 500 */ }
  }
  return out;
}

// =====================================================
// ANALYTICS REVENUE
// =====================================================
// GET /en/api/super/analytics-revenue?start_date=&end_date=&currency=
// Tenant-wide daily revenue/commission time series, summed across every
// accessible casino (getTimeSeries with dimensionId=null already sums
// over all dimension_ids of that type per date -- see analytics.js).
// currency is REQUIRED here specifically (not optional, unlike the
// overview endpoint) -- summing revenue across mixed currencies would
// silently produce a meaningless number, and this platform's own rule
// is "never silently convert currencies" (brief §23).
export async function handleAnalyticsRevenue(request, env) {
  const url = new URL(request.url);
  const range = parseDateRange(url);
  if (!range) return fail("start_date and end_date are required");

  const currency = url.searchParams.get("currency");
  if (!currency) return fail("currency is required (revenue is never summed across currencies)");

  const series = await getTimeSeries(env.DB, SUPER_API_ACTOR, {
    dimensionType: "casino", dimensionId: null, currency, ...range
  });

  return ok({ currency, series });
}

// =====================================================
// TRACKING LINK HEALTH
// =====================================================
// GET /en/api/super/tracking-health
// Current status counts + which specific links are currently unhealthy.
// Deliberately NOT the raw tracking_link_health_checks history table --
// that stays internal; this is a summarized operational signal, per the
// audit's explicit "expose a summarized capability rather than raw
// table access" guidance for this exact resource.
export async function handleTrackingHealth(request, env) {
  const countsResult = await env.DB.prepare(`
    SELECT health_status, COUNT(*) AS count
    FROM tracking_links
    GROUP BY health_status
  `).all();

  const unhealthyResult = await env.DB.prepare(`
    SELECT id, internal_name, health_status
    FROM tracking_links
    WHERE health_status != 'healthy'
    ORDER BY health_status
    LIMIT 100
  `).all();

  const counts = {};
  for (const row of countsResult.results || []) {
    counts[row.health_status] = row.count;
  }

  return ok({
    counts,
    unhealthy_links: (unhealthyResult.results || []).map(r => ({
      id: r.id, name: r.internal_name, status: r.health_status
    }))
  });
}


// =====================================================
// v15 -- GEO, system health, manual runs
// =====================================================

// GET /en/api/super/analytics-geo?start_date=&end_date=&currency=
// Same getGeoPerformance() the tenant dashboard's /analytics/geo uses,
// tenant-wide (admin-equivalent actor), currency optional like the
// dashboard. Reads analytics_events/analytics_conversions for a bounded,
// explicitly date-ranged request (never a page-render path).
export async function handleAnalyticsGeo(request, env) {
  const url = new URL(request.url);
  const range = parseDateRange(url);
  if (!range) return fail("start_date and end_date are required");
  const currency = url.searchParams.get("currency") || null;
  const rows = await getGeoPerformance(env.DB, SUPER_API_ACTOR, { currency, ...range });
  return ok({ rows });
}

// GET /en/api/super/analytics-health
// Scheduled-job health (never_run / disabled / stale / ok) -- the
// diagnosis for "the dashboard shows zero". Same getCronHealth() as the
// tenant dashboard's System Health table.
export async function handleAnalyticsHealth(request, env) {
  const jobs = await getCronHealth(env.DB);
  return ok({ jobs });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /en/api/super/analytics-aggregate  { start_date, end_date }
// Manual/backfill aggregation, same as the dashboard's "Run Aggregation
// Now" (does not depend on the automation flag; records the run in the
// same cron-health row).
export async function handleAnalyticsAggregate(request, env, _id, bodyText) {
  let body = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (_) { /* validated below */ }
  if (!DATE_RE.test(body.start_date || "") || !DATE_RE.test(body.end_date || "")) {
    return fail("start_date and end_date (YYYY-MM-DD) are required");
  }
  if (body.start_date > body.end_date) return fail("start_date must not be after end_date");
  try {
    const result = await backfillAnalyticsDaily(env.DB, { startDate: body.start_date, endDate: body.end_date });
    await recordCronRun(env.DB, "analytics_aggregation", {
      skipped: false, date: `${body.start_date} to ${body.end_date}`, daysProcessed: result.daysProcessed
    });
    return ok({ ...result });
  } catch (error) {
    return fail(error.message || "aggregation_failed", 422);
  }
}

// POST /en/api/super/analytics-evaluate-alerts
export async function handleAnalyticsEvaluateAlerts(request, env) {
  const result = await evaluateAllRulesNow(env.DB);
  await recordCronRun(env.DB, "alert_evaluation", { skipped: false, summary: result.summary });
  return ok({ ...result });
}

// POST /en/api/super/analytics-run-due-reports
// Only schedules that are actually due right now (next_run_at <= now).
export async function handleAnalyticsRunDueReports(request, env) {
  const result = await runDueReportSchedulesNow(env.DB, env);
  await recordCronRun(env.DB, "report_schedules", { skipped: false, results: result.summary });
  return ok({ ...result });
}
