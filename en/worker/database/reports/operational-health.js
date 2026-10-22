import { getAccessibleIdCondition } from '../item-access.js';
import { OPERATIONAL_HEALTH_COLUMNS } from "./columns.js";

export async function handleOperationalHealth(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'tracking_links', 'read', 'tl.id');
  const healthResult = await db.prepare(`
    SELECT tl.id AS tracking_link_id, tl.internal_name, tl.health_status,
           MAX(hc.checked_at) AS last_checked_at
    FROM tracking_links tl
    LEFT JOIN tracking_link_health_checks hc ON hc.tracking_link_id = tl.id
    WHERE ${condition} AND tl.health_status != 'healthy'
    GROUP BY tl.id
    ORDER BY tl.health_status
  `).bind(...params).all();

  // Report-run failures: scoped to reports this user owns (or all, if
  // admin) -- reuses report_definitions' own item-access registration
  // rather than inventing a separate check.
  const { condition: reportCond, params: reportParams } = await getAccessibleIdCondition(db, user, 'report_definitions', 'read', 'rd.id');
  const failedRuns = await db.prepare(`
    SELECT rr.id, rr.report_id, rd.name AS report_name, rr.error_message, rr.started_at
    FROM report_runs rr
    JOIN report_definitions rd ON rd.id = rr.report_id
    WHERE rr.status = 'failed' AND ${reportCond}
      AND date(rr.started_at) BETWEEN ? AND ?
    ORDER BY rr.started_at DESC
    LIMIT 50
  `).bind(...reportParams, filters.startDate, filters.endDate).all();

  // Open alerts: admin-only in this version -- analytics_alert_rules'
  // scope_type/scope_id isn't wired to the item-access registry (it's a
  // free-form dimension pointer, not a registered resource), so rather
  // than build a partial per-scope-type join here, non-admins simply see
  // a count of 0 with a note. This is a conservative, non-leaking
  // default, not a claim that no alerts exist.
  const alerts = user.role === 'admin'
    ? await db.prepare(`SELECT id, rule_id, triggered_at, status FROM analytics_alerts WHERE status = 'open' ORDER BY triggered_at DESC LIMIT 50`).all()
    : { results: [] };

  return {
    columns: OPERATIONAL_HEALTH_COLUMNS,
    rows: [
      ...(healthResult.results || []).map(r => ({ section: 'Tracking Link Health', detail: `${r.internal_name} (#${r.tracking_link_id}): ${r.health_status}` })),
      ...(failedRuns.results || []).map(r => ({ section: 'Failed Report Run', detail: `"${r.report_name}" (run #${r.id}) at ${r.started_at}: ${r.error_message || 'unknown error'}` })),
      ...(alerts.results || []).map(r => ({ section: 'Open Alert', detail: `Alert #${r.id} (rule #${r.rule_id}) triggered ${r.triggered_at}` })),
      ...(user.role !== 'admin' ? [{ section: 'Note', detail: 'Open alerts are only shown to admins in this version.' }] : [])
    ]
  };
}
