// Small per-key rate gate on the existing ai_rate_limits table (key, timestamp).
// The table's key is (ip_hash, created_at), so three random digits are added after the milliseconds: two calls in
// the same instant must not collide and go uncounted. The stamp is still an ISO-style string that sorts by time.
// If the table is missing the gate lets the request through (a missing log must never block people).
export async function rateGate(db, key, max, windowMinutes) {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const row = await db.prepare(`SELECT COUNT(*) AS c FROM ai_rate_limits WHERE ip_hash = ? AND created_at >= ?`).bind(key, since).first();
    if ((row?.c || 0) >= max) return false;
    for (let n = 0; n < 6; n++) {
      const stamp = new Date().toISOString().slice(0, -1) + String(Math.floor(Math.random() * 1000)).padStart(3, "0") + "Z";
      const res = await db.prepare(`INSERT OR IGNORE INTO ai_rate_limits (ip_hash, created_at) VALUES (?, ?)`).bind(key, stamp).run();
      if (res?.meta?.changes !== 0) break;
    }
  } catch (_) { /* table missing */ }
  return true;
}
