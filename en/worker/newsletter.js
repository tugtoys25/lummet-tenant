// worker/newsletter.js
// Newsletter signup: double opt-in via a confirmation email sent
// through the same Resend account used elsewhere (see ./email.js).

import {
  getSubscriberByEmail,
  getSubscriberByToken,
  createSubscriber,
  refreshSubscriberToken,
  confirmSubscriber,
  unsubscribeSubscriber,
  resubscribeSubscriber
} from "./database/newsletter.js";
import { sendEmail } from "./email.js";
import { getSiteContext } from "./site-context.js";

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// confirm/unsubscribe are reached by a person clicking a link in an
// email (a plain browser navigation, not a JS fetch call), so they
// render a small standalone HTML page rather than JSON.
function htmlPage({ siteName, title, message, status = 200 }) {
  const escapedMessage = String(message).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}${siteName ? ` — ${siteName}` : ""}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:80px auto;padding:0 20px;text-align:center;color:#1a1a1a;">
  <h1 style="font-size:1.4rem;">${title}</h1>
  <p style="color:#444;">${escapedMessage}</p>
  <p><a href="/en" style="color:#2563eb;">Return to the homepage</a></p>
</body>
</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * Subscribe (or re-subscribe) an email address. Always sends a fresh
 * confirmation email for pending/unconfirmed signups so the token
 * stays usable; already-confirmed subscribers just get a friendly
 * "already subscribed" response, no duplicate email.
 */
export async function subscribeNewsletter(request, env) {
  const body = await request.json();
  const email = body.email?.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return json({ success: false, error: "A valid email address is required" }, 400);
  }

  const site = await getSiteContext(request, env);
  const existing = await getSubscriberByEmail(env.DB, email);
  let token;

  if (!existing) {
    token = generateToken();
    await createSubscriber(env.DB, email, token);
  } else if (existing.status === "confirmed") {
    return json({ success: true, message: "You're already subscribed." });
  } else {
    // pending or unsubscribed -- issue a fresh token and re-send.
    token = generateToken();
    await refreshSubscriberToken(env.DB, existing.id, token);
    if (existing.status === "unsubscribed") {
      await resubscribeSubscriber(env.DB, existing.id);
    }
  }

  const confirmUrl = `${site.origin}/en/newsletter/confirm?token=${token}`;

  try {
    await sendEmail(env, {
      to: email,
      subject: `Confirm your subscription to ${site.siteName}`,
      text:
        `Please confirm your subscription to the ${site.siteName} newsletter.\n\n` +
        `Confirm here:\n${confirmUrl}\n\n` +
        `If you didn't request this, you can ignore this email.`,
      html:
        `<p>Please confirm your subscription to the ${site.siteName} newsletter.</p>` +
        `<p><a href="${confirmUrl}">Click here to confirm</a>.</p>` +
        `<p>If you didn't request this, you can ignore this email.</p>`
    });
  } catch (err) {
    console.error("subscribeNewsletter: email send failed", err.message);
    return json({ success: false, error: "Could not send confirmation email. Please try again later." }, 502);
  }

  return json({ success: true, message: "Check your email to confirm your subscription." });
}

/**
 * Confirm a pending subscription via the emailed token.
 */
export async function confirmNewsletter(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const site = await getSiteContext(request, env);

  if (!token) {
    return htmlPage({ siteName: site.siteName, title: "Missing token", message: "This confirmation link is incomplete.", status: 400 });
  }

  const subscriber = await getSubscriberByToken(env.DB, token);
  if (!subscriber) {
    return htmlPage({ siteName: site.siteName, title: "Invalid link", message: "This confirmation link is invalid or has expired.", status: 400 });
  }

  if (subscriber.status !== "confirmed") {
    await confirmSubscriber(env.DB, subscriber.id);
  }

  return htmlPage({
    siteName: site.siteName,
    title: "Subscription confirmed",
    message: `Thanks for signing up for the ${site.siteName} newsletter!`
  });
}

/**
 * Unsubscribe via the same per-subscriber token (also usable as the
 * confirm token -- either way it's a single unguessable link tied to
 * one email address, so no login is required for either action).
 */
export async function unsubscribeNewsletter(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const site = await getSiteContext(request, env);

  if (!token) {
    return htmlPage({ siteName: site.siteName, title: "Missing token", message: "This unsubscribe link is incomplete.", status: 400 });
  }

  const subscriber = await getSubscriberByToken(env.DB, token);
  if (!subscriber) {
    return htmlPage({ siteName: site.siteName, title: "Invalid link", message: "This unsubscribe link is invalid.", status: 400 });
  }

  if (subscriber.status !== "unsubscribed") {
    await unsubscribeSubscriber(env.DB, subscriber.id);
  }

  return htmlPage({
    siteName: site.siteName,
    title: "Unsubscribed",
    message: `You've been unsubscribed from the ${site.siteName} newsletter. Sorry to see you go.`
  });
}
