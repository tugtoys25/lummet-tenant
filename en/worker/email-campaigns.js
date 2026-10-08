// worker/email-campaigns.js
// Orchestrates an admin-composed (or system-triggered) email send:
// resolves who the recipients actually are for a given targeting
// choice, renders each one through the chosen layout, sends via the
// shared Resend helper (./email.js), and logs the attempt to
// email_campaigns (./database/email-campaigns.js) for the dashboard.

import * as adminTools from './database/admin_tools.js';
import * as newsletterDb from './database/newsletter.js';
import * as campaignDb from './database/email-campaigns.js';
import { sendEmail } from './email.js';
import { renderEmailHtml, htmlToPlainText, EMAIL_LAYOUTS } from './email-layouts.js';
import { getSiteContext } from './site-context.js';

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCustomEmails(customEmails) {
  const raw = Array.isArray(customEmails) ? customEmails : String(customEmails || '').split(/[,;\n]/);
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const email = String(entry || '').trim().toLowerCase();
    if (!email || !isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Resolves a recipient_type + its params into a de-duplicated list of
 * { email, unsubscribeToken }. unsubscribeToken is only ever present
 * for the 'subscribed' type (real newsletter_subscribers rows) --
 * "all"/"selected"/"new"/"custom" recipients are being emailed as
 * account holders or ad-hoc addresses, not newsletter subscribers, so
 * there's nothing to unsubscribe them from.
 */
export async function resolveRecipients(env, { recipientType, userIds = [], customEmails = [], sinceDays = 7 }) {
  let rows;
  switch (recipientType) {
    case 'all': {
      const users = await adminTools.getAllUsers(env.DB);
      rows = users.map(u => ({ email: u.email, unsubscribeToken: null }));
      break;
    }
    case 'selected': {
      if (!Array.isArray(userIds) || userIds.length === 0) { rows = []; break; }
      const idSet = new Set(userIds.map(Number));
      const users = await adminTools.getAllUsers(env.DB);
      rows = users.filter(u => idSet.has(u.id)).map(u => ({ email: u.email, unsubscribeToken: null }));
      break;
    }
    case 'new': {
      const users = await adminTools.getRecentUsers(env.DB, sinceDays || 7);
      rows = users.map(u => ({ email: u.email, unsubscribeToken: null }));
      break;
    }
    case 'custom': {
      rows = parseCustomEmails(customEmails).map(email => ({ email, unsubscribeToken: null }));
      break;
    }
    case 'subscribed': {
      const subs = await newsletterDb.getConfirmedSubscribers(env.DB);
      rows = subs.map(s => ({ email: s.email, unsubscribeToken: s.token }));
      break;
    }
    default:
      throw new Error(`Unknown recipient_type "${recipientType}"`);
  }

  const byEmail = new Map();
  for (const r of rows) {
    const key = r.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, r);
  }
  return [...byEmail.values()];
}

/** Recipient count preview for the composer UI, without sending anything. */
export async function previewRecipientCount(env, params) {
  const recipients = await resolveRecipients(env, params);
  return recipients.length;
}

/**
 * Sends an admin-composed (or system) campaign. Every send is logged
 * to email_campaigns regardless of outcome -- a per-recipient failure
 * never aborts the rest of the send (same "keep going, record the
 * failure" contract as worker/reports/delivery.js).
 */
export async function sendCampaign(env, request, {
  subject,
  layout = 'branded',
  bodyHtml,
  bodyText = null,
  recipientType,
  userIds = [],
  customEmails = [],
  sinceDays = 7,
  createdByUserId = null
}) {
  if (!subject || !bodyHtml) {
    throw new Error('subject and bodyHtml are required');
  }
  if (!EMAIL_LAYOUTS.includes(layout)) layout = 'branded';

  const site = await getSiteContext(request, env);
  const recipients = await resolveRecipients(env, { recipientType, userIds, customEmails, sinceDays });

  const campaignId = await campaignDb.createCampaignRow(env.DB, {
    subject,
    layout,
    bodyHtml,
    bodyText,
    recipientType,
    recipientMeta: JSON.stringify({ userIds, customEmails, sinceDays }),
    recipientCount: recipients.length,
    createdBy: createdByUserId
  });

  let sentCount = 0;
  let failedCount = 0;
  const plainText = bodyText || htmlToPlainText(bodyHtml);

  for (const recipient of recipients) {
    const unsubscribeUrl = recipient.unsubscribeToken
      ? `${site.origin}/en/newsletter/unsubscribe?token=${recipient.unsubscribeToken}`
      : null;
    const html = renderEmailHtml(site, { layout, subject, bodyHtml, unsubscribeUrl });

    try {
      await sendEmail(env, { to: recipient.email, subject, html, text: plainText });
      sentCount++;
    } catch (err) {
      failedCount++;
      console.error(`sendCampaign #${campaignId}: failed to send to ${recipient.email}`, err.message);
    }
  }

  const status = recipients.length === 0 ? 'sent' : (sentCount > 0 ? 'sent' : 'failed');
  await campaignDb.finalizeCampaignRow(env.DB, campaignId, {
    status,
    sentCount,
    failedCount,
    errorMessage: failedCount > 0 ? `${failedCount} of ${recipients.length} recipient(s) failed` : null
  });

  return { campaignId, recipientCount: recipients.length, sentCount, failedCount, status };
}
