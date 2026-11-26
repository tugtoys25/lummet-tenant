// worker/tracking/bot-shield.js -- Click protection for tracked links (/en/go/...).
//
// Modes (setting go_bot_mode, Settings > General > Click protection):
//   off   (default)  nothing here runs: no signals read, no database access, the redirect is exactly as before.
//   flag             suspicious clicks are still redirected, but recorded as bot clicks (is_bot = 1) with the reasons, so
//                    earnings and analytics reports leave them out. Real visitors are never affected.
//   hold             as flag, and clicks with STRONG evidence of automation get a 403 instead of the redirect.
//
// Signals (a click is suspicious with one strong signal or two weak ones):
//   strong  automation user agent (headless browsers, scripting libraries, scrapers), HEAD request, prefetch/preview request,
//           Cloudflare bot score <= 10 (when the plan provides it), rate above the limit
//   weak    no user agent, no Accept-Language, Cloudflare bot score 11..29, verified crawler
// A person is never judged by one weak signal alone. Everything fails open: any error here means "not suspicious".
export const MODES = ['off', 'flag', 'hold'];
export const DEFAULT_RATE_LIMIT = 20; // clicks per visitor per 10 minutes, across all tracked links

const AUTOMATION_UA = /headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver|python-requests|python-urllib|aiohttp|httpx|scrapy|curl\/|wget\/|go-http-client|libwww|java\/|apache-httpclient|node-fetch|axios\/|undici|postmanruntime|insomnia|okhttp-bot|headless/i;

export function inspectRequest(request) {
  const strong = []; const weak = [];
  const ua = request.headers.get('user-agent') || '';
  if (!ua) weak.push('no_user_agent');
  else if (AUTOMATION_UA.test(ua)) strong.push('automation_agent');
  if (request.method === 'HEAD') strong.push('head_request');
  const purpose = `${request.headers.get('sec-purpose') || ''} ${request.headers.get('purpose') || ''} ${request.headers.get('x-moz') || ''}`.toLowerCase();
  if (/prefetch|preview|prerender/.test(purpose)) strong.push('prefetch');
  if (!request.headers.get('accept-language') && ua) weak.push('no_accept_language');
  const bm = request.cf && request.cf.botManagement;
  if (bm && typeof bm.score === 'number' && bm.score > 0) {
    if (bm.score <= 10) strong.push('bot_score_low'); else if (bm.score < 30) weak.push('bot_score_medium');
  }
  if (bm && bm.verifiedBot) weak.push('verified_crawler');
  return { strong, weak };
}

export function decide(signals, { rateExceeded = false } = {}) {
  const strong = [...signals.strong]; if (rateExceeded) strong.push('rate_limit');
  const reasons = [...strong, ...signals.weak];
  return { suspect: strong.length >= 1 || signals.weak.length >= 2, hold: strong.length >= 1, reasons };
}

const memo = new WeakMap();
export function forgetShieldSettings(db) { memo.delete(db); }
export async function getShieldSettings(db, now = Date.now()) {
  if (!db) return { mode: 'off', limit: DEFAULT_RATE_LIMIT };
  const hit = memo.get(db); if (hit && now - hit.at < 30000) return hit.value;
  let value = { mode: 'off', limit: DEFAULT_RATE_LIMIT };
  try {
    const rows = (await db.prepare(`SELECT key, value FROM settings WHERE key IN ('go_bot_mode','go_bot_rate_limit')`).all()).results || [];
    const raw = {}; for (const r of rows) raw[r.key] = r.value;
    const limit = Number.parseInt(raw.go_bot_rate_limit, 10);
    value = { mode: MODES.includes(raw.go_bot_mode) ? raw.go_bot_mode : 'off', limit: limit >= 3 && limit <= 1000 ? limit : DEFAULT_RATE_LIMIT };
  } catch { /* fail open */ }
  memo.set(db, { at: now, value });
  return value;
}

// Counts this click and returns the visitor's clicks in the last 10 minutes. Fails open (0).
export async function countClick(db, visitorHash, now = Date.now()) {
  if (!db || !visitorHash) return 0;
  try {
    const bucket = Math.floor(now / 60000);
    await db.prepare(`INSERT INTO go_click_velocity (visitor_hash, bucket, hits) VALUES (?, ?, 1) ON CONFLICT(visitor_hash, bucket) DO UPDATE SET hits = hits + 1`).bind(visitorHash, bucket).run();
    const row = await db.prepare(`SELECT COALESCE(SUM(hits), 0) AS n FROM go_click_velocity WHERE visitor_hash = ? AND bucket > ?`).bind(visitorHash, bucket - 10).first();
    if (Math.random() < 0.02) await db.prepare(`DELETE FROM go_click_velocity WHERE bucket < ?`).bind(bucket - 60).run();
    return Number(row && row.n) || 0;
  } catch { return 0; }
}

// One call from the redirect: returns null when protection is off, else { mode, suspect, hold, reasons }.
export async function runShield(env, request, ipHash) {
  try {
    const cfg = await getShieldSettings(env && env.DB);
    if (cfg.mode === 'off') return null;
    const n = await countClick(env.DB, ipHash);
    const d = decide(inspectRequest(request), { rateExceeded: n > cfg.limit });
    return { mode: cfg.mode, suspect: d.suspect, hold: cfg.mode === 'hold' && d.hold, reasons: d.reasons };
  } catch { return null; }
}

export function heldResponse() {
  return new Response('Automated access to this link is not permitted.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

// The redirect itself, with headers that keep it out of search results and caches. Same validation as Response.redirect.
export function goRedirect(url, status = 302) {
  const href = new URL(url).href;
  return new Response(null, { status, headers: { Location: href, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
