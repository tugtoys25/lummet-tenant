// =====================================================
// LUMMET AI -- weekly chat-quality report, emailed to admins who opted in
//
// Opt-in per admin (stored as a list of user ids in the `settings` table, key ai_chat_report_to), turned on from AI Studio.
// Content: the same numbers as the AI Studio digest plus the top content gaps. Visitor questions are escaped.
// No model call. Nothing is sent when there is nothing to report. Best effort: never throws to the scheduler.
// =====================================================

import { chatQualityDigest, contentGaps } from "./digest.js";
import { sendEmail } from "../email.js";
import { renderEmailHtml, htmlToPlainText } from "../email-layouts.js";
import { getSiteContext } from "../site-context.js";

export const REPORT_KEY = "ai_chat_report_to";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function getRecipients(db) {
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(REPORT_KEY).first();
    const ids = JSON.parse((row && row.value) || "[]");
    return Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch (_) { return []; }
}

export async function setRecipient(db, userId, on) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const ids = new Set(await getRecipients(db));
  if (on) ids.add(id); else ids.delete(id);
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).bind(REPORT_KEY, JSON.stringify([...ids])).run();
  return true;
}

const wk = (w) => (w.up + w.down ? `${w.helpful_pct}% helpful (${w.up} up, ${w.down} down)` : "no ratings");

/** Builds the report. `empty` is true when there is genuinely nothing to say. */
export async function buildChatQualityReport(env, request, site) {
  const d = await chatQualityDigest(env, request, { checkCoverage: false });
  if (!d.available) return { empty: true, reason: "chat feedback is not set up" };
  const g = await contentGaps(env, request, { limit: 3 });
  const gaps = g.available ? g.gaps : [];
  if (d.this_week.up + d.this_week.down === 0 && gaps.length === 0) return { empty: true, reason: "nothing to report this week" };

  const trend = d.trend === null ? "" : d.trend > 0 ? ` (up ${d.trend} points)` : d.trend < 0 ? ` (down ${Math.abs(d.trend)} points)` : " (no change)";
  const link = `${site.origin}/en/dashboard/ai-studio`;
  const li = (items) => `<ul style="margin:6px 0 0;padding-left:20px;">${items.map((x) => `<li style="margin-bottom:4px;">${x}</li>`).join("")}</ul>`;
  let html = `<p style="margin:0 0 8px;">Lummet AI chat quality for ${esc(site.siteName)}, last 7 days.</p>` +
    `<p style="margin:0 0 4px;"><strong>This week:</strong> ${esc(wk(d.this_week))}${esc(trend)}</p>` +
    `<p style="margin:0 0 12px;"><strong>Last week:</strong> ${esc(wk(d.last_week))}</p>`;
  if ((d.by_source || []).length) {
    const SRC = { widget: "Floating widget", subdomain: "lummet. page" };
    html += `<p style="margin:0 0 12px;"><strong>By entrance (28 days):</strong> ${d.by_source.map((x) => esc((SRC[x.source] || x.source) + " " + (x.helpful_pct === null ? "-" : x.helpful_pct + "%") + " helpful (" + (x.up + x.down) + " ratings)")).join(", ")}</p>`;
  }
  if (d.topics.length) html += `<h3 style="margin:16px 0 4px;font-size:15px;">Topics that keep getting thumbs-down</h3>${li(d.topics.slice(0, 5).map((t) => `${esc(t.topic)} (${t.count})`))}`;
  if (gaps.length) html += `<h3 style="margin:16px 0 4px;font-size:15px;">Content gaps: the site has nothing on these</h3>${li(gaps.map((x) => `<strong>${esc(x.topic)}</strong> (${x.count}): ${esc((x.examples[0] || {}).question || "")}`))}`;
  html += `<p style="margin:16px 0 0;"><a href="${esc(link)}" style="color:#2563eb;">Open AI Studio</a> to draft fixes and research.</p>`;
  return { empty: false, subject: `${site.siteName}: Lummet AI weekly chat quality`, html, data: { this_week: d.this_week, gaps: gaps.length } };
}

/** Sends to every opted-in admin (or only `onlyUserId`). Returns a short summary; never throws. */
export async function sendChatQualityReport(env, request = null, { onlyUserId = null } = {}) {
  try {
    const wanted = onlyUserId ? [Number(onlyUserId)] : await getRecipients(env.DB);
    if (!wanted.length) return { skipped: true, reason: "nobody has turned the report on" };
    const site = await getSiteContext(request, env);
    const report = await buildChatQualityReport(env, request, site);
    if (report.empty) return { skipped: true, reason: report.reason };
    const html = renderEmailHtml(site, { layout: "branded", subject: report.subject, bodyHtml: report.html });
    const text = htmlToPlainText(report.html);
    let sent = 0, failed = 0, last = "";
    for (const id of wanted) {
      const u = await env.DB.prepare(`SELECT email, role FROM users WHERE id = ?`).bind(id).first();
      if (!u || !u.email || !["admin", "super_admin"].includes(u.role)) continue;   // role may have changed since opting in
      try { await sendEmail(env, { to: u.email, subject: report.subject, html, text }); sent++; } catch (e) { failed++; last = e.message; }
    }
    return { skipped: false, sent, failed, ...(failed ? { error: last } : {}) };
  } catch (e) {
    return { skipped: true, reason: e.message };
  }
}
