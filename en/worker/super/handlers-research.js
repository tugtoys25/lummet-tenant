// =====================================================
// SUPER API — HANDLERS (Research: sources, claims,
// claim<->source attachments)
//
// Thin wrappers around the tenant's existing
// worker/database/research-sources.js and
// worker/database/research-claims.js, unmodified. No business
// logic duplicated: source_type/claim_status/support_type
// validation, domain-from-url derivation, and verified_at
// auto-stamping all still live in those two files exactly as the
// tenant's own /api/v1/research-sources/* and (claims equivalent)
// admin routes already use them.
//
// Unlike newsroom-taxonomy.js, neither module has an internal
// actor/perms permission gate or its own audit-log call — same as
// worker/database/offers.js etc. — so no SUPER_API_ACTOR sentinel is
// needed here; the Super API's credential being tenant-wide-admin-
// equivalent is what already governs every write in this API.
//
// research_sources is a GLOBAL table (never duplicated per research
// item) — DELETE here is a real hard delete, matching the tenant's
// own /api/v1/research-sources/delete route, which has no
// citation-count guard either (verified against worker/api.js).
// research_claims and research_claim_sources cascade-delete via
// their own foreign keys (ON DELETE CASCADE in migration 0046), so
// deleting a claim also removes its source attachments.
// =====================================================

import * as sourcesDB from "../database/research-sources.js";
import * as claimsDB from "../database/research-claims.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function ok(data = {}) { return json({ success: true, ...data }, 200); }
function created(data = {}) { return json({ success: true, ...data }, 201); }
function fail(message, status = 400) { return json({ success: false, error: message }, status); }

async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch (_) { return {}; }
}

// -----------------------------------------------------
// Sources (global, not scoped to a research item)
// -----------------------------------------------------

export async function handleListResearchSources(request, env) {
  const rows = await sourcesDB.getAllSources(env.DB);
  return ok({ data: rows });
}

export async function handleGetResearchSource(request, env, id) {
  const row = await sourcesDB.getSource(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateResearchSource(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.organisation) return fail("organisation is required", 422);
  try {
    const result = await sourcesDB.createSource(env.DB, body);
    return created({ data: { id: result.meta.last_row_id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateResearchSource(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.organisation) return fail("organisation is required", 422);
  const existing = await sourcesDB.getSource(env.DB, Number(id));
  if (!existing) return fail("not_found", 404);
  try {
    await sourcesDB.updateSource(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteResearchSource(request, env, id) {
  const existing = await sourcesDB.getSource(env.DB, Number(id));
  if (!existing) return fail("not_found", 404);
  await sourcesDB.deleteSource(env.DB, Number(id));
  return ok();
}

// -----------------------------------------------------
// Claims (scoped to one research_item_id)
// -----------------------------------------------------

export async function handleListResearchClaims(request, env) {
  const url = new URL(request.url);
  const researchItemId = url.searchParams.get("research_item_id");
  if (!researchItemId) return fail("research_item_id query param is required", 400);
  const rows = await claimsDB.getClaimsForResearchItem(env.DB, Number(researchItemId));
  return ok({ data: rows });
}

export async function handleGetResearchClaim(request, env, id) {
  const row = await claimsDB.getClaim(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateResearchClaim(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.research_item_id || !body.claim_text) return fail("research_item_id and claim_text are required", 422);
  try {
    const result = await claimsDB.createClaim(env.DB, body);
    return created({ data: { id: result.meta.last_row_id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateResearchClaim(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.claim_text) return fail("claim_text is required", 422);
  const existing = await claimsDB.getClaim(env.DB, Number(id));
  if (!existing) return fail("not_found", 404);
  try {
    await claimsDB.updateClaim(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteResearchClaim(request, env, id) {
  const existing = await claimsDB.getClaim(env.DB, Number(id));
  if (!existing) return fail("not_found", 404);
  await claimsDB.deleteClaim(env.DB, Number(id));
  return ok();
}

// -----------------------------------------------------
// Claim <-> Source attachments (the evidence links)
// -----------------------------------------------------

export async function handleAttachResearchClaimSource(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.claim_id || !body.source_id) return fail("claim_id and source_id are required", 422);
  const claim = await claimsDB.getClaim(env.DB, Number(body.claim_id));
  if (!claim) return fail("unknown claim_id", 400);
  const source = await sourcesDB.getSource(env.DB, Number(body.source_id));
  if (!source) return fail("unknown source_id", 400);
  try {
    const result = await claimsDB.attachSourceToClaim(env.DB, body);
    return created({ data: { id: result.meta.last_row_id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDetachResearchClaimSource(request, env, id) {
  await claimsDB.detachSourceFromClaim(env.DB, Number(id));
  return ok();
}
