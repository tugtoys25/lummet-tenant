// ============================================================
// en/worker/newsroom-import.js -- bring articles in from WordPress (WXR export), any RSS/Atom feed, or a CSV (additive, off by default)
//
//   news_import   turns the Import tab on (Newsroom > Import, needs the manage-settings permission)
//
// Safe by design: every imported article is created as a DRAFT (never published), its HTML is run through the
// site's sanitiser, an address that already exists is skipped (nothing is overwritten), and each run is recorded
// with a mapping of old address -> new address you can download. Images stay as links in the text.
// ============================================================

import { getOpsFlags } from './newsroom-ops.js';
import { createNews } from './database/news.js';
import { sanitizeHtml } from './sanitize/pipeline.js';
import { logAudit } from './database/audit.js';

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ITEMS = 300;
export const FORMATS = ['wordpress', 'rss', 'csv'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const unwrap = (raw) => { const m = String(raw).match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/); return m ? m[1] : decode(raw); };
const esc = (n) => n.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');

function tag(block, name) {
  const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, 'i'));
  return m ? unwrap(m[1]).trim() : '';
}
function allTags(block, name) {
  const out = []; const re = new RegExp(`<${esc(name)}((?:\\s[^>]*)?)>([\\s\\S]*?)</${esc(name)}>`, 'gi'); let m;
  while ((m = re.exec(block))) out.push({ attrs: m[1] || '', text: unwrap(m[2]).trim() });
  return out;
}
const attr = (attrs, name) => { const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')); return m ? decode(m[1]) : ''; };

export function slugify(text) {
  return String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
}
const lastSegment = (url) => { try { const p = new URL(url, 'https://x.invalid').pathname.split('/').filter(Boolean); return slugify(decodeURIComponent(p[p.length - 1] || '')); } catch { return ''; } };
const toIso = (v) => { if (!v) return null; const d = new Date(String(v).includes('T') || /GMT|UTC|[+-]\d{4}$/.test(String(v)) ? v : String(v).replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) || d.getFullYear() < 1990 ? null : d.toISOString().slice(0, 19).replace('T', ' '); };

// ── parsers ──────────────────────────────────────────────────
export function parseFeed(text, format = 'rss') {
  const items = [];
  const blocks = String(text).match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const atom = /^<entry/i.test(b);
    const type = tag(b, 'wp:post_type');
    if (format === 'wordpress' && type && type !== 'post') continue;                    // pages, menus, media
    const link = atom ? attr((b.match(/<link\b[^>]*>/i) || [''])[0], 'href') : tag(b, 'link');
    const tags = atom
      ? (b.match(/<category\b[^>]*>/gi) || []).map((c) => attr(c, 'term')).filter(Boolean)
      : allTags(b, 'category').map((c) => c.text).filter(Boolean);
    const body = tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary');
    const excerpt = tag(b, 'excerpt:encoded') || (tag(b, 'content:encoded') ? tag(b, 'description') : '');
    items.push({
      title: decode(tag(b, 'title')).trim(), slug: tag(b, 'wp:post_name') || '', link, guid: tag(b, 'guid') || tag(b, 'id'),
      content: body, excerpt: excerpt && excerpt !== body ? excerpt : '',
      published_at: toIso(tag(b, 'wp:post_date_gmt') || tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated')),
      author: tag(b, 'dc:creator') || tag(b, 'name'), tags: [...new Set(tags)].slice(0, 20), status: tag(b, 'wp:status') || ''
    });
  }
  return items;
}

export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false; const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((x) => x !== '')) rows.push(row); }
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const ix = { title: col('title'), slug: col('slug'), content: col('content', 'body'), excerpt: col('excerpt', 'summary'), date: col('published_at', 'date'), author: col('author'), tags: col('tags'), link: col('url', 'link', 'source_url') };
  return rows.slice(1).map((r) => ({
    title: (r[ix.title] || '').trim(), slug: (r[ix.slug] || '').trim(), link: (r[ix.link] || '').trim(), guid: '',
    content: r[ix.content] || '', excerpt: (r[ix.excerpt] || '').trim(), published_at: toIso(r[ix.date]),
    author: (r[ix.author] || '').trim(), tags: (r[ix.tags] || '').split(/[;,|]/).map((t) => t.trim()).filter(Boolean).slice(0, 20), status: ''
  }));
}

export function parseSource(format, text) {
  if (!FORMATS.includes(format)) throw new Error('Unknown format');
  if (typeof text !== 'string' || !text.trim()) throw new Error('The file is empty');
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('The file is larger than 2 MB. Split it and import in parts.');
  const items = format === 'csv' ? parseCsv(text) : parseFeed(text, format);
  if (!items.length) throw new Error(format === 'csv' ? 'No rows found. The first row must name the columns (title, content, ...).' : 'No articles found in this file.');
  return items;
}

// ── plan and run ─────────────────────────────────────────────
async function plan(db, items) {
  const taken = new Set(); const out = [];
  for (const it of items.slice(0, MAX_ITEMS)) {
    const title = it.title.slice(0, 300);
    const slug = slugify(it.slug) || lastSegment(it.link) || slugify(title) || '';
    const content = sanitizeHtml(String(it.content || '')).trim();
    let reason = '';
    if (!title) reason = 'no title';
    else if (!slug) reason = 'no usable address (slug)';
    else if (!content) reason = 'no content';
    else if (taken.has(slug)) reason = 'same address twice in this file';
    else if (await db.prepare(`SELECT 1 AS x FROM news WHERE slug = ? UNION SELECT 1 FROM news_redirects WHERE old_slug = ?`).bind(slug, slug).first()) reason = 'address already exists';
    if (!reason) taken.add(slug);
    out.push({ item: it, title, slug, content, reason });
  }
  return { rows: out, cut: Math.max(0, items.length - MAX_ITEMS) };
}

export async function previewImport(env, { format, data }) {
  if (!(await getOpsFlags(env.DB)).news_import) return { ok: false, status: 403, error: 'Import is switched off (Newsroom > Flags)' };
  let items; try { items = parseSource(format, data); } catch (e) { return { ok: false, status: 400, error: e.message }; }
  const p = await plan(env.DB, items);
  const ok = p.rows.filter((r) => !r.reason);
  return { ok: true, status: 200, found: items.length, will_create: ok.length, will_skip: p.rows.length - ok.length, over_limit: p.cut,
    sample: p.rows.slice(0, 12).map((r) => ({ title: r.title, slug: r.slug, skip: r.reason || null })) };
}

export async function runImport(env, { format, data, filename, actor }) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_import) return { ok: false, status: 403, error: 'Import is switched off (Newsroom > Flags)' };
  let items; try { items = parseSource(format, data); } catch (e) { return { ok: false, status: 400, error: e.message }; }
  const p = await plan(db, items);
  const head = await db.prepare(`INSERT INTO news_imports (source_format, filename, created_by) VALUES (?, ?, ?)`).bind(format, String(filename || '').slice(0, 200) || null, actor?.user_id ?? null).run();
  const importId = head?.meta?.last_row_id;
  const authors = (await db.prepare(`SELECT id, name FROM authors`).all().catch(() => ({ results: [] }))).results || [];
  const byName = new Map(authors.map((a) => [String(a.name).trim().toLowerCase(), a.id]));
  let created = 0, skipped = 0;
  for (const r of p.rows) {
    const src = r.item.link || r.item.guid || null;
    if (r.reason) { skipped++; await db.prepare(`INSERT INTO news_import_items (import_id, title, source_url, outcome, reason) VALUES (?, ?, ?, 'skipped', ?)`).bind(importId, r.title || null, src, r.reason).run(); continue; }
    try {
      const res = await createNews(db, {
        slug: r.slug, title: r.title, content: r.content, published: false, published_at: r.item.published_at,
        excerpt: r.item.excerpt ? sanitizeHtml(r.item.excerpt).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) : null,
        tags: r.item.tags.join(', ') || null, author: r.item.author || 'Imported', author_id: byName.get(r.item.author.trim().toLowerCase()) ?? null, created_by: actor?.user_id ?? null
      });
      const newsId = res?.meta?.last_row_id ?? null;
      created++;
      await db.prepare(`INSERT INTO news_import_items (import_id, news_id, title, source_url, new_slug, outcome) VALUES (?, ?, ?, ?, ?, 'created')`).bind(importId, newsId, r.title, src, r.slug).run();
      // The old address's last part keeps working, if it differs from the new one and is free.
      const old = lastSegment(r.item.link);
      if (newsId && old && old !== r.slug) await db.prepare(`INSERT OR IGNORE INTO news_redirects (old_slug, news_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM news WHERE slug = ?)`).bind(old, newsId, old).run();
    } catch (e) {
      skipped++; console.error('import item failed:', e && e.message);
      await db.prepare(`INSERT INTO news_import_items (import_id, title, source_url, outcome, reason) VALUES (?, ?, ?, 'skipped', ?)`).bind(importId, r.title, src, 'could not be saved').run();
    }
  }
  await db.prepare(`UPDATE news_imports SET created_count = ?, skipped_count = ? WHERE id = ?`).bind(created, skipped, importId).run();
  await logAudit(db, { userId: actor?.user_id, action: 'news_imported', entityType: 'news_import', entityId: importId, metadata: { format, created, skipped } });
  return { ok: true, status: 200, import_id: importId, created, skipped, over_limit: p.cut };
}

export async function listImports(db) {
  return (await db.prepare(`SELECT id, source_format, filename, created_count, skipped_count, created_at FROM news_imports ORDER BY id DESC LIMIT 30`).all()).results || [];
}

const cell = (v) => { let s = String(v ?? '').replace(/\r?\n/g, ' '); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function mappingCsv(db, importId, origin = '') {
  const rows = (await db.prepare(`SELECT title, source_url, new_slug, outcome, reason FROM news_import_items WHERE import_id = ? ORDER BY id`).bind(Number(importId) || 0).all()).results || [];
  const lines = ['old_url,new_url,title,result,note'];
  for (const r of rows) lines.push([r.source_url, r.new_slug ? `${origin}/en/news/${r.new_slug}` : '', r.title, r.outcome === 'created' ? 'created as draft' : 'skipped', r.reason || ''].map(cell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
