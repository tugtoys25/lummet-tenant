// ============================================================
// en/worker/database/newsroom-taxonomy.js
// Stage C: taxonomy CRUD + article metadata/relations writers.
//
// SQL-safety rule: table and column names come ONLY from the fixed maps
// below, never from input. Values are always bound parameters.
// Nothing here deletes taxonomy rows: "archive" sets active = 0, so an
// article's links never dangle and public URLs never silently 404.
// ============================================================

import { logAudit } from './audit.js';
import { checkPermission } from './permissions.js';
import {
  plainText, slugify, validatePublicUrl, assertSectionSlugFree,
  ARTICLE_TYPES, CONTENT_CLASSES, LABELS, RELATION_TYPES
} from './newsroom.js';

export const ENTITY_TYPES = ['company', 'operator', 'regulator', 'person', 'organization'];
export const DISCLOSURE_KEYS = ['editorial_independence', 'affiliate', 'sponsored', 'advertising', 'ai_assistance'];

const int = (v) => (v === null || v === undefined || v === '' ? null : (Number.isInteger(Number(v)) ? Number(v) : NaN));
const bool01 = (v) => (v === undefined ? undefined : (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0));

// kind -> { table, fields: { column: sanitizer(value) -> value | undefined(=skip) | throw } }
const KINDS = {
  sections: {
    table: 'news_sections', audit: 'news_section',
    fields: {
      name: (v) => plainText(v, 120), description: (v) => plainText(v, 1000) || null,
      seo_title: (v) => plainText(v, 160) || null, seo_description: (v) => plainText(v, 320) || null,
      og_image: int, display_order: (v) => int(v) ?? 0, active: bool01, parent_id: int
    }
  },
  topics: {
    table: 'news_topics', audit: 'news_topic',
    fields: {
      name: (v) => plainText(v, 120), description: (v) => plainText(v, 1000) || null,
      seo_title: (v) => plainText(v, 160) || null, seo_description: (v) => plainText(v, 320) || null, active: bool01
    }
  },
  entities: {
    table: 'news_entities', audit: 'news_entity',
    fields: {
      name: (v) => plainText(v, 160),
      entity_type: (v) => { if (!ENTITY_TYPES.includes(v)) throw new Error('invalid entity_type'); return v; },
      description: (v) => plainText(v, 2000) || null, logo_media_id: int,
      website_url: (v) => { const r = validatePublicUrl(v); if (!r.ok) throw new Error(`website_url: ${r.error}`); return r.value; },
      country_code: (v) => { if (v == null || v === '') return null; const c = String(v).toUpperCase(); if (!/^[A-Z]{2}$/.test(c)) throw new Error('invalid country_code'); return c; },
      casino_id: int, seo_title: (v) => plainText(v, 160) || null, seo_description: (v) => plainText(v, 320) || null, active: bool01
    }
  },
  series: {
    table: 'news_series', audit: 'news_series',
    fields: {
      name: (v) => plainText(v, 160), description: (v) => plainText(v, 2000) || null, image_media_id: int,
      seo_title: (v) => plainText(v, 160) || null, seo_description: (v) => plainText(v, 320) || null, active: bool01
    }
  }
};
export const TAXONOMY_KINDS = Object.keys(KINDS);

export async function listTaxonomy(db, kind, { includeInactive = false } = {}) {
  const k = KINDS[kind]; if (!k) return null;
  const order = kind === 'sections' ? 'display_order, name' : 'name';
  const r = await db.prepare(`SELECT * FROM ${k.table} ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY ${order} LIMIT 1000`).all();
  return r.results || [];
}

// Single-row counterpart to listTaxonomy, added alongside the Super API's
// newsroom taxonomy endpoints (GET .../:id) — table name still comes only
// from the fixed KINDS map above, id is always a bound parameter.
export async function getTaxonomyItem(db, kind, id) {
  const k = KINDS[kind]; if (!k) return null;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return undefined; // caller treats undefined as "not found", null as "unknown kind"
  return (await db.prepare(`SELECT * FROM ${k.table} WHERE id = ?`).bind(numId).first()) || undefined;
}

// Create (no id) or update (id) one taxonomy item. Partial updates: only
// keys present in `input` change.
export async function saveTaxonomyItem(db, kind, input, { actor, perms }) {
  const k = KINDS[kind];
  if (!k) return { ok: false, status: 404, error: 'unknown taxonomy kind' };
  if (!checkPermission(perms, 'news', 'manage_taxonomy')) return { ok: false, status: 403, error: 'forbidden' };

  const id = input?.id != null ? Number(input.id) : null;
  if (id !== null && !Number.isInteger(id)) return { ok: false, status: 400, error: 'invalid id' };

  const values = {};
  try {
    for (const [col, fn] of Object.entries(k.fields)) {
      if (input?.[col] === undefined) continue;
      const v = fn(input[col]);
      if (typeof v === 'number' && Number.isNaN(v)) throw new Error(`invalid ${col}`);
      if (v !== undefined) values[col] = v;
    }
  } catch (e) { return { ok: false, status: 400, error: e.message }; }
  if ('name' in values && !values.name) return { ok: false, status: 400, error: 'name is required' };

  let slug;
  if (id === null) {
    if (!values.name) return { ok: false, status: 400, error: 'name is required' };
    if (kind === 'entities' && !values.entity_type) values.entity_type = 'company';
    slug = input.slug ? String(input.slug) : slugify(values.name);
  } else if (input.slug !== undefined) {
    slug = String(input.slug);
  }

  if (slug !== undefined) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, status: 400, error: 'slug must be lowercase letters, digits and hyphens' };
    if (kind === 'sections') {
      const free = await assertSectionSlugFree(db, slug, id);
      if (!free.ok) return { ok: false, status: 409, error: free.error };
    }
    values.slug = slug;
  }

  if (kind === 'sections' && values.parent_id != null) {
    if (id !== null && values.parent_id === id) return { ok: false, status: 400, error: 'a section cannot be its own parent' };
    let cur = values.parent_id, depth = 0;
    while (cur != null && depth++ < 5) {
      if (id !== null && cur === id) return { ok: false, status: 400, error: 'parent would create a cycle' };
      const p = await db.prepare(`SELECT parent_id FROM news_sections WHERE id = ?`).bind(cur).first();
      if (!p) return { ok: false, status: 400, error: 'parent section not found' };
      cur = p.parent_id;
    }
  }

  try {
    if (id === null) {
      const cols = Object.keys(values);
      const r = await db.prepare(`INSERT INTO ${k.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .bind(...cols.map(c => values[c])).run();
      await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: k.audit, entityId: r.meta?.last_row_id, metadata: { op: 'create', slug: values.slug } });
      return { ok: true, id: r.meta?.last_row_id, slug: values.slug };
    }
    const cols = Object.keys(values);
    if (!cols.length) return { ok: false, status: 400, error: 'nothing to update' };
    const r = await db.prepare(`UPDATE ${k.table} SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(...cols.map(c => values[c]), id).run();
    if (!r.meta?.changes) return { ok: false, status: 404, error: 'not found' };
    await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: k.audit, entityId: id, metadata: { op: 'update', fields: cols } });
    return { ok: true, id };
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return { ok: false, status: 409, error: 'slug already exists' };
    console.error('taxonomy save failed:', kind, e.message);
    return { ok: false, status: 500, error: 'save failed' };
  }
}

// "Archive" = active 0. Never deletes; links and URLs stay resolvable.
export async function archiveTaxonomyItem(db, kind, id, { actor, perms, active = false }) {
  return saveTaxonomyItem(db, kind, { id, active }, { actor, perms });
}

// ── Article metadata (public columns on news) ────────────────
export const META_FIELDS = ['article_type', 'section_id', 'primary_country', 'region_slug', 'content_class', 'labels',
  'methodology', 'pr_provided_by', 'pr_original_source_url', 'pr_original_date', 'disclosure_json'];

export async function setArticleMeta(db, newsId, input, { actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return { ok: false, status: 403, error: 'forbidden' };
  const cur = await db.prepare(`SELECT id, article_type, content_class, pr_provided_by FROM news WHERE id = ?`).bind(newsId).first();
  if (!cur) return { ok: false, status: 404, error: 'article not found' };

  const v = {};
  const has = (k) => input?.[k] !== undefined;
  const nul = (k) => input[k] === null || input[k] === '';

  if (has('article_type')) {
    if (nul('article_type')) v.article_type = null;
    else if (ARTICLE_TYPES.includes(input.article_type)) v.article_type = input.article_type;
    else return { ok: false, status: 400, error: 'invalid article_type' };
  }
  if (has('content_class')) {
    if (nul('content_class')) v.content_class = null;
    else if (CONTENT_CLASSES.includes(input.content_class)) v.content_class = input.content_class;
    else return { ok: false, status: 400, error: 'invalid content_class' };
  }
  if (has('section_id')) {
    if (nul('section_id')) v.section_id = null;
    else {
      const sid = Number(input.section_id);
      const s = Number.isInteger(sid) ? await db.prepare(`SELECT id FROM news_sections WHERE id = ? AND active = 1`).bind(sid).first() : null;
      if (!s) return { ok: false, status: 400, error: 'section not found or inactive' };
      v.section_id = sid;
    }
  }
  if (has('primary_country')) {
    if (nul('primary_country')) v.primary_country = null;
    else {
      const code = String(input.primary_country).toUpperCase();
      const c = /^[A-Z]{2}$/.test(code) ? await db.prepare(`SELECT code FROM countries WHERE code = ?`).bind(code).first() : null;
      if (!c) return { ok: false, status: 400, error: 'unknown country' };
      v.primary_country = code;
    }
  }
  if (has('region_slug')) {
    if (nul('region_slug')) v.region_slug = null;
    else {
      const r = await db.prepare(`SELECT slug FROM news_regions WHERE slug = ? AND active = 1`).bind(String(input.region_slug)).first();
      if (!r) return { ok: false, status: 400, error: 'unknown region' };
      v.region_slug = r.slug;
    }
  }
  if (has('labels')) {
    if (input.labels === null) v.labels = null;
    else if (Array.isArray(input.labels) && input.labels.every(l => LABELS.includes(l)) && input.labels.length <= 5) v.labels = JSON.stringify([...new Set(input.labels)]);
    else return { ok: false, status: 400, error: 'invalid labels' };
  }
  if (has('methodology')) v.methodology = nul('methodology') ? null : plainText(input.methodology, 5000);
  if (has('pr_provided_by')) v.pr_provided_by = nul('pr_provided_by') ? null : plainText(input.pr_provided_by, 200);
  if (has('pr_original_date')) v.pr_original_date = nul('pr_original_date') ? null : plainText(input.pr_original_date, 40);
  if (has('pr_original_source_url')) {
    const r = validatePublicUrl(input.pr_original_source_url);
    if (!r.ok) return { ok: false, status: 400, error: `pr_original_source_url: ${r.error}` };
    v.pr_original_source_url = r.value;
  }
  if (has('disclosure_json')) {
    if (input.disclosure_json === null) v.disclosure_json = null;
    else if (input.disclosure_json && typeof input.disclosure_json === 'object' && !Array.isArray(input.disclosure_json)) {
      const out = {};
      for (const key of DISCLOSURE_KEYS) if (key in input.disclosure_json) out[key] = input.disclosure_json[key] === true;
      v.disclosure_json = JSON.stringify(out);
    } else return { ok: false, status: 400, error: 'invalid disclosure_json' };
  }

  // Press releases must never pass as independent reporting: require attribution.
  const finalType = 'article_type' in v ? v.article_type : cur.article_type;
  const finalClass = 'content_class' in v ? v.content_class : cur.content_class;
  const finalProvider = 'pr_provided_by' in v ? v.pr_provided_by : cur.pr_provided_by;
  if ((finalType === 'press_release' || finalClass === 'press_release') && !finalProvider) {
    return { ok: false, status: 400, error: 'press releases require pr_provided_by' };
  }

  const cols = Object.keys(v);
  if (!cols.length) return { ok: true, changed: [] };
  await db.prepare(`UPDATE news SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(...cols.map(c => v[c]), newsId).run();
  await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: 'news', entityId: newsId, metadata: { fields: cols } });
  return { ok: true, changed: cols };
}

// ── Article relations (replace-set semantics per provided key) ──
async function idsExist(db, table, ids) {
  if (!ids.length) return true;
  const r = await db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).first();
  return r.c === ids.length;
}
const uniqInts = (a, max = 50) => {
  if (!Array.isArray(a) || a.length > max) return null;
  const n = a.map(Number);
  return n.every(Number.isInteger) ? [...new Set(n)] : null;
};

// Read-side counterpart to setArticleRelations, added alongside the
// Super API's GET .../:id/newsroom-relations endpoint. Table/column
// names here are hardcoded literals (not derived from input), same
// SQL-safety posture as the rest of this file.
export async function getArticleRelations(db, newsId) {
  const [topics, series, entities, countries, related] = await Promise.all([
    db.prepare(`SELECT topic_id FROM news_article_topics WHERE news_id = ?`).bind(newsId).all(),
    db.prepare(`SELECT series_id, position FROM news_series_articles WHERE news_id = ? ORDER BY position`).bind(newsId).all(),
    db.prepare(`SELECT entity_id, role, display_order FROM news_article_entities WHERE news_id = ? ORDER BY display_order`).bind(newsId).all(),
    db.prepare(`SELECT country_code, is_primary FROM news_article_countries WHERE news_id = ?`).bind(newsId).all(),
    db.prepare(`SELECT related_news_id, relation_type, display_order FROM news_related WHERE news_id = ? ORDER BY display_order`).bind(newsId).all()
  ]);
  return {
    topic_ids: (topics.results || []).map(r => r.topic_id),
    series_ids: (series.results || []).map(r => r.series_id),
    entities: (entities.results || []).map(r => ({ id: r.entity_id, role: r.role })),
    countries: (countries.results || []).map(r => ({ code: r.country_code, is_primary: !!r.is_primary })),
    related: (related.results || []).map(r => ({ news_id: r.related_news_id, relation_type: r.relation_type }))
  };
}

export async function setArticleRelations(db, newsId, input, { actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return { ok: false, status: 403, error: 'forbidden' };
  const art = await db.prepare(`SELECT id FROM news WHERE id = ?`).bind(newsId).first();
  if (!art) return { ok: false, status: 404, error: 'article not found' };
  const changed = [];

  // Validate everything first, write after: no partial application.
  const plan = [];

  if (input?.topic_ids !== undefined) {
    const ids = uniqInts(input.topic_ids); if (!ids) return { ok: false, status: 400, error: 'invalid topic_ids' };
    if (!(await idsExist(db, 'news_topics', ids))) return { ok: false, status: 400, error: 'unknown topic' };
    plan.push(['topics', ids]);
  }
  if (input?.series_ids !== undefined) {
    const ids = uniqInts(input.series_ids, 10); if (!ids) return { ok: false, status: 400, error: 'invalid series_ids' };
    if (!(await idsExist(db, 'news_series', ids))) return { ok: false, status: 400, error: 'unknown series' };
    plan.push(['series', ids]);
  }
  if (input?.entities !== undefined) {
    if (!Array.isArray(input.entities) || input.entities.length > 50) return { ok: false, status: 400, error: 'invalid entities' };
    const list = input.entities.map((e, i) => ({ id: Number(e?.id ?? e), role: e?.role ? plainText(e.role, 40) : null, order: i }));
    if (!list.every(e => Number.isInteger(e.id))) return { ok: false, status: 400, error: 'invalid entities' };
    if (!(await idsExist(db, 'news_entities', [...new Set(list.map(e => e.id))]))) return { ok: false, status: 400, error: 'unknown entity' };
    plan.push(['entities', list]);
  }
  if (input?.countries !== undefined) {
    if (!Array.isArray(input.countries) || input.countries.length > 30) return { ok: false, status: 400, error: 'invalid countries' };
    const codes = [...new Set(input.countries.map(c => String(c?.code ?? c).toUpperCase()))];
    if (!codes.every(c => /^[A-Z]{2}$/.test(c))) return { ok: false, status: 400, error: 'invalid country code' };
    if (codes.length) {
      const r = await db.prepare(`SELECT COUNT(*) AS c FROM countries WHERE code IN (${codes.map(() => '?').join(',')})`).bind(...codes).first();
      if (r.c !== codes.length) return { ok: false, status: 400, error: 'unknown country' };
    }
    const primary = input.primary_country ? String(input.primary_country).toUpperCase() : null;
    if (primary && !codes.includes(primary)) return { ok: false, status: 400, error: 'primary country must be one of the countries' };
    plan.push(['countries', { codes, primary }]);
  }
  if (input?.related !== undefined) {
    if (!Array.isArray(input.related) || input.related.length > 20) return { ok: false, status: 400, error: 'invalid related' };
    const list = input.related.map((r, i) => ({ id: Number(r?.news_id), type: r?.relation_type || 'related', order: i }));
    if (!list.every(r => Number.isInteger(r.id) && RELATION_TYPES.includes(r.type) && r.id !== newsId)) return { ok: false, status: 400, error: 'invalid related story' };
    if (!(await idsExist(db, 'news', [...new Set(list.map(r => r.id))]))) return { ok: false, status: 400, error: 'unknown related article' };
    plan.push(['related', list]);
  }

  for (const [what, data] of plan) {
    if (what === 'topics') {
      await db.prepare(`DELETE FROM news_article_topics WHERE news_id = ?`).bind(newsId).run();
      for (const id of data) await db.prepare(`INSERT INTO news_article_topics (news_id, topic_id) VALUES (?, ?)`).bind(newsId, id).run();
    } else if (what === 'series') {
      const existing = (await db.prepare(`SELECT series_id, position FROM news_series_articles WHERE news_id = ?`).bind(newsId).all()).results || [];
      const pos = new Map(existing.map(e => [e.series_id, e.position])); // keep editorial order when re-saving
      await db.prepare(`DELETE FROM news_series_articles WHERE news_id = ?`).bind(newsId).run();
      for (const id of data) {
        let p = pos.get(id);
        if (p === undefined) p = ((await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM news_series_articles WHERE series_id = ?`).bind(id).first()).p);
        await db.prepare(`INSERT INTO news_series_articles (series_id, news_id, position) VALUES (?, ?, ?)`).bind(id, newsId, p).run();
      }
    } else if (what === 'entities') {
      await db.prepare(`DELETE FROM news_article_entities WHERE news_id = ?`).bind(newsId).run();
      const seen = new Set();
      for (const e of data) {
        if (seen.has(e.id)) continue; seen.add(e.id);
        await db.prepare(`INSERT INTO news_article_entities (news_id, entity_id, role, display_order) VALUES (?, ?, ?, ?)`).bind(newsId, e.id, e.role, e.order).run();
      }
    } else if (what === 'countries') {
      await db.prepare(`DELETE FROM news_article_countries WHERE news_id = ?`).bind(newsId).run();
      for (const code of data.codes) await db.prepare(`INSERT INTO news_article_countries (news_id, country_code, is_primary) VALUES (?, ?, ?)`).bind(newsId, code, code === data.primary ? 1 : 0).run();
      if (data.primary !== null) await db.prepare(`UPDATE news SET primary_country = ? WHERE id = ?`).bind(data.primary, newsId).run();
    } else if (what === 'related') {
      await db.prepare(`DELETE FROM news_related WHERE news_id = ?`).bind(newsId).run();
      const seen = new Set();
      for (const r of data) {
        const key = `${r.id}:${r.type}`; if (seen.has(key)) continue; seen.add(key);
        await db.prepare(`INSERT INTO news_related (news_id, related_news_id, relation_type, display_order) VALUES (?, ?, ?, ?)`).bind(newsId, r.id, r.type, r.order).run();
      }
    }
    changed.push(what);
  }
  if (changed.length) await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: 'news', entityId: newsId, metadata: { relations: changed } });
  return { ok: true, changed };
}
