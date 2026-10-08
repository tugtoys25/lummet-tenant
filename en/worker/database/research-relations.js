// =====================================================
// RESEARCH ENGINE — Phase 3 database layer: relationships
//
// research_relations is polymorphic: from_type/to_type select
// which existing table from_id/to_id actually points into.
// Referential integrity and the public link/label for each side
// are resolved here in application code (the schema itself
// cannot express a polymorphic foreign key).
// =====================================================

export const ENTITY_TYPES = ["research_item", "casino", "country", "category", "payment_method"];

export const RELATION_TYPES = [
  "covers", "located_in", "operates_in", "regulated_by", "regulates",
  "licensed_by", "requires", "uses", "related_to", "part_of", "contains",
  "updates", "supersedes", "superseded_by", "cites", "supports",
  "contradicts", "derived_from", "mentions", "affects", "affected_by",
  "applies_to", "available_in", "restricted_in"
];

// The inverse of each relation_type — used so a relation stored once
// (A regulated_by B) can be shown from B's side too (B regulates A)
// without inserting a second row. Types with no natural inverse
// (e.g. related_to) map to themselves.
const INVERSE_RELATION = {
  covers: "covered_by",
  located_in: "contains",
  operates_in: "operated_in_by",
  regulated_by: "regulates",
  regulates: "regulated_by",
  licensed_by: "licenses",
  requires: "required_by",
  uses: "used_by",
  related_to: "related_to",
  part_of: "contains",
  contains: "part_of",
  updates: "updated_by",
  supersedes: "superseded_by",
  superseded_by: "supersedes",
  cites: "cited_by",
  supports: "supported_by",
  contradicts: "contradicted_by",
  derived_from: "source_of",
  mentions: "mentioned_by",
  affects: "affected_by",
  affected_by: "affects",
  applies_to: "subject_to",
  available_in: "hosts",
  restricted_in: "restricts"
};

export function isValidEntityType(type) {
  return ENTITY_TYPES.includes(type);
}

export function isValidRelationType(type) {
  return RELATION_TYPES.includes(type);
}

// Per-type lookup: id column, name column, slug/route-key column,
// and the public route builder. research_item is handled specially
// since its route depends on its own `type` sub-field, not just id.
const ENTITY_CONFIG = {
  casino: { table: "casinos", idColType: "INTEGER", nameCol: "name", slugCol: "slug", route: (row) => `/en/casino/${row.slug}` },
  country: { table: "countries", idColType: "TEXT", nameCol: "name", slugCol: "code", route: (row) => `/en/country/${row.code}` },
  category: { table: "categories", idColType: "INTEGER", nameCol: "name", slugCol: "slug", route: (row) => `/en/category/${row.slug}` },
  payment_method: { table: "payment_methods", idColType: "INTEGER", nameCol: "name", slugCol: "slug", route: (row) => `/en/payment-methods/${row.slug}` },
};

/**
 * Batch-resolve a list of { type, id } refs into { type, id, label, url, exists }.
 * Groups by type so each type is fetched in a single query.
 */
export async function resolveEntities(db, refs) {
  const byType = new Map();
  for (const ref of refs) {
    if (!byType.has(ref.type)) byType.set(ref.type, new Set());
    byType.get(ref.type).add(String(ref.id));
  }

  const resolved = new Map(); // key: `${type}:${id}` -> { label, url }

  for (const [type, idSet] of byType.entries()) {
    const ids = [...idSet];
    if (ids.length === 0) continue;

    if (type === "research_item") {
      const placeholders = ids.map(() => "?").join(",");
      const result = await db.prepare(
        `SELECT id, type, slug, title FROM research_items WHERE id IN (${placeholders})`
      ).bind(...ids.map(Number)).all();
      for (const row of result.results || []) {
        resolved.set(`research_item:${row.id}`, { label: row.title, url: `/en/research/${row.type}/${row.slug}` });
      }
      continue;
    }

    const config = ENTITY_CONFIG[type];
    if (!config) continue;

    const idCol = config.slugCol === "code" ? "code" : "id";
    const placeholders = ids.map(() => "?").join(",");
    const boundIds = config.idColType === "INTEGER" ? ids.map(Number) : ids;
    const result = await db.prepare(
      `SELECT * FROM ${config.table} WHERE ${idCol} IN (${placeholders})`
    ).bind(...boundIds).all();
    for (const row of result.results || []) {
      const key = config.idColType === "INTEGER" ? row.id : row[idCol];
      resolved.set(`${type}:${key}`, { label: row[config.nameCol], url: config.route(row) });
    }
  }

  return refs.map((ref) => {
    const hit = resolved.get(`${ref.type}:${ref.id}`);
    return { type: ref.type, id: ref.id, label: hit?.label || null, url: hit?.url || null, exists: !!hit };
  });
}

/** All relations where the given entity is the "from" side, with the "to" side resolved. */
export async function getRelationsFrom(db, fromType, fromId) {
  const result = await db.prepare(`
    SELECT * FROM research_relations
    WHERE from_type = ? AND from_id = ?
    ORDER BY sort_order ASC, id ASC
  `).bind(fromType, String(fromId)).all();
  const rows = result.results || [];
  if (rows.length === 0) return [];

  const resolvedTargets = await resolveEntities(db, rows.map((r) => ({ type: r.to_type, id: r.to_id })));
  return rows.map((r, i) => ({ ...r, target: resolvedTargets[i] }));
}

/**
 * Batched version of getRelationsFrom for many source entities of the
 * SAME from_type at once (one query + one batched resolveEntities
 * call, instead of N+1) — built for listing pages like the research
 * hub, which need "what is each of these 20 items related to" without
 * running 20 separate relation lookups. Returns a Map keyed by
 * fromId (string) -> array of { ...relationRow, target }.
 */
export async function getRelationsFromMany(db, fromType, fromIds) {
  const ids = [...new Set((fromIds || []).map(String))];
  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT * FROM research_relations
    WHERE from_type = ? AND from_id IN (${placeholders})
    ORDER BY from_id, sort_order ASC, id ASC
  `).bind(fromType, ...ids).all();
  const rows = result.results || [];

  const byFromId = new Map(ids.map((id) => [id, []]));
  if (rows.length === 0) return byFromId;

  const resolvedTargets = await resolveEntities(db, rows.map((r) => ({ type: r.to_type, id: r.to_id })));
  rows.forEach((r, i) => {
    byFromId.get(r.from_id).push({ ...r, target: resolvedTargets[i] });
  });
  return byFromId;
}

/** All relations where the given entity is the "to" side, with the "from" side resolved — lets a country page show "Casinos regulated in this country" even though the row was stored from the casino's side. */
export async function getRelationsTo(db, toType, toId) {
  const result = await db.prepare(`
    SELECT * FROM research_relations
    WHERE to_type = ? AND to_id = ?
    ORDER BY sort_order ASC, id ASC
  `).bind(toType, String(toId)).all();
  const rows = result.results || [];
  if (rows.length === 0) return [];

  const resolvedSources = await resolveEntities(db, rows.map((r) => ({ type: r.from_type, id: r.from_id })));
  return rows.map((r, i) => ({
    ...r,
    // shown from the "to" side, so the relation reads in its inverse direction
    relation_type: INVERSE_RELATION[r.relation_type] || r.relation_type,
    target: resolvedSources[i]
  }));
}

/** Both directions combined — what a research item's admin "Relationships" tab and public "Related" section both need. */
export async function getAllRelationsForEntity(db, type, id) {
  const [outgoing, incoming] = await Promise.all([
    getRelationsFrom(db, type, id),
    getRelationsTo(db, type, id)
  ]);
  return [...outgoing, ...incoming];
}

export async function createRelation(db, data) {
  if (!isValidEntityType(data.from_type)) throw new Error(`Invalid from_type: ${data.from_type}`);
  if (!isValidEntityType(data.to_type)) throw new Error(`Invalid to_type: ${data.to_type}`);
  if (!isValidRelationType(data.relation_type)) throw new Error(`Invalid relation_type: ${data.relation_type}`);

  return await db.prepare(`
    INSERT INTO research_relations (
      from_type, from_id, to_type, to_id, relation_type, label,
      sort_order, is_primary, valid_from, valid_until, source_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.from_type,
    String(data.from_id),
    data.to_type,
    String(data.to_id),
    data.relation_type,
    data.label || null,
    data.sort_order ?? 0,
    data.is_primary ? 1 : 0,
    data.valid_from || null,
    data.valid_until || null,
    data.source_id ? Number(data.source_id) : null
  ).run();
}

export async function deleteRelation(db, id) {
  return await db.prepare(`DELETE FROM research_relations WHERE id = ?`).bind(id).run();
}

/**
 * Simple text search across the 5 entity types, for the admin's
 * relationship entity picker — one grouped result set rather than
 * making the admin type raw ids.
 */
export async function searchEntities(db, query, limit = 8) {
  const term = `%${query.toLowerCase()}%`;
  const results = [];

  const riResult = await db.prepare(`
    SELECT id, type, slug, title FROM research_items
    WHERE LOWER(title) LIKE ? LIMIT ?
  `).bind(term, limit).all();
  for (const r of riResult.results || []) {
    results.push({ type: "research_item", id: r.id, label: `${r.title} (${r.type})`, url: `/en/research/${r.type}/${r.slug}` });
  }

  for (const [type, config] of Object.entries(ENTITY_CONFIG)) {
    const idCol = config.slugCol === "code" ? "code" : "id";
    const r = await db.prepare(
      `SELECT * FROM ${config.table} WHERE LOWER(${config.nameCol}) LIKE ? LIMIT ?`
    ).bind(term, limit).all();
    for (const row of r.results || []) {
      results.push({ type, id: config.idColType === "INTEGER" ? row.id : row[idCol], label: row[config.nameCol], url: config.route(row) });
    }
  }

  return results;
}
