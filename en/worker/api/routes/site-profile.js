// Site profile (module / landing / header configuration).
// Dispatched from worker/api/routes/index.js.
import { requireRole } from "../../auth.js";
import { NOT_HANDLED, failure, json, success } from "../helpers.js";
import { loadProfile, saveProfile } from "../../site-profile/store.js";
import { validateProfile, applyPreset } from "../../site-profile/profile.js";
import { MODULES, PRESETS } from "../../site-profile/registry.js";
import { deleteCached, CACHE_KEYS, invalidateNav } from "../../cache.js";

export async function route({ request, env, path, user }) {
  if (path !== "/api/v1/site-profile") return NOT_HANDLED;
  if (!user || !requireRole(user, "admin")) return failure("Only administrators can change the site configuration", 403);
  const host = new URL(request.url).hostname;

  if (request.method === "GET") {
    const modules = Object.fromEntries(Object.entries(MODULES).map(([k, m]) => [k, { label: m.label, desc: m.desc }]));
    const presets = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, { label: p.label, profile: applyPreset(k) }]));
    return json({ profile: await loadProfile(env, host), modules, presets });
  }
  if (request.method !== "POST") return failure("Method not allowed", 405);

  let body; try { body = await request.json(); } catch { return failure("Invalid JSON"); }
  const { ok, errors, profile } = validateProfile(body);
  if (!ok) return failure(errors.join(" "), 422);

  await saveProfile(env, host, profile);
  // Header stickiness lives in the existing header settings; keep one source of truth.
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES('site_header_sticky', ?, CURRENT_TIMESTAMP)").bind(profile.header.sticky ? "1" : "0").run();
  await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host));
  await invalidateNav(env);
  return success({ profile });
}
