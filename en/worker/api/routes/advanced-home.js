// Advanced Homepage API (Studio). Reads and previews are open to staff; saving and switching are for administrators.
// Values live under the advhome_* settings prefix only. Dispatched from worker/api/routes/index.js.
import { requireRole } from "../../auth.js";
import { ADVANCED_THEMES } from "../../advanced-home/themes.js";
import { NOT_HANDLED, failure, json } from "../helpers.js";
import { saveSettings } from "../../database/settings.js";
import { getAllCasinos } from "../../database/casinos.js";
import { getPublishedCountries } from "../../database/countries.js";
import { deleteCached, CACHE_KEYS } from "../../cache.js";
import { crossSite, readJsonCapped } from "../config-http.js";
import { readLiveDocument, recordDirect } from "../../site-profile/versions.js";
import { advancedHomeState, cleanConfig, defaultConfig, renderAdvancedHomePage } from "../../advanced-home/index.js";
import { SECTION_META, CUSTOM_TYPES, MAX_CUSTOM, DEFAULT_LABELS, newCustomSection } from "../../advanced-home/schema.js";
import { starterTemplates } from "../../advanced-home/templates.js";

const BASE = "/api/v1/studio-pro/advanced-home";
const MAX = 200 * 1024;

export async function route({ request, env, path, user }) {
  if (!path.startsWith(BASE)) return NOT_HANDLED;
  if (!user || !requireRole(user, "editor")) return failure("Only staff can use the Advanced Homepage studio", 403);
  const host = new URL(request.url).hostname;
  const sub = path.slice(BASE.length);

  if (sub === "/state" && request.method === "GET") {
    const st = await advancedHomeState(env);
    const casinos = (await getAllCasinos(env.DB).catch(() => [])).map((c) => ({ id: c.id, name: c.name, slug: c.slug, rating: c.rating }));
    const countries = (await getPublishedCountries(env.DB).catch(() => [])).map((c) => ({ code: c.code, name: c.name }));
    return json({ success: true, state: { mode: st.mode, config: st.config, hasConfig: st.hasConfig, hasPrevious: st.hasPrevious }, meta: SECTION_META, themes: ADVANCED_THEMES.map(({ id, label, category, style, desc, pal, dark }) => ({ id, label, category, style, desc, pal, dark })), defaults: defaultConfig(), templates: starterTemplates(), labelDefaults: DEFAULT_LABELS, customTypes: CUSTOM_TYPES, maxCustom: MAX_CUSTOM, customDefaults: Object.fromEntries(CUSTOM_TYPES.map((t) => [t, newCustomSection(t)])), lookups: { casinos, countries } });
  }

  // Preview renders the real homepage with the posted settings and optionally as seen from another country. Nothing is stored.
  if (sub === "/preview" && request.method === "POST") {
    const rb = await readJsonCapped(request, MAX); if (rb.response) return rb.response;
    const { config, errors } = cleanConfig(rb.body.config);
    const country = /^[A-Za-z]{2}$/.test(String(rb.body.country || "")) ? String(rb.body.country).toUpperCase() : "";
    const u = new URL(request.url); const target = new URL("/en", u.origin); if (country) target.searchParams.set("geo", country);
    const req = new Request(target.toString(), { method: "GET", headers: request.headers });
    try { return json({ success: true, html: await renderAdvancedHomePage(req, env, config), warnings: errors }); }
    catch (e) { return failure("The preview could not be built: " + (e && e.message ? e.message : "unknown error"), 500); }
  }

  if (request.method === "GET") return NOT_HANDLED;
  if (!requireRole(user, "admin")) return failure("Only administrators can change the homepage.", 403);
  if (crossSite(request)) return failure("Cross-site request refused.", 403);

  const save = async (flat) => {
    const before = await readLiveDocument(env).catch(() => null);
    await saveSettings(env.DB, flat);
    await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host));
    if (before) await recordDirect(env, user, "direct.advanced-home", before);
  };
  const snapshot = (st) => JSON.stringify({ mode: st.mode, config: st.hasConfig ? st.config : null });

  if (sub === "/save" && request.method === "POST") {
    const rb = await readJsonCapped(request, MAX); if (rb.response) return rb.response;
    const { config, errors } = cleanConfig(rb.body.config);
    if (errors.length) return failure(errors.join(" "), 422);
    const st = await advancedHomeState(env);
    await save({ advhome_config: JSON.stringify(config), advhome_previous: snapshot(st) });
    return json({ success: true, saved: true, config });
  }
  if (sub === "/mode" && request.method === "POST") {
    const rb = await readJsonCapped(request, MAX); if (rb.response) return rb.response;
    if (!["on", "off"].includes(rb.body.mode)) return failure("Mode must be on or off.", 422);
    const st = await advancedHomeState(env);
    if (rb.body.mode === "on" && !st.hasConfig) return failure("Save your homepage first, then turn it on.", 422);
    await save({ advhome_mode: rb.body.mode, advhome_previous: snapshot(st) });
    return json({ success: true, saved: true, mode: rb.body.mode });
  }
  if (sub === "/revert" && request.method === "POST") {
    const st = await advancedHomeState(env);
    const raw = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'advhome_previous'").first())?.value;
    let prev = null; try { prev = JSON.parse(raw || "null"); } catch { prev = null; }
    if (!prev) return failure("There is no earlier version to return to.", 404);
    await save({ advhome_mode: prev.mode === "on" ? "on" : "off", advhome_config: prev.config ? JSON.stringify(cleanConfig(prev.config).config) : "", advhome_previous: snapshot(st) });
    return json({ success: true, saved: true });
  }
  return NOT_HANDLED;
}
