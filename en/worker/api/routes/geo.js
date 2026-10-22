// Geo rules.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as geo from "../../database/geo.js";
import { invalidateCasinos } from "../../cache.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

    // ==================================
    // GEO RULES
    // ==================================
    if (
      path === "/api/v1/geo/save" &&
      request.method === "POST"
    ) {
      const result = await saveGeoRule(request, env);
      await invalidateCasinos(env);
      return result;
    }

        // ==================================
    // GEO RULES — BULK SYNC + LISTING
    // ==================================

    if (path === "/api/v1/geo/sync" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug", "rules"]);
      const { setCasinoGeoRules } = await import("../../database/geo.js");
      await setCasinoGeoRules(env.DB, body.casino_slug, body.rules);
      await invalidateCasinos(env);
      return success();
    }

    if (path === "/api/v1/geo/list" && request.method === "GET") {
      const url = new URL(request.url);
      const casinoSlug = url.searchParams.get("casino_slug");
      if (!casinoSlug) return failure("casino_slug is required");
      const { getGeoRulesForCasino } = await import("../../database/geo.js");
      const rules = await getGeoRulesForCasino(env.DB, casinoSlug);
      return json({ rules });
    }

  return NOT_HANDLED;
}

// =====================================================
// GEO RULES
// =====================================================

async function saveGeoRule(request, env) {
  const body = await request.json();
  validate(body, ["casino_slug", "country_code", "status"]);
  await geo.saveGeoRule(
    env.DB,
    body
  );

  return success();
}
