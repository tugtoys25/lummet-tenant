// =====================================================
// LUMMET AI -- answer feedback (thumbs up / down)
//
// The visitor rates the LAST answer of their conversation. The question and answer text are read from the saved
// conversation on the server, never from the browser, so the text cannot be forged. Only thumbs-down keeps text.
// Nothing identifying is stored. Everything here is best effort: a missing table never breaks the chat.
// =====================================================

import { hashIP } from "./security.js";
import { rateGate } from "./rate.js";

export const FEEDBACK_KEEP_DAYS = 180;
const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8" } });

/** Which entrance a request came from, decided by the server from the address: the lummet.<domain> page or the widget. */
export function feedbackSource(request) {
  try { return new URL(request.url).hostname.toLowerCase().startsWith("lummet.") ? "subdomain" : "widget"; } catch (_) { return "widget"; }
}

/** POST /api/v1/ai/feedback  { session_id, rating: 'up'|'down', reason? } -- public, like the chat itself. */
export async function handleFeedback(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ success: false, error: "Invalid request" }, 400); }
  const sessionId = clip(body && body.session_id, 100);
  const rating = body && body.rating;
  if (sessionId.length < 8 || (rating !== "up" && rating !== "down")) return json({ success: false, error: "Invalid request" }, 400);

  const ipHash = "fb:" + (await hashIP(request.headers.get("CF-Connecting-IP")));
  if (!(await rateGate(env.DB, ipHash, 30, 15))) return json({ success: false, error: "Too many requests" }, 429);

  try {
    const row = await env.DB.prepare(`SELECT messages FROM ai_conversations WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1`).bind(sessionId).first();
    let msgs = [];
    try { msgs = JSON.parse(row?.messages || "[]"); } catch (_) { msgs = []; }
    let at = -1;
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "assistant") { at = i; break; }
    if (at < 0) return json({ success: false, error: "Nothing to rate" }, 404);
    const answer = msgs[at], question = at > 0 && msgs[at - 1].role === "user" ? msgs[at - 1] : null;
    const down = rating === "down";
    const args = [sessionId, Number(answer.ts) || 0, rating, down ? clip(body.reason, 200) || null : null,
      down ? clip(question && question.content, 400) || null : null, down ? clip(answer.content, 900) : null,
      clip(request.cf && request.cf.country, 2) || null];
    const upsert = (cols, marks, extra) => env.DB.prepare(`
      INSERT INTO ai_feedback (${cols})
      VALUES (${marks})
      ON CONFLICT(session_id, msg_ts) DO UPDATE SET rating = excluded.rating, reason = excluded.reason,
        question = excluded.question, answer = excluded.answer, country = excluded.country${extra}
    `);
    try {
      // migration 0064 adds `source`; until it is applied the plain insert below is used
      await upsert("session_id, msg_ts, rating, reason, question, answer, country, source", "?, ?, ?, ?, ?, ?, ?, ?", ", source = excluded.source").bind(...args, feedbackSource(request)).run();
    } catch (_) {
      await upsert("session_id, msg_ts, rating, reason, question, answer, country", "?, ?, ?, ?, ?, ?, ?", "").bind(...args).run();
    }
    if (down) {
      const cutoff = new Date(Date.now() - FEEDBACK_KEEP_DAYS * 86400000).toISOString().slice(0, 19).replace("T", " ");
      await env.DB.prepare(`DELETE FROM ai_feedback WHERE created_at < ?`).bind(cutoff).run();
    }
    return json({ success: true });
  } catch (_) {
    return json({ success: true, stored: false });   // table not there yet: the visitor still sees "thanks"
  }
}

/** Counts for the last N days plus the most common reasons. */
export async function feedbackSummary(db, days = 30) {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace("T", " ");
    const t = await db.prepare(`SELECT rating, COUNT(*) AS n FROM ai_feedback WHERE created_at >= ? GROUP BY rating`).bind(since).all();
    const c = { up: 0, down: 0 };
    for (const r of t.results || []) c[r.rating] = r.n;
    const o = await db.prepare(`SELECT COUNT(*) AS n FROM ai_feedback WHERE rating = 'down' AND reviewed = 0`).first();
    const r = await db.prepare(`SELECT reason, COUNT(*) AS n FROM ai_feedback WHERE rating = 'down' AND reason IS NOT NULL AND created_at >= ? GROUP BY reason ORDER BY n DESC LIMIT 5`).bind(since).all();
    return { available: true, days, up: c.up, down: c.down, unreviewed_down: o?.n || 0, reasons: r.results || [] };
  } catch (_) {
    return { available: false, days, up: 0, down: 0, unreviewed_down: 0, reasons: [] };
  }
}

export async function listFeedback(db, { rating = "down", reviewed = "", before = 0, limit = 30 } = {}) {
  try {
    const where = [], params = [];
    if (rating === "up" || rating === "down") { where.push("rating = ?"); params.push(rating); }
    if (reviewed === "0" || reviewed === "1") { where.push("reviewed = ?"); params.push(Number(reviewed)); }
    if (before > 0) { where.push("id < ?"); params.push(before); }
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const r = await db.prepare(`SELECT id, rating, reason, question, answer, country, reviewed, created_at FROM ai_feedback ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ${lim}`).bind(...params).all();
    return { available: true, rows: r.results || [] };
  } catch (_) {
    return { available: false, rows: [] };
  }
}

export async function setReviewed(db, id, flag) {
  try {
    const r = await db.prepare(`UPDATE ai_feedback SET reviewed = ? WHERE id = ?`).bind(flag ? 1 : 0, Number(id)).run();
    return (r?.meta?.changes || 0) > 0;
  } catch (_) { return false; }
}
