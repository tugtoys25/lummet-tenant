// Analytics alerts and alert rules.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as alertsDB from "../../database/alerts.js";
import * as cronHealthDB from "../../database/cron-health.js";
import { NOT_HANDLED, failure, json, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // Manual alert-rule evaluation -- same "explicit admin action
    // doesn't need the automation flag on" reasoning as aggregate-now
    // above. Also updates the SAME cron-health row the scheduled path
    // writes to, so /dashboard/analytics System Health reflects manual
    // activity too, not only cron ticks.
    if (path === "/api/v1/analytics/alerts/evaluate-now" && request.method === "POST") {
      const result = await alertsDB.evaluateAllRulesNow(env.DB);
      await cronHealthDB.recordCronRun(env.DB, 'alert_evaluation', { skipped: false, summary: result.summary });
      await logAudit(env.DB, { userId: user.user_id, action: 'run', entityType: 'alert_evaluation', metadata: { evaluated: result.evaluated, triggered: result.summary.filter(s => s.triggered).length } });
      return json({ success: true, ...result });
    }

    // ==================================
    // ALERTS (Phase 13)
    // ==================================
    // getScopedAlerts()/acknowledgeAlert() in alertsDB do their own
    // item-access-equivalent scoping internally (alerts reference a
    // rule's scope_type/scope_id, not a directly registered item-access
    // resource) -- this section trusts that scoping rather than
    // re-deriving it, same as analyticsDB's queries are trusted above.

    if (path === "/api/v1/analytics/alerts/list") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "open";
      const alerts = await alertsDB.getScopedAlerts(env.DB, user, status);
      return json({ success: true, alerts });
    }

    if (path === "/api/v1/analytics/alert/acknowledge" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const result = await alertsDB.acknowledgeAlert(env.DB, user, body.id);
      if (!result.success) return failure(result.error, 404);

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "analytics_alert", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // Alert rule CRUD -- create/delete are admin-only by the permission
    // seed in 0031 (editor: create=0, delete=0); editors can read/update
    // (acknowledge) but not define new rules or remove them.
    if (path === "/api/v1/analytics/alert-rules/list") {
      const result = await env.DB.prepare(`SELECT * FROM analytics_alert_rules ORDER BY created_at DESC`).all();
      return json({ success: true, rules: result.results || [] });
    }

    if (path === "/api/v1/analytics/alert-rule/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "metric", "thresholdType"]);

      const result = await env.DB.prepare(`
        INSERT INTO analytics_alert_rules (name, metric, scope_type, scope_id, threshold_type, threshold_value, comparison_window_days, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.metric, body.scopeType || "global", body.scopeId ?? null,
        body.thresholdType, body.thresholdValue ?? null, body.comparisonWindowDays || 7, user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "analytics_alert_rule",
        entityId: result.meta.last_row_id, metadata: { metric: body.metric }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/analytics/alert-rule/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);
      await env.DB.prepare(`UPDATE analytics_alert_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.enabled ? 1 : 0, body.id).run();
      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "analytics_alert_rule", entityId: body.id, metadata: { enabled: body.enabled }
      });
      return json({ success: true });
    }

  return NOT_HANDLED;
}
