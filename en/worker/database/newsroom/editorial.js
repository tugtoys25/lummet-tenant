import { logAudit } from '../audit.js';
import { checkPermission } from '../permissions.js';
import { CORRECTION_TYPES, FACT_CHECK_STATUSES, SOURCE_TYPES, WORKFLOW_STATUSES, inSet, plainText, slugify, validatePublicUrl } from "./base.js";
import { getCountryBySlug } from "./discovery.js";

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
