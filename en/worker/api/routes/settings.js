// Site settings.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as settings from "../../database/settings.js";
import { sanitizeHeaderHeroInput } from "../../header-hero.js";
import { requireRole } from "../../auth.js";
import { CACHE_KEYS, deleteCached } from "../../cache.js";
import { NOT_HANDLED, failure, json, success } from "../helpers.js";
import { allFields, ownedKeys } from "../../site-profile/settings-groups.js";
import { readLiveDocument, recordDirect } from "../../site-profile/versions.js";

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

  // Look-and-feel keys (Configuration > Look and feel) are versioned: an administrator's save is recorded as a
  // version, and an editor's change to them goes through the Configuration draft, which an administrator publishes.
  // Other settings (verification markup, ad rules, ...) behave exactly as before.
  const clean = sanitizeHeaderHeroInput(body);
  const owned = ownedKeys();
  const isAdmin = requireRole(user, "admin");
  let before = null;
  if (isAdmin) {
    before = await readLiveDocument(env).catch(() => null);
  } else {
    const stored = await settings.getAllSettings(env.DB);
    const defaults = new Map(allFields().map((f) => [f.key, f]));
    const changed = [];
    for (const k of Object.keys(clean)) {
      if (!owned.has(k)) continue;
      const f = defaults.get(k);
      const current = stored[k] !== undefined ? String(stored[k]) : (f && f.def !== undefined ? String(typeof f.def === "boolean" ? (f.def ? "1" : "0") : f.def) : "");
      if (String(clean[k]) !== current) changed.push(f ? f.label : k);
      delete clean[k]; // never written live by an editor, changed or not
    }
    if (changed.length) {
      return failure(
        `Editors save look-and-feel changes to the draft, and an administrator publishes them. Open Configuration to change: ${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ", and more" : ""}.`,
        403
      );
    }
    if (!Object.keys(clean).length) return success();
  }
  await settings.saveSettings(env.DB, clean);
  const hostname =
  new URL(request.url)
    .hostname
    .toLowerCase();

await deleteCached(
  env,
  CACHE_KEYS.SITE_SETTINGS(hostname)
);
  if (before) await recordDirect(env, user, "direct.settings.legacy", before);

  return success();
}
