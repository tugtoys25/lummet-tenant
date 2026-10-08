// =====================================================
// RESEARCH ENGINE — Phase 2 database layer: claims
// research_claims scoped to one research_item; sourced via
// research_claim_sources (many-to-many with research_sources).
// =====================================================

const CLAIM_STATUSES = ["unverified", "verified", "disputed", "superseded"];
const SUPPORT_TYPES = ["direct", "partial", "contextual", "disputed"];

export function isValidClaimStatus(status) {
  return CLAIM_STATUSES.includes(status);
}

export function isValidSupportType(type) {
  return SUPPORT_TYPES.includes(type);
}

export async function getClaim(db, id) {
  return await db.prepare(`SELECT * FROM research_claims WHERE id = ? LIMIT 1`).bind(id).first();
}

/** All claims for one research item, each with its attached sources nested in. */
export async function getClaimsForResearchItem(db, researchItemId) {
  const claimsResult = await db.prepare(`
    SELECT cl.*, c.name AS jurisdiction_name
    FROM research_claims cl
    LEFT JOIN countries c ON c.code = cl.jurisdiction_id
    WHERE cl.research_item_id = ?
    ORDER BY cl.created_at ASC
  `).bind(researchItemId).all();
  const claims = claimsResult.results || [];
  if (claims.length === 0) return [];

  const claimIds = claims.map((c) => c.id);
  const placeholders = claimIds.map(() => "?").join(",");
  const sourcesResult = await db.prepare(`
    SELECT cs.*, s.organisation, s.title AS source_title, s.url AS source_url, s.is_primary
    FROM research_claim_sources cs
    JOIN research_sources s ON s.id = cs.source_id
    WHERE cs.claim_id IN (${placeholders})
    ORDER BY cs.id ASC
  `).bind(...claimIds).all();

  const sourcesByClaim = new Map();
  for (const row of sourcesResult.results || []) {
    if (!sourcesByClaim.has(row.claim_id)) sourcesByClaim.set(row.claim_id, []);
    sourcesByClaim.get(row.claim_id).push(row);
  }

  return claims.map((c) => ({ ...c, sources: sourcesByClaim.get(c.id) || [] }));
}

export async function createClaim(db, data) {
  if (data.status && !isValidClaimStatus(data.status)) {
    throw new Error(`Invalid claim status: ${data.status}`);
  }
  const result = await db.prepare(`
    INSERT INTO research_claims (
      research_item_id, claim_text, claim_type, status, jurisdiction_id,
      valid_from, valid_until, verified_at, verified_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    Number(data.research_item_id),
    data.claim_text,
    data.claim_type || "fact",
    data.status || "unverified",
    data.jurisdiction_id || null,
    data.valid_from || null,
    data.valid_until || null,
    data.status === "verified" && !data.verified_at ? new Date().toISOString() : (data.verified_at || null),
    data.verified_by || null
  ).run();

  return result;
}

export async function updateClaim(db, id, data) {
  if (data.status && !isValidClaimStatus(data.status)) {
    throw new Error(`Invalid claim status: ${data.status}`);
  }

  let verifiedAt = data.verified_at || null;
  if (data.status === "verified" && !verifiedAt) {
    const existing = await getClaim(db, id);
    verifiedAt = existing?.verified_at || new Date().toISOString();
  }

  const result = await db.prepare(`
    UPDATE research_claims SET
      claim_text=?, claim_type=?, status=?, jurisdiction_id=?,
      valid_from=?, valid_until=?, verified_at=?, verified_by=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    data.claim_text,
    data.claim_type || "fact",
    data.status || "unverified",
    data.jurisdiction_id || null,
    data.valid_from || null,
    data.valid_until || null,
    verifiedAt,
    data.verified_by || null,
    id
  ).run();

  return result;
}

export async function deleteClaim(db, id) {
  return await db.prepare(`DELETE FROM research_claims WHERE id = ?`).bind(id).run();
}

export async function attachSourceToClaim(db, data) {
  if (data.support_type && !isValidSupportType(data.support_type)) {
    throw new Error(`Invalid support type: ${data.support_type}`);
  }
  return await db.prepare(`
    INSERT INTO research_claim_sources (claim_id, source_id, citation_context, source_quote, support_type)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    Number(data.claim_id),
    Number(data.source_id),
    data.citation_context || null,
    data.source_quote || null,
    data.support_type || "direct"
  ).run();
}

export async function detachSourceFromClaim(db, claimSourceId) {
  return await db.prepare(`DELETE FROM research_claim_sources WHERE id = ?`).bind(claimSourceId).run();
}

export { CLAIM_STATUSES, SUPPORT_TYPES };
