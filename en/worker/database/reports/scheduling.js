import { logAudit } from '../audit.js';
import { runReport } from "./run.js";

// ── Run bookkeeping + scheduled execution (Phase 9) ─────────────────

/**
 * Executes one report run end-to-end: runs the report_type handler,
 * records a report_runs row (success or failure — never silently
 * dropped, per brief §12), and returns the result for the caller to
 * do something with (stream as an export, or hand to delivery).
 *
 * `scheduleId` is null for an ad-hoc/manual run, set for a scheduled one.
 */
export async function executeReportRun(db, user, reportDefinition, { scheduleId = null, filters }) {
  const startedAt = new Date().toISOString();
  let runId = null;

  try {
    const result = await runReport(db, user, reportDefinition.report_type, filters);

    const insertResult = await db.prepare(`
      INSERT INTO report_runs (report_id, schedule_id, status, row_count, output_format, triggered_by, started_at, finished_at)
      VALUES (?, ?, 'success', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      reportDefinition.id, scheduleId, result.rows.length,
      filters.outputFormat || 'csv', user?.user_id ?? null, startedAt
    ).run();
    runId = insertResult.meta.last_row_id;

    return { success: true, runId, ...result };
  } catch (e) {
    const insertResult = await db.prepare(`
      INSERT INTO report_runs (report_id, schedule_id, status, error_message, triggered_by, started_at, finished_at)
      VALUES (?, ?, 'failed', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(reportDefinition.id, scheduleId, e.message, user?.user_id ?? null, startedAt).run();
    runId = insertResult.meta.last_row_id;

    return { success: false, runId, error: e.message };
  }
}

function computeNextRunAt(frequency, fromDate = new Date()) {
  const next = new Date(fromDate);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  else return null; // 'custom' — no cron-expression parser here; requires manual reschedule
  return next.toISOString();
}

/**
 * Cron entry point (Phase 9). Feature-flagged identically to the
 * aggregation and health-check jobs (system_settings key
 * 'report_schedules_cron_enabled', default off).
 *
 * For each due schedule: builds a system-level "runner" user context
 * from the schedule's created_by (so item-access scoping still applies
 * to a scheduled run — it does NOT run unscoped just because no live
 * admin is making the request), executes the report, delivers it, and
 * advances next_run_at. One schedule's failure never stops the others
 * (each is wrapped independently).
 */
export async function runDueReportSchedules(db, env) {
  const flag = await db.prepare(
    `SELECT value FROM system_settings WHERE key = 'report_schedules_cron_enabled'`
  ).first();
  if (!flag || flag.value !== 'true') {
    return { skipped: true, reason: 'feature flag disabled' };
  }
  const result = await runDueReportSchedulesNow(db, env);
  return { skipped: false, ...result };
}

/**
 * Manual/admin trigger -- same reasoning as backfillAnalyticsDaily
 * (analytics.js) and evaluateAllRulesNow (alerts.js): an explicit
 * human action deliberately does NOT check
 * 'report_schedules_cron_enabled'. Only picks up schedules that are
 * actually due (next_run_at <= now) -- pressing this button doesn't
 * force-run everything early, it just stops waiting on the disabled
 * automatic trigger for whatever's already due right now.
 */
export async function runDueReportSchedulesNow(db, env) {
  const { deliverReportRun } = await import('../../reports/delivery.js');

  const due = await db.prepare(`
    SELECT rs.*, rd.report_type, rd.name AS report_name, rd.owner_id
    FROM report_schedules rs
    JOIN report_definitions rd ON rd.id = rs.report_id
    WHERE rs.enabled = 1 AND rs.next_run_at IS NOT NULL AND rs.next_run_at <= CURRENT_TIMESTAMP
  `).all();

  const summary = [];
  for (const schedule of due.results || []) {
    try {
      // Run AS the report's owner, so item-access scoping is exactly
      // what it would be if that user ran it manually right now —
      // never an unscoped "system" context.
      const owner = await db.prepare(`SELECT id AS user_id, role FROM users WHERE id = ?`).bind(schedule.owner_id).first();
      if (!owner) throw new Error(`Report owner (user #${schedule.owner_id}) no longer exists`);

      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const filters = { startDate: thirtyDaysAgo, endDate: today, outputFormat: schedule.output_format };

      const result = await executeReportRun(db, owner, { id: schedule.report_id, report_type: schedule.report_type }, {
        scheduleId: schedule.id, filters
      });

      const recipients = await db.prepare(`SELECT user_id, email FROM report_recipients WHERE schedule_id = ?`).bind(schedule.id).all();
      if (result.success) {
        const deliveryOutcomes = await deliverReportRun(env, {
          reportRun: { id: result.runId, rowCount: result.rows?.length ?? 0 },
          reportName: schedule.report_name,
          recipients: recipients.results || []
        });
        // The report run itself succeeded (recorded above) -- a
        // delivery failure (bad email address, Resend misconfigured,
        // etc.) is a SEPARATE outcome and must not be silently
        // dropped just because deliverReportRun() never throws itself.
        // Recorded via the audit log rather than report_runs.status,
        // since the run's own status genuinely is 'success' -- only
        // notifying about it partially failed.
        const failedDeliveries = deliveryOutcomes.filter(o => !o.success);
        for (const failure of failedDeliveries) {
          await logAudit(db, {
            userId: null, action: 'delivery_failed', entityType: 'report_run', entityId: result.runId,
            metadata: { scheduleId: schedule.id, recipient: failure.recipient, method: failure.method, error: failure.error }
          });
        }
      }
      // Failed runs are already recorded in report_runs by executeReportRun
      // above; deliberately not notifying recipients of a failed run body
      // here (no content to send) — operational_health surfaces failures
      // to admins/owners instead, per brief §12/§22.

      const nextRunAt = computeNextRunAt(schedule.frequency);
      if (nextRunAt) {
        await db.prepare(`UPDATE report_schedules SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(nextRunAt, schedule.id).run();
      }

      summary.push({ scheduleId: schedule.id, success: result.success, runId: result.runId });
    } catch (e) {
      // A schedule-level failure (e.g. missing owner) that never made
      // it into report_runs — record it there too so nothing is silent.
      await db.prepare(`
        INSERT INTO report_runs (report_id, schedule_id, status, error_message, started_at, finished_at)
        VALUES (?, ?, 'failed', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(schedule.report_id, schedule.id, e.message).run().catch(() => {});
      summary.push({ scheduleId: schedule.id, success: false, error: e.message });
    }
  }

  return { processed: summary.length, summary };
}
