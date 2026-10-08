// worker/email-layouts.js
// Wraps an email body (already-composed HTML, e.g. from the admin
// composer's rich text box, or built by a system notification) in a
// chosen layout before it goes to worker/email.js's sendEmail(). Kept
// separate from that module: this file only ever produces HTML/text
// strings, it never touches fetch or Resend.

export const EMAIL_LAYOUTS = ['plain', 'branded'];

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * @param {object} site - result of getSiteContext(request, env)
 * @param {object} opts
 * @param {string} opts.layout - 'plain' | 'branded' (falls back to 'branded' for an unknown value)
 * @param {string} opts.subject
 * @param {string} opts.bodyHtml - the message content, already HTML (paragraphs etc.)
 * @param {string} [opts.unsubscribeUrl] - per-recipient unsubscribe link, when the
 *   recipient has a newsletter_subscribers token. Omitted entirely for recipients
 *   (e.g. "all users") who are being emailed as account holders, not as newsletter
 *   subscribers -- there's nothing to unsubscribe from in that case.
 * @returns {string} full HTML document
 */
export function renderEmailHtml(site, { layout, subject, bodyHtml, unsubscribeUrl = null }) {
  if (layout === 'plain') {
    return `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;">
${bodyHtml}
${unsubscribeUrl ? `<p style="margin-top:24px;font-size:12px;color:#888;"><a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a></p>` : ''}
</body></html>`;
  }

  // 'branded' (default/fallback)
  const siteName = escapeHtml(site.siteName || '');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:580px;width:100%;">
        <tr>
          <td style="background:#111827;padding:20px 28px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;">${siteName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#1a1a1a;font-size:15px;line-height:1.6;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid #eee;color:#888;font-size:12px;">
            You're receiving this from ${siteName}.
            ${unsubscribeUrl ? ` <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a>` : ''}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text fallback when the composer's body_text field is empty --
 * a rough HTML-to-text strip, good enough as a fallback part of a
 * multipart-style send (we send text+html separately via Resend, not
 * a real multipart MIME, but both fields are still worth populating).
 */
export function htmlToPlainText(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
