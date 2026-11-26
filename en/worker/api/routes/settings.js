// Site settings.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as settings from "../../database/settings.js";
import { sanitizeHeaderHeroInput } from "../../header-hero.js";
import { requireRole } from "../../auth.js";
import { CACHE_KEYS, deleteCached } from "../../cache.js";
import { NOT_HANDLED, failure, json, success } from "../helpers.js";
import { allFields, ownedKeys } from "../../site-profile/settings-groups.js";
import { readLiveDocument, recordDirect } from "../../site-profile/versions.js";
import { MODES as SHIELD_MODES, DEFAULT_RATE_LIMIT, getShieldSettings, forgetShieldSettings } from "../../tracking/bot-shield.js";
import { logAudit } from "../../database/audit.js";
import { buildLayout, forgetLayout, validPrefix, cleanPrefix, LAYOUTS, toPublic, parseOverrides } from "../../url-layout.js";

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

    if (path === "/api/v1/settings/click-protection") {
      if (!user || !requireRole(user, "admin")) return failure("Only an administrator can change click protection", 403);
      if (request.method === "GET") { const c = await getShieldSettings(env.DB, Date.now() + 60000); return json({ mode: c.mode, limit: c.limit }); }
      if (request.method === "POST") return saveClickProtection(request, env, user);
    }

    if (path === "/api/v1/settings/url-layout") {
      if (!user || !requireRole(user, "admin")) return failure("Only an administrator can change the website address layout", 403);
      if (request.method === "GET") return json({ layout: await readUrlLayout(env), examples: urlExamples(await readUrlLayout(env)) });
      if (request.method === "POST") return saveUrlLayout(request, env, user);
    }

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


// =====================================================
// WEBSITE ADDRESS LAYOUT (see worker/url-layout.js)
// =====================================================

const URL_KEYS = ["url_layout", "url_custom_prefix", "url_page_overrides", "url_legacy_redirect"];

async function readUrlLayout(env) {
  const rows = (await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${URL_KEYS.map(() => "?").join(",")})`).bind(...URL_KEYS).all()).results || [];
  const raw = {}; for (const r of rows) raw[r.key] = r.value;
  return { url_layout: LAYOUTS.includes(raw.url_layout) ? raw.url_layout : "en", url_custom_prefix: raw.url_custom_prefix || "", url_page_overrides: raw.url_page_overrides || "", url_legacy_redirect: raw.url_legacy_redirect === "0" ? "0" : "1" };
}

function urlExamples(values) {
  const L = buildLayout(values);
  return ["/en", "/en/news", "/en/casino/example", "/en/about"].map((p) => ({ from: p, to: toPublic(L, p) }));
}

async function saveUrlLayout(request, env, user) {
  let body; try { body = await request.json(); } catch { return failure("Send the settings as JSON"); }
  const layout = String(body.url_layout || "en");
  if (!LAYOUTS.includes(layout)) return failure("Choose /en/, the root or a custom prefix");
  const prefix = cleanPrefix(body.url_custom_prefix);
  const overrides = String(body.url_page_overrides || "");
  const rules = parseOverrides(overrides);
  const usesCustom = layout === "custom" || rules.some((r) => r.where === "custom");
  if (usesCustom && !validPrefix(prefix)) return failure("The custom prefix needs 1 to 24 letters, numbers or dashes, and cannot be a name the platform already uses (en, static, media, api, admin ...)");
  const lines = overrides.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bad = lines.filter((l) => !/^\/?[A-Za-z0-9/_-]*\s*[=:>]\s*(root|en|custom)$/i.test(l));
  if (bad.length) return failure(`These page rules are not understood: ${bad.slice(0, 3).join(" | ")}. Write one per line, like /about = root`);
  const clean = { url_layout: layout, url_custom_prefix: usesCustom ? prefix : "", url_page_overrides: rules.map((r) => `${r.page || "/"} = ${r.where}`).join("\n"), url_legacy_redirect: body.url_legacy_redirect === "0" || body.url_legacy_redirect === false ? "0" : "1" };
  await settings.saveSettings(env.DB, clean);
  forgetLayout(env.DB);
  try { await logAudit(env.DB, { userId: user.user_id ?? user.id ?? null, action: 'url_layout_changed', entityType: 'settings', entityId: 'url_layout', metadata: { layout, prefix: clean.url_custom_prefix, rules: rules.length } }); } catch { /* audit is best effort */ }
  try { await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(new URL(request.url).hostname.toLowerCase())); } catch { /* cache is best effort */ }
  try { const { bumpPageEpoch } = await import("../../page-cache.js"); await bumpPageEpoch(env); } catch { /* cached pages expire by themselves */ }
  return json({ success: true, layout: clean, examples: urlExamples(clean) });
}


// =====================================================
// CLICK PROTECTION (see worker/tracking/bot-shield.js)
// =====================================================

async function saveClickProtection(request, env, user) {
  let body; try { body = await request.json(); } catch { return failure("Send the settings as JSON"); }
  const mode = String(body.mode || "off");
  if (!SHIELD_MODES.includes(mode)) return failure("Choose off, flag or hold");
  const limit = body.limit === undefined || body.limit === "" ? DEFAULT_RATE_LIMIT : Number.parseInt(body.limit, 10);
  if (!(limit >= 3 && limit <= 1000)) return failure("The click limit must be a number from 3 to 1000");
  await settings.saveSettings(env.DB, { go_bot_mode: mode, go_bot_rate_limit: String(limit) });
  forgetShieldSettings(env.DB);
  try { await logAudit(env.DB, { userId: user.user_id ?? user.id ?? null, action: "click_protection_changed", entityType: "settings", entityId: "go_bot_mode", metadata: { mode, limit } }); } catch { /* audit is best effort */ }
  return json({ success: true, mode, limit });
}
