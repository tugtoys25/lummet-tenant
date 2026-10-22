// Ad rules.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as adRulesDB from "../../database/ad-rules.js";
import { getCurrentUser } from "../../auth.js";
import { NOT_HANDLED, json } from "../helpers.js";

export async function route({ request, env, path }) {

// ── Routes ───────────────────────────────────────────────
  if (path === "/api/v1/ad-rules/list" && request.method === "GET") {
    try {
      const user = await requireAdAdmin(request, env);
      const rules = await adRulesDB.getAllAdRules(env.DB);
      return json({ rules });
    } catch (e) {
      return json({ error: e.message }, 403);
    }
  }

  if (path === "/api/v1/ad-rules/create" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.createAdRule(env.DB, body);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/update" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.updateAdRule(env.DB, body.id, body);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/delete" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.deleteAdRule(env.DB, body.id);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/validate" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      const { VALID_PLACEMENTS, VALID_DEVICES, VALID_PAGE_TYPES } = adRulesDB;
      return json({
        valid_placements: VALID_PLACEMENTS,
        valid_devices: VALID_DEVICES,
        valid_page_types: VALID_PAGE_TYPES
      });
    } catch (e) {
      return json({ error: e.message }, 403);
    }
  }

  return NOT_HANDLED;
}

    // ============================================================
// AD RULES API — with authorization + validation
// ============================================================

// ── Authorization helper ─────────────────────────────────

async function requireAdAdmin(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) throw new Error('Authentication required');
  if (user.role !== 'admin' && user.role !== 'editor') {
    throw new Error('Insufficient permissions. Admin or editor role required.');
  }
  return user;
}
