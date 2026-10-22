import { LIVE } from "./base.js";
import { loadDiscovery } from "./discovery.js";

// ── PUBLIC loaders (explicit columns; safe to render) ────────
export async function getPublicSources(db, newsId) {
  const r = await db.prepare(`
    SELECT source_name, source_url, source_type, source_date, author, description
    FROM news_article_sources WHERE news_id = ? ORDER BY display_order, id
  `).bind(newsId).all();
  return r.results || [];
}

export async function getPublicCorrections(db, newsId) {
  const r = await db.prepare(`
    SELECT type, public_message, created_at
    FROM news_corrections WHERE news_id = ? ORDER BY created_at, id
  `).bind(newsId).all();
  return r.results || [];
}

// editor_id references authors.id so a public display name can be shown
// without ever exposing a users row (email, hash, role).
export async function getPublicTimeline(db, newsId) {
  const r = await db.prepare(`
    SELECT t.update_time, t.body, a.name AS editor_name
    FROM news_timeline_updates t LEFT JOIN authors a ON a.id = t.editor_id
    WHERE t.news_id = ? ORDER BY t.update_time DESC, t.id DESC LIMIT 100
  `).bind(newsId).all();
  return r.results || [];
}

export async function getPublicSection(db, sectionId) {
  if (!sectionId) return null;
  return await db.prepare(`SELECT id, slug, name, description FROM news_sections WHERE id = ? AND active = 1`).bind(sectionId).first();
}

// One call for the article renderer. Independent queries run in parallel and
// each fails closed to an empty result: an optional feature can never make an
// article unavailable (Phase 51).
export async function loadArticleExtras(db, article) {
  const safe = (label, p, fallback) => p.catch(e => { console.error(`newsroom ${label} failed:`, e.message); return fallback; });
  const [sources, corrections, timeline, section] = await Promise.all([
    safe('sources', getPublicSources(db, article.id), []),
    safe('corrections', getPublicCorrections(db, article.id), []),
    article.article_type === 'live' ? safe('timeline', getPublicTimeline(db, article.id), []) : Promise.resolve([]),
    safe('section', getPublicSection(db, article.section_id), null)
  ]);
  return { sources, corrections, timeline, section };
}

// ============================================================
// Stage D: public-render loaders
// ============================================================

export const PUBLIC_FLAG_KEYS = ['news_new_taxonomy', 'news_sources_display', 'news_corrections_display',
  'news_v2_homepage', 'news_entity_pages', 'news_trending', 'news_editorial_workflow', 'news_analytics_enrichment', 'news_search_v2'];

// Public pages read the flags on every view, so this is cached per DB handle
// for a short TTL (isolate-local; a flag flip takes effect within `ttlMs`).
// Failure fails closed (all off) and is NOT cached, so recovery is immediate.
let flagCache = new WeakMap();

export function resetNewsFlagCache() { flagCache = new WeakMap(); }

   // tests / admin "apply now"
export async function getNewsFlags(db, { ttlMs = 30000, now = Date.now() } = {}) {
  const hit = flagCache.get(db);
  if (hit && now - hit.at < ttlMs) return hit.flags;
  const off = Object.fromEntries(PUBLIC_FLAG_KEYS.map((k) => [k, false]));
  try {
    const r = await db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${PUBLIC_FLAG_KEYS.map(() => '?').join(',')})`).bind(...PUBLIC_FLAG_KEYS).all();
    const flags = { ...off };
    for (const row of r.results || []) flags[row.key] = String(row.value).toLowerCase() === 'true';
    flagCache.set(db, { at: now, flags });
    return flags;
  } catch (e) {
    console.error('newsroom flags read failed (all off):', e.message);
    return off;
  }
}

// Related stories must be PUBLIC: never expose a draft or scheduled title.
export async function getPublicRelated(db, newsId) {
  const r = await db.prepare(`
    SELECT n.slug, n.title, r.relation_type
    FROM news_related r JOIN news n ON n.id = r.related_news_id
    WHERE r.news_id = ? AND ${LIVE}
    ORDER BY r.display_order, n.id LIMIT 12
  `).bind(newsId).all();
  return r.results || [];
}

// One call for the article renderer. Only queries what the enabled flags need;
// returns null when nothing is enabled (=> zero extra queries, identical page).
export async function loadPublicNewsroom(db, article, flags) {
  const tax = !!flags.news_new_taxonomy, src = !!flags.news_sources_display, corr = !!flags.news_corrections_display;
  if (!tax && !src && !corr) return null;
  const safe = (label, p, fallback) => p.catch((e) => { console.error(`newsroom ${label} failed:`, e.message); return fallback; });
  const [sources, corrections, section, timeline, related, discovery] = await Promise.all([
    src ? safe('sources', getPublicSources(db, article.id), []) : [],
    corr ? safe('corrections', getPublicCorrections(db, article.id), []) : [],
    tax && article.section_id ? safe('section', getPublicSection(db, article.section_id), null) : null,
    tax && article.article_type === 'live' ? safe('timeline', getPublicTimeline(db, article.id), []) : [],
    tax ? safe('related', getPublicRelated(db, article.id), []) : [],
    tax ? safe('discovery', loadDiscovery(db, article, flags), null) : null
  ]);
  return { sources, corrections, section, timeline, related, discovery };
}

// ── section pages ────────────────────────────────────────────
export async function getSectionBySlug(db, slug) {
  return await db.prepare(`SELECT id, slug, name, description, seo_title, seo_description, parent_id FROM news_sections WHERE slug = ? AND active = 1`).bind(slug).first();
}

// A section page also lists its direct children's articles (one level).
export async function getSectionIds(db, sectionId) {
  const r = await db.prepare(`SELECT id FROM news_sections WHERE parent_id = ? AND active = 1`).bind(sectionId).all();
  return [sectionId, ...(r.results || []).map((x) => x.id)];
}

export async function getSectionArticles(db, sectionIds, { limit = 12, offset = 0 } = {}) {
  const ph = sectionIds.map(() => '?').join(',');
  const [rows, total] = await Promise.all([
    db.prepare(`
      SELECT n.id, n.slug, n.title, n.excerpt, n.published_at, n.created_at, n.article_type, n.content_class, n.labels,
             m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail, m.alt_text AS featured_image_alt
      FROM news n LEFT JOIN media_library m ON m.id = n.featured_image
      WHERE n.section_id IN (${ph}) AND ${LIVE}
      ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT ? OFFSET ?
    `).bind(...sectionIds, limit, offset).all(),
    db.prepare(`SELECT COUNT(*) AS c FROM news n WHERE n.section_id IN (${ph}) AND ${LIVE}`).bind(...sectionIds).first()
  ]);
  return { articles: rows.results || [], total: total?.c || 0 };
}

// Articles whose slug equals a section/region slug: the article wins (its URL
// is already indexed), so the section page is unreachable until one is renamed.
export async function findSlugCollisions(db) {
  const r = await db.prepare(`
    SELECT n.id AS news_id, n.slug, s.id AS section_id, s.name AS section_name
    FROM news n JOIN news_sections s ON s.slug = n.slug WHERE s.active = 1
  `).all();
  return r.results || [];
}
