// =====================================================
// RESEARCH ENGINE — Phase 5: review queue
//
// Every function here reads existing data (research_items,
// research_sources, research_claims, research_relations) — this
// module stores nothing new, it just answers "what needs a human
// editor's attention right now" (spec section 19).
// =====================================================

import * as researchRelations from "./research-relations.js";

/** Published items whose next_review_at has passed. */
export async function getOverdueVerification(db) {
  const result = await db.prepare(`
    SELECT id, type, slug, title, next_review_at
    FROM research_items
    WHERE published = 1 AND next_review_at IS NOT NULL AND next_review_at < CURRENT_TIMESTAMP
    ORDER BY next_review_at ASC
  `).all();
  return result.results || [];
}

/** Sources whose last health check came back broken/timeout. */
export async function getBrokenSources(db) {
  const result = await db.prepare(`
    SELECT s.*, c.name AS country_name,
           (SELECT COUNT(*) FROM research_claim_sources cs WHERE cs.source_id = s.id) AS citation_count
    FROM research_sources s
    LEFT JOIN countries c ON c.code = s.country_id
    WHERE s.status = 'broken'
    ORDER BY s.updated_at DESC
  `).all();
  return result.results || [];
}

/** Active sources not (re-)checked in a while — same threshold the scheduled job itself uses by default. */
export async function getStaleSources(db, olderThanDays = 180) {
  const result = await db.prepare(`
    SELECT id, organisation, title, url, accessed_at
    FROM research_sources
    WHERE status = 'active' AND (accessed_at IS NULL OR accessed_at < datetime('now', ?))
    ORDER BY accessed_at ASC
  `).bind(`-${olderThanDays} days`).all();
  return result.results || [];
}

/** Published items with zero claims — a research page making regulatory assertions with nothing independently verifiable behind them. */
export async function getItemsMissingCitations(db) {
  const result = await db.prepare(`
    SELECT ri.id, ri.type, ri.slug, ri.title
    FROM research_items ri
    WHERE ri.published = 1 AND ri.status != 'draft'
      AND NOT EXISTS (SELECT 1 FROM research_claims rc WHERE rc.research_item_id = ri.id)
    ORDER BY ri.updated_at DESC
  `).all();
  return result.results || [];
}

/** Published items missing SEO title or description. */
export async function getItemsMissingSeo(db) {
  const result = await db.prepare(`
    SELECT id, type, slug, title, seo_title, seo_description
    FROM research_items
    WHERE published = 1 AND status != 'draft'
      AND (seo_title IS NULL OR TRIM(seo_title) = '' OR seo_description IS NULL OR TRIM(seo_description) = '')
    ORDER BY updated_at DESC
  `).all();
  return result.results || [];
}

/**
 * Relations whose target entity no longer resolves — e.g. a casino
 * that was linked from a research item and later deleted. Scans in
 * batches per (from_type,to_type) pair rather than resolving one
 * relation at a time.
 */
export async function getOrphanRelations(db) {
  const allResult = await db.prepare(`SELECT * FROM research_relations ORDER BY id`).all();
  const relations = allResult.results || [];
  if (relations.length === 0) return [];

  const targets = relations.map((r) => ({ type: r.to_type, id: r.to_id }));
  const resolved = await researchRelations.resolveEntities(db, targets);

  const orphans = [];
  relations.forEach((r, i) => {
    if (!resolved[i].exists) orphans.push({ ...r, unresolved_target: `${r.to_type}:${r.to_id}` });
  });
  return orphans;
}

/** Counts only — powers the dashboard overview cards without pulling every row. */
export async function getReviewQueueCounts(db) {
  const [overdue, broken, stale, missingCitations, missingSeo, orphanRelations] = await Promise.all([
    getOverdueVerification(db),
    getBrokenSources(db),
    getStaleSources(db),
    getItemsMissingCitations(db),
    getItemsMissingSeo(db),
    getOrphanRelations(db)
  ]);

  return {
    overdueVerification: overdue.length,
    brokenSources: broken.length,
    staleSources: stale.length,
    missingCitations: missingCitations.length,
    missingSeo: missingSeo.length,
    orphanRelations: orphanRelations.length
  };
}
