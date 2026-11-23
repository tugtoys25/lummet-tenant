// ============================================================
// en/worker/newsroom-pro.js -- newsroom pro tools (all additive, all fail-soft)
//
//   * bylines        extra credits (reporter, editor, photographer ...) beside the main author
//   * rich schema    fuller NewsArticle data: real section, co-authors, free access, image sizes
//   * revisions      rebuild an earlier version of an article and restore it (reversible)
//   * calendar       a week of published, scheduled and planned stories
//   * IndexNow       tells search engines about new and corrected articles (off until switched on)
//
// Nothing here changes what an existing article looks like unless an editor adds data for it.
// Every public loader returns an empty result on error so an article page is never lost to an
// optional feature.
// ============================================================

import { checkPermission } from './database/permissions.js';
import { logAudit } from './database/audit.js';
import { plainText, recordRevision, getRevision, TRACKED_FIELDS } from './database/newsroom.js';

// ── bylines ──────────────────────────────────────────────────
export const BYLINE_ROLES = ['co-author', 'reporter', 'editor', 'photographer', 'illustrator', 'translator', 'contributor'];
const AUTHOR_LIKE = new Set(['co-author', 'reporter', 'contributor']);   // listed as authors in structured data
const MAX_BYLINES = 12;

export async function listBylines(db, newsId) {
  const r = await db.prepare(`
    SELECT b.author_id, b.role, b.display_order, a.name, a.slug, a.avatar_url
    FROM news_article_bylines b JOIN authors a ON a.id = b.author_id
    WHERE b.news_id = ? ORDER BY b.display_order, b.rowid`).bind(newsId).all();
  return r.results || [];
}

export async function getPublicBylines(db, newsId) {
  try { return await listBylines(db, newsId); } catch (e) { console.error('bylines failed:', e.message); return []; }
}

// Replaces the whole list. Everything is validated before the first write.
export async function saveBylines(db, { newsId, items, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return { ok: false, status: 403, error: 'forbidden' };
  if (!Array.isArray(items) || items.length > MAX_BYLINES) return { ok: false, status: 400, error: `bylines must be a list of at most ${MAX_BYLINES}` };
  const clean = [], seen = new Set();
  for (const [i, it] of items.entries()) {
    const authorId = Number(it?.author_id);
    if (!Number.isInteger(authorId) || authorId <= 0) return { ok: false, status: 400, error: `byline ${i + 1}: invalid author` };
    if (seen.has(authorId)) return { ok: false, status: 400, error: `byline ${i + 1}: the same person is listed twice` };
    seen.add(authorId);
    const role = String(it?.role || 'co-author');
    if (!BYLINE_ROLES.includes(role)) return { ok: false, status: 400, error: `byline ${i + 1}: unknown role` };
    clean.push({ authorId, role, order: i });
  }
  if (clean.length) {
    const ph = clean.map(() => '?').join(',');
    const r = await db.prepare(`SELECT COUNT(*) AS c FROM authors WHERE id IN (${ph})`).bind(...clean.map((c) => c.authorId)).first();
    if (r.c !== clean.length) return { ok: false, status: 400, error: 'unknown author' };
  }
  await db.prepare(`DELETE FROM news_article_bylines WHERE news_id = ?`).bind(newsId).run();
  for (const c of clean) {
    await db.prepare(`INSERT INTO news_article_bylines (news_id, author_id, role, display_order) VALUES (?, ?, ?, ?)`).bind(newsId, c.authorId, c.role, c.order).run();
  }
  await logAudit(db, { userId: actor?.user_id, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { bylines: clean.length } });
  return { ok: true, count: clean.length };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const roleLabel = (r) => ({ 'co-author': 'With', reporter: 'Reporting', editor: 'Edited by', photographer: 'Photography', illustrator: 'Illustration', translator: 'Translation', contributor: 'Contributor' }[r] || r);

// One short line under the main author. Empty string when there are no extra credits.
export function renderBylinesHtml(bylines) {
  if (!bylines?.length) return '';
  const items = bylines.map((b) => {
    const name = b.slug ? `<a href="/en/author/${esc(encodeURIComponent(b.slug))}" style="text-decoration:none;font-weight:600">${esc(b.name)}</a>` : `<strong>${esc(b.name)}</strong>`;
    return `<span class="news-byline-extra" data-role="${esc(b.role)}">${esc(roleLabel(b.role))}: ${name}</span>`;
  });
  return `<div class="news-bylines" style="margin-top:8px;font-size:13px;color:var(--gray);display:flex;gap:6px 14px;flex-wrap:wrap">${items.join('')}</div>`;
}

// ── rich NewsArticle data ────────────────────────────────────
// Returns only the fields to merge into the existing schema object. It never removes a field.
export function buildRichSchema({ article, base, bylines = [], section = null, siteUrl = (p) => p, images = [] }) {
  const out = { isAccessibleForFree: true };
  const person = (b) => ({ '@type': 'Person', name: b.name, ...(b.slug ? { url: siteUrl(`/en/author/${b.slug}`) } : {}), ...(b.avatar_url ? { image: b.avatar_url } : {}) });

  const extraAuthors = bylines.filter((b) => AUTHOR_LIKE.has(b.role));
  if (extraAuthors.length) {
    const first = base?.author && base.author.name ? [base.author] : [];
    const names = new Set(first.map((a) => a.name));
    out.author = [...first, ...extraAuthors.filter((b) => !names.has(b.name)).map(person)];
    if (out.author.length === 1) out.author = out.author[0];
  }
  const editors = bylines.filter((b) => b.role === 'editor');
  if (editors.length) out.editor = editors.length === 1 ? person(editors[0]) : editors.map(person);
  const contributors = bylines.filter((b) => ['photographer', 'illustrator', 'translator'].includes(b.role));
  if (contributors.length) out.contributor = contributors.map(person);

  if (section?.name) out.articleSection = section.name;

  const imgs = images.filter((i) => i && i.url).map((i) => ({
    '@type': 'ImageObject', url: i.url,
    ...(Number.isInteger(i.width) && i.width > 0 ? { width: i.width } : {}),
    ...(Number.isInteger(i.height) && i.height > 0 ? { height: i.height } : {}),
    ...(i.caption ? { caption: i.caption } : {})
  }));
  if (imgs.length) { out.image = imgs; out.thumbnailUrl = imgs[0].url; }
  if (article?.tags && !base?.keywords) out.keywords = article.tags;
  return out;
}

// ── revisions: rebuild, diff, restore ────────────────────────
// Fields a restore may change. The address (slug) and publication state are never touched.
export const RESTORABLE_FIELDS = ['title', 'excerpt', 'content', 'author_id', 'article_type', 'section_id', 'primary_country',
  'region_slug', 'content_class', 'labels', 'methodology', 'featured_image', 'og_image', 'seo_title', 'seo_description']
  .filter((f) => TRACKED_FIELDS.includes(f));

const sqlList = (rows) => rows;
async function allRevisions(db, newsId) {
  const r = await db.prepare(`SELECT version_number, changed_fields, previous_values, new_values, changed_at FROM news_revisions WHERE news_id = ? ORDER BY version_number DESC`).bind(newsId).all();
  return sqlList(r.results || []).map((x) => ({ v: x.version_number, at: x.changed_at, prev: parse(x.previous_values), next: parse(x.new_values), changed: parse(x.changed_fields, []) }));
}
function parse(s, f = {}) { try { return s ? JSON.parse(s) : f; } catch { return f; } }

// State of the article right AFTER version `version` (0 = before the first recorded edit).
// Starts from the live row and undoes later edits newest-first. `drift` is true when the live row
// no longer matches what the newest revision recorded, i.e. something changed outside the history.
export async function reconstructVersion(db, newsId, version) {
  const live = await db.prepare(`SELECT ${TRACKED_FIELDS.join(', ')} FROM news WHERE id = ?`).bind(newsId).first();   // columns from a fixed constant
  if (!live) return null;
  const revs = await allRevisions(db, newsId);
  if (version !== 0 && !revs.some((r) => r.v === version)) return null;
  const state = { ...live };
  let drift = false;
  const newest = revs[0];
  if (newest) {
    for (const f of newest.changed) {
      const nv = newest.next[f];
      if (nv && typeof nv === 'object' && 'length' in nv) { if (String(live[f] ?? '').length !== nv.length) drift = true; }
      else if (String(live[f] ?? '') !== String(nv ?? '')) drift = true;
    }
  }
  for (const r of revs) {
    if (r.v <= version) break;
    for (const f of r.changed) if (f in r.prev) state[f] = r.prev[f];
  }
  return { live, state, drift, revisions: revs.length };
}

export async function diffForRevision(db, newsId, version, perms) {
  if (!checkPermission(perms, 'news', 'read')) return null;
  const rec = await reconstructVersion(db, newsId, version);
  if (!rec) return null;
  const pick = (o) => Object.fromEntries(RESTORABLE_FIELDS.map((f) => [f, o[f] ?? null]));
  const changed = RESTORABLE_FIELDS.filter((f) => String(rec.state[f] ?? '') !== String(rec.live[f] ?? ''));
  return { version, drift: rec.drift, changed, version_values: pick(rec.state), current_values: pick(rec.live) };
}

export async function restoreVersion(db, { newsId, version, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return { ok: false, status: 403, error: 'forbidden' };
  const v = Number(version);
  if (!Number.isInteger(v) || v < 0) return { ok: false, status: 400, error: 'invalid version' };
  const rec = await reconstructVersion(db, newsId, v);
  if (!rec) return { ok: false, status: 404, error: 'version not found' };
  const changed = RESTORABLE_FIELDS.filter((f) => String(rec.state[f] ?? '') !== String(rec.live[f] ?? ''));
  if (!changed.length) return { ok: true, changed: [], revision: null };
  if (changed.includes('title') && !String(rec.state.title || '').trim()) return { ok: false, status: 409, error: 'that version has no title' };
  if (changed.includes('content') && !String(rec.state.content || '').trim()) return { ok: false, status: 409, error: 'that version has no content' };
  const sets = changed.map((f) => `${f} = ?`).join(', ');   // column names come from RESTORABLE_FIELDS only
  await db.prepare(`UPDATE news SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...changed.map((f) => rec.state[f] ?? null), newsId).run();
  const after = await db.prepare(`SELECT ${TRACKED_FIELDS.join(', ')} FROM news WHERE id = ?`).bind(newsId).first();
  // The restore is itself a revision, so it can be undone the same way.
  const revision = await recordRevision(db, { newsId, changedBy: actor?.user_id ?? null, before: rec.live, after, summary: `Restored version ${v}` });
  await logAudit(db, { userId: actor?.user_id, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { restored_version: v, revision } });
  return { ok: true, changed, revision, drift: rec.drift };
}

// ── calendar ─────────────────────────────────────────────────
const SQL_DATE = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

export async function loadCalendar(db, { from, days = 7, condition = '', params = [] } = {}) {
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const n = Math.min(Math.max(Number(days) || 7, 1), 31);
  const end = new Date(start.getTime() + n * 86400e3);
  const access = condition ? ` AND (${condition})` : '';
  const cols = `n.id, n.slug, n.title, n.published, n.published_at, n.article_type, e.workflow_status, e.assigned_to`;
  const dated = await db.prepare(`
    SELECT ${cols} FROM news n LEFT JOIN news_editorial e ON e.news_id = n.id
    WHERE n.published_at IS NOT NULL AND datetime(n.published_at) >= datetime(?) AND datetime(n.published_at) < datetime(?)${access}
    ORDER BY datetime(n.published_at), n.id LIMIT 300`).bind(SQL_DATE(start), SQL_DATE(end), ...params).all();
  const planned = await db.prepare(`
    SELECT ${cols} FROM news n LEFT JOIN news_editorial e ON e.news_id = n.id
    WHERE n.published_at IS NULL AND n.published = 0${access}
    ORDER BY n.updated_at DESC LIMIT 40`).bind(...params).all();
  const nowMs = Date.now();
  const label = (r) => {
    if (r.workflow_status === 'scheduled' || (r.published === 1 && Date.parse(String(r.published_at).replace(' ', 'T') + 'Z') > nowMs)) return 'scheduled';
    return r.published === 1 ? 'published' : (r.workflow_status || 'draft');
  };
  return {
    from: start.toISOString().slice(0, 10), days: n,
    items: (dated.results || []).map((r) => ({ ...r, state: label(r) })),
    unscheduled: (planned.results || []).map((r) => ({ ...r, state: label(r) }))
  };
}

// ── IndexNow ─────────────────────────────────────────────────
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

export async function indexNowEnabled(db) {
  try { const r = await db.prepare(`SELECT value FROM system_settings WHERE key = 'news_indexnow'`).first(); return !!r && String(r.value).toLowerCase() === 'true'; }
  catch { return false; }
}

export async function getIndexNowKey(db, { create = false } = {}) {
  const r = await db.prepare(`SELECT value FROM system_settings WHERE key = 'indexnow_key'`).first();
  if (r && /^[a-f0-9]{32}$/.test(r.value)) return r.value;
  if (!create) return null;
  const key = hex(16);
  await db.prepare(`INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('indexnow_key', ?, CURRENT_TIMESTAMP)`).bind(key).run();
  const again = await db.prepare(`SELECT value FROM system_settings WHERE key = 'indexnow_key'`).first();
  return again?.value || key;
}

export function originFrom(env, request) {
  try { if (request) return new URL(request.url).origin; } catch { /* fall through */ }
  try { if (env?.SITE_URL) return new URL(env.SITE_URL).origin; } catch { /* none */ }
  return null;
}

// Sends the given /en/... paths. Never throws. Returns { ok, sent, skipped?, status? }.
export async function pingIndexNow(env, { origin, paths, newsId = null, reason = 'updated', fetchImpl = fetch, now = Date.now() }) {
  const db = env.DB;
  try {
    if (!(await indexNowEnabled(db))) return { ok: true, sent: 0, skipped: 'off' };
    if (!origin) return { ok: false, sent: 0, skipped: 'no site address (set SITE_URL for background jobs)' };
    const list = [...new Set((paths || []).filter((p) => typeof p === 'string' && p.startsWith('/en/')))].slice(0, 50);
    if (!list.length) return { ok: true, sent: 0, skipped: 'nothing to send' };
    const host = new URL(origin).host;
    if (/^(localhost|127\.|\[::1\])/.test(host) || !host.includes('.')) return { ok: true, sent: 0, skipped: 'not a public host' };
    if (newsId != null) {   // one submission per article and reason every five minutes
      const last = await db.prepare(`SELECT created_at FROM news_index_pings WHERE news_id = ? AND reason = ? AND status = 'sent' ORDER BY id DESC LIMIT 1`).bind(newsId, reason).first();
      if (last && now - Date.parse(String(last.created_at).replace(' ', 'T') + 'Z') < 5 * 60e3) return { ok: true, sent: 0, skipped: 'sent recently' };
    }
    const key = await getIndexNowKey(db, { create: true });
    const urls = list.map((p) => origin + p);
    let status = 'failed', http = null;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, signal: ctl.signal,
        body: JSON.stringify({ host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls })
      });
      clearTimeout(t);
      http = res.status; status = res.status >= 200 && res.status < 300 ? 'sent' : 'failed';
    } catch (e) { console.error('indexnow failed:', e && e.message); }
    for (const u of urls) {
      await db.prepare(`INSERT INTO news_index_pings (news_id, url, reason, status, http_status) VALUES (?, ?, ?, ?, ?)`).bind(newsId, u, plainText(reason, 40), status, http).run();
    }
    return { ok: status === 'sent', sent: status === 'sent' ? urls.length : 0, status: http };
  } catch (e) {
    console.error('indexnow error (ignored):', e && e.message);
    return { ok: false, sent: 0, skipped: 'error' };
  }
}

// Pings one article if it is live right now. Used by the save, publish and correction paths.
export async function pingArticleById(env, request, newsId, reason) {
  try {
    if (!(await indexNowEnabled(env.DB))) return null;
    const row = await env.DB.prepare(`SELECT slug FROM news WHERE id = ? AND published = 1 AND (published_at IS NULL OR datetime(published_at) <= datetime('now'))`).bind(newsId).first();
    if (!row) return null;
    return await pingIndexNow(env, { origin: originFrom(env, request), paths: [`/en/news/${row.slug}`], newsId, reason });
  } catch (e) { console.error('indexnow ping skipped:', e && e.message); return null; }
}

export async function pingArticleBySlug(env, request, slug, reason) {
  try {
    if (!(await indexNowEnabled(env.DB))) return null;
    const row = await env.DB.prepare(`SELECT id FROM news WHERE slug = ?`).bind(slug).first();
    return row ? await pingArticleById(env, request, row.id, reason) : null;
  } catch { return null; }
}

// Background job: tell search engines about articles that went live (for example on a schedule)
// in the last three days and have never been sent.
export async function runNewsIndexPings(env, { fetchImpl = fetch } = {}) {
  try {
    if (!(await indexNowEnabled(env.DB))) return { skipped: true, reason: 'news_indexnow is off' };
    const r = await env.DB.prepare(`
      SELECT n.id, n.slug FROM news n
      WHERE n.published = 1 AND n.published_at IS NOT NULL
        AND datetime(n.published_at) <= datetime('now') AND datetime(n.published_at) >= datetime('now', '-3 days')
        AND NOT EXISTS (SELECT 1 FROM news_index_pings p WHERE p.news_id = n.id AND p.status = 'sent')
      ORDER BY n.published_at LIMIT 20`).all();
    const rows = r.results || [];
    if (!rows.length) return { skipped: false, sent: 0 };
    const res = await pingIndexNow(env, { origin: originFrom(env, null), paths: rows.map((x) => `/en/news/${x.slug}`), newsId: null, reason: 'went-live', fetchImpl });
    if (res.ok && res.sent) {   // newsId was null for the batch; mark each article so it is not sent again
      for (const x of rows) await env.DB.prepare(`UPDATE news_index_pings SET news_id = ? WHERE news_id IS NULL AND url LIKE ? AND reason = 'went-live'`).bind(x.id, `%/en/news/${x.slug}`).run();
    }
    return res;
  } catch (e) { console.error('news index pings failed:', e && e.message); return { skipped: true, reason: 'error' }; }
}

export async function recentPings(db, newsId = null, limit = 20) {
  const r = newsId
    ? await db.prepare(`SELECT url, reason, status, http_status, created_at FROM news_index_pings WHERE news_id = ? ORDER BY id DESC LIMIT ?`).bind(newsId, limit).all()
    : await db.prepare(`SELECT url, reason, status, http_status, created_at FROM news_index_pings ORDER BY id DESC LIMIT ?`).bind(limit).all();
  return r.results || [];
}
