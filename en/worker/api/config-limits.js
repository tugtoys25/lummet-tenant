// Request-count rate limits for the staff configuration endpoints that are expensive or reach outside the site (Phase 10).
// The sign-in limiter (auth/security.js checkRateLimit) counts FAILURES; these endpoints are used by signed-in staff, so what is limited
// is the NUMBER OF REQUESTS per person in a window. Rows live in auth_attempts (action "cfg:<name>", key "u:<user id>"), so no migration.
// Each request inserts a row, then counts the rows in the window; one over the limit is refused with 429.
// The sign-in limiter deletes every auth_attempts row older than 15 minutes, so windows here must stay at 15 minutes or less.
// Fail-open: if the table cannot be read the request goes ahead (staff are authenticated, role-checked and the operation is bounded).
export const WINDOW_MINUTES = 10;
export const LIMITS = Object.freeze({
  export: 20, plan: 30, apply: 15, fetch: 10, presets: 30, shares: 20, setup: 10, publish: 20, rollback: 10,
});

const failureResponse = (action, max, retry) => new Response(JSON.stringify({ success: false, code: "rate_limited", error: `Too many ${action} requests. Try again in a few minutes.`, limit: max, windowMinutes: WINDOW_MINUTES }),
  { status: 429, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "Retry-After": String(retry) } });

/** Count this request. Returns a 429 Response when over the limit, otherwise null. */
export async function limitRequest(env, user, name, now = Date.now()) {
  const max = LIMITS[name]; if (!max || !env?.DB) return null;
  const action = `cfg:${name}`, key = `u:${user?.user_id ?? user?.id ?? "anon"}`;
  try {
    const since = new Date(now - WINDOW_MINUTES * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM auth_attempts WHERE action LIKE 'cfg:%' AND created_at < ?").bind(since).run();
    await env.DB.prepare("INSERT INTO auth_attempts (ip_hash, action, created_at) VALUES (?, ?, ?)").bind(key, action, new Date(now).toISOString()).run();
    const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM auth_attempts WHERE ip_hash = ? AND action = ? AND created_at >= ?").bind(key, action, since).first();
    if (Number(row?.c || 0) > max) return failureResponse(name, max, WINDOW_MINUTES * 60);
  } catch { /* fail open, see above */ }
  return null;
}
