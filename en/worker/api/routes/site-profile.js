// Site profile (module / landing / header configuration).
// Dispatched from worker/api/routes/index.js.
import { requireRole } from "../../auth.js";
import { NOT_HANDLED, failure, json, success } from "../helpers.js";
import { loadProfile, saveProfile, invalidateProfile } from "../../site-profile/store.js";
import { getSystemFlag, setSystemFlag, refuseWhenOff } from "../../site-profile/system-flag.js";
import { validateProfile, applyPreset } from "../../site-profile/profile.js";
import { syncContentTypes } from "../../site-profile/content-sync.js";
import { listCustomTypes, dropUnknownCustomTypes } from "../../site-profile/custom-types.js";
import { wizardOptions, previewChange, diagnose, nextSteps } from "../../site-profile/guidance.js";
import { loadFacts } from "../../site-profile/facts.js";
import { settingsManifest, validateSettingsInput, ownedKeys, allFields } from "../../site-profile/settings-groups.js";
import { isEnabled } from "../../site-profile/profile.js";
import { getAllSettings, saveSettings } from "../../database/settings.js";
import { MODULES, PRESETS, FEATURES } from "../../site-profile/registry.js";
import { DESIGN_PACKS } from "../../site-profile/design-packs.js";
import { deleteCached, CACHE_KEYS, invalidateNav } from "../../cache.js";
import { readLiveDocument, recordDirect } from "../../site-profile/versions.js";
import { getSetup, completeSetup, presetChoices } from "../../site-profile/setup.js";
import { crossSite, readJsonCapped } from "../config-http.js";
import { limitRequest } from "../config-limits.js";

export async function route({ request, env, path, user }) {
  if (path !== "/api/v1/site-profile" && !path.startsWith("/api/v1/site-profile/")) return NOT_HANDLED;
  // Staff only. Reading (and the read-only "what will change" preview) is open to editors so they can use the
  // Configuration screen with the draft. Every write to the live site is for administrators: editors save to the
  // draft (/api/v1/config/draft) and an administrator publishes.
  if (!user || !requireRole(user, "editor")) return failure("Only staff can use the site configuration", 403);
  const readOnly = request.method === "GET" || path === "/api/v1/site-profile/preview";
  if (!readOnly && !requireRole(user, "admin")) return failure("Only administrators can change the live site configuration. Editors save changes to the draft, and an administrator publishes them.", 403);
  // Cross-site writes are refused (Phase 10; this route had no Origin check before). The preview POST is read-only, so it is exempt.
  if (!readOnly && crossSite(request)) return failure("Cross-site request refused.", 403);
  const host = new URL(request.url).hostname;

  // Master switch (Phase 10). Reading the state is open to staff; changing it is for administrators and works while the system is off
  // (otherwise it could never be switched back on). Every OTHER write below is refused while the system is off.
  if (path === "/api/v1/site-profile/system") {
    if (request.method === "GET") return json({ success: true, system: await getSystemFlag(env) });
    if (request.method !== "PUT") return failure("Method not allowed", 405);
    const rb = await readJsonCapped(request); if (rb.response) return rb.response; const b = rb.body;
    if (!b || typeof b.enabled !== "boolean") return failure("Send { \"enabled\": true } or { \"enabled\": false }.", 422);
    const r = await setSystemFlag(env, b.enabled);
    if (!r.ok) return json({ success: false, code: r.code, error: r.error }, r.status);
    await invalidateProfile(env, host);
    await invalidateNav(env);
    return json({ success: true, system: { enabled: r.enabled, source: r.source, envOverride: r.envOverride, env: r.env, setting: r.setting } });
  }
  if (!readOnly) { const off = await refuseWhenOff(env); if (off) return off; }

  // Guidance (read-only; nothing is saved).
  if (path === "/api/v1/site-profile/next-steps" && request.method === "GET") {
    if (!(await getSystemFlag(env)).enabled) return json({ steps: [], total: 0, systemOff: true });
    const profile = await loadProfile(env, host);
    const r = nextSteps(profile, await loadFacts(env));
    // A site that was provisioned for the wizard asks its owner to confirm the setup first.
    if ((await getSetup(env)).pending) { r.steps.unshift({ id: "setup", title: "Confirm your site setup", why: "Your site was created with a setup type. Check it, change anything you like, then confirm.", href: "/en/dashboard/configuration#cfgSetup" }); r.total = r.steps.length; }
    return json({ ...r });
  }
  // Setup (Phase 9): whether this site still waits for its owner to confirm the setup it was created with.
  if (path === "/api/v1/site-profile/setup" && request.method === "GET") {
    // Switched off: no welcome panel, whatever the stored setup state is (it is kept, not changed).
    if (!(await getSystemFlag(env)).enabled) return json({ setup: { state: "complete", pending: false, known: true, source: null, preset: null, from: null }, livePreset: "full", presets: [], canConfirm: false, systemOff: true });
    const setup = await getSetup(env);
    return json({ setup, livePreset: (await loadProfile(env, host)).preset, presets: presetChoices(), canConfirm: requireRole(user, "admin") });
  }
  if (path === "/api/v1/site-profile/setup/complete" && request.method === "POST") {
    { const lim = await limitRequest(env, user, "setup"); if (lim) return lim; }
    const r = await completeSetup(env, user);
    return json({ ...r });
  }
  if (path === "/api/v1/site-profile/preview" && request.method === "POST") {
    const rb = await readJsonCapped(request); if (rb.response) return rb.response; const draft = rb.body;
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
    return json({ groups: settingsManifest((id) => isEnabled(live, id)), values, designs: DESIGN_PACKS });
  }
  if (path === "/api/v1/site-profile/settings" && request.method === "POST") {
    const rb = await readJsonCapped(request); if (rb.response) return rb.response; const body = rb.body;
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
    const features = Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, { label: f.label, desc: f.desc, help: f.help, requires: f.requires || "" }]));
    const live = await loadProfile(env, host);
    return json({ profile: live, modules, features, presets, wizard: wizardOptions(), issues: diagnose(live), customTypes: await listCustomTypes(env) });
  }
  if (request.method !== "POST") return failure("Method not allowed", 405);

  const rb = await readJsonCapped(request); if (rb.response) return rb.response; const body = rb.body;
  const { ok, errors, profile } = validateProfile(body);
  if (!ok) return failure(errors.join(" "), 422);
  await dropUnknownCustomTypes(env, profile); // per custom type choices for types that no longer exist are not stored

  const before = await readLiveDocument(env).catch(() => null);
  await saveProfile(env, host, profile);
  await syncContentTypes(env, profile);
  // Header stickiness lives in the existing header settings; keep one source of truth.
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES('site_header_sticky', ?, CURRENT_TIMESTAMP)").bind(profile.header.sticky ? "1" : "0").run();
  await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host));
  await invalidateNav(env);
  if (before) await recordDirect(env, user, "direct.profile", before);
  return success({ profile });
}
