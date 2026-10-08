// worker/email.js
// Shared Resend (https://resend.com) email-sending helper.
//
// This is the single place that talks to the Resend API for this
// tenant. Every feature that needs to send transactional email —
// password reset, newsletter confirmation, scheduled report
// delivery (worker/reports/delivery.js) — should call sendEmail()
// from here rather than hitting api.resend.com directly, so there
// is exactly one place that knows the request shape and exactly one
// place that handles config/error cases.
//
// Configuration is two secrets, set per-tenant via
// `wrangler secret put`, never committed to this repo or
// wrangler.jsonc (same convention already used for TURNSTILE_SECRET
// elsewhere in this codebase):
//   RESEND_API_KEY     — required. Missing it is a config error, not
//                        a silent no-op.
//   RESEND_FROM_EMAIL  — required. No hardcoded fallback domain: this
//                        is a multi-tenant codebase and guessing a
//                        "from" address for a tenant that hasn't
//                        configured one would send real email from
//                        an address nobody chose.

/**
 * Sends one email via the Resend API. Throws with a specific,
 * actionable message on any failure mode (missing config, Resend API
 * error) rather than pretending to succeed. Callers decide whether a
 * failure should surface to the end user, be logged, or (for report
 * delivery) recorded per-recipient.
 *
 * @param {object} env
 * @param {object} opts
 * @param {string} opts.to - recipient email address
 * @param {string} opts.subject
 * @param {string} [opts.text] - plain-text body. At least one of
 *   text/html is required.
 * @param {string} [opts.html] - HTML body.
 * @param {string} [opts.replyTo] - optional Reply-To address.
 * @returns {Promise<string|null>} the Resend message id, if returned.
 */
export async function sendEmail(env, { to, subject, text, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    throw new Error('Email delivery is not configured for this tenant: RESEND_API_KEY secret is not set (wrangler secret put RESEND_API_KEY).');
  }
  if (!env.RESEND_FROM_EMAIL) {
    throw new Error('Email delivery is not configured for this tenant: RESEND_FROM_EMAIL secret is not set (wrangler secret put RESEND_FROM_EMAIL).');
  }
  if (!to) {
    throw new Error('sendEmail: "to" is required.');
  }
  if (!text && !html) {
    throw new Error('sendEmail: one of "text" or "html" is required.');
  }

  const payload = {
    from: env.RESEND_FROM_EMAIL,
    to: [to],
    subject
  };
  if (text) payload.text = text;
  if (html) payload.html = html;
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    // Resend's error responses are JSON with a `message` field; fall
    // back to the raw status if the body isn't parseable, but never
    // leak the API key (it's never included in the error path below).
    let detail = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.message) detail = errorBody.message;
    } catch { /* keep the HTTP-status fallback */ }
    throw new Error(`Resend delivery failed: ${detail}`);
  }

  const result = await response.json();
  return result?.id ?? null;
}
