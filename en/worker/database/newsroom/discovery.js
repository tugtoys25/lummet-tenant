import { logAudit } from '../audit.js';
import { checkPermission } from '../permissions.js';
import { LIVE, slugify } from "./base.js";

// ============================================================
// Stage H: slug redirects, region/country/topic/entity/series collections
// ============================================================

// Remember an article's previous slug so the old URL 301s to the new one.
// Never throws: it runs after the save has already succeeded.
export async function recordSlugRedirect(db, { oldSlug, newSlug }) {
  try {
    if (!oldSlug || !newSlug || oldSlug === newSlug) return false;
    const art = await db.prepare(`SELECT id FROM news WHERE slug = ?`).bind(newSlug).first();
    if (!art) return false;
    await db.prepare(`INSERT OR REPLACE INTO news_redirects (old_slug, news_id) VALUES (?, ?)`).bind(oldSlug, art.id).run();
    await db.prepare(`DELETE FROM news_redirects WHERE old_slug = ?`).bind(newSlug).run();   // renamed back: the article's own slug wins
    return true;
  } catch (e) {
    console.error('slug redirect not recorded:', e.message);
    return false;
  }
}

// Current slug of a LIVE article that used to have `slug`, else null.
export async function getRedirectTarget(db, slug) {
  const r = await db.prepare(`
    SELECT n.slug FROM news_redirects r JOIN news n ON n.id = r.news_id
    WHERE r.old_slug = ? AND ${LIVE} LIMIT 1`).bind(slug).first();
  return r?.slug && r.slug !== slug ? r.slug : null;
}

// ── geography ────────────────────────────────────────────────
export async function getRegionBySlug(db, slug) {
  return await db.prepare(`SELECT slug, name FROM news_regions WHERE slug = ? AND active = 1`).bind(slug).first();
}

// The existing `countries` table has no slug column (and its `name` is editor-typed:
// production has "UK" for GB). The CANONICAL news slug is derived from the standard
// English region name for the ISO code (Intl.DisplayNames -> "united-kingdom"), falling
// back to the table's name. The table's own name-slug and the lowercase ISO code
// ("uk", "gb"; the code is also what /en/country/<code> uses) are ALIASES that the
// route 301s to the canonical URL, so there is exactly one indexable URL per country.
// Only published countries.
// The slug -> country map is cached per DB handle for 60 s: every unknown /en/news/<x>
// URL (bots probe many) reaches this lookup, and countries change rarely.
let countryCache = new WeakMap();

export function resetCountryCache() { countryCache = new WeakMap(); }

async function countryIndex(db, now = Date.now()) {
  let hit = countryCache.get(db);
  if (!hit || now - hit.at > 60000) {
    const r = (await db.prepare(`SELECT code, name, seo_title, seo_description, robots FROM countries WHERE COALESCE(published, 1) = 1`).all()).results || [];
    let names = null;
    try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* runtime without Intl.DisplayNames: table names are used */ }
    const map = new Map();
    const canon = (c) => { let n = null; try { n = names?.of(c.code); } catch { /* invalid region code */ } return slugify(n && n !== c.code && !/unknown/i.test(n) ? n : c.name); };
    const list = r.map((c) => ({ ...c, canonical: canon(c) }));
    const byCode = new Map(list.map((c) => [c.code, c]));
    for (const c of list) map.set(c.canonical, { ...c, isAlias: false });                       // canonical slugs first: they always win
    for (const c of list) for (const alias of [slugify(c.name), String(c.code).toLowerCase()]) if (alias && !map.has(alias)) map.set(alias, { ...c, isAlias: true });
    hit = { at: now, map, byCode };
    countryCache.set(db, hit);
  }
  return hit;
}

export async function getCountryBySlug(db, slug, now = Date.now()) {
  return (await countryIndex(db, now)).map.get(slug) || null;
}

// code -> { code, name, canonical } for a PUBLISHED country, else null
export async function getCountryByCode(db, code, now = Date.now()) {
  return (await countryIndex(db, now)).byCode.get(String(code || '').toUpperCase()) || null;
}

const COLLECTION_SELECT = `SELECT n.id, n.slug, n.title, n.excerpt, n.published_at, n.created_at, n.article_type, n.content_class, n.labels,
       m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail, m.alt_text AS featured_image_alt
FROM news n LEFT JOIN media_library m ON m.id = n.featured_image`;

// `where` and `order` are FIXED strings chosen by the callers below; values are bound.
async function collection(db, where, params, { limit = 12, offset = 0, order = `COALESCE(n.published_at, n.created_at) DESC, n.id DESC`, joins = '' } = {}) {
  const [rows, total] = await Promise.all([
    db.prepare(`${COLLECTION_SELECT.replace('FROM news n', `FROM news n ${joins}`)} WHERE ${LIVE} AND ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
    db.prepare(`SELECT COUNT(*) AS c FROM news n ${joins} WHERE ${LIVE} AND ${where}`).bind(...params).first()
  ]);
  return { articles: rows.results || [], total: total?.c || 0 };
}

export const getCountryArticles = (db, code, page) => collection(db,
  `(n.primary_country = ? OR n.id IN (SELECT news_id FROM news_article_countries WHERE country_code = ?))`, [code, code], page);

export const getRegionArticles = (db, slug, page) => collection(db,
  `(n.region_slug = ?
    OR n.primary_country IN (SELECT country_code FROM news_region_countries WHERE region_slug = ?)
    OR n.id IN (SELECT news_id FROM news_article_countries WHERE country_code IN (SELECT country_code FROM news_region_countries WHERE region_slug = ?)))`, [slug, slug, slug], page);

export const getTopicArticles = (db, topicId, page) => collection(db,
  `n.id IN (SELECT news_id FROM news_article_topics WHERE topic_id = ?)`, [topicId], page);

export const getEntityArticles = (db, entityId, page) => collection(db,
  `n.id IN (SELECT news_id FROM news_article_entities WHERE entity_id = ?)`, [entityId], page);

// Series: editorial order (position), not date.
export const getSeriesArticles = (db, seriesId, page) => collection(db,
  `sa.series_id = ?`, [seriesId], { ...page, order: `sa.position, n.id`, joins: `JOIN news_series_articles sa ON sa.news_id = n.id` });

export async function getTopicBySlug(db, slug) {
  return await db.prepare(`SELECT id, slug, name, description, seo_title, seo_description FROM news_topics WHERE slug = ? AND active = 1`).bind(slug).first();
}

export async function getSeriesBySlug(db, slug) {
  return await db.prepare(`SELECT s.id, s.slug, s.name, s.description, s.seo_title, s.seo_description, m.url AS image_url
    FROM news_series s LEFT JOIN media_library m ON m.id = s.image_media_id WHERE s.slug = ? AND s.active = 1`).bind(slug).first();
}

export async function getEntityBySlug(db, slug) {
  return await db.prepare(`SELECT e.id, e.slug, e.name, e.entity_type, e.description, e.website_url, e.country_code, c.name AS country_name, e.seo_title, e.seo_description, m.url AS logo_url
    FROM news_entities e LEFT JOIN media_library m ON m.id = e.logo_media_id LEFT JOIN countries c ON c.code = e.country_code WHERE e.slug = ? AND e.active = 1`).bind(slug).first();
}

// Which countries belong to a region (admin mapping; used by region pages).
export async function setRegionCountries(db, regionSlug, codes, { actor, perms }) {
  if (!checkPermission(perms, 'news', 'manage_taxonomy')) return { ok: false, status: 403, error: 'forbidden' };
  const region = await db.prepare(`SELECT slug FROM news_regions WHERE slug = ?`).bind(regionSlug).first();
  if (!region) return { ok: false, status: 404, error: 'unknown region' };
  if (!Array.isArray(codes) || codes.length > 250) return { ok: false, status: 400, error: 'country_codes must be an array' };
  const clean = [...new Set(codes.map((c) => String(c).toUpperCase()))];
  if (!clean.every((c) => /^[A-Z]{2}$/.test(c))) return { ok: false, status: 400, error: 'invalid country code' };
  if (clean.length) {
    const r = await db.prepare(`SELECT COUNT(*) AS c FROM countries WHERE code IN (${clean.map(() => '?').join(',')})`).bind(...clean).first();
    if (r.c !== clean.length) return { ok: false, status: 400, error: 'unknown country' };
  }
  await db.prepare(`DELETE FROM news_region_countries WHERE region_slug = ?`).bind(regionSlug).run();
  for (const c of clean) await db.prepare(`INSERT INTO news_region_countries (region_slug, country_code) VALUES (?, ?)`).bind(regionSlug, c).run();
  await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: 'news_region', entityId: null, metadata: { region: regionSlug, countries: clean.length } });
  return { ok: true, count: clean.length };
}

// ── article-page discovery (Phase 44): topics, entities, countries, region, series nav, more-from-section ──
// One UNION query for the taxonomy chips + at most two more (series neighbours, same-section stories).
// Everything is live-filtered; entity chips only when entity pages are enabled.
export async function loadDiscovery(db, article, flags) {
  const safe = (label, p, fb) => p.catch((e) => { console.error(`newsroom discovery ${label} failed:`, e.message); return fb; });
  const rows = await safe('chips', db.prepare(`
    SELECT 'topic' AS k, t.slug AS a, t.name AS b, NULL AS c, NULL AS d FROM news_article_topics x JOIN news_topics t ON t.id = x.topic_id WHERE x.news_id = ?1 AND t.active = 1
    UNION ALL SELECT 'entity', e.slug, e.name, e.entity_type, NULL FROM news_article_entities x JOIN news_entities e ON e.id = x.entity_id WHERE x.news_id = ?1 AND e.active = 1
    UNION ALL SELECT 'series', s.slug, s.name, sa.position, s.id FROM news_series_articles sa JOIN news_series s ON s.id = sa.series_id WHERE sa.news_id = ?1 AND s.active = 1
    UNION ALL SELECT 'country', country_code, NULL, is_primary, NULL FROM news_article_countries WHERE news_id = ?1
    UNION ALL SELECT 'region', r.slug, r.name, NULL, NULL FROM news_regions r WHERE r.slug = ?2 AND r.active = 1
  `).bind(article.id, article.region_slug ?? null).all().then((r) => r.results || []), []);

  const topics = rows.filter((r) => r.k === 'topic').map((r) => ({ slug: r.a, name: r.b }));
  const entities = flags.news_entity_pages ? rows.filter((r) => r.k === 'entity').map((r) => ({ slug: r.a, name: r.b, type: r.c })) : [];
  const region = rows.find((r) => r.k === 'region');
  const seriesRow = rows.find((r) => r.k === 'series');

  const codes = [...new Set([article.primary_country, ...rows.filter((r) => r.k === 'country').map((r) => r.a)].filter(Boolean).map((c) => String(c).toUpperCase()))];
  const countries = [];
  for (const code of codes.slice(0, 6)) {
    const c = await safe('country', getCountryByCode(db, code), null);
    if (c) countries.push({ slug: c.canonical, name: c.name });
  }

  const [neighbours, more] = await Promise.all([
    seriesRow ? safe('series', db.prepare(`
      SELECT n.slug, n.title, sa.position FROM news_series_articles sa JOIN news n ON n.id = sa.news_id
      WHERE sa.series_id = ? AND ${LIVE} ORDER BY sa.position, n.id LIMIT 60`).bind(seriesRow.d).all().then((r) => r.results || []), []) : [],
    article.section_id ? safe('more', db.prepare(`
      SELECT n.slug, n.title FROM news n WHERE n.section_id = ? AND n.id != ? AND ${LIVE}
      ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT 4`).bind(article.section_id, article.id).all().then((r) => r.results || []), []) : []
  ]);

  let series = null;
  if (seriesRow) {
    const i = neighbours.findIndex((n) => n.slug === article.slug);
    series = { slug: seriesRow.a, name: seriesRow.b, part: i >= 0 ? i + 1 : null, total: neighbours.length,
      prev: i > 0 ? neighbours[i - 1] : null, next: i >= 0 && i < neighbours.length - 1 ? neighbours[i + 1] : null };
  }
  return { topics, entities, countries, region: region ? { slug: region.a, name: region.b } : null, series, more };
}

// ── landing pages for the sitemap ────────────────────────────
// Only landing pages that actually list at least one LIVE article (no thin / empty pages),
// with the date of their newest article as lastmod. Sections roll their children up into the
// parent (the section page lists direct children too). Raw dates are returned; the sitemap
// formats them. Every part is fail-soft.
export async function getLandingSitemapEntries(db, flags) {
  const soft = async (label, fn) => { try { return await fn(); } catch (e) { console.error(`landing sitemap ${label} failed:`, e.message); return []; } };
  const all = async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results || [];
  const D = `COALESCE(n.published_at, n.created_at)`;
  const out = [];
  const newer = (a, b) => (!a || (b && b > a) ? b : a);

  const sections = await soft('sections', async () => {
    const secs = await all(`SELECT id, slug, parent_id FROM news_sections WHERE active = 1`);
    const rows = await all(`SELECT n.section_id AS id, MAX(${D}) AS lm FROM news n WHERE n.section_id IS NOT NULL AND ${LIVE} GROUP BY n.section_id`);
    const byId = new Map(secs.map((s) => [s.id, { slug: s.slug, parent: s.parent_id, lm: null }]));
    for (const r of rows) { const s = byId.get(r.id); if (!s) continue; s.lm = newer(s.lm, r.lm); if (s.parent && byId.has(s.parent)) byId.get(s.parent).lm = newer(byId.get(s.parent).lm, r.lm); }
    return [...byId.values()].filter((s) => s.lm).map((s) => ({ path: `/en/news/${s.slug}`, lastmod: s.lm }));
  });
  const regions = await soft('regions', async () => {
    const res = [];
    for (const r of await all(`SELECT slug FROM news_regions WHERE active = 1 ORDER BY display_order`)) {
      const c = await getRegionArticles(db, r.slug, { limit: 1, offset: 0 });
      if (c.total > 0) res.push({ path: `/en/news/${r.slug}`, lastmod: c.articles[0].published_at || c.articles[0].created_at });
    }
    return res;
  });
  const countries = await soft('countries', async () => {
    const rows = await all(`SELECT code, MAX(d) AS lm FROM (
        SELECT n.primary_country AS code, ${D} AS d FROM news n WHERE n.primary_country IS NOT NULL AND ${LIVE}
        UNION ALL SELECT ac.country_code, ${D} FROM news_article_countries ac JOIN news n ON n.id = ac.news_id WHERE ${LIVE}) GROUP BY code`);
    const res = [];
    for (const r of rows) { const c = await getCountryByCode(db, r.code); if (c) res.push({ path: `/en/news/${c.canonical}`, lastmod: r.lm }); }
    return res;
  });
  const grouped = (label, sql, prefix) => soft(label, async () => (await all(sql)).map((r) => ({ path: `${prefix}${r.slug}`, lastmod: r.lm })));
  const topics = await grouped('topics', `SELECT t.slug, MAX(${D}) AS lm FROM news_topics t JOIN news_article_topics x ON x.topic_id = t.id JOIN news n ON n.id = x.news_id WHERE t.active = 1 AND ${LIVE} GROUP BY t.id`, '/en/news/topic/');
  const series = await grouped('series', `SELECT s.slug, MAX(${D}) AS lm FROM news_series s JOIN news_series_articles x ON x.series_id = s.id JOIN news n ON n.id = x.news_id WHERE s.active = 1 AND ${LIVE} GROUP BY s.id`, '/en/news/series/');
  const entities = flags.news_entity_pages
    ? await grouped('entities', `SELECT e.slug, MAX(${D}) AS lm FROM news_entities e JOIN news_article_entities x ON x.entity_id = e.id JOIN news n ON n.id = x.news_id WHERE e.active = 1 AND ${LIVE} GROUP BY e.id`, '/en/news/entity/') : [];
  for (const list of [sections, regions, countries, topics, series, entities]) out.push(...list);
  // a URL can only appear once (e.g. a region and a section can never share a slug, but be safe)
  const seen = new Set(); return out.filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)));
}
