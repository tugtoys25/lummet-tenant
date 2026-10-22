import { clip } from "./text-utils.js";

// ---------- history (who did what; no prompts, no generated text) ----------

export const HISTORY_KEEP_DAYS = 365;

/** Best effort: never throws, and does nothing if migration 0062 has not been applied. */
export async function recordHistory(db, user, e) {
  try {
    const uid = user?.user_id || user?.id || null;
    await db.prepare(`INSERT INTO ai_studio_history (user_id, user_label, kind, task, target, item_type, item_key, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid, clip(user?.name || user?.email || (uid ? `user ${uid}` : ""), 120), e.kind, e.task || null, e.target || null,
        e.item_type ? clip(e.item_type, 40) : null, e.item_key ? clip(e.item_key, 120) : null, e.outcome === "failed" ? "failed" : "ok", clip(e.detail, 240) || null).run();
    if (e.kind === "save") {
      const cutoff = new Date(Date.now() - HISTORY_KEEP_DAYS * 86400000).toISOString().slice(0, 19).replace("T", " ");
      await db.prepare(`DELETE FROM ai_studio_history WHERE created_at < ?`).bind(cutoff).run();
    }
  } catch (_) { /* history is optional */ }
}

export const isAllSeeing = (user) => user && (user.role === "admin" || user.role === "super_admin");

/** Admins see everyone's history; everyone else sees only their own. */
export async function readHistory(db, user, { kind = "", mine = false, before = 0, limit = 50 } = {}) {
  try {
    const where = [], params = [];
    if (!isAllSeeing(user) || mine) { where.push("user_id = ?"); params.push(user?.user_id || user?.id || -1); }
    if (kind === "generate" || kind === "save") { where.push("kind = ?"); params.push(kind); }
    if (before > 0) { where.push("id < ?"); params.push(before); }
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const r = await db.prepare(`SELECT id, user_id, user_label, kind, task, target, item_type, item_key, outcome, detail, created_at FROM ai_studio_history ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ${lim}`).bind(...params).all();
    return { available: true, rows: r.results || [] };
  } catch (_) {
    return { available: false, rows: [] };
  }
}
