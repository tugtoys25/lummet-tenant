import * as programsDB from "../../database/affiliate-programs.js";
import * as termsDB from "../../database/affiliate-commercial-terms.js";
import * as offersDB from "../../database/offers.js";
import * as trackingLinksDB from "../../database/tracking-links.js";
import { created, fail, ok, readJsonBody, validateRequired } from "./shared.js";

// =====================================================
// COMMERCIAL TERMS
// Deliberately read+create only through this generic contract --
// terms are versioned/immutable by design (see
// migrations/0023_affiliate_partners_programs.sql and
// worker/database/affiliate-commercial-terms.js). The tenant's own
// admin UI has no plain "edit" for terms either, only create +
// supersede. handleUpdateTerm exists only so a PUT request gets a
// clear, honest rejection instead of a 404/500 -- superseding a term
// (closing the old one, opening a new one) is a deliberate two-step
// action, not a field edit, and isn't bolted onto the generic
// edit-in-place CRUD form to avoid implying otherwise.
// =====================================================

export async function handleListTerms(request, env) {
  const url = new URL(request.url);
  const programId = url.searchParams.get("program_id");
  const rows = await termsDB.getTermHistory(env.DB, {
    programId: programId ? Number(programId) : null,
    accountId: url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null,
    casinoId: url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null,
  });
  return ok({ data: rows });
}

export async function handleGetTerm(request, env, id) {
  const row = await termsDB.getTermById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateTerm(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["program_id", "term_type", "effective_date"]);
    const program = await programsDB.getProgramById(env.DB, Number(body.program_id));
    if (!program) return fail("program_id does not reference an existing affiliate program", 422);
    const id = await termsDB.createCommercialTerm(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    const isOverlap = /already covers this exact scope/.test(error.message || "");
    return fail(error.message || "invalid_input", isOverlap ? 409 : 422);
  }
}

export async function handleUpdateTerm(request, env, id) {
  return fail(
    "Commercial terms are immutable once created -- supersede this term (POST a new one with a later effective_date) instead of editing it in place.",
    409
  );
}

// =====================================================
// OFFERS
// No delete endpoint by design (status transitions only, never
// hard-deleted) -- matches worker/api.js's own /offer/* routes,
// which likewise have no delete.
// =====================================================

export async function handleListOffers(request, env) {
  const url = new URL(request.url);
  const rows = await offersDB.getAllOffersAdmin(env.DB, {
    casinoId: url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null,
    programId: url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null,
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetOffer(request, env, id) {
  const row = await offersDB.getOfferById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateOffer(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["casino_id", "offer_type", "internal_name"]);
    const casino = await env.DB.prepare(`SELECT id FROM casinos WHERE id = ?`).bind(Number(body.casino_id)).first();
    if (!casino) return fail("casino_id does not reference an existing casino", 422);
    const id = await offersDB.createOffer(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateOffer(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const existing = await offersDB.getOfferById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await offersDB.updateOffer(env.DB, Number(id), body, { changeReason: body.change_reason || null });
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// =====================================================
// TRACKING LINKS
// No delete endpoint by design, same reasoning as offers.
// =====================================================

export async function handleListTrackingLinks(request, env) {
  const url = new URL(request.url);
  const rows = await trackingLinksDB.getAllTrackingLinksAdmin(env.DB, {
    casinoId: url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null,
    status: url.searchParams.get("status") || null,
    healthStatus: url.searchParams.get("health_status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetTrackingLink(request, env, id) {
  const row = await trackingLinksDB.getTrackingLinkById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  row.geo_destinations = await trackingLinksDB.getGeoDestinations(env.DB, row.id);
  return ok({ data: row });
}

export async function handleCreateTrackingLink(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["internal_name", "destination_url"]);
    const ownDomains = [new URL(request.url).hostname];
    const result = await trackingLinksDB.createTrackingLink(env.DB, body, { ownDomains });
    if (Array.isArray(body.geo_destinations)) {
      await trackingLinksDB.setGeoDestinations(env.DB, result.id, body.geo_destinations, { ownDomains });
    }
    return created({ data: result });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateTrackingLink(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const existing = await trackingLinksDB.getTrackingLinkById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    const ownDomains = [new URL(request.url).hostname];
    await trackingLinksDB.updateTrackingLink(env.DB, Number(id), body, { ownDomains });
    if (Array.isArray(body.geo_destinations)) {
      await trackingLinksDB.setGeoDestinations(env.DB, Number(id), body.geo_destinations, { ownDomains });
    }
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}
