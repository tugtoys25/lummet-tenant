// ============================================================
// en/worker/news-feed.js -- RSS 2.0 feeds for the newsroom (all additive, off until switched on)
//
//   /en/news/feed.xml  (also /en/feed.xml)        every live article
//   /en/news/<section>/feed.xml                    one section (needs the sections switch, like the section page)
//   /en/news/(topic|entity|series)/<slug>/feed.xml
//   /en/author/<slug>/feed.xml
//
// Switches (Newsroom > Flags): news_rss_feeds turns the feeds on; news_rss_full_text puts the whole
// article in each item instead of the summary. Only live articles appear (published and not scheduled
// for the future). Every feed is cached for five minutes and carries an ETag for conditional requests.
// ============================================================

import { isNewsFlagEnabled } from './database/newsroom/base.js';
import * as newsroom from './database/newsroom.js';
import { xmlEscape } from './sitemap.js';
import { limitedIds } from './newsroom-membership.js';

const LIMIT = 30;
const cdata = (s) => `<![CDATA[${String(s ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
const rfc822 = (v) => { const d = new Date(String(v || '').includes('T') || /[zZ]$/.test(String(v || '')) ? v : String(v || '').replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString(); };
const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const ARTICLE_COLS = `n.id, n.slug, n.title, n.excerpt, n.published_at, n.created_at, n.updated_at, n.author_id,
  m.url AS featured_image_url, a.name AS author_name`;
const FROM = `FROM news n LEFT JOIN media_library m ON m.id = n.featured_image LEFT JOIN authors a ON a.id = n.author_id`;
const LIVE_SQL = `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;
const ORDER = `ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT ?`;

async function loadScope(db, scope, slug) {
  if (scope === 'all') {
    const r = await db.prepare(`SELECT ${ARTICLE_COLS} ${FROM} WHERE ${LIVE_SQL} ${ORDER}`).bind(LIMIT).all();
    return { title: null, description: null, path: '/en/news', rows: r.results || [] };
  }
  if (scope === 'author') {
    const au = await db.prepare(`SELECT id, name, slug FROM authors WHERE slug = ?`).bind(slug).first();
    if (!au) return null;
    const r = await db.prepare(`SELECT ${ARTICLE_COLS} ${FROM} WHERE n.author_id = ? AND ${LIVE_SQL} ${ORDER}`).bind(au.id, LIMIT).all();
    return { title: `Articles by ${au.name}`, description: `Latest articles by ${au.name}.`, path: `/en/author/${au.slug}`, rows: r.results || [] };
  }
  // The remaining scopes reuse the landing pages' own loaders, so a feed always matches its page.
  const flags = await newsroom.getNewsFlags(db);
  if (!flags.news_new_taxonomy) return null;
  const page = { limit: LIMIT, offset: 0 };
  let meta = null, listing = null, path = '';
  if (scope === 'section') {
    meta = await newsroom.getSectionBySlug(db, slug); if (!meta) return null;
    listing = await newsroom.getSectionArticles(db, await newsroom.getSectionIds(db, meta.id), page); path = `/en/news/${meta.slug}`;
  } else if (scope === 'topic') {
    meta = await newsroom.getTopicBySlug(db, slug); if (!meta) return null;
    listing = await newsroom.getTopicArticles(db, meta.id, page); path = `/en/news/topic/${meta.slug}`;
  } else if (scope === 'entity') {
    meta = await newsroom.getEntityBySlug(db, slug); if (!meta) return null;
    listing = await newsroom.getEntityArticles(db, meta.id, page); path = `/en/news/entity/${meta.slug}`;
  } else if (scope === 'series') {
    meta = await newsroom.getSeriesBySlug(db, slug); if (!meta) return null;
    listing = await newsroom.getSeriesArticles(db, meta.id, page); path = `/en/news/series/${meta.slug}`;
  } else return null;
  return { title: meta.name, description: meta.description || null, path, rows: listing.articles || [] };
}

async function withDetails(db, rows, full) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id), ph = ids.map(() => '?').join(',');
  const extra = new Map();
  const q = await db.prepare(`SELECT n.id, ${full ? 'n.content,' : ''} a.name AS author_name, m.url AS img FROM news n
    LEFT JOIN authors a ON a.id = n.author_id LEFT JOIN media_library m ON m.id = n.featured_image WHERE n.id IN (${ph})`).bind(...ids).all();
  for (const x of q.results || []) extra.set(x.id, x);
  // Members-only and registered-only articles never put their full text in a feed (the summary is still shown).
  const limited = full ? await limitedIds(db, ids) : new Set();
  return rows.map((r) => { const m = { ...r, ...(extra.get(r.id) || {}), featured_image_url: r.featured_image_url || extra.get(r.id)?.img || null }; if (limited.has(r.id)) m.content = null; return m; });
}

async function sha1(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildFeedXml({ origin, siteName, siteDescription, feedPath, scopeTitle, scopeDescription, link, rows, full }) {
  const abs = (u) => (/^https?:\/\//i.test(u) ? u : origin + (String(u).startsWith('/') ? '' : '/') + u);
  const title = scopeTitle ? `${scopeTitle} - ${siteName}` : siteName;
  const items = rows.map((r) => {
    const url = `${origin}/en/news/${encodeURIComponent(r.slug)}`;
    const summary = stripTags(r.excerpt || '') || stripTags(r.content || '').slice(0, 280);
    const img = r.featured_image_url ? abs(r.featured_image_url) : '';
    return [
      '<item>',
      `<title>${xmlEscape(r.title)}</title>`,
      `<link>${xmlEscape(url)}</link>`,
      `<guid isPermaLink="true">${xmlEscape(url)}</guid>`,
      `<pubDate>${rfc822(r.published_at || r.created_at)}</pubDate>`,
      r.author_name ? `<dc:creator>${xmlEscape(r.author_name)}</dc:creator>` : '',
      `<description>${cdata(summary)}</description>`,
      full && r.content ? `<content:encoded>${cdata(r.content)}</content:encoded>` : '',
      img ? `<media:content url="${xmlEscape(img)}" medium="image"/>` : '',
      '</item>'
    ].filter(Boolean).join('');
  }).join('\n');
  const newest = rows[0] ? rfc822(rows[0].updated_at || rows[0].published_at || rows[0].created_at) : new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${xmlEscape(title)}</title>
<link>${xmlEscape(link)}</link>
<description>${xmlEscape(scopeDescription || siteDescription || title)}</description>
<language>en</language>
<lastBuildDate>${newest}</lastBuildDate>
<atom:link href="${xmlEscape(origin + feedPath)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`;
}

export async function handleNewsFeed(request, env, route, { getSite } = {}) {
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  try {
    if (!(await isNewsFlagEnabled(env.DB, 'news_rss_feeds'))) return notFound();
    const data = await loadScope(env.DB, route.scope, route.slug);
    if (!data) return notFound();
    const full = await isNewsFlagEnabled(env.DB, 'news_rss_full_text');
    const rows = await withDetails(env.DB, data.rows, full);
    const site = getSite ? await getSite(request, env) : null;
    const origin = site?.origin || new URL(request.url).origin;
    const feedPath = new URL(request.url).pathname;
    const xml = buildFeedXml({
      origin, siteName: site?.siteName || new URL(origin).host, siteDescription: site?.description || '',
      feedPath, scopeTitle: data.title, scopeDescription: data.description, link: origin + data.path, rows, full
    });
    const etag = `"${await sha1(xml)}"`;
    const headers = { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
    return new Response(xml, { status: 200, headers });
  } catch (e) {
    console.error('news feed failed:', e && e.message);
    return new Response('Feed unavailable', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' } });
  }
}

// Adds <link rel="alternate"> to the news list page so feed readers find the feed. No-op when the switch is off.
export async function withFeedLink(response, request, env) {
  try {
    if (!response || response.status !== 200 || !(await isNewsFlagEnabled(env.DB, 'news_rss_feeds'))) return response;
    const ct = response.headers.get('Content-Type') || '';
    if (!ct.includes('text/html')) return response;
    const html = await response.text();
    const tag = `<link rel="alternate" type="application/rss+xml" title="News feed" href="/en/news/feed.xml">`;
    const out = html.includes('</head>') ? html.replace('</head>', `${tag}\n</head>`) : html;
    return new Response(out, { status: response.status, headers: response.headers });
  } catch (e) { console.error('feed link skipped:', e && e.message); return response; }
}
