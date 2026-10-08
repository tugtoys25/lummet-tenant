// =====================================================
// RESEARCH ENGINE — Phase 2 database layer: sources
// research_sources is global/reusable — never duplicated per
// research item. Plain async CRUD, same shape as research.js.
// =====================================================

const SOURCE_TYPES = [
  "regulator", "government", "legislation", "court",
  "eu_institution", "official_register", "operator",
  "industry_organization", "academic", "research_organization",
  "news", "other"
];

export function isValidSourceType(type) {
  return SOURCE_TYPES.includes(type);
}

export async function getSource(db, id) {
  return await db.prepare(`
    SELECT s.*, c.name AS country_name
    FROM research_sources s
    LEFT JOIN countries c ON c.code = s.country_id
    WHERE s.id = ? LIMIT 1
  `).bind(id).first();
}

export async function getAllSources(db) {
  const result = await db.prepare(`
    SELECT s.*, c.name AS country_name,
           (SELECT COUNT(*) FROM research_claim_sources cs WHERE cs.source_id = s.id) AS citation_count
    FROM research_sources s
    LEFT JOIN countries c ON c.code = s.country_id
    ORDER BY s.organisation, s.title
  `).all();
  return result.results || [];
}

/** Sources actually cited by claims belonging to one research item — used to build the public footnote list. */
export async function getSourcesForResearchItem(db, researchItemId) {
  const result = await db.prepare(`
    SELECT DISTINCT s.*
    FROM research_sources s
    JOIN research_claim_sources cs ON cs.source_id = s.id
    JOIN research_claims c ON c.id = cs.claim_id
    WHERE c.research_item_id = ?
    ORDER BY s.organisation
  `).bind(researchItemId).all();
  return result.results || [];
}

/** Batch-fetch specific sources by id — used to resolve source_citation content blocks (which cite a source_id directly, independent of the claims table) alongside claim-linked sources. */
export async function getSourcesByIds(db, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean).map(Number))];
  if (uniqueIds.length === 0) return [];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT * FROM research_sources WHERE id IN (${placeholders})`
  ).bind(...uniqueIds).all();
  return result.results || [];
}

export async function createSource(db, data) {
  if (data.source_type && !isValidSourceType(data.source_type)) {
    throw new Error(`Invalid source type: ${data.source_type}`);
  }
  let domain = data.domain || null;
  if (!domain && data.url) {
    try { domain = new URL(data.url).hostname.replace(/^www\./, ""); } catch { /* leave null on unparsable URL */ }
  }

  const result = await db.prepare(`
    INSERT INTO research_sources (
      organisation, title, url, domain, source_type, country_id,
      is_primary, document_type, language, publication_date, accessed_at,
      status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.organisation,
    data.title || null,
    data.url || null,
    domain,
    data.source_type || "other",
    data.country_id || null,
    data.is_primary ? 1 : 0,
    data.document_type || null,
    data.language || null,
    data.publication_date || null,
    data.accessed_at || null,
    data.status || "active",
    data.notes || null
  ).run();

  return result;
}

export async function updateSource(db, id, data) {
  if (data.source_type && !isValidSourceType(data.source_type)) {
    throw new Error(`Invalid source type: ${data.source_type}`);
  }
  let domain = data.domain || null;
  if (!domain && data.url) {
    try { domain = new URL(data.url).hostname.replace(/^www\./, ""); } catch { /* leave null on unparsable URL */ }
  }

  const result = await db.prepare(`
    UPDATE research_sources SET
      organisation=?, title=?, url=?, domain=?, source_type=?, country_id=?,
      is_primary=?, document_type=?, language=?, publication_date=?, accessed_at=?,
      status=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    data.organisation,
    data.title || null,
    data.url || null,
    domain,
    data.source_type || "other",
    data.country_id || null,
    data.is_primary ? 1 : 0,
    data.document_type || null,
    data.language || null,
    data.publication_date || null,
    data.accessed_at || null,
    data.status || "active",
    data.notes || null,
    id
  ).run();

  return result;
}

export async function deleteSource(db, id) {
  return await db.prepare(`DELETE FROM research_sources WHERE id = ?`).bind(id).run();
}

/** Sources with status='active' but not accessed in a long time — feeds the Phase 5 review queue. */
export async function getStaleSources(db, olderThanDays = 180) {
  const result = await db.prepare(`
    SELECT id, organisation, title, url, accessed_at
    FROM research_sources
    WHERE status = 'active'
      AND (accessed_at IS NULL OR accessed_at < datetime('now', ?))
    ORDER BY accessed_at ASC
  `).bind(`-${olderThanDays} days`).all();
  return result.results || [];
}

export { SOURCE_TYPES };
