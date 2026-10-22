// Reports and schedules.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as reportsDB from "../../database/reports.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // REPORTS (Phase 7-9)
    // ==================================
    // filters_json on a saved report_definitions row is NEVER trusted as
    // an authorization boundary -- every /report/run call below passes
    // the REQUESTING user into reportsDB.executeReportRun(), which
    // re-resolves item-access at execution time via the same helpers
    // analytics.js uses. A saved report cannot be used to read data the
    // runner no longer has access to.

    if (path === "/api/v1/reports/list") {
      const url = new URL(request.url);
      const reportType = url.searchParams.get("report_type");
      const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "report_definitions", "read");
      const typeClause = reportType ? "AND report_type = ?" : "";
      const result = await env.DB.prepare(`
        SELECT * FROM report_definitions
        WHERE status = 'active' ${condition ? "AND " + condition : ""} ${typeClause}
        ORDER BY created_at DESC
      `).bind(...params, ...(reportType ? [reportType] : [])).all();
      return json({ success: true, reports: result.results || [] });
    }

    // Column manifest for a report type -- lets the UI render a
    // checklist of available columns (and which are groupable) without
    // running the report itself. Static metadata, no DB query beyond
    // the permission check already applied via readResourceMap above.
    if (path === "/api/v1/report/column-options") {
      const url = new URL(request.url);
      const reportType = url.searchParams.get("report_type");
      if (!reportType) return failure("report_type is required");

      const columns = reportsDB.getReportColumnOptions(reportType);
      if (!columns) {
        return json({ success: true, columns: [], note: "No column customization available for this report type." });
      }
      return json({ success: true, columns });
    }

    if (path === "/api/v1/report/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const report = await itemAccess.getItemById(env.DB, "report_definitions", id);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const schedules = await env.DB.prepare(`SELECT * FROM report_schedules WHERE report_id = ?`).bind(id).all();
      return json({ success: true, report, schedules: schedules.results || [] });
    }

    if (path === "/api/v1/report/runs/list") {
      const url = new URL(request.url);
      const reportId = Number(url.searchParams.get("report_id"));
      if (!reportId) return failure("report_id is required");

      const report = await itemAccess.getItemById(env.DB, "report_definitions", reportId);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const runs = await env.DB.prepare(`
        SELECT * FROM report_runs WHERE report_id = ? ORDER BY started_at DESC LIMIT 50
      `).bind(reportId).all();
      return json({ success: true, runs: runs.results || [] });
    }

    if (path === "/api/v1/report/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "reportType"]);
      if (!reportsDB.isValidReportType(body.reportType)) {
        return failure(`Unknown report_type: ${body.reportType}`);
      }

      const result = await env.DB.prepare(`
        INSERT INTO report_definitions (name, report_type, filters_json, columns_json, grouping_json, sort_json, owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.reportType,
        body.filters ? JSON.stringify(body.filters) : null,
        body.columns ? JSON.stringify(body.columns) : null,
        body.grouping ? JSON.stringify(body.grouping) : null,
        body.sort ? JSON.stringify(body.sort) : null,
        user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "report_definition",
        entityId: result.meta.last_row_id, metadata: { report_type: body.reportType }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/report/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, "report_definitions", body.id);
      if (!existing) return failure("Report not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", existing);
      if (!canUpdate) return failure("Report not found", 404);

      await env.DB.prepare(`
        UPDATE report_definitions SET
          name = ?, status = ?, columns_json = ?, grouping_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        body.name ?? existing.name,
        body.status ?? existing.status,
        body.columns ? JSON.stringify(body.columns) : existing.columns_json,
        body.grouping !== undefined ? (body.grouping ? JSON.stringify(body.grouping) : null) : existing.grouping_json,
        body.id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "report_definition", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // Ad-hoc run: executes immediately for THIS user (item-access scoped
    // to them, not the report's owner), records a report_runs row, and
    // returns either JSON rows or a downloadable CSV/HTML file depending
    // on `format`. This is the one endpoint in this section that returns
    // a non-JSON Response body when format=csv|html.
    if (path === "/api/v1/report/run" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "startDate", "endDate"]);

      const report = await itemAccess.getItemById(env.DB, "report_definitions", body.id);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const format = body.format || "json";
      // Column selection / grouping: request body overrides the saved
      // report_definitions.columns_json/grouping_json when provided,
      // otherwise fall back to what was saved at creation/edit time.
      // Either way this is a DISPLAY parameter only -- see
      // applyColumnSelectionAndGrouping() in reports.js, which applies
      // it strictly after the handler's own item-access-scoped query.
      let selectedColumns = body.columns;
      if (selectedColumns === undefined && report.columns_json) {
        try { selectedColumns = JSON.parse(report.columns_json); } catch { selectedColumns = undefined; }
      }
      let groupBy = body.groupBy;
      if (groupBy === undefined && report.grouping_json) {
        try { groupBy = JSON.parse(report.grouping_json); } catch { groupBy = undefined; }
      }

      const filters = {
        startDate: body.startDate, endDate: body.endDate, currency: body.currency || null,
        outputFormat: format, selectedColumns, groupBy,
        // cohort_analysis / ltv_analysis-specific filters (brief §17/§18)
        // -- harmless no-ops for every other report type, which never
        // reads these keys off filters.
        cohortMetric: body.cohortMetric || undefined,
        groupByDimension: body.groupByDimension || undefined
      };

      const result = await reportsDB.executeReportRun(env.DB, user, report, { filters });
      await logAudit(env.DB, {
        userId: user.user_id, action: "read", entityType: "report_run",
        entityId: result.runId, metadata: { report_id: body.id, format }
      });

      if (!result.success) {
        return failure(result.error, 422);
      }

      if (format === "csv") {
        const csv = reportsDB.toCsv(result);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${report.name.replace(/[^a-z0-9]+/gi, '-')}-${body.startDate}-to-${body.endDate}.csv"`
          }
        });
      }
      if (format === "html") {
        const html = reportsDB.toHtml(result, report.name);
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return json({ success: true, runId: result.runId, columns: result.columns, rows: result.rows });
    }

    if (path === "/api/v1/report/schedule/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["reportId", "frequency"]);

      const report = await itemAccess.getItemById(env.DB, "report_definitions", body.reportId);
      if (!report) return failure("Report not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", report);
      if (!canUpdate) return failure("Report not found", 404);

      // First run is scheduled starting now, per the requested frequency
      // (i.e. a daily schedule created today first fires tomorrow, not
      // immediately -- use "Run Now" / /report/run for an immediate result).
      const nextRunAt = new Date(
        body.frequency === "daily" ? Date.now() + 86400000 :
        body.frequency === "weekly" ? Date.now() + 7 * 86400000 :
        body.frequency === "monthly" ? new Date(new Date().setMonth(new Date().getMonth() + 1)) :
        Date.now() + 86400000
      ).toISOString();

      const scheduleResult = await env.DB.prepare(`
        INSERT INTO report_schedules (report_id, frequency, timezone, next_run_at, enabled, output_format, created_by)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).bind(body.reportId, body.frequency, body.timezone || "UTC", nextRunAt, body.outputFormat || "csv", user.user_id).run();
      const scheduleId = scheduleResult.meta.last_row_id;

      // Default to the creating user as the sole recipient when none are
      // given explicitly -- avoids requiring the client to know/send its
      // own user_id just to schedule "deliver to me".
      const recipients = (body.recipients && body.recipients.length > 0)
        ? body.recipients
        : [{ userId: user.user_id }];
      for (const recipient of recipients) {
        await env.DB.prepare(`
          INSERT INTO report_recipients (schedule_id, user_id, email) VALUES (?, ?, ?)
        `).bind(scheduleId, recipient.userId ?? null, recipient.email ?? null).run();
      }

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "report_schedule",
        entityId: scheduleId, metadata: { report_id: body.reportId, frequency: body.frequency }
      });
      return json({ success: true, id: scheduleId });
    }

    if (path === "/api/v1/report/schedule/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);

      const schedule = await env.DB.prepare(`SELECT rs.*, rd.owner_id, rd.id AS report_id_check FROM report_schedules rs JOIN report_definitions rd ON rd.id = rs.report_id WHERE rs.id = ?`).bind(body.id).first();
      if (!schedule) return failure("Schedule not found", 404);
      const report = await itemAccess.getItemById(env.DB, "report_definitions", schedule.report_id);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", report);
      if (!canUpdate) return failure("Schedule not found", 404);

      await env.DB.prepare(`UPDATE report_schedules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.enabled ? 1 : 0, body.id).run();
      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "report_schedule", entityId: body.id, metadata: { enabled: body.enabled }
      });
      return json({ success: true });
    }

  return NOT_HANDLED;
}
