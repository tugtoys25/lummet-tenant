// Offers.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as offersDB from "../../database/offers.js";
import { resolveOfferForCasino, getCandidateOffers } from "../../offers/selection.js";
import { logAudit } from "../../database/audit.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // OFFERS
    // ==================================

    if (path === "/api/v1/offers/list") {
      const url = new URL(request.url);
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const programId = url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const offerList = await offersDB.getAllOffersAdmin(env.DB, { casinoId, programId, status, search });
      return json({ success: true, offers: offerList });
    }

    if (path === "/api/v1/offer/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const offer = await offersDB.getOfferById(env.DB, id);
      if (!offer) return failure("Offer not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'offers', 'read', offer);
      if (!canAccess) return failure("Offer not found", 404);

      return json({ success: true, offer });
    }

    if (path === "/api/v1/offer/history") {
      const url = new URL(request.url);
      const offerId = Number(url.searchParams.get("offer_id"));
      if (!offerId) return failure("offer_id is required");

      const history = await offersDB.getOfferVersionHistory(env.DB, offerId);
      return json({ success: true, history });
    }

    if (path === "/api/v1/offer/as-of") {
      const url = new URL(request.url);
      const offerId = Number(url.searchParams.get("offer_id"));
      const date = url.searchParams.get("date");
      if (!offerId || !date) return failure("offer_id and date are required");

      const snapshot = await offersDB.getOfferAsOfDate(env.DB, offerId, date);
      return json({ success: true, offer: snapshot });
    }

    // Admin eligibility preview: every active candidate for a casino,
    // in priority order -- lets an admin see the full ranking, not
    // just the single winner resolve() would return.
    if (path === "/api/v1/offer/candidates") {
      const url = new URL(request.url);
      const casinoId = Number(url.searchParams.get("casino_id"));
      if (!casinoId) return failure("casino_id is required");

      const candidates = await getCandidateOffers(env.DB, casinoId);
      return json({ success: true, candidates });
    }

    // Admin testing tool: preview exactly what a visitor from a given
    // country would see for a casino, using the real selection service
    // (the same one the public site will use) -- not a separate mock.
    if (path === "/api/v1/offer/resolve") {
      const url = new URL(request.url);
      const casinoSlug = url.searchParams.get("casino_slug");
      const countryCode = url.searchParams.get("country_code");
      if (!casinoSlug || !countryCode) return failure("casino_slug and country_code are required");

      const result = await resolveOfferForCasino(env.DB, { casinoSlug, countryCode: countryCode.toUpperCase() });
      return json({ success: true, ...result });
    }

    if (path === "/api/v1/offer/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_id", "offer_type", "internal_name"]);

      const casino = await env.DB.prepare(`SELECT id FROM casinos WHERE id = ?`).bind(body.casino_id).first();
      if (!casino) return failure("Casino not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await offersDB.createOffer(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'offer', entityId: id,
          metadata: { casino_id: body.casino_id, offer_type: body.offer_type, internal_name: body.internal_name, status: body.status || 'draft' }
        });
        return success({ id });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/offer/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'offers', body.id);
      if (!existing) return failure("Offer not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'offers', 'update', existing);
      if (!canUpdate) return failure("Offer not found", 404);

      try {
        await offersDB.updateOffer(env.DB, body.id, body, { changedBy: user.user_id, changeReason: body.change_reason || null });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'offer', entityId: body.id,
          metadata: { previous_status: existing.status, new_status: body.status || existing.status }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/offer/status/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "status"]);

      const existing = await itemAccess.getItemById(env.DB, 'offers', body.id);
      if (!existing) return failure("Offer not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'offers', 'update', existing);
      if (!canUpdate) return failure("Offer not found", 404);

      try {
        await offersDB.transitionOfferStatus(env.DB, body.id, body.status, { changedBy: user.user_id, changeReason: body.change_reason || null });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'status_change', entityType: 'offer', entityId: body.id,
          metadata: { from: existing.status, to: body.status, reason: body.change_reason || null }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

  return NOT_HANDLED;
}
