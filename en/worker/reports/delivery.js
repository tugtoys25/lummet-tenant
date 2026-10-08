// worker/reports/delivery.js
// Phase 9: Report delivery abstraction.
//
// In-app delivery (via the EXISTING user_notifications table, extended
// in 0032 with severity/category/related_resource/related_id) works
// for any recipient with a user_id. Email recipients (a bare `email`
// with no `user_id`) are accepted by the schema (report_recipients.email)
// and sent via Resend (https://resend.com) — the provider chosen for
// this tenant. The actual Resend call lives in the shared ../email.js
// module (also used by auth password-reset emails and the newsletter),
// so there is exactly one place that knows the Resend request shape.
// Configuration is two secrets, set per-tenant via `wrangler secret put`
// (see worker/email.js for details): RESEND_API_KEY, RESEND_FROM_EMAIL.

import { sendEmail as sendResendEmail } from '../email.js';

/**
 * Thin wrapper kept so the rest of this file (and its tests, which
 * mock global fetch and assert on the exact request shape) doesn't
 * need to change: `body` here maps to the shared helper's `text`.
 */
async function sendEmail(env, { to, subject, body }) {
  return sendResendEmail(env, { to, subject, text: body });
}

/**
 * Delivers a completed report run to every recipient on its schedule.
 * Never throws — each recipient's outcome is collected and returned so
 * the caller (the scheduled-report cron job) can record failures per
 * recipient rather than failing the whole run over one bad email
 * address or an unconfigured provider.
 */
export async function deliverReportRun(env, { reportRun, reportName, recipients }) {
  const outcomes = [];

  for (const recipient of recipients) {
    if (recipient.user_id) {
      try {
        await env.DB.prepare(`
          INSERT INTO user_notifications (user_id, title, message, link, severity, category, related_resource, related_id)
          VALUES (?, ?, ?, ?, 'info', 'reports', 'report_run', ?)
        `).bind(
          recipient.user_id,
          `Report ready: ${reportName}`,
          `Your scheduled report "${reportName}" finished with ${reportRun.rowCount ?? 0} rows.`,
          `/en/dashboard/reports/runs/${reportRun.id}`,
          reportRun.id
        ).run();
        outcomes.push({ recipient: recipient.user_id, method: 'in_app', success: true });
      } catch (e) {
        outcomes.push({ recipient: recipient.user_id, method: 'in_app', success: false, error: e.message });
      }
    } else if (recipient.email) {
      try {
        const messageId = await sendEmail(env, {
          to: recipient.email,
          subject: `Report ready: ${reportName}`,
          body: `Your scheduled report "${reportName}" finished with ${reportRun.rowCount ?? 0} rows.`
        });
        outcomes.push({ recipient: recipient.email, method: 'email', success: true, messageId });
      } catch (e) {
        outcomes.push({ recipient: recipient.email, method: 'email', success: false, error: e.message });
      }
    }
  }

  return outcomes;
}
