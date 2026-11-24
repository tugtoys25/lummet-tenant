// ============================================================
// en/worker/newsroom-ops.js -- operations tools for the newsroom (additive, every one off until switched on)
//
//   web vitals       news_web_vitals        real-user Core Web Vitals as daily counts (no IP, no visitor ids)
//   section digests  news_section_digests   readers pick sections + daily/weekly; one email per reader per run
//   CSV export       news_csv_export        article list as CSV for editors (spreadsheet-safe)
//   section ads      news_section_ads       ad rules can be limited to chosen sections (see controllers/ads.js)
//
// Public paths fail soft: a broken lookup means "nothing extra", never a broken page.
// ============================================================


const KEYS = ['news_web_vitals', 'news_section_digests', 'news_csv_export', 'news_section_ads', 'news_comments', 'news_comments_open_posting', 'news_web_push', 'news_push_auto', 'news_membership', 'news_import', 'news_video_embeds', 'news_podcast', 'news_galleries'];
const memo = new WeakMap();
const TTL = 30000;

export async function getOpsFlags(db, now = Date.now()) {
  const hit = memo.get(db);
  if (hit && now - hit.at < TTL) return hit.flags;
  const flags = Object.fromEntries(KEYS.map((k) => [k, false]));
  try {
    const r = await db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${KEYS.map(() => '?').join(',')})`).bind(...KEYS).all();
    for (const row of r.results || []) flags[row.key] = String(row.value).toLowerCase() === 'true';
  } catch (e) { console.error('ops flags read failed (all off):', e && e.message); }
  memo.set(db, { at: now, flags });
  return flags;
}
export function forgetOpsFlags(db) { memo.delete(db); }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Core Web Vitals ──────────────────────────────────────────
export const VITALS = {
  LCP: [2500, 4000], CLS: [0.1, 0.25], INP: [200, 500], FCP: [1800, 3000], TTFB: [800, 1800]
};
const PAGES = ['article', 'list'];
const DEVICES = ['mobile', 'desktop'];

// Tiny script (no library, no cookies). Sends one beacon when the reader leaves or hides the page.
export function vitalsScript(page) {
  if (!PAGES.includes(page)) return '';
  return `<script>(function(){try{if(!('PerformanceObserver' in window)||!navigator.sendBeacon)return;var m={},cls=0,sent=0;
function o(t,f){try{new PerformanceObserver(function(l){l.getEntries().forEach(f);}).observe({type:t,buffered:true});}catch(e){}}
o('largest-contentful-paint',function(e){m.LCP=e.startTime;});
o('layout-shift',function(e){if(!e.hadRecentInput){cls+=e.value;m.CLS=cls;}});
o('event',function(e){if(e.interactionId&&(!m.INP||e.duration>m.INP))m.INP=e.duration;});
o('paint',function(e){if(e.name==='first-contentful-paint')m.FCP=e.startTime;});
var n=performance.getEntriesByType('navigation')[0];if(n)m.TTFB=n.responseStart;
function send(){if(sent)return;sent=1;var b=JSON.stringify({page:${JSON.stringify(page)},device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop',metrics:m});navigator.sendBeacon('/en/api/v1/news/vitals',new Blob([b],{type:'application/json'}));}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')send();});addEventListener('pagehide',send);}catch(e){}})();</script>`;
}

export async function articleVitalsHtml(db) {
  try { return (await getOpsFlags(db)).news_web_vitals ? vitalsScript('article') : ''; } catch { return ''; }
}

export function rateVital(metric, value) {
  const t = VITALS[metric]; if (!t) return null;
  return value <= t[0] ? 'good' : value <= t[1] ? 'needs_improvement' : 'poor';
}

export async function recordVitals(env, body) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_web_vitals) return { ok: false, status: 404 };
  if (!body || typeof body !== 'object' || !PAGES.includes(body.page) || !DEVICES.includes(body.device) || !body.metrics || typeof body.metrics !== 'object') return { ok: false, status: 400 };
  const day = new Date().toISOString().slice(0, 10);
  const stmts = [];
  for (const metric of Object.keys(VITALS)) {
    const v = Number(body.metrics[metric]);
    if (!Number.isFinite(v) || v < 0 || v > 600000) continue;
    const bucket = rateVital(metric, v);
    stmts.push(db.prepare(`INSERT INTO news_web_vitals (day, page, device, metric, good, needs_improvement, poor, total, sum_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(day, page, device, metric) DO UPDATE SET good = good + excluded.good, needs_improvement = needs_improvement + excluded.needs_improvement,
        poor = poor + excluded.poor, total = total + 1, sum_value = sum_value + excluded.sum_value`)
      .bind(day, body.page, body.device, metric, bucket === 'good' ? 1 : 0, bucket === 'needs_improvement' ? 1 : 0, bucket === 'poor' ? 1 : 0, v));
  }
  if (!stmts.length) return { ok: false, status: 400 };
  try { await db.batch(stmts); } catch (e) { console.error('vitals write failed:', e && e.message); return { ok: false, status: 503 }; }
  return { ok: true, status: 204 };
}

export async function vitalsSummary(db, days = 28) {
  const n = Math.min(Math.max(Math.trunc(Number(days)) || 28, 1), 90);
  const since = new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  try {
    const r = await db.prepare(`SELECT page, device, metric, SUM(good) AS good, SUM(needs_improvement) AS ni, SUM(poor) AS poor, SUM(total) AS total, SUM(sum_value) AS sum_value
      FROM news_web_vitals WHERE day >= ? GROUP BY page, device, metric ORDER BY page, device, metric`).bind(since).all();
    return { days: n, rows: (r.results || []).map((x) => ({
      page: x.page, device: x.device, metric: x.metric, samples: x.total,
      good_pct: x.total ? Math.round((x.good / x.total) * 100) : 0, poor_pct: x.total ? Math.round((x.poor / x.total) * 100) : 0,
      mean: x.total ? Math.round((x.sum_value / x.total) * 1000) / 1000 : 0, thresholds: VITALS[x.metric]
    })) };
  } catch (e) { console.error('vitals summary failed:', e && e.message); return { days: n, rows: [] }; }
}

// Old days are not needed once the summary window has passed.
export async function pruneVitals(db, keepDays = 120) {
  try { await db.prepare(`DELETE FROM news_web_vitals WHERE day < ?`).bind(new Date(Date.now() - keepDays * 86400000).toISOString().slice(0, 10)).run(); } catch { /* table may not exist yet */ }
}

// ── CSV export ───────────────────────────────────────────────
const CSV_COLS = ['id', 'slug', 'title', 'status', 'section', 'author', 'published_at', 'created_at', 'updated_at', 'excerpt'];
// A cell starting with = + - @ tab or CR is run as a formula by spreadsheets; a leading apostrophe makes it plain text.
export function csvCell(v) {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportNewsCsv(db, { status = 'all', from = '', to = '', limit = 5000 } = {}) {
  const where = [], params = [];
  if (status === 'published') where.push(`n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`);
  else if (status === 'draft') where.push(`n.published = 0`);
  else if (status === 'scheduled') where.push(`n.published = 1 AND n.published_at IS NOT NULL AND datetime(n.published_at) > datetime('now')`);
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (date.test(from)) { where.push(`date(COALESCE(n.published_at, n.created_at)) >= ?`); params.push(from); }
  if (date.test(to)) { where.push(`date(COALESCE(n.published_at, n.created_at)) <= ?`); params.push(to); }
  const cap = Math.min(Math.max(Math.trunc(Number(limit)) || 5000, 1), 20000);
  const sql = `SELECT n.id, n.slug, n.title, n.published, n.published_at, n.created_at, n.updated_at, n.excerpt,
      s.name AS section, a.name AS author
    FROM news n LEFT JOIN news_sections s ON s.id = n.section_id LEFT JOIN authors a ON a.id = n.author_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT ${cap}`;
  let rows = [];
  try { rows = (await db.prepare(sql).bind(...params).all()).results || []; }
  catch { // sections table or column missing: export without the section name rather than failing
    rows = (await db.prepare(`SELECT n.id, n.slug, n.title, n.published, n.published_at, n.created_at, n.updated_at, n.excerpt, NULL AS section, a.name AS author
      FROM news n LEFT JOIN authors a ON a.id = n.author_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT ${cap}`).bind(...params).all()).results || [];
  }
  const now = Date.now();
  const lines = [CSV_COLS.join(',')];
  for (const r of rows) {
    const live = r.published && (!r.published_at || new Date(String(r.published_at).replace(' ', 'T') + (/[zZ]|\+/.test(r.published_at) ? '' : 'Z')).getTime() <= now);
    const state = !r.published ? 'draft' : live ? 'published' : 'scheduled';
    lines.push([r.id, r.slug, r.title, state, r.section, r.author, r.published_at, r.created_at, r.updated_at, r.excerpt].map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ── Section digests ──────────────────────────────────────────
export const DIGEST_FREQUENCIES = ['daily', 'weekly'];

export async function listDigestSections(db) {
  try { return (await db.prepare(`SELECT id, slug, name FROM news_sections WHERE active = 1 ORDER BY name`).all()).results || []; } catch { return []; }
}

async function subscriberByToken(db, token) {
  const t = String(token || '').slice(0, 200);
  if (!t) return null;
  return await db.prepare(`SELECT id, email FROM newsletter_subscribers WHERE token = ? AND status = 'confirmed'`).bind(t).first();
}

export async function getDigestPrefs(env, token) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_section_digests) return { ok: false, status: 404 };
  const sub = await subscriberByToken(db, token);
  if (!sub) return { ok: false, status: 404 };
  const prefs = (await db.prepare(`SELECT p.section_id, p.frequency, s.slug FROM news_digest_prefs p JOIN news_sections s ON s.id = p.section_id WHERE p.subscriber_id = ?`).bind(sub.id).all()).results || [];
  return { ok: true, status: 200, sections: await listDigestSections(db), selected: prefs.map((p) => p.slug), frequency: prefs[0]?.frequency || 'weekly' };
}

export async function saveDigestPrefs(env, { token, sections, frequency }) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_section_digests) return { ok: false, status: 404, error: 'Not found' };
  const sub = await subscriberByToken(db, token);
  if (!sub) return { ok: false, status: 404, error: 'This link is no longer valid' };
  const freq = DIGEST_FREQUENCIES.includes(frequency) ? frequency : 'weekly';
  const wanted = Array.isArray(sections) ? [...new Set(sections.map((s) => String(s).slice(0, 120)))].slice(0, 50) : [];
  const all = await listDigestSections(db);
  const ids = all.filter((s) => wanted.includes(s.slug)).map((s) => s.id);
  const stmts = [db.prepare(`DELETE FROM news_digest_prefs WHERE subscriber_id = ?`).bind(sub.id)];
  for (const id of ids) stmts.push(db.prepare(`INSERT INTO news_digest_prefs (subscriber_id, section_id, frequency) VALUES (?, ?, ?)`).bind(sub.id, id, freq));
  await db.batch(stmts);
  return { ok: true, status: 200, count: ids.length };
}

export async function digestStats(db) {
  try {
    const r = await db.prepare(`SELECT s.name, p.frequency, COUNT(*) AS readers FROM news_digest_prefs p JOIN news_sections s ON s.id = p.section_id
      JOIN newsletter_subscribers n ON n.id = p.subscriber_id AND n.status = 'confirmed' GROUP BY s.id, p.frequency ORDER BY readers DESC`).all();
    return { rows: r.results || [] };
  } catch { return { rows: [] }; }
}

const DUE_HOURS = { daily: 23, weekly: 24 * 6.9 };
const MAX_READERS_PER_RUN = 150;

// Called from the scheduled job. Sends at most one email per reader per run, listing new articles in the sections they chose.
export async function runSectionDigests(env, now = Date.now(), deps = {}) {
  const db = env.DB;
  try {
    if (!(await getOpsFlags(db, now)).news_section_digests) return { skipped: true, reason: 'news_section_digests is off' };
    const prefs = (await db.prepare(`SELECT p.subscriber_id, p.section_id, p.frequency, p.last_sent_at, n.email, n.token, s.name AS section_name
      FROM news_digest_prefs p JOIN newsletter_subscribers n ON n.id = p.subscriber_id AND n.status = 'confirmed'
      JOIN news_sections s ON s.id = p.section_id AND s.active = 1`).all()).results || [];
    const bySub = new Map();
    for (const p of prefs) { if (!bySub.has(p.subscriber_id)) bySub.set(p.subscriber_id, []); bySub.get(p.subscriber_id).push(p); }
    const sendEmail = deps.sendEmail || (await import('./email.js')).sendEmail;
    const { renderEmailHtml, htmlToPlainText } = await import('./email-layouts.js');
    const site = deps.site || await (await import('./site-context.js')).getSiteContext(null, env);
    let sent = 0, failed = 0, checked = 0;
    for (const [subId, list] of bySub) {
      const freq = list[0].frequency;
      const last = list.map((p) => p.last_sent_at).filter(Boolean).sort().pop();
      const lastMs = last ? new Date(String(last).replace(' ', 'T') + (/[zZ]/.test(last) ? '' : 'Z')).getTime() : 0;
      if (last && now - lastMs < (DUE_HOURS[freq] || DUE_HOURS.weekly) * 3600000) continue;
      if (++checked > MAX_READERS_PER_RUN) break;
      const sinceMs = last ? lastMs : now - (freq === 'daily' ? 1 : 7) * 86400000;
      const since = new Date(sinceMs).toISOString().slice(0, 19).replace('T', ' ');
      const groups = [];
      for (const p of list) {
        const rows = (await db.prepare(`SELECT title, slug FROM news WHERE published = 1 AND section_id = ? AND datetime(COALESCE(published_at, created_at)) > datetime(?)
          AND (published_at IS NULL OR datetime(published_at) <= datetime(?)) ORDER BY COALESCE(published_at, created_at) DESC LIMIT 8`)
          .bind(p.section_id, since, new Date(now).toISOString().slice(0, 19).replace('T', ' ')).all()).results || [];
        if (rows.length) groups.push({ name: p.section_name, rows });
      }
      const stamp = db.prepare(`UPDATE news_digest_prefs SET last_sent_at = ? WHERE subscriber_id = ?`).bind(new Date(now).toISOString().slice(0, 19).replace('T', ' '), subId);
      if (!groups.length) { await stamp.run(); continue; }   // nothing new: wait for the next window instead of re-checking every run
      const bodyHtml = `<p style="margin:0 0 8px;">New in the sections you follow at ${esc(site.siteName)}:</p>` + groups.map((g) =>
        `<h3 style="margin:20px 0 8px;font-size:15px;">${esc(g.name)}</h3><ul style="margin:0;padding-left:20px;">${g.rows.map((r) =>
          `<li style="margin-bottom:6px;"><a href="${site.origin}/en/news/${encodeURIComponent(r.slug)}" style="color:#2563eb;">${esc(r.title)}</a></li>`).join('')}</ul>`).join('')
        + `<p style="margin:24px 0 0;font-size:13px;"><a href="${site.origin}/en/newsletter/sections?token=${encodeURIComponent(list[0].token)}">Change your sections</a></p>`;
      const subject = `${site.siteName}: ${freq === 'daily' ? 'today' : 'this week'} in your sections`;
      const html = renderEmailHtml(site, { layout: 'branded', subject, bodyHtml, unsubscribeUrl: `${site.origin}/en/newsletter/unsubscribe?token=${list[0].token}` });
      try { await sendEmail(env, { to: list[0].email, subject, html, text: htmlToPlainText(bodyHtml) }); sent++; await stamp.run(); }
      catch (e) { failed++; console.error('section digest send failed:', e && e.message); }
    }
    return { skipped: false, sent, failed };
  } catch (e) {
    console.error('section digests failed:', e && e.message);
    return { skipped: true, reason: e.message };
  }
}

// ── per-section ad targeting ─────────────────────────────────
export async function getRuleSections(db, ruleIds) {
  const map = new Map();
  if (!ruleIds.length) return map;
  try {
    const r = await db.prepare(`SELECT rule_id, section_id FROM ad_rule_sections WHERE rule_id IN (${ruleIds.map(() => '?').join(',')})`).bind(...ruleIds).all();
    for (const x of r.results || []) { if (!map.has(x.rule_id)) map.set(x.rule_id, new Set()); map.get(x.rule_id).add(x.section_id); }
  } catch { /* table not there yet: every rule behaves as before */ }
  return map;
}

export async function setRuleSections(db, ruleId, sectionIds) {
  const ids = [...new Set((sectionIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
  const stmts = [db.prepare(`DELETE FROM ad_rule_sections WHERE rule_id = ?`).bind(ruleId)];
  for (const id of ids) stmts.push(db.prepare(`INSERT OR IGNORE INTO ad_rule_sections (rule_id, section_id) VALUES (?, ?)`).bind(ruleId, id));
  await db.batch(stmts);
}

// Rules with no section rows run everywhere. Others run only on articles in a listed section (or its parent section).
export function ruleMatchesSection(ruleSections, articleSectionIds) {
  if (!ruleSections || ruleSections.size === 0) return true;
  return (articleSectionIds || []).some((id) => ruleSections.has(id));
}

export async function articleSectionIds(db, sectionId) {
  const id = Number(sectionId);
  if (!Number.isInteger(id) || id <= 0) return [];
  const out = [id];
  try { const p = await db.prepare(`SELECT parent_id FROM news_sections WHERE id = ?`).bind(id).first(); if (p && p.parent_id) out.push(p.parent_id); } catch { /* ignore */ }
  return out;
}
