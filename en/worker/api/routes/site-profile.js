// Site profile (module / landing / header configuration).
// Dispatched from worker/api/routes/index.js.
import { requireRole } from "../../auth.js";
import { NOT_HANDLED, failure, json, success } from "../helpers.js";
import { loadProfile, saveProfile } from "../../site-profile/store.js";
import { validateProfile, applyPreset } from "../../site-profile/profile.js";
import { wizardOptions, previewChange, diagnose, nextSteps } from "../../site-profile/guidance.js";
import { loadFacts } from "../../site-profile/facts.js";
import { settingsManifest, validateSettingsInput, ownedKeys, allFields } from "../../site-profile/settings-groups.js";
import { isEnabled } from "../../site-profile/profile.js";
import { getAllSettings, saveSettings } from "../../database/settings.js";
import { MODULES, PRESETS, FEATURES } from "../../site-profile/registry.js";
import { deleteCached, CACHE_KEYS, invalidateNav } from "../../cache.js";
import { readLiveDocument, recordDirect } from "../../site-profile/versions.js";

export async function route({ request, env, path, user }) {
  if (path !== "/api/v1/site-profile" && !path.startsWith("/api/v1/site-profile/")) return NOT_HANDLED;
  // Staff only. Reading (and the read-only "what will change" preview) is open to editors so they can use the
  // Configuration screen with the draft. Every write to the live site is for administrators: editors save to the
  // draft (/api/v1/config/draft) and an administrator publishes.
  if (!user || !requireRole(user, "editor")) return failure("Only staff can use the site configuration", 403);
  const readOnly = request.method === "GET" || path === "/api/v1/site-profile/preview";
  if (!readOnly && !requireRole(user, "admin")) return failure("Only administrators can change the live site configuration. Editors save changes to the draft, and an administrator publishes them.", 403);
  const host = new URL(request.url).hostname;

  // Guidance (read-only; nothing is saved).
  if (path === "/api/v1/site-profile/next-steps" && request.method === "GET") {
    const profile = await loadProfile(env, host);
    return json({ ...nextSteps(profile, await loadFacts(env)) });
  }
  if (path === "/api/v1/site-profile/preview" && request.method === "POST") {
    let draft; try { draft = await request.json(); } catch { return failure("Invalid JSON"); }
    const live = await loadProfile(env, host);
    const { errors, profile } = validateProfile(draft);
    const facts = await loadFacts(env);
    return json({ profile, errors, issues: diagnose(profile), preview: previewChange(live, profile, facts) });
  }
  // Look and feel (Phase 5): schema-driven settings groups.
  if (path === "/api/v1/site-profile/settings" && request.method === "GET") {
    const live = await loadProfile(env, host);
    const stored = await getAllSettings(env.DB);
    const owned = ownedKeys();
    const values = {};
    for (const f of allFields()) values[f.key] = stored[f.key] !== undefined ? stored[f.key] : (f.def === undefined ? "" : String(typeof f.def === "boolean" ? (f.def ? "1" : "0") : f.def));
    for (const k of Object.keys(stored)) if (owned.has(k) && values[k] === undefined) values[k] = stored[k];
    return json({ groups: settingsManifest((id) => isEnabled(live, id)), values });
  }
  if (path === "/api/v1/site-profile/settings" && request.method === "POST") {
    let body; try { body = await request.json(); } catch { return failure("Invalid JSON"); }
    const { clean, errors } = validateSettingsInput(body?.settings);
    if (errors.length) return failure(errors.join(" "), 422);
    if (!Object.keys(clean).length) return failure("Nothing to save.", 422);
    if (body.dryRun) return json({ changed: Object.keys(clean), settings: clean, saved: false });
    const before = await readLiveDocument(env).catch(() => null);
    await saveSettings(env.DB, clean);
    if ("site_header_sticky" in clean) {
      // One source of truth for stickiness: keep the site profile in step with the header setting.
      const cur = await loadProfile(env, host);
      await saveProfile(env, host, { ...cur, header: { ...cur.header, sticky: clean.site_header_sticky === "1" } });
    }
    await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host));
    await invalidateNav(env);
    if (before) await recordDirect(env, user, "direct.settings", before);
    return json({ changed: Object.keys(clean), saved: true });
  }

  if (path !== "/api/v1/site-profile") return NOT_HANDLED;

  if (request.method === "GET") {
    const modules = Object.fromEntries(Object.entries(MODULES).map(([k, m]) => [k, {
      label: m.label, desc: m.desc, help: m.help,
      pages: Object.fromEntries(Object.entries(m.pages).map(([pk, pg]) => [`${k}.${pk}`, { label: pg.label, desc: pg.desc }])),
    }]));
    const presets = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, { label: p.label, help: p.help, profile: applyPreset(k) }]));
    const features = Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, { label: f.label, desc: f.desc, help: f.help }]));
    const live = await loadProfile(env, host);
    return json({ profile: live, modules, features, presets, wizard: wizardOptions(), issues: diagnose(live) });
  }
  if (request.method !== "POST") return failure("Method not allowed", 405);

  let body; try { body = await request.json(); } catch { return failure("Invalid JSON"); }
  const { ok, errors, profile } = validateProfile(body);
  if (!ok) return failure(errors.join(" "), 422);

  const before = await readLiveDocument(env).catch(() => null);
  await saveProfile(env, host, profile);
  // Header stickiness lives in the existing header settings; keep one source of truth.
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES('site_header_sticky', ?, CURRENT_TIMESTAMP)").bind(profile.header.sticky ? "1" : "0").run();
  await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host));
  await invalidateNav(env);
  if (before) await recordDirect(env, user, "direct.profile", before);
  return success({ profile });
}
