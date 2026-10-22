// Commercial terms.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliatePrograms from "../../database/affiliate-programs.js";
import * as commercialTerms from "../../database/affiliate-commercial-terms.js";
import { logAudit } from "../../database/audit.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // COMMERCIAL TERMS
    // ==================================

    if (path === "/api/v1/commercial-terms/list" || path === "/api/v1/commercial-terms/history") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;

      const terms = await commercialTerms.getTermHistory(env.DB, { programId, accountId, casinoId });
      return json({ success: true, terms });
    }

    if (path === "/api/v1/commercial-terms/resolve") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const geoCode = url.searchParams.get("geo_code") || null;
      const onDate = url.searchParams.get("date") || null;

      const term = await commercialTerms.resolveApplicableTerm(env.DB, { programId, accountId, casinoId, geoCode, onDate });
      return json({ success: true, term });
    }

    if (path === "/api/v1/commercial-term/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const term = await commercialTerms.getTermById(env.DB, id);
      if (!term) return failure("Commercial term not found", 404);

      return json({ success: true, term });
    }

    if (path === "/api/v1/commercial-term/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id", "term_type", "effective_date"]);

      const program = await affiliatePrograms.getProgramById(env.DB, body.program_id);
      if (!program) return failure("Affiliate program not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await commercialTerms.createCommercialTerm(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id,
          action: 'create',
          entityType: 'commercial_term',
          entityId: id,
          metadata: {
            program_id: body.program_id, account_id: body.account_id ?? null,
            casino_id: body.casino_id ?? null, geo_code: body.geo_code ?? null,
            term_type: body.term_type, effective_date: body.effective_date
          }
        });
        return success({ id });
      } catch (error) {
        // Overlap conflicts and field-validation errors are client
        // errors, not server errors -- surface them as 409/422 rather
        // than falling into the generic 500 catch below.
        const isOverlap = /already covers this exact scope/.test(error.message);
        return failure(error.message, isOverlap ? 409 : 422);
      }
    }

    if (path === "/api/v1/commercial-term/supersede" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await commercialTerms.getTermById(env.DB, body.id);
      if (!existing) return failure("Commercial term not found", 404);

      await commercialTerms.supersedeTerm(env.DB, body.id, body.expiry_date || null);
      await logAudit(env.DB, { userId: user.user_id, action: 'supersede', entityType: 'commercial_term', entityId: body.id, metadata: { program_id: existing.program_id, term_type: existing.term_type } });
      return success();
    }

  return NOT_HANDLED;
}
