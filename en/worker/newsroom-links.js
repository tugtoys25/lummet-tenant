// ============================================================
// en/worker/newsroom-links.js -- the newsroom's own affiliate links (Amazon, Alibaba, AliExpress, eBay, Jumia ... any programme)
//
// An editor creates a link once (a label, the programme name, the full affiliate address, and a short code of their choice).
// Widgets and the article text then point to  /en/go/<code>.  The click is counted per link, per article and per widget.
//
// Kept apart from the casino tracking system on purpose:
//   * own tables (news_affiliate_links, news_link_clicks); nothing in tracking_links, casinos or analytics is read for stats or written
//   * /en/go/<code> asks the casino system first; this file is only consulted when that system finds NOTHING for the code
//   * a new code is refused if a tracking link code or a casino slug already uses it
//   * everything is off unless the news_commerce switch is on
// ============================================================

import { getCommerceFlags } from './newsroom-commerce.js';

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
const RESERVED = new Set(['admin', 'api', 'static', 'news', 'login', 'logout']);
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, n);

export function validDestination(u) {
  const s = String(u ?? '').trim();
  if (!s || s.length > 2048) return '';
  try { const x = new URL(s); return x.protocol === 'https:' && !x.username && !x.password ? x.toString() : ''; } catch { return ''; }
}

// True when the casino tracking system would answer for this code (tracking link code or casino slug), or another news link has it.
export async function codeTaken(db, code, exceptId = null) {
  const c = String(code);
  const t = await db.prepare(`SELECT 1 AS x FROM tracking_links WHERE lower(tracking_code) = lower(?) LIMIT 1`).bind(c).first();
  if (t) return 'a casino tracking link already uses that code';
  const k = await db.prepare(`SELECT 1 AS x FROM casinos WHERE lower(slug) = lower(?) LIMIT 1`).bind(c).first();
  if (k) return 'a casino already uses that code';
  const n = await db.prepare(`SELECT id FROM news_affiliate_links WHERE code = ? LIMIT 1`).bind(c).first();
  if (n && n.id !== exceptId) return 'another news link already uses that code';
  return '';
}

export async function listLinks(db) {
  const rows = (await db.prepare(`
    SELECT l.id, l.code, l.label, l.network, l.destination_url, l.status, l.notes, l.created_at,
           (SELECT COUNT(*) FROM news_link_clicks c WHERE c.link_id = l.id AND c.is_bot = 0) AS clicks_total,
           (SELECT COUNT(*) FROM news_link_clicks c WHERE c.link_id = l.id AND c.is_bot = 0 AND c.created_at >= datetime('now','-30 days')) AS clicks_30d,
           (SELECT COUNT(*) FROM news_widgets w WHERE lower(w.go_code) = lower(l.code)) AS used_by
      FROM news_affiliate_links l ORDER BY l.id DESC LIMIT 500`).all()).results || [];
  return rows;
}

export async function saveLink(db, input, { userId = null } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const id = b.id ? Number(b.id) : null;
  const code = clip(b.code, 64);
  const label = clip(b.label, 120);
  const dest = validDestination(b.destination_url);
  if (!label) return { ok: false, error: 'Give the link a name, for example "Kettle on Amazon"' };
  if (!dest) return { ok: false, error: 'The destination must be a full https:// address (no user name or password in it)' };
  let existing = null;
  if (id) { existing = await db.prepare(`SELECT id, code FROM news_affiliate_links WHERE id = ?`).bind(id).first(); if (!existing) return { ok: false, status: 404, error: 'Link not found' }; }
  // The code of an existing link never changes: widgets and printed addresses depend on it.
  const finalCode = existing ? existing.code : code;
  if (!existing) {
    if (!CODE.test(code)) return { ok: false, error: 'The code needs 2 to 64 letters, numbers, - or _ (for example amazon-kettle)' };
    if (RESERVED.has(code.toLowerCase())) return { ok: false, error: 'That code is reserved. Choose another.' };
    const taken = await codeTaken(db, code); if (taken) return { ok: false, error: `That code cannot be used: ${taken}.` };
  }
  const network = clip(b.network, 60) || null, notes = clip(b.notes, 500) || null;
  const status = b.status === 'paused' ? 'paused' : 'active';
  if (existing) {
    await db.prepare(`UPDATE news_affiliate_links SET label = ?, network = ?, destination_url = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(label, network, dest, status, notes, existing.id).run();
    return { ok: true, id: existing.id, code: finalCode, created: false };
  }
  const r = await db.prepare(`INSERT INTO news_affiliate_links (code, label, network, destination_url, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(finalCode, label, network, dest, status, notes, userId).run();
  return { ok: true, id: r.meta?.last_row_id ?? null, code: finalCode, created: true };
}

export async function setLinkStatus(db, id, status) {
  if (!['active', 'paused'].includes(status)) return { ok: false, error: 'Unknown status' };
  const r = await db.prepare(`UPDATE news_affiliate_links SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(status, Number(id) || 0).run();
  return r?.meta?.changes === 0 ? { ok: false, status: 404, error: 'Link not found' } : { ok: true };
}

// A link in use by a widget cannot be deleted (it would turn the widget's button into a dead address). Pause it instead.
export async function deleteLink(db, id) {
  const l = await db.prepare(`SELECT id, code FROM news_affiliate_links WHERE id = ?`).bind(Number(id) || 0).first();
  if (!l) return { ok: false, status: 404, error: 'Link not found' };
  const used = await db.prepare(`SELECT COUNT(*) AS c FROM news_widgets WHERE lower(go_code) = lower(?)`).bind(l.code).first();
  if ((used?.c || 0) > 0) return { ok: false, status: 409, error: `${used.c} widget(s) still use this link. Remove them first, or pause the link instead.` };
  await db.prepare(`DELETE FROM news_affiliate_links WHERE id = ?`).bind(l.id).run();
  return { ok: true };
}

export async function linkExists(db, code) {
  if (!code) return false;
  const n = await db.prepare(`SELECT 1 AS x FROM news_affiliate_links WHERE code = ? LIMIT 1`).bind(String(code)).first();
  if (n) return true;
  const t = await db.prepare(`SELECT 1 AS x FROM tracking_links WHERE tracking_code = ? LIMIT 1`).bind(String(code)).first();
  return !!t;
}

// Article picker for the Commerce tab: search by words, narrow by section and/or topic. Respects the editor's article access.
export async function pickArticles(db, { q = '', sectionId = null, topicId = null, condition = '', params = [], limit = 25 } = {}) {
  const where = []; const bind = [];
  const text = String(q || '').trim().slice(0, 100).replace(/[%_]/g, '');
  if (/^\d{1,9}$/.test(text)) { where.push('(n.id = ? OR n.title LIKE ?)'); bind.push(Number(text), `%${text}%`); }
  else if (text) { where.push('(n.title LIKE ? OR n.slug LIKE ?)'); bind.push(`%${text}%`, `%${text}%`); }
  const sec = Number(sectionId); if (Number.isInteger(sec) && sec > 0) { where.push('n.section_id = ?'); bind.push(sec); }
  const top = Number(topicId); if (Number.isInteger(top) && top > 0) { where.push('EXISTS (SELECT 1 FROM news_article_topics t WHERE t.news_id = n.id AND t.topic_id = ?)'); bind.push(top); }
  if (condition) where.push(`(${condition})`);
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 50);
  const rows = (await db.prepare(`
    SELECT n.id, n.title, n.slug, n.published, n.published_at, s.name AS section_name, c.mode AS commerce_mode
      FROM news n LEFT JOIN news_sections s ON s.id = n.section_id LEFT JOIN news_commerce c ON c.news_id = n.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT ${lim}`).bind(...bind, ...params).all()).results || [];
  return rows;
}

// ── public: /en/go/<code> fallback ──────────────────────────
const intParam = (sp, k) => { const v = sp.get(k); return v && /^[0-9]{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null; };

/** Returns a redirect Response when <code> is an active news link, otherwise null (the caller shows its normal 404). Never throws. */
export async function handleNewsLink(request, env, ctx, code, country = null) {
  try {
    if (!code || !CODE.test(String(code))) return null;
    const flags = await getCommerceFlags(env.DB);
    if (!flags.news_commerce) return null;
    const link = await env.DB.prepare(`SELECT id, destination_url FROM news_affiliate_links WHERE code = ? AND status = 'active'`).bind(String(code)).first();
    if (!link) return null;
    const dest = validDestination(link.destination_url);
    if (!dest) return null;
    const sp = new URL(request.url).searchParams;
    const ua = request.headers.get('user-agent') || '';
    const bot = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless/i.test(ua) ? 1 : 0;
    const device = /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop';
    const log = env.DB.prepare(`INSERT INTO news_link_clicks (link_id, news_id, widget_id, country, device, is_bot) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(link.id, intParam(sp, 'n'), intParam(sp, 'w'), country ? String(country).slice(0, 2) : null, device, bot).run().catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(log); else await log;
    return new Response(null, { status: 302, headers: { Location: dest, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer-when-downgrade' } });
  } catch (e) { console.error('news link redirect skipped:', e && e.message); return null; }
}
