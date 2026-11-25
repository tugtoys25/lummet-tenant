// ============================================================
// en/worker/newsroom-safety.js -- content backups and uptime / error alerts (additive; each off until switched on)
//
//   news_backups     once a day (and on demand) the newsroom's content is saved as a compressed JSON file in private storage.
//                    Only content tables are included: no passwords, sessions, members, subscribers, push keys or comments.
//   news_monitoring  every scheduled run checks the database and a page render, logs server errors, and emails an alert
//                    when the site goes down, comes back, or errors spike. /en/api/v1/health is a public up/down address
//                    for an outside monitor (a site that is completely down cannot email you about itself).
//
// Everything here fails soft: a problem in this file never changes what a visitor sees.
// ============================================================

import { getOpsFlags } from './newsroom-ops.js';
import { sendEmail } from './email.js';

export const BACKUP_TABLES = ['news', 'authors', 'news_sections', 'news_redirects', 'news_access', 'news_corrections', 'news_series', 'news_series_articles', 'news_topics', 'news_entities', 'news_article_topics', 'news_article_entities', 'news_article_bylines', 'news_article_sources', 'news_related', 'news_pins', 'news_timeline_updates', 'news_regions', 'news_region_countries', 'news_article_countries', 'media_library'];
const KEEP_BACKUPS = 14, PAGE = 500, MAX_ROWS_PER_TABLE = 50000, ERR_KEEP_DAYS = 14, CHECK_KEEP_DAYS = 30;
export const SETTING_KEYS = ['monitor_alert_email', 'monitor_state', 'monitor_last_alert_at', 'monitor_error_threshold'];

// ── backups ─────────────────────────────────────────────────
async function existingTables(db) {
  const r = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
  const have = new Set((r.results || []).map((x) => x.name));
  return BACKUP_TABLES.filter((t) => have.has(t));
}

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function runBackup(env, { kind = 'auto', actor = null, now = new Date() } = {}) {
  if (!env.MEDIA_BUCKET) return { ok: false, error: 'Private storage (R2) is not connected for this site' };
  try {
    const tables = await existingTables(env.DB);
    const dump = { format: 'lummet-newsroom-backup', version: 1, created_at: now.toISOString(), tables: {}, truncated: [] };
    for (const t of tables) {
      const rows = [];
      for (let off = 0; off < MAX_ROWS_PER_TABLE; off += PAGE) {
        const r = await env.DB.prepare(`SELECT * FROM ${t} ORDER BY rowid LIMIT ${PAGE} OFFSET ${off}`).all();
        const got = r.results || [];
        rows.push(...got);
        if (got.length < PAGE) break;
        if (off + PAGE >= MAX_ROWS_PER_TABLE) dump.truncated.push(t);
      }
      dump.tables[t] = rows;
    }
    const bytes = await gzip(JSON.stringify(dump));
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const key = `backups/content/${stamp}-${kind}.json.gz`;
    await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/gzip' } });
    const counts = Object.fromEntries(Object.entries(dump.tables).map(([k, v]) => [k, v.length]));
    await env.DB.prepare(`INSERT INTO news_backups (r2_key, kind, bytes, tables_json, created_by) VALUES (?,?,?,?,?)`).bind(key, kind, bytes.length, JSON.stringify(counts), actor).run();
    await pruneBackups(env);
    return { ok: true, key, bytes: bytes.length, tables: counts, truncated: dump.truncated };
  } catch (e) {
    console.error('backup failed:', e && e.message);
    return { ok: false, error: 'The backup could not be completed' };
  }
}

async function pruneBackups(env) {
  const old = (await env.DB.prepare(`SELECT id, r2_key FROM news_backups ORDER BY id DESC LIMIT -1 OFFSET ?`).bind(KEEP_BACKUPS).all()).results || [];
  for (const b of old) {
    try { await env.MEDIA_BUCKET.delete(b.r2_key); } catch { /* keep the row if the file could not be removed */ continue; }
    await env.DB.prepare(`DELETE FROM news_backups WHERE id = ?`).bind(b.id).run();
  }
}

export async function runDailyBackup(env, now = new Date()) {
  try {
    if (!(await getOpsFlags(env.DB)).news_backups) return { skipped: 'off' };
    if (now.getUTCHours() !== 2) return { skipped: 'not the backup hour' };
    const day = now.toISOString().slice(0, 10);
    const done = await env.DB.prepare(`SELECT id FROM news_backups WHERE kind = 'auto' AND created_at >= ? LIMIT 1`).bind(day + ' 00:00:00').first();
    if (done) return { skipped: 'already done today' };
    return await runBackup(env, { kind: 'auto', now });
  } catch (e) { console.error('daily backup skipped:', e && e.message); return { skipped: 'error' }; }
}

export async function listBackups(db) {
  return (await db.prepare(`SELECT id, kind, bytes, tables_json, created_at FROM news_backups ORDER BY id DESC LIMIT 30`).all()).results || [];
}

export async function downloadBackup(env, id) {
  const row = await env.DB.prepare(`SELECT r2_key, created_at FROM news_backups WHERE id = ?`).bind(Number(id) || 0).first();
  if (!row || !env.MEDIA_BUCKET) return null;
  const obj = await env.MEDIA_BUCKET.get(row.r2_key);
  if (!obj) return null;
  const name = `newsroom-backup-${String(row.created_at).replace(/[^0-9]/g, '').slice(0, 12)}.json.gz`;
  return new Response(obj.body, { status: 200, headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

// ── monitoring ──────────────────────────────────────────────
let errBudget = { minute: 0, n: 0 };
// Called from the request handler on a server error. Capped so an outage cannot flood the database with log rows.
export async function recordError(env, { path = '', status = 500, message = '' } = {}) {
  try {
    if (!(await getOpsFlags(env.DB)).news_monitoring) return;
    const minute = Math.floor(Date.now() / 60000);
    if (errBudget.minute !== minute) errBudget = { minute, n: 0 };
    if (++errBudget.n > 20) return;
    await env.DB.prepare(`INSERT INTO news_error_log (path, status, message) VALUES (?,?,?)`).bind(String(path).slice(0, 200), Number(status) || 500, String(message).replace(/\s+/g, ' ').slice(0, 300)).run();
  } catch { /* logging must never cause errors */ }
}

async function getSettings(db) {
  const out = {};
  try {
    const r = await db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(',')})`).bind(...SETTING_KEYS).all();
    for (const x of r.results || []) out[x.key] = x.value;
  } catch { /* defaults */ }
  return out;
}
const put = (db, k, v) => db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(k, String(v)).run();

export async function saveMonitorConfig(db, input) {
  const email = String(input.monitor_alert_email || '').trim().slice(0, 200);
  if (email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(email)) return { ok: false, error: 'That email address does not look right' };
  const th = Math.min(1000, Math.max(1, Math.trunc(Number(input.monitor_error_threshold) || 10)));
  await put(db, 'monitor_alert_email', email); await put(db, 'monitor_error_threshold', th);
  return { ok: true };
}

async function recipients(env, settings) {
  if (settings.monitor_alert_email) return [settings.monitor_alert_email];
  try { return ((await env.DB.prepare(`SELECT email FROM users WHERE role = 'admin' ORDER BY id LIMIT 3`).all()).results || []).map((u) => u.email).filter(Boolean); } catch { return []; }
}

async function alert(env, settings, subject, text) {
  const to = await recipients(env, settings);
  let sent = 0;
  for (const addr of to) { try { await sendEmail(env, { to: addr, subject, text }); sent++; } catch (e) { console.error('alert email failed:', e && e.message); } }
  return sent;
}

// render: optional async () => Response for the home page (cron passes the app itself, so no outside request is needed).
export async function runMonitor(env, { render = null, now = new Date() } = {}) {
  try {
    if (!(await getOpsFlags(env.DB)).news_monitoring) return { skipped: 'off' };
    const settings = await getSettings(env.DB);
    const started = Date.now();
    let ok = true; const problems = [];
    try { await env.DB.prepare('SELECT 1').first(); } catch { ok = false; problems.push('database not answering'); }
    if (ok && render) {
      try { const res = await render(); if (!res || res.status >= 500) { ok = false; problems.push(`home page returned ${res ? res.status : 'nothing'}`); } } catch (e) { ok = false; problems.push('home page failed: ' + String(e && e.message).slice(0, 120)); }
    }
    const ms = Date.now() - started;
    await env.DB.prepare(`INSERT INTO news_health_checks (ok, ms, detail) VALUES (?,?,?)`).bind(ok ? 1 : 0, ms, problems.join('; ') || null).run();

    const prev = settings.monitor_state || 'up';
    const state = ok ? 'up' : 'down';
    let alerted = 0;
    if (state !== prev) {
      await put(env.DB, 'monitor_state', state);
      alerted += await alert(env, settings, state === 'down' ? 'ALERT: your site has a problem' : 'Recovered: your site is working again', state === 'down' ? `Problem detected at ${now.toISOString()}: ${problems.join('; ')}.\nYou will get another email when it recovers.` : `The site passed its check at ${now.toISOString()}.`);
    }
    // Error spike: many server errors in the last hour, at most one email per 6 hours.
    const threshold = Math.max(1, Number(settings.monitor_error_threshold) || 10);
    const recent = await env.DB.prepare(`SELECT COUNT(*) AS c FROM news_error_log WHERE at >= datetime('now','-1 hour')`).first();
    const last = Date.parse(String(settings.monitor_last_alert_at || '').replace(' ', 'T') + 'Z') || 0;
    if ((recent?.c || 0) >= threshold && now.getTime() - last > 6 * 3600 * 1000) {
      const top = (await env.DB.prepare(`SELECT path, message, COUNT(*) AS c FROM news_error_log WHERE at >= datetime('now','-1 hour') GROUP BY path, message ORDER BY c DESC LIMIT 5`).all()).results || [];
      alerted += await alert(env, settings, `ALERT: ${recent.c} server errors in the last hour`, `Most frequent:\n${top.map((t) => `- ${t.c}x ${t.path} ${t.message}`).join('\n')}`);
      await put(env.DB, 'monitor_last_alert_at', now.toISOString().replace('T', ' ').slice(0, 19));
    }
    if (now.getUTCHours() === 3) {
      await env.DB.prepare(`DELETE FROM news_error_log WHERE at < datetime('now', ?)`).bind(`-${ERR_KEEP_DAYS} days`).run();
      await env.DB.prepare(`DELETE FROM news_health_checks WHERE checked_at < datetime('now', ?)`).bind(`-${CHECK_KEEP_DAYS} days`).run();
    }
    return { ok, ms, problems, alerted };
  } catch (e) { console.error('monitor skipped:', e && e.message); return { skipped: 'error' }; }
}

export async function sendTestAlert(env) {
  const settings = await getSettings(env.DB);
  const n = await alert(env, settings, 'Test alert from your newsroom', 'This is a test. If you can read it, alerts will reach you.');
  return { sent: n, to: await recipients(env, settings) };
}

export async function healthResponse(env) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    if (!(await getOpsFlags(env.DB)).news_monitoring) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    await env.DB.prepare('SELECT 1').first();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch { return new Response(JSON.stringify({ ok: false }), { status: 503, headers }); }
}

export async function safetyStatus(db) {
  const settings = await getSettings(db);
  const [backups, checks, errors, flags] = await Promise.all([
    listBackups(db),
    db.prepare(`SELECT checked_at, ok, ms, detail FROM news_health_checks ORDER BY id DESC LIMIT 20`).all().then((r) => r.results || []).catch(() => []),
    db.prepare(`SELECT at, path, status, message FROM news_error_log ORDER BY id DESC LIMIT 20`).all().then((r) => r.results || []).catch(() => []),
    getOpsFlags(db)
  ]);
  return { flags, backups, checks, errors, config: { monitor_alert_email: settings.monitor_alert_email || '', monitor_error_threshold: Number(settings.monitor_error_threshold) || 10, monitor_state: settings.monitor_state || 'up' } };
}
