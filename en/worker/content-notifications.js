// worker/content-notifications.js
// Two related, both-off-by-default email triggers built on top of
// worker/email-campaigns.js's send/log machinery:
//
//   notifyOnPublish()       -- fired from the casino/review/news create
//                               handlers in worker/api.js right after a
//                               successful publish. Gated by the
//                               'email_notify_content_updates' row in
//                               `settings` (see worker/database/settings.js;
//                               this is the tenant-editable key/value store
//                               behind the existing Settings admin page and
//                               /api/v1/settings/save -- NOT the separate
//                               system_settings table the cron jobs in
//                               worker/cron.js use for their own flags).
//                               Off by default: an admin turns it on from
//                               the Subscriptions dashboard once they're
//                               ready for publishing to start emailing
//                               subscribers.
//
//   buildAndSendWeeklyDigest() -- called from worker/cron.js on the same
//                               system_settings feature-flag convention as
//                               every other scheduled job in this codebase
//                               ('weekly_digest_cron_enabled'). Summarizes
//                               whatever casinos/reviews/news were
//                               published in the last 7 days; sends nothing
//                               if there's genuinely nothing new that week
//                               (never a fabricated/empty digest).
//
// Both are best-effort and never throw out to their caller -- a failed
// notification must never break the casino/review/news save it's
// reacting to, nor take down the scheduled() handler.

import { getSetting } from './database/settings.js';
import * as newsletterDb from './database/newsletter.js';
import * as campaignDb from './database/email-campaigns.js';
import { sendEmail } from './email.js';
import { renderEmailHtml, htmlToPlainText } from './email-layouts.js';
import { getSiteContext } from './site-context.js';

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CONTENT_TYPES = {
  casino: { notifyColumn: 'notify_casinos', label: 'New casino added', path: '/en/casino' },
  review: { notifyColumn: 'notify_reviews', label: 'New review published', path: '/en/review' },
  news: { notifyColumn: 'notify_news', label: 'New article published', path: '/en/news' }
};

/**
 * @param {object} env
 * @param {Request|null} request - the incoming admin request, when available
 *   (site-context falls back to env.SITE_URL when it's not)
 * @param {object} opts
 * @param {'casino'|'review'|'news'} opts.type
 * @param {string} opts.title
 * @param {string} opts.slug
 */
export async function notifyOnPublish(env, request, { type, title, slug }) {
  const config = CONTENT_TYPES[type];
  if (!config) return { skipped: true, reason: `unknown content type "${type}"` };

  try {
    const enabled = await getSetting(env.DB, 'email_notify_content_updates');
    if (enabled !== '1') return { skipped: true, reason: 'email_notify_content_updates is off' };

    const subscribers = await newsletterDb.getConfirmedSubscribers(env.DB, config.notifyColumn);
    if (subscribers.length === 0) return { skipped: true, reason: 'no subscribers opted in to this category' };

    const site = await getSiteContext(request, env);
    const url = `${site.origin}${config.path}/${slug}`;
    const subject = `${config.label}: ${title}`;
    const bodyHtml = `<p style="margin:0 0 12px;">${config.label}</p><p style="margin:0;"><a href="${url}" style="color:#2563eb;">${escapeHtml(title)}</a></p>`;

    return await sendToSubscribers(env, site, {
      subject,
      bodyHtml,
      recipientType: `auto:${type}`,
      recipientMeta: { slug },
      subscribers
    });
  } catch (err) {
    console.error(`notifyOnPublish (${type}) failed`, err.message);
    return { skipped: true, reason: err.message };
  }
}

/**
 * Called from worker/cron.js. `env` only -- no request context, so
 * getSiteContext falls back to env.SITE_URL (see worker/site-context.js).
 */
export async function buildAndSendWeeklyDigest(env) {
  try {
    const enabled = await getSetting(env.DB, 'email_weekly_digest_enabled');
    if (enabled !== '1') return { skipped: true, reason: 'email_weekly_digest_enabled is off' };

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [newsResult, casinoResult, reviewResult] = await Promise.all([
      env.DB.prepare(`SELECT title, slug FROM news WHERE published = 1 AND created_at >= ? ORDER BY created_at DESC LIMIT 10`).bind(since).all(),
      env.DB.prepare(`SELECT name, slug FROM casinos WHERE published = 1 AND created_at >= ? ORDER BY created_at DESC LIMIT 10`).bind(since).all(),
      env.DB.prepare(`SELECT title, slug FROM reviews WHERE published = 1 AND created_at >= ? ORDER BY created_at DESC LIMIT 10`).bind(since).all()
    ]);
    const news = newsResult.results || [];
    const casinos = casinoResult.results || [];
    const reviews = reviewResult.results || [];

    if (news.length === 0 && casinos.length === 0 && reviews.length === 0) {
      return { skipped: true, reason: 'nothing new to report this week' };
    }

    const subscribers = await newsletterDb.getConfirmedSubscribers(env.DB, 'notify_weekly_report');
    if (subscribers.length === 0) return { skipped: true, reason: 'no subscribers opted in to the weekly report' };

    const site = await getSiteContext(null, env);

    const section = (heading, items, path, nameKey) => {
      if (items.length === 0) return '';
      const rows = items.map(item =>
        `<li style="margin-bottom:6px;"><a href="${site.origin}${path}/${item.slug}" style="color:#2563eb;">${escapeHtml(item[nameKey])}</a></li>`
      ).join('');
      return `<h3 style="margin:20px 0 8px;font-size:15px;">${heading}</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
    };

    const bodyHtml =
      `<p style="margin:0 0 8px;">Here's what's new at ${escapeHtml(site.siteName)} this week:</p>` +
      section('New casinos', casinos, '/en/casino', 'name') +
      section('New reviews', reviews, '/en/review', 'title') +
      section('Latest news', news, '/en/news', 'title');

    return await sendToSubscribers(env, site, {
      subject: `${site.siteName} weekly update`,
      bodyHtml,
      recipientType: 'auto:weekly_digest',
      recipientMeta: { newsCount: news.length, casinoCount: casinos.length, reviewCount: reviews.length },
      subscribers
    });
  } catch (err) {
    console.error('buildAndSendWeeklyDigest failed', err.message);
    return { skipped: true, reason: err.message };
  }
}

/** Shared per-recipient send + email_campaigns log, used by both triggers above. */
async function sendToSubscribers(env, site, { subject, bodyHtml, recipientType, recipientMeta, subscribers }) {
  const campaignId = await campaignDb.createCampaignRow(env.DB, {
    subject,
    layout: 'branded',
    bodyHtml,
    bodyText: null,
    recipientType,
    recipientMeta: JSON.stringify(recipientMeta),
    recipientCount: subscribers.length,
    createdBy: null
  });

  let sentCount = 0;
  let failedCount = 0;
  const plainText = htmlToPlainText(bodyHtml);

  for (const sub of subscribers) {
    const unsubscribeUrl = `${site.origin}/en/newsletter/unsubscribe?token=${sub.token}`;
    const html = renderEmailHtml(site, { layout: 'branded', subject, bodyHtml, unsubscribeUrl });
    try {
      await sendEmail(env, { to: sub.email, subject, html, text: plainText });
      sentCount++;
    } catch (err) {
      failedCount++;
      console.error(`sendToSubscribers #${campaignId}: failed to send to ${sub.email}`, err.message);
    }
  }

  await campaignDb.finalizeCampaignRow(env.DB, campaignId, {
    status: sentCount > 0 ? 'sent' : 'failed',
    sentCount,
    failedCount,
    errorMessage: failedCount > 0 ? `${failedCount} of ${subscribers.length} recipient(s) failed` : null
  });

  return { skipped: false, campaignId, sentCount, failedCount };
}
