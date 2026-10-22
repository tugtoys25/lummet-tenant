// Site settings.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as settings from "../../database/settings.js";
import { sanitizeHeaderHeroInput } from "../../header-hero.js";
import { requireRole } from "../../auth.js";
import { CACHE_KEYS, deleteCached } from "../../cache.js";
import { NOT_HANDLED, failure, json, success } from "../helpers.js";

export async function route({ request, env, path, user }) {

// Get settings
if (path === "/api/v1/settings/get") {
  const result = await env.DB.prepare(`
    SELECT key, value FROM settings
  `).all();
  const settings = {};
  for (const row of result.results) {
    settings[row.key] = row.value;
  }
  return json({ settings });
}

    // ==================================
    // SETTINGS
    // ==================================

    if (
      path === "/api/v1/settings/save" &&
      request.method === "POST"
    ) {
      return saveSettings(request, env, user);
    }

  return NOT_HANDLED;
}

// =====================================================
// SETTINGS
// =====================================================

async function saveSettings(request, env, user) {

  // Site settings — including the GPWA verification script/seal,
  // which is trusted raw markup (not sanitized) — are only ever
  // writable by admin or editor accounts. This mirrors the
  // page-level gate already enforced on /en/dashboard/settings
  // (see renderAdminPage's allowedRoles), which this endpoint
  // was missing.
  if (!user || !requireRole(user, "editor")) {
    return failure(
      "You do not have permission to modify site settings",
      403
    );
  }

  const body = await request.json();

  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return failure("Settings object cannot be empty");
  }

  await settings.saveSettings(
    env.DB,
    sanitizeHeaderHeroInput(body)
  );
  const hostname =
  new URL(request.url)
    .hostname
    .toLowerCase();

await deleteCached(
  env,
  CACHE_KEYS.SITE_SETTINGS(hostname)
);

  return success();
}
