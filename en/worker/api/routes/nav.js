// Navigation and geo navigation.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as navDB from "../../database/nav.js";
import { sanitizeUrl } from "../../sanitize.js";
import { invalidateNav } from "../../cache.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

    // ==================================
    // NAVIGATION CRUD
    // ==================================

    // ==================================
    // NAVIGATION CRUD
    // ==================================

    if (path === "/api/v1/nav/list") {
      const url = new URL(request.url);
      const location = url.searchParams.get("location");
      const result = location
        ? await navDB.getNavItems(env.DB, location)
        : await navDB.getAllNavItems(env.DB);
      return json({ nav: result });
    }

    if (path === "/api/v1/nav/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["label", "url", "location"]);

      // Reuse the existing URL sanitizer (sanitize.js) — blocks
      // javascript:/vbscript:/unsafe data: schemes while allowing
      // legitimate internal and external URLs. Applies to every
      // nav location (header/footer/mobile/page) equally.
      const safeUrl = sanitizeUrl(body.url, false);
      if (!safeUrl) {
        return failure("Invalid or unsafe URL");
      }
      body.url = safeUrl;

      const id = await navDB.createNavItem(env.DB, body);
      await invalidateNav(env);
      return json({ success: true, id });
    }

    if (path === "/api/v1/nav/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "label", "url", "location"]);

      const safeUrl = sanitizeUrl(body.url, false);
      if (!safeUrl) {
        return failure("Invalid or unsafe URL");
      }
      body.url = safeUrl;

      await navDB.updateNavItem(env.DB, body.id, body);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/nav/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      // Explicit cleanup of any PageNav GEO rules for this item.
      // We do not rely solely on page_nav_geo_rules' ON DELETE
      // CASCADE foreign key, since D1's SQLite foreign-key
      // enforcement is not guaranteed in every environment. This
      // is a no-op for nav items with no GEO rules (i.e. every
      // existing header/footer/mobile item today), so it does not
      // change existing deletion behavior for those locations.
      await navDB.deletePageNavGeoRulesForItem(env.DB, body.id);

      await navDB.deleteNavItem(env.DB, body.id);
      await invalidateNav(env);
      return success();
    }

    // ==================================
    // PAGE NAV — GEO RULES CRUD
    // ==================================
    // Uses the same "nav" permission resource as the rest of
    // nav CRUD above (see resourceMap/readResourceMap) — no new
    // permission resource was introduced.

    if (path === "/api/v1/nav/geo/list") {
      const url = new URL(request.url);
      const navItemId = parseInt(url.searchParams.get("nav_item_id"), 10);

      if (!navItemId || navItemId <= 0) {
        return failure("A valid nav_item_id is required");
      }

      const rules = await navDB.getPageNavGeoRules(env.DB, navItemId);
      return json({ rules });
    }

    if (path === "/api/v1/nav/geo/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["nav_item_id", "country_code", "status"]);

      const navItemId = parseInt(body.nav_item_id, 10);
      if (!navItemId || navItemId <= 0) {
        return failure("A valid nav_item_id is required");
      }

      const existingItem = await env.DB.prepare(`
        SELECT id FROM nav_items WHERE id = ?
      `).bind(navItemId).first();
      if (!existingItem) {
        return failure("Nav item not found", 404);
      }

      const countryCode = String(body.country_code || "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) {
        return failure("country_code must be a 2-letter ISO country code (e.g. CA, NZ, GB)");
      }

      const status = String(body.status || "").trim().toLowerCase();
      const allowedStatuses = ["allowed", "blocked", "restricted"];
      if (!allowedStatuses.includes(status)) {
        return failure(`status must be one of: ${allowedStatuses.join(", ")}`);
      }

      const id = await navDB.createPageNavGeoRule(env.DB, {
        nav_item_id: navItemId,
        country_code: countryCode,
        status
      });

      await invalidateNav(env);

      return json({ success: true, id });
    }

    if (path === "/api/v1/nav/geo/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      await navDB.deletePageNavGeoRule(env.DB, body.id);
      await invalidateNav(env);

      return success();
    }

  return NOT_HANDLED;
}
