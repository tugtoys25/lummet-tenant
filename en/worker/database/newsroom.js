// ============================================================
// en/worker/database/newsroom.js
// Newsroom services layer (Stage B). Additive: nothing imports this yet,
// so it cannot change existing behaviour until Stage C/D wire it in.
//
// Conventions kept from the codebase:
//   * vocabularies validated here in JS, not via SQL CHECK
//   * prepared statements only; no string-built SQL from input
//   * audit via logAudit() (never throws)
//   * permission checks via permissions.checkPermission(userPerms,'news',action)
//     where userPerms comes from getPermissionsForUser() (null = admin)
//
// PUBLIC vs INTERNAL: every get*Public* loader selects an explicit column
// list. Internal data (news_editorial, news_editorial_notes, revisions,
// created_by) is only reachable through the admin-only functions below.
// ============================================================

import { logAudit } from './audit.js';
import { checkPermission } from './permissions.js';

// ── Vocabularies ─────────────────────────────────────────────
export const ARTICLE_TYPES = ['news', 'analysis', 'interview', 'investigation', 'explainer',
  'research', 'opinion', 'original_reporting', 'press_release', 'feature', 'live'];
export const CONTENT_CLASSES = ['editorial', 'sponsored', 'commercial', 'press_release'];
export const LABELS = ['breaking', 'developing', 'exclusive', 'analysis', 'investigation',
  'interview', 'opinion', 'research', 'press_release'];
export const SOURCE_TYPES = ['official_statement', 'regulator', 'government', 'court_document',
  'company_filing', 'press_release', 'interview', 'original_reporting', 'industry_report',
  'research', 'other'];
export const CORRECTION_TYPES = ['correction', 'clarification', 'update', 'retraction'];
export const RELATION_TYPES = ['related', 'previous_coverage', 'follow_up', 'background',
  'explainer', 'original_story'];
export const FACT_CHECK_STATUSES = ['not_checked', 'in_review', 'fact_checked', 'needs_correction'];
export const WORKFLOW_STATUSES = ['idea', 'assigned', 'draft', 'editorial_review', 'fact_check',
  'approved', 'scheduled', 'published', 'updated', 'corrected', 'retracted', 'archived'];

const inSet = (list, v) => typeof v === 'string' && list.includes(v);

// ── Feature flags (system_settings, all default off) ─────────
export async function isNewsFlagEnabled(db, key) {
  try {
    const row = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(key).first();
    return !!row && String(row.value).toLowerCase() === 'true';
  } catch (e) {
    console.error('newsroom flag read failed:', key, e.message);
    return false; // fail closed: an unreadable flag never turns a new feature on
  }
}

// ── Text / slug helpers ──────────────────────────────────────
export function plainText(input, max = 2000) {
  return String(input ?? '')
    .replace(/<[^>]*>/g, '')          // strip any markup: public messages are text-only
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

export function slugify(input) {
  return String(input ?? '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// ── URL validation (sources, press-release origin) ───────────
// Sources are only ever rendered as links; the server never fetches them.
// Validation is still strict (defence in depth against SSRF if a fetcher is
// ever added, and against javascript:/data: XSS and credential-bearing URLs).
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localdomain)$/i;

function isPrivateIp(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h.includes(':') && (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'));
}

export function validatePublicUrl(raw) {
  if (raw == null || String(raw).trim() === '') return { ok: true, value: null };
  const s = String(raw).trim();
  if (s.length > 2048) return { ok: false, error: 'URL too long' };
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'Invalid URL' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Only http(s) URLs are allowed' };
  if (u.username || u.password) return { ok: false, error: 'URLs with credentials are not allowed' };
  if (!u.hostname || PRIVATE_HOST.test(u.hostname) || isPrivateIp(u.hostname)) {
    return { ok: false, error: 'Private or local hosts are not allowed' };
  }
  return { ok: true, value: u.toString() };
}

// ── Sources ──────────────────────────────────────────────────
export function normalizeSource(input, index = 0) {
  const errors = [];
  const name = plainText(input?.source_name, 300);
  if (!name) errors.push('source_name is required');
  const type = input?.source_type ?? 'other';
  if (!inSet(SOURCE_TYPES, type)) errors.push(`invalid source_type: ${String(type).slice(0, 40)}`);
  const url = validatePublicUrl(input?.source_url);
  if (!url.ok) errors.push(`source_url: ${url.error}`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      source_name: name,
      source_url: url.value,
      source_type: type,
      source_date: plainText(input?.source_date, 40) || null,
      author: plainText(input?.author, 200) || null,
      description: plainText(input?.description, 1000) || null,
      display_order: Number.isInteger(input?.display_order) ? input.display_order : index
    }
  };
}

// Replaces the whole source list for one article. Validates everything
// BEFORE touching the DB so a bad row never leaves a half-written list.
export async function replaceArticleSources(db, { newsId, sources, actor, perms }) {
  if (!checkPermission(perms, 'news', 'manage_sources')) return { ok: false, status: 403, error: 'forbidden' };
  if (!Array.isArray(sources) || sources.length > 50) return { ok: false, status: 400, error: 'sources must be an array (max 50)' };
  const clean = [];
  for (let i = 0; i < sources.length; i++) {
    const r = normalizeSource(sources[i], i);
    if (!r.ok) return { ok: false, status: 400, error: `source #${i + 1}: ${r.errors.join('; ')}` };
    clean.push(r.value);
  }
  const before = await db.prepare(`SELECT COUNT(*) AS c FROM news_article_sources WHERE news_id = ?`).bind(newsId).first();
  await db.prepare(`DELETE FROM news_article_sources WHERE news_id = ?`).bind(newsId).run();
  for (const s of clean) {
    await db.prepare(`
      INSERT INTO news_article_sources (news_id, source_name, source_url, source_type, source_date, author, description, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(newsId, s.source_name, s.source_url, s.source_type, s.source_date, s.author, s.description, s.display_order).run();
  }
  const removed = Math.max(0, (before?.c || 0) - clean.length);
  if (clean.length > (before?.c || 0)) await logAudit(db, { userId: actor?.user_id, action: 'source_added', entityType: 'news', entityId: newsId, metadata: { count: clean.length } });
  if (removed > 0) await logAudit(db, { userId: actor?.user_id, action: 'source_removed', entityType: 'news', entityId: newsId, metadata: { removed } });
  return { ok: true, count: clean.length };
}

// ── Revisions (field-level) ──────────────────────────────────
export const TRACKED_FIELDS = ['title', 'slug', 'excerpt', 'content', 'author_id', 'article_type',
  'section_id', 'primary_country', 'region_slug', 'content_class', 'labels', 'methodology',
  'featured_image', 'og_image', 'seo_title', 'seo_description', 'published', 'published_at'];

// To avoid duplicating large bodies, `content` is stored in full only as the
// PREVIOUS value; new_values.content holds a length marker. Version N's body
// is therefore recoverable as revision N+1's previous value (or the live row).
export function diffArticle(before, after) {
  const changed = [], prev = {}, next = {};
  for (const f of TRACKED_FIELDS) {
    const a = before?.[f] ?? null, b = after?.[f] ?? null;
    if (String(a) !== String(b) || (a === null) !== (b === null)) {
      changed.push(f);
      prev[f] = a;
      next[f] = f === 'content' ? { length: String(b ?? '').length } : b;
    }
  }
  return { changed, prev, next };
}

export async function recordRevision(db, { newsId, changedBy = null, before, after, summary = null }) {
  const { changed, prev, next } = diffArticle(before, after);
  if (changed.length === 0) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await db.prepare(`SELECT COALESCE(MAX(version_number), 0) + 1 AS v FROM news_revisions WHERE news_id = ?`).bind(newsId).first();
      const version = row?.v || 1;
      await db.prepare(`
        INSERT INTO news_revisions (news_id, version_number, changed_by, change_summary, changed_fields, previous_values, new_values)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(newsId, version, changedBy, plainText(summary, 500) || null,
        JSON.stringify(changed), JSON.stringify(prev), JSON.stringify(next)).run();
      return version;
    } catch (e) {
      if (!/UNIQUE/i.test(e.message)) { console.error('revision write failed:', e.message); return null; }
      // concurrent editor took this version number: recompute and retry
    }
  }
  console.error('revision write gave up after retries for news', newsId);
  return null;
}

export async function listRevisions(db, newsId, perms) {
  if (!checkPermission(perms, 'news', 'read')) return null;
  const r = await db.prepare(`
    SELECT version_number, changed_by, changed_at, change_summary, changed_fields
    FROM news_revisions WHERE news_id = ? ORDER BY version_number DESC LIMIT 200
  `).bind(newsId).all();
  return (r.results || []).map(x => ({ ...x, changed_fields: safeJson(x.changed_fields, []) }));
}

export async function getRevision(db, newsId, version, perms) {
  if (!checkPermission(perms, 'news', 'read')) return null;
  const row = await db.prepare(`SELECT * FROM news_revisions WHERE news_id = ? AND version_number = ?`).bind(newsId, version).first();
  if (!row) return null;
  return { ...row, changed_fields: safeJson(row.changed_fields, []), previous_values: safeJson(row.previous_values, {}), new_values: safeJson(row.new_values, {}) };
}

function safeJson(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }

// ── Corrections ──────────────────────────────────────────────
export async function addCorrection(db, { newsId, type, message, actor, perms }) {
  if (!inSet(CORRECTION_TYPES, type)) return { ok: false, status: 400, error: 'invalid correction type' };
  const needed = type === 'retraction' ? 'retract' : type === 'update' ? 'publish' : 'correct';
  if (!checkPermission(perms, 'news', needed)) return { ok: false, status: 403, error: 'forbidden' };
  const text = plainText(message, 2000);
  if (!text) return { ok: false, status: 400, error: 'public_message is required' };
  const exists = await db.prepare(`SELECT id FROM news WHERE id = ?`).bind(newsId).first();
  if (!exists) return { ok: false, status: 404, error: 'article not found' };
  const res = await db.prepare(`INSERT INTO news_corrections (news_id, type, public_message, created_by) VALUES (?, ?, ?, ?)`)
    .bind(newsId, type, text, actor?.user_id ?? null).run();
  await logAudit(db, { userId: actor?.user_id, action: type === 'retraction' ? 'article_retracted' : 'article_corrected', entityType: 'news', entityId: newsId, metadata: { type } });
  return { ok: true, id: res.meta?.last_row_id };
}

// ── Workflow ─────────────────────────────────────────────────
const TRANSITIONS = {
  idea: ['assigned', 'draft'],
  assigned: ['draft'],
  draft: ['editorial_review', 'published', 'scheduled'],   // draft->published keeps "simple publishing" for authorised users
  editorial_review: ['draft', 'fact_check', 'approved'],
  fact_check: ['draft', 'editorial_review', 'approved'],
  approved: ['draft', 'scheduled', 'published'],
  scheduled: ['draft', 'approved', 'published'],
  published: ['updated', 'corrected', 'retracted', 'archived', 'draft'],
  updated: ['updated', 'corrected', 'retracted', 'archived', 'published'],
  corrected: ['updated', 'corrected', 'retracted', 'archived', 'published'],
  retracted: ['archived'],
  archived: ['draft']
};

const REQUIRED_ACTION = {
  idea: 'create', assigned: 'update', draft: 'update', editorial_review: 'update',
  fact_check: 'factcheck', approved: 'review', scheduled: 'schedule', published: 'publish',
  updated: 'publish', corrected: 'correct', retracted: 'retract', archived: 'publish'
};

export function canTransition(from, to) {
  return inSet(WORKFLOW_STATUSES, to) && (TRANSITIONS[from] || []).includes(to);
}
export const requiredActionFor = (to) => REQUIRED_ACTION[to] || null;

// A missing news_editorial row = legacy article: effective status follows the
// legacy `published` flag, so no article is retro-fitted into the workflow.
export async function getEffectiveStatus(db, newsId) {
  const row = await db.prepare(`
    SELECT n.published, e.workflow_status
    FROM news n LEFT JOIN news_editorial e ON e.news_id = n.id
    WHERE n.id = ?
  `).bind(newsId).first();
  if (!row) return null;
  return row.workflow_status || (row.published === 1 ? 'published' : 'draft');
}

export async function transitionWorkflow(db, { newsId, to, actor, perms, scheduledAt = null }) {
  const from = await getEffectiveStatus(db, newsId);
  if (from === null) return { ok: false, status: 404, error: 'article not found' };
  if (!canTransition(from, to)) return { ok: false, status: 409, error: `cannot move from ${from} to ${to}` };
  if (!checkPermission(perms, 'news', REQUIRED_ACTION[to])) return { ok: false, status: 403, error: 'forbidden' };
  if (to === 'scheduled') {
    const t = Date.parse(scheduledAt);
    if (!scheduledAt || Number.isNaN(t) || t <= Date.now()) return { ok: false, status: 400, error: 'scheduledAt must be a future date' };
  }

  const uid = actor?.user_id ?? null;
  await db.prepare(`INSERT OR IGNORE INTO news_editorial (news_id) VALUES (?)`).bind(newsId).run();
  await db.prepare(`UPDATE news_editorial SET workflow_status = ?, updated_at = CURRENT_TIMESTAMP WHERE news_id = ?`).bind(to, newsId).run();

  // Stamp who did what (internal columns only).
  const stamp = { editorial_review: 'reviewed_by', approved: 'approved_by', published: 'published_by' }[to];
  if (stamp) await db.prepare(`UPDATE news_editorial SET ${stamp} = ? WHERE news_id = ?`).bind(uid, newsId).run(); // column name from fixed map, never input
  if (to === 'fact_check') await db.prepare(`UPDATE news_editorial SET fact_check_status = 'in_review' WHERE news_id = ?`).bind(newsId).run();

  // Only these transitions touch public visibility. Retract/archive do NOT
  // unpublish: pulling a URL would 404 indexed pages; unpublishing stays an
  // explicit, separate editor action.
  if (to === 'published') {
    await db.prepare(`UPDATE news SET published = 1, published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(newsId).run();
  } else if (to === 'scheduled') {
    await db.prepare(`UPDATE news SET published = 1, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(new Date(scheduledAt).toISOString().slice(0, 19).replace('T', ' '), newsId).run();
  } else if (to === 'draft' && (from === 'published' || from === 'updated' || from === 'corrected' || from === 'scheduled')) {
    await db.prepare(`UPDATE news SET published = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(newsId).run();
  }

  const action = { editorial_review: 'article_submitted_for_review', approved: 'article_approved', published: 'article_published',
    scheduled: 'article_scheduled', draft: (from === 'published' ? 'article_unpublished' : 'article_updated') }[to] || 'article_updated';
  await logAudit(db, { userId: uid, action, entityType: 'news', entityId: newsId, metadata: { from, to } });
  return { ok: true, from, to };
}

// Internal editorial record (admin/editor UI only; never used by public code).
export async function getEditorialState(db, newsId, perms) {
  if (!checkPermission(perms, 'news', 'read')) return null;
  return await db.prepare(`SELECT * FROM news_editorial WHERE news_id = ?`).bind(newsId).first();
}

export async function setFactCheck(db, { newsId, status, notes = null, actor, perms }) {
  if (!inSet(FACT_CHECK_STATUSES, status)) return { ok: false, status: 400, error: 'invalid fact_check_status' };
  if (!checkPermission(perms, 'news', 'factcheck')) return { ok: false, status: 403, error: 'forbidden' };
  await db.prepare(`INSERT OR IGNORE INTO news_editorial (news_id) VALUES (?)`).bind(newsId).run();
  await db.prepare(`
    UPDATE news_editorial SET fact_check_status = ?, fact_check_notes = ?, fact_checked_by = ?,
      fact_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE news_id = ?
  `).bind(status, plainText(notes, 5000) || null, actor?.user_id ?? null, newsId).run();
  await logAudit(db, { userId: actor?.user_id, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { fact_check_status: status } });
  return { ok: true };
}

// ── Taxonomy ─────────────────────────────────────────────────
// /en/news/<slug> is also the article route. Article slugs always win, so a
// section/topic slug may never equal an existing article slug or a reserved word.
const RESERVED_SLUGS = ['new', 'edit', 'search', 'tag', 'author', 'series', 'topic', 'country', 'region', 'entity', 'rss', 'feed', 'page'];

export async function assertSectionSlugFree(db, slug, ignoreSectionId = null) {
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: 'slug must be lowercase letters, digits and hyphens' };
  if (RESERVED_SLUGS.includes(slug)) return { ok: false, error: 'slug is reserved' };
  const art = await db.prepare(`SELECT id FROM news WHERE slug = ?`).bind(slug).first();
  if (art) return { ok: false, error: 'slug is used by an existing article URL' };
  const sec = await db.prepare(`SELECT id FROM news_sections WHERE slug = ? AND id IS NOT ?`).bind(slug, ignoreSectionId).first();
  if (sec) return { ok: false, error: 'slug already used by another section' };
  const reg = await db.prepare(`SELECT slug FROM news_regions WHERE slug = ?`).bind(slug).first();
  if (reg) return { ok: false, error: 'slug is used by a region' };
  const ctry = await getCountryBySlug(db, slug).catch(() => null);
  if (ctry) return { ok: false, error: 'slug is used by a country page' };
  return { ok: true };
}

export async function createSection(db, { name, slug, description = null, parentId = null, displayOrder = 0, actor, perms }) {
  if (!checkPermission(perms, 'news', 'manage_taxonomy')) return { ok: false, status: 403, error: 'forbidden' };
  const cleanName = plainText(name, 120);
  if (!cleanName) return { ok: false, status: 400, error: 'name is required' };
  const s = slug ? String(slug) : slugify(cleanName);
  const free = await assertSectionSlugFree(db, s);
  if (!free.ok) return { ok: false, status: 409, error: free.error };
  const r = await db.prepare(`INSERT INTO news_sections (slug, name, description, parent_id, display_order) VALUES (?, ?, ?, ?, ?)`)
    .bind(s, cleanName, plainText(description, 1000) || null, parentId, displayOrder).run();
  await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: 'news_section', entityId: r.meta?.last_row_id, metadata: { slug: s } });
  return { ok: true, id: r.meta?.last_row_id, slug: s };
}

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
export function resetNewsFlagCache() { flagCache = new WeakMap(); }   // tests / admin "apply now"
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

const LIVE = `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;

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
