// worker/database/email-campaigns.js
// Pure storage for the email_campaigns log (see migrations/0039).
// Send orchestration (recipient resolution, calling Resend) lives in
// worker/email-campaigns.js -- this file only reads/writes rows.

export async function createCampaignRow(db, {
  subject, layout, bodyHtml, bodyText, recipientType, recipientMeta, recipientCount, createdBy
}) {
  const result = await db.prepare(`
    INSERT INTO email_campaigns
      (subject, layout, body_html, body_text, recipient_type, recipient_meta, status, recipient_count, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'sending', ?, ?)
  `).bind(subject, layout, bodyHtml, bodyText || null, recipientType, recipientMeta || null, recipientCount, createdBy || null).run();
  return result.meta.last_row_id;
}

export async function finalizeCampaignRow(db, id, { status, sentCount, failedCount, errorMessage = null }) {
  return db.prepare(`
    UPDATE email_campaigns
    SET status = ?, sent_count = ?, failed_count = ?, error_message = ?, sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, sentCount, failedCount, errorMessage, id).run();
}

export async function listCampaigns(db, { limit = 30, offset = 0 } = {}) {
  const result = await db.prepare(`
    SELECT ec.id, ec.subject, ec.layout, ec.recipient_type, ec.status,
           ec.recipient_count, ec.sent_count, ec.failed_count,
           ec.created_at, ec.sent_at, ec.created_by, u.email as created_by_email
    FROM email_campaigns ec
    LEFT JOIN users u ON u.id = ec.created_by
    ORDER BY ec.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();
  return result.results || [];
}

export async function getCampaignById(db, id) {
  return db.prepare(`SELECT * FROM email_campaigns WHERE id = ?`).bind(id).first();
}
