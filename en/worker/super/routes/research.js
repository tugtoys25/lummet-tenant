// Super API routes: Research sources, claims and claim-source links.
// Each entry: [METHOD, path-pattern, handler, resource-name]. Order matters (first match wins);
// router.js joins the groups in the order the table always had.
import * as rsh from "../handlers-research.js";

export const RESEARCH_ROUTES = [
  // Research Engine Phase 2 (v14) -- sources (global) + claims
  // (scoped to a research_item_id) + the claim<->source evidence
  // links. Thin wrapper around worker/database/research-sources.js
  // and worker/database/research-claims.js (added with migration
  // 0046_research_sources_claims.sql; the tenant's own
  // /api/v1/research-sources/* and /api/v1/research-claims/* admin
  // routes already use these unmodified). DELETE on a source is a
  // real hard delete (global table, no citation-count guard on the
  // tenant's own admin route either); claims/claim-sources cascade
  // via their own foreign keys. Relations/versions/review-queue/
  // datasets (the other four research sub-systems) are NOT exposed
  // yet -- deferred to a later phase.
  ["GET", "/en/api/super/research-sources", rsh.handleListResearchSources, "research_sources"],
  ["GET", "/en/api/super/research-sources/:id", rsh.handleGetResearchSource, "research_sources"],
  ["POST", "/en/api/super/research-sources", rsh.handleCreateResearchSource, "research_sources"],
  ["PUT", "/en/api/super/research-sources/:id", rsh.handleUpdateResearchSource, "research_sources"],
  ["DELETE", "/en/api/super/research-sources/:id", rsh.handleDeleteResearchSource, "research_sources"],

  ["GET", "/en/api/super/research-claims", rsh.handleListResearchClaims, "research_claims"],
  ["GET", "/en/api/super/research-claims/:id", rsh.handleGetResearchClaim, "research_claims"],
  ["POST", "/en/api/super/research-claims", rsh.handleCreateResearchClaim, "research_claims"],
  ["PUT", "/en/api/super/research-claims/:id", rsh.handleUpdateResearchClaim, "research_claims"],
  ["DELETE", "/en/api/super/research-claims/:id", rsh.handleDeleteResearchClaim, "research_claims"],

  ["POST", "/en/api/super/research-claim-sources", rsh.handleAttachResearchClaimSource, "research_claims"],
  ["DELETE", "/en/api/super/research-claim-sources/:id", rsh.handleDetachResearchClaimSource, "research_claims"]
];
