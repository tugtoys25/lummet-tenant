// Analytics overview, time series, geo, cron health, manual jobs.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as analyticsDB from "../../database/analytics.js";
import * as reportsDB from "../../database/reports.js";
import * as cronHealthDB from "../../database/cron-health.js";
import { NOT_HANDLED, failure, json, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

        // ==================================
    // ANALYTICS / REPORTING (Phase 5)
    // ==================================
    // Read endpoints are gated by the "analytics" / "analytics_conversions"
    // resource via readResourceMap above (role-level check, already run
    // before this point in handleAPI). Item-access scoping happens INSIDE
    // analyticsDB — every query below resolves the caller's accessible
    // dimension IDs before aggregating (see worker/database/analytics.js
    // header comment). No handler here re-derives or bypasses that.

    if (path === "/api/v1/analytics/overview") {
      const url = new URL(request.url);
      const dimensionType = url.searchParams.get("dimension_type") || "casino";
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const rows = await analyticsDB.getDimensionPerformance(env.DB, user, {
        dimensionType, startDate, endDate, currency
      });
      return json({ success: true, dimension_type: dimensionType, rows });
    }

    if (path === "/api/v1/analytics/timeseries") {
      const url = new URL(request.url);
      const dimensionType = url.searchParams.get("dimension_type") || "casino";
      const dimensionId = url.searchParams.get("dimension_id") ? Number(url.searchParams.get("dimension_id")) : null;
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const series = await analyticsDB.getTimeSeries(env.DB, user, {
        dimensionType, dimensionId, startDate, endDate, currency
      });
      return json({ success: true, series });
    }

    if (path === "/api/v1/analytics/geo") {
      const url = new URL(request.url);
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const rows = await analyticsDB.getGeoPerformance(env.DB, user, { startDate, endDate, currency });
      return json({ success: true, rows });
    }

    // Cron/scheduled-job health -- diagnoses the exact failure mode
    // that produces "the dashboard shows zero" support requests:
    // 'never_run' means the Worker's scheduled() trigger itself has
    // never fired (check wrangler.jsonc's triggers.crons), 'disabled'
    // means it fires but the job's own feature flag is off, 'stale'
    // means it was working and appears to have stopped. Read-only,
    // same 'analytics' resource as overview/timeseries/geo above.
    if (path === "/api/v1/analytics/cron-health") {
      const health = await cronHealthDB.getCronHealth(env.DB);
      return json({ success: true, jobs: health });
    }

    // Manual/backfill aggregation run -- admin-only (editor:analytics:create
    // is 0 by default, see migration 0027), because this writes
    // analytics_daily rows across EVERY casino/offer/etc. at once,
    // ignoring the calling user's own item-access scope entirely (the
    // aggregation itself has to see everything to produce correct
    // tenant-wide rollups; per-user scoping happens later, at read
    // time, in getDimensionPerformance/getGeoPerformance). Deliberately
    // does NOT require 'analytics_aggregation_cron_enabled' to be on --
    // see backfillAnalyticsDaily()'s own header comment for why a
    // manual admin action shouldn't depend on the automation flag.
    if (path === "/api/v1/analytics/aggregate-now" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["start_date", "end_date"]);
      try {
        const result = await analyticsDB.backfillAnalyticsDaily(env.DB, { startDate: body.start_date, endDate: body.end_date });
        await cronHealthDB.recordCronRun(env.DB, 'analytics_aggregation', { skipped: false, date: `${body.start_date} to ${body.end_date}`, daysProcessed: result.daysProcessed });
        await logAudit(env.DB, { userId: user.user_id, action: 'run', entityType: 'analytics_aggregation', metadata: { start_date: body.start_date, end_date: body.end_date, days_processed: result.daysProcessed } });
        return json({ success: true, ...result });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    // Manual scheduled-report run -- same reasoning. Only picks up
    // schedules that are ACTUALLY due right now (next_run_at <= now),
    // so this can't be used to force an early run of something not
    // due yet -- it just stops waiting on a disabled cron for what's
    // already due.
    if (path === "/api/v1/analytics/reports/run-due-now" && request.method === "POST") {
      const result = await reportsDB.runDueReportSchedulesNow(env.DB, env);
      await cronHealthDB.recordCronRun(env.DB, 'report_schedules', { skipped: false, results: result.summary });
      await logAudit(env.DB, { userId: user.user_id, action: 'run', entityType: 'report_schedules', metadata: { processed: result.processed } });
      return json({ success: true, ...result });
    }

    // Records a partner-reported conversion. Never accepts a caller-
    // supplied commission figure — recordConversion() looks up the
    // applicable affiliate_commercial_terms row itself. This is an
    // internal/admin-triggered entry point (e.g. manual postback
    // reconciliation); an unauthenticated public postback endpoint is
    // a separate, not-yet-built concern (would need its own signature
    // verification, distinct from session auth) and is intentionally
    // out of scope here.
    if (path === "/api/v1/analytics/conversion/record" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["programId", "conversionType"]);

      const created = await analyticsDB.recordConversion(env.DB, {
        clickId: body.clickId ?? null,
        trackingLinkId: body.trackingLinkId ?? null,
        offerId: body.offerId ?? null,
        casinoId: body.casinoId ?? null,
        partnerId: body.partnerId ?? null,
        programId: body.programId,
        accountId: body.accountId ?? null,
        campaignId: body.campaignId ?? null,
        conversionType: body.conversionType,
        reportedValue: body.reportedValue ?? null,
        currency: body.currency || "USD",
        countryCode: body.countryCode ?? null,
        externalReference: body.externalReference ?? null,
        createdBy: user.user_id
      });
      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "analytics_conversion",
        entityId: created?.meta?.last_row_id ?? null,
        metadata: { conversion_type: body.conversionType, program_id: body.programId }
      });
      return json({ success: true });
    }

  return NOT_HANDLED;
}
