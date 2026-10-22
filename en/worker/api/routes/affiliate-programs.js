// Affiliate programs.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliatePartners from "../../database/affiliate-partners.js";
import * as affiliatePrograms from "../../database/affiliate-programs.js";
import * as offersDB from "../../database/offers.js";
import * as trackingLinksDB from "../../database/tracking-links.js";
import { logAudit } from "../../database/audit.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // AFFILIATE PROGRAMS
    // ==================================

    if (path === "/api/v1/affiliate-programs/list") {
      const url = new URL(request.url);
      const partnerId = url.searchParams.get("partner_id") ? Number(url.searchParams.get("partner_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const programs = await affiliatePrograms.getAllProgramsAdmin(env.DB, { partnerId, status, search });
      return json({ success: true, programs });
    }

    if (path === "/api/v1/affiliate-program/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const program = await affiliatePrograms.getProgramById(env.DB, id);
      if (!program) return failure("Program not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'read', program);
      if (!canAccess) return failure("Program not found", 404);

      program.casinos = await affiliatePrograms.getProgramCasinos(env.DB, id);
      return json({ success: true, program });
    }

    if (path === "/api/v1/affiliate-program/casinos" && request.method === "GET") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const casinoList = await affiliatePrograms.getProgramCasinos(env.DB, programId);
      return json({ success: true, casinos: casinoList });
    }

    // Reverse lookup: every program covering a given casino (used by
    // the Offer admin UI in System 2 to scope the program picker).
    if (path === "/api/v1/casino/affiliate-programs") {
      const url = new URL(request.url);
      const casinoId = Number(url.searchParams.get("casino_id"));
      if (!casinoId) return failure("casino_id is required");

      const programList = await affiliatePrograms.getCasinoPrograms(env.DB, casinoId);
      return json({ success: true, programs: programList });
    }

    if (path === "/api/v1/affiliate-program/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["partner_id", "name"]);

      const partner = await affiliatePartners.getPartnerById(env.DB, body.partner_id);
      if (!partner) return failure("Affiliate partner not found", 404);

      body.created_by = user.user_id;
      const id = await affiliatePrograms.createProgram(env.DB, body);

      if (Array.isArray(body.casino_ids)) {
        await affiliatePrograms.setProgramCasinos(env.DB, id, body.casino_ids);
      }
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_program', entityId: id, metadata: { name: body.name, partner_id: body.partner_id, casino_ids: body.casino_ids || [] } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-program/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.id);
      if (!existing) return failure("Program not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'update', existing);
      if (!canUpdate) return failure("Program not found", 404);

      body.updated_by = user.user_id;
      await affiliatePrograms.updateProgram(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_program', entityId: body.id, metadata: { name: body.name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-program/casinos/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.program_id);
      if (!existing) return failure("Program not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'update', existing);
      if (!canUpdate) return failure("Program not found", 404);

      await affiliatePrograms.setProgramCasinos(env.DB, body.program_id, body.casino_ids || []);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_program', entityId: body.program_id, metadata: { casino_ids: body.casino_ids || [] } });
      return success();
    }

    if (path === "/api/v1/affiliate-program/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.id);
      if (!existing) return failure("Program not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'delete', existing);
      if (!canDelete) return failure("Program not found", 404);

      const dependents = await affiliatePrograms.getProgramDependents(env.DB, body.id);
      if (dependents) {
        const parts = Object.entries(dependents).map(([k, v]) => `${v} ${k}`).join(", ");
        return failure(
          `Cannot delete: this program has ${parts} attached. Archive it instead, or remove the dependents first.`,
          409
        );
      }
      const offerDependents = await offersDB.getProgramOfferDependents(env.DB, body.id);
      if (offerDependents) {
        return failure(
          `Cannot delete: this program has ${offerDependents.offers} offer(s) attached. Archive it instead, or remove those offers first.`,
          409
        );
      }
      const trackingDependents = await trackingLinksDB.getProgramTrackingLinkDependents(env.DB, body.id);
      if (trackingDependents) {
        return failure(
          `Cannot delete: this program has ${trackingDependents.tracking_links} tracking link(s) attached. Archive it instead, or remove those tracking links first.`,
          409
        );
      }

      await affiliatePrograms.deleteProgram(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_program', entityId: body.id, metadata: { name: existing.name } });
      return success();
    }

  return NOT_HANDLED;
}
