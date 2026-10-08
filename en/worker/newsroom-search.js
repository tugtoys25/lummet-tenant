// ============================================================
// en/worker/newsroom-search.js  --  Stage K: news search
//
// A small application-maintained inverted index (news_search_terms) replaces
// `LIKE '%q%'` over article bodies. Query cost = one index seek per word.
//
// Semantics: every query word must match (AND); the LAST word also matches as
// a prefix ("regul" finds "regulation") so search-as-you-type works. Ranking =
// sum of the matched terms' weights (title 10 > entities/topics 4 = tags 4 >
// section 3 = excerpt 3 > body 1) then newest first. No stemming, no phrases.
//
// Safety: query text becomes bound parameters made only of [a-z0-9]; filters are
// resolved to ids/codes first (unknown value => empty result, not an error);
// the public path ALWAYS applies the live filter, so a stale index can never
// reveal a draft or scheduled article.
// ============================================================

import { getAccessibleWhereClause } from './database/item-access.js';
import { getCountryBySlug, getCountryByCode, ARTICLE_TYPES } from './database/newsroom.js';
import { getCached, setCached } from './cache.js';

// Short function words are stop words too, EXCEPT ones that are meaningful in this domain ("us", "it", "no", "uk", "eu").
const STOP = new Set(['of', 'to', 'in', 'is', 'on', 'at', 'as', 'be', 'by', 'or', 'an', 'if', 'so', 'up', 'we', 'he', 'me', 'my', 'do', 'go', 'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'that', 'this', 'with', 'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about', 'which', 'when', 'your', 'into', 'than', 'then', 'them', 'been', 'were', 'its', 'also', 'more', 'other', 'some', 'such', 'only', 'over', 'just']);
const W = { title: 10, entity: 4, topic: 4, tags: 4, section: 3, excerpt: 3, body: 1 };
const MAX_BODY_TERMS = 150;
export const MAX_QUERY_TERMS = 8;
export const PAGE_SIZE = 12;

const LIVE = `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;

// ── tokenizing ───────────────────────────────────────────────
export function tokenize(text, { keepStop = false } = {}) {
  const words = String(text ?? '').replace(/<[^>]*>/g, ' ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ');
  return words.filter((w) => w.length >= 2 && w.length <= 40 && (keepStop || !STOP.has(w)));
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') + str.length.toString(16);
}

// term -> weight for one article
export function buildTerms({ title, excerpt, tags, content, section, entities = [], topics = [] }) {
  const terms = new Map();
  const add = (words, weight) => { for (const w of words) { if ((terms.get(w) || 0) < weight) terms.set(w, weight); } };
  const body = new Map();
  for (const w of tokenize(content)) body.set(w, (body.get(w) || 0) + 1);
  const topBody = [...body.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_BODY_TERMS).map((e) => e[0]);
  add(topBody, W.body);
  add(tokenize(excerpt), W.excerpt); add(tokenize(section), W.section);
  add(tokenize(tags), W.tags);
  for (const e of entities) add(tokenize(e), W.entity);
  for (const t of topics) add(tokenize(t), W.topic);
  add(tokenize(title), W.title);
  return terms;
}

async function run(db, stmts) {
  if (typeof db.batch === 'function') return db.batch(stmts);
  for (const s of stmts) await s.run();
}

// ── indexing ─────────────────────────────────────────────────
export async function reindexArticle(db, id, { force = false } = {}) {
  try {
    const a = await db.prepare(`SELECT n.id, n.title, n.excerpt, n.tags, n.content, s.name AS section FROM news n LEFT JOIN news_sections s ON s.id = n.section_id WHERE n.id = ?`).bind(id).first();
    if (!a) return { ok: false, reason: 'not found' };
    const [ents, tops] = await Promise.all([
      db.prepare(`SELECT e.name FROM news_article_entities x JOIN news_entities e ON e.id = x.entity_id WHERE x.news_id = ?`).bind(id).all().then((r) => r.results.map((x) => x.name)).catch(() => []),
      db.prepare(`SELECT t.name FROM news_article_topics x JOIN news_topics t ON t.id = x.topic_id WHERE x.news_id = ?`).bind(id).all().then((r) => r.results.map((x) => x.name)).catch(() => [])
    ]);
    const source = [a.title, a.excerpt, a.tags, a.content, a.section, ents.join('|'), tops.join('|')].map((x) => x ?? '').join('\u0001');
    const hash = fnv1a(source);
    if (!force) {
      const cur = await db.prepare(`SELECT content_hash FROM news_search_docs WHERE news_id = ?`).bind(id).first();
      if (cur && cur.content_hash === hash) return { ok: true, skipped: true };
    }
    const terms = [...buildTerms({ ...a, entities: ents, topics: tops }).entries()];
    const stmts = [db.prepare(`DELETE FROM news_search_terms WHERE news_id = ?`).bind(id)];
    for (let i = 0; i < terms.length; i += 30) {            // D1 allows 100 bound parameters per statement: 30 rows x 3
      const chunk = terms.slice(i, i + 30);
      stmts.push(db.prepare(`INSERT OR REPLACE INTO news_search_terms (term, news_id, weight) VALUES ${chunk.map(() => '(?, ?, ?)').join(', ')}`).bind(...chunk.flatMap(([t, w]) => [t, id, w])));
    }
    stmts.push(db.prepare(`INSERT INTO news_search_docs (news_id, content_hash, indexed_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(news_id) DO UPDATE SET content_hash = excluded.content_hash, indexed_at = CURRENT_TIMESTAMP`).bind(id, hash));
    await run(db, stmts);
    return { ok: true, terms: terms.length };
  } catch (e) {
    console.error('news search reindex failed:', id, e.message);
    return { ok: false, reason: 'error' };
  }
}

export async function reindexBySlug(db, slug) {
  try {
    const a = await db.prepare(`SELECT id FROM news WHERE slug = ?`).bind(slug).first();
    return a ? reindexArticle(db, a.id) : { ok: false, reason: 'not found' };
  } catch (e) { console.error('news search reindex (slug) failed:', e.message); return { ok: false, reason: 'error' }; }
}

// Backfill / repair in bounded steps: call repeatedly with the returned cursor.
export async function reindexBatch(db, { cursor = 0, limit = 25, force = false } = {}) {
  const rows = (await db.prepare(`SELECT id FROM news WHERE id > ? ORDER BY id LIMIT ?`).bind(cursor, Math.min(Math.max(limit, 1), 100)).all()).results || [];
  let indexed = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    const x = await reindexArticle(db, r.id, { force });
    if (!x.ok) failed++; else if (x.skipped) skipped++; else indexed++;
  }
  const next = rows.length ? rows[rows.length - 1].id : cursor;
  const more = rows.length ? (await db.prepare(`SELECT COUNT(*) AS c FROM news WHERE id > ?`).bind(next).first()).c : 0;
  return { processed: rows.length, indexed, skipped, failed, cursor: next, remaining: more };
}

export async function indexStatus(db) {
  const [a, b, c] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM news`).first(), db.prepare(`SELECT COUNT(*) AS c FROM news_search_docs`).first(),
    db.prepare(`SELECT COUNT(*) AS c FROM news_search_terms`).first()
  ]);
  return { articles: a.c, indexed_articles: b.c, terms: c.c, complete: b.c >= a.c };
}

// ── searching ────────────────────────────────────────────────
const prefixRange = (p) => [p, p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1)];
const validDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d)) ? d : null);

export function parseSearchParams(searchParams) {
  const get = (k, max = 100) => { const v = (searchParams.get(k) || '').trim(); return v ? v.slice(0, max) : ''; };
  const page = searchParams.get('page') === null ? 1 : Number(searchParams.get('page'));
  return { q: get('q', 200), section: get('section', 80), author: get('author', 80), country: get('country', 80), entity: get('entity', 80),
    type: get('type', 30), from: get('from', 10), to: get('to', 10), status: get('status', 20), workflow: get('workflow', 30), page };
}
export const hasSearchFilters = (p) => !!(p.q || p.section || p.author || p.country || p.entity || p.type || p.from || p.to);

// Resolve slugs to ids. `invalid` lists filters that matched nothing => the result is empty.
async function resolveFilters(db, p) {
  const invalid = []; const f = {};
  if (p.section) { const s = await db.prepare(`SELECT id FROM news_sections WHERE slug = ? AND active = 1`).bind(p.section).first(); if (!s) invalid.push('section'); else f.sectionIds = [s.id, ...((await db.prepare(`SELECT id FROM news_sections WHERE parent_id = ? AND active = 1`).bind(s.id).all()).results || []).map((x) => x.id)]; }
  if (p.author) { const a = await db.prepare(`SELECT id FROM authors WHERE slug = ?`).bind(p.author).first(); if (!a) invalid.push('author'); else f.authorId = a.id; }
  if (p.country) { const c = await getCountryBySlug(db, p.country); if (!c) invalid.push('country'); else f.country = c.code; }
  if (p.entity) { const e = await db.prepare(`SELECT id FROM news_entities WHERE slug = ? AND active = 1`).bind(p.entity).first(); if (!e) invalid.push('entity'); else f.entityId = e.id; }
  if (p.type) { if (!ARTICLE_TYPES.includes(p.type)) invalid.push('type'); else f.type = p.type; }
  if (p.from) { const d = validDate(p.from); if (!d) invalid.push('from'); else f.from = d; }
  if (p.to) { const d = validDate(p.to); if (!d) invalid.push('to'); else f.to = d; }
  return { f, invalid };
}

// mode: 'public' (live only, no drafts) | 'admin' (all states, item-access scoped, status filters)
export async function searchNews(db, params, { mode = 'public', user = null, pageSize = PAGE_SIZE } = {}) {
  const p = params;
  const { f, invalid } = await resolveFilters(db, p);
  const tokens = tokenize(p.q).slice(0, MAX_QUERY_TERMS);
  const emptyQuery = !!p.q && tokens.length === 0;              // only stop words / symbols: nothing can match
  const page = Number.isInteger(p.page) && p.page >= 1 && p.page <= 500 ? p.page : null;
  const base = { page: page || 1, page_size: pageSize, tokens, invalid_filters: invalid };
  if (page === null) return { ok: false, status: 404, error: 'invalid page' };
  if (invalid.length || emptyQuery) return { ok: true, ...base, articles: [], total: 0 };

  const where = [], params_ = [];
  where.push(mode === 'public' ? LIVE : '1 = 1');
  if (mode === 'admin') {
    if (p.status === 'draft') where.push(`n.published = 0`);
    else if (p.status === 'scheduled') where.push(`n.published = 1 AND n.published_at IS NOT NULL AND datetime(n.published_at) > datetime('now')`);
    else if (p.status === 'published') where.push(LIVE);
    if (p.workflow) { where.push(`n.id IN (SELECT news_id FROM news_editorial WHERE workflow_status = ?)`); params_.push(p.workflow); }
    const scope = await getAccessibleWhereClause(db, user, 'news', 'read', 'n');
    if (scope.condition) { where.push(scope.condition); params_.push(...scope.params); }
  }
  let scoreSql = '0', scoreParams = [];
  if (tokens.length) {
    const exact = tokens.slice(0, -1), last = tokens[tokens.length - 1];
    for (const t of exact) { where.push(`n.id IN (SELECT news_id FROM news_search_terms WHERE term = ?)`); params_.push(t); }
    const [lo, hi] = prefixRange(last);
    where.push(`n.id IN (SELECT news_id FROM news_search_terms WHERE term >= ? AND term < ?)`); params_.push(lo, hi);
    scoreSql = `(SELECT COALESCE(SUM(t.weight), 0) FROM news_search_terms t WHERE t.news_id = n.id AND (t.term IN (${[...exact, '_'].map(() => '?').join(',')}) OR (t.term >= ? AND t.term < ?)))`;
    scoreParams = [...exact, last, lo, hi];
  }
  if (f.sectionIds) { where.push(`n.section_id IN (${f.sectionIds.map(() => '?').join(',')})`); params_.push(...f.sectionIds); }
  if (f.authorId) { where.push(`n.author_id = ?`); params_.push(f.authorId); }
  if (f.country) { where.push(`(n.primary_country = ? OR n.id IN (SELECT news_id FROM news_article_countries WHERE country_code = ?))`); params_.push(f.country, f.country); }
  if (f.entityId) { where.push(`n.id IN (SELECT news_id FROM news_article_entities WHERE entity_id = ?)`); params_.push(f.entityId); }
  if (f.type) { where.push(`COALESCE(n.article_type, 'news') = ?`); params_.push(f.type); }
  if (f.from) { where.push(`date(COALESCE(n.published_at, n.created_at)) >= ?`); params_.push(f.from); }
  if (f.to) { where.push(`date(COALESCE(n.published_at, n.created_at)) <= ?`); params_.push(f.to); }

  const w = where.join(' AND ');
  // internal workflow state is selected ONLY in admin mode
  const adminCol = mode === 'admin' ? ', ed.workflow_status AS workflow_status' : '';
  const adminJoin = mode === 'admin' ? 'LEFT JOIN news_editorial ed ON ed.news_id = n.id' : '';
  const [rows, total] = await Promise.all([
    db.prepare(`
      SELECT n.id, n.slug, n.title, n.excerpt, n.published, n.published_at, n.created_at, n.article_type, n.content_class, n.labels,
             m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail, m.alt_text AS featured_image_alt,
             a.name AS author_name, ${scoreSql} AS score${adminCol}
      FROM news n LEFT JOIN media_library m ON m.id = n.featured_image LEFT JOIN authors a ON a.id = n.author_id ${adminJoin}
      WHERE ${w} ORDER BY score DESC, COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT ? OFFSET ?`)
      .bind(...scoreParams, ...params_, pageSize, (base.page - 1) * pageSize).all(),
    db.prepare(`SELECT COUNT(*) AS c FROM news n WHERE ${w}`).bind(...params_).first()
  ]);
  return { ok: true, ...base, articles: rows.results || [], total: total?.c || 0 };
}

// ── facets for the public search form (cached 10 min) ────────
export async function getSearchFacets(db, env, { entityPages = false } = {}) {
  const key = `news:search:facets:${entityPages ? 1 : 0}`;
  const hit = await getCached(env, key); if (hit) return hit;
  const soft = (p) => p.then((r) => r.results || []).catch(() => []);
  const [sections, authors, types, countries, entities] = await Promise.all([
    soft(db.prepare(`SELECT s.slug, s.name FROM news_sections s WHERE s.active = 1 AND EXISTS (SELECT 1 FROM news n WHERE n.section_id = s.id AND ${LIVE}) ORDER BY s.display_order, s.name`).all()),
    soft(db.prepare(`SELECT a.slug, a.name FROM authors a WHERE COALESCE(a.published, 1) = 1 AND EXISTS (SELECT 1 FROM news n WHERE n.author_id = a.id AND ${LIVE}) ORDER BY a.name`).all()),
    soft(db.prepare(`SELECT DISTINCT COALESCE(n.article_type, 'news') AS type FROM news n WHERE ${LIVE} ORDER BY type`).all()),
    soft(db.prepare(`SELECT n.primary_country AS code, COUNT(*) AS c FROM news n WHERE n.primary_country IS NOT NULL AND ${LIVE} GROUP BY n.primary_country ORDER BY c DESC LIMIT 40`).all()),
    entityPages ? soft(db.prepare(`SELECT e.slug, e.name FROM news_entities e WHERE e.active = 1 AND EXISTS (SELECT 1 FROM news_article_entities x JOIN news n ON n.id = x.news_id WHERE x.entity_id = e.id AND ${LIVE}) ORDER BY e.name LIMIT 100`).all()) : Promise.resolve([])
  ]);
  const countryOptions = [];
  for (const c of countries) { const x = await getCountryByCode(db, c.code).catch(() => null); if (x) countryOptions.push({ slug: x.canonical, name: x.name }); }
  countryOptions.sort((a, b) => a.name.localeCompare(b.name));
  const facets = { sections, authors, types: types.map((t) => t.type), countries: countryOptions, entities };
  await setCached(env, key, facets, 600);
  return facets;
}
