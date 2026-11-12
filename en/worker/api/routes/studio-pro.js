// Design Studio API (Libraries 2-5). Separate from site-profile and header-hero. Dispatched from worker/api/routes/index.js.
// Reads and previews are open to staff; applying is for administrators. Values are stored under the prostudio_* prefix only.
import { requireRole } from "../../auth.js";
import { NOT_HANDLED, failure, json } from "../helpers.js";
import { getAllSettings, saveSettings } from "../../database/settings.js";
import { deleteCached, CACHE_KEYS } from "../../cache.js";
import { crossSite, readJsonCapped } from "../config-http.js";
import { readLiveDocument, recordDirect } from "../../site-profile/versions.js";
import { parseProStudio, validateStudioInput, renderPreviewDocument, STUDIO_KEYS } from "../../studio-pro/index.js";
import { loadStudioSite, loadCardSample } from "../../studio-site.js";
import { renderCardsPreviewDocument } from "../../studio-pro/cards-preview.js";

const stateFrom = (values) => parseProStudio(values);

export async function route({ request, env, path, user }) {
  if (!path.startsWith("/api/v1/studio-pro")) return NOT_HANDLED;
  if (!user || !requireRole(user, "editor")) return failure("Only staff can use the design studio", 403);
  const host = new URL(request.url).hostname;
  const get = request.method === "GET";

  if (path === "/api/v1/studio-pro/state" && get) {
    const values = await getAllSettings(env.DB);
    let previous = null; try { previous = JSON.parse(values.prostudio_previous || "null"); } catch { previous = null; }
    return json({ success: true, state: stateFrom(values), hasPrevious: Boolean(previous) });
  }
  // Preview renders a document from the posted state. Nothing is stored, so it is open to editors.
  if (path === "/api/v1/studio-pro/preview" && request.method === "POST") {
    const rb = await readJsonCapped(request); if (rb.response) return rb.response;
    const { clean, errors } = validateStudioInput(rb.body);
    if (errors.length) return failure(errors.join(" "), 422);
    if (rb.body?.view === "cards") {
      const sel = clean.prostudio_cards ? JSON.parse(clean.prostudio_cards) : null;
      const sample = await loadCardSample(env, new URL(request.url).origin);
      return json({ success: true, html: renderCardsPreviewDocument(sel, sample) });
    }
    const merged = { ...stateFrom(await getAllSettings(env.DB)), ...Object.fromEntries(Object.entries(rb.body || {}).filter(([k]) => ["mode", "theme", "header", "hero", "sections", "custom"].includes(k))) };
    merged.custom = clean.prostudio_custom ? JSON.parse(clean.prostudio_custom) : merged.custom;
    merged.sections = clean.prostudio_sections ? JSON.parse(clean.prostudio_sections) : merged.sections;
    const own = await loadStudioSite(env); // the preview shows the site's own wording, links and navigation
    return json({ success: true, html: renderPreviewDocument(merged, own.site, own.nav) });
  }

  if (get || path === "/api/v1/studio-pro/preview") return NOT_HANDLED;
  if (!requireRole(user, "admin")) return failure("Only administrators can apply a design.", 403);
  if (crossSite(request)) return failure("Cross-site request refused.", 403);

  const save = async (flat) => {
    const before = await readLiveDocument(env).catch(() => null);
    await saveSettings(env.DB, flat);
    await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host));
    if (before) await recordDirect(env, user, "direct.studio-pro", before);
  };
  const snapshotOf = (values) => JSON.stringify(Object.fromEntries(["prostudio_mode", "prostudio_theme", "prostudio_header", "prostudio_hero", "prostudio_sections", "prostudio_custom", "prostudio_cards"].map((k) => [k, values[k] || ""])));

  if (path === "/api/v1/studio-pro/apply" && request.method === "POST") {
    const rb = await readJsonCapped(request); if (rb.response) return rb.response;
    const { clean, errors } = validateStudioInput(rb.body);
    if (errors.length) return failure(errors.join(" "), 422);
    if (!clean.prostudio_mode && clean.prostudio_cards === undefined) return failure("Choose a mode.", 422);
    if (rb.body?.dryRun) return json({ success: true, saved: false, changed: Object.keys(clean) });
    const values = await getAllSettings(env.DB);
    // A card style is its own choice and never switches the first studio off; a theme/header/hero apply does (one studio at a time).
    await save({ ...clean, ...(clean.prostudio_mode ? { ds_selection: "" } : {}), prostudio_previous: snapshotOf(values) });
    return json({ success: true, saved: true, changed: Object.keys(clean) });
  }
  if (path === "/api/v1/studio-pro/revert" && request.method === "POST") {
    const values = await getAllSettings(env.DB);
    let prev = null; try { prev = JSON.parse(values.prostudio_previous || "null"); } catch { prev = null; }
    if (!prev) return failure("There is no earlier studio design to return to.", 404);
    const flat = Object.fromEntries(STUDIO_KEYS.filter((k) => k !== "prostudio_previous").map((k) => [k, String(prev[k] ?? "")]));
    await save({ ...flat, prostudio_previous: snapshotOf(values) });
    return json({ success: true, saved: true });
  }
  if (path === "/api/v1/studio-pro/off" && request.method === "POST") {
    const values = await getAllSettings(env.DB);
    await save({ prostudio_mode: "off", prostudio_previous: snapshotOf(values) });
    return json({ success: true, saved: true });
  }
  return NOT_HANDLED;
}
