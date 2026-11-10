// Design Studio (Libraries 2-5): Premium Website Themes, Header Studio, Hero Studio, Section & Shape Studio.
// Separate from /api/v1/site-profile (Library 1). Stores ONE namespaced setting (ds_selection) plus the previous one for undo,
// so applying a studio design can never overwrite a Library 1 setting. Dispatched from worker/api/routes/index.js.
import { requireRole } from "../../auth.js";
import { NOT_HANDLED, failure, json } from "../helpers.js";
import { getAllSettings, saveSettings } from "../../database/settings.js";
import { deleteCached, CACHE_KEYS } from "../../cache.js";
import { crossSite, readJsonCapped } from "../config-http.js";
import { THEMES, THEME_CATEGORIES } from "../../design-studio/catalog-themes.js";
import { HEADERS } from "../../design-studio/catalog-headers.js";
import { HEROES } from "../../design-studio/catalog-heroes.js";
import { SHAPES } from "../../design-studio/catalog-shapes.js";
import { SECTIONS } from "../../design-studio/catalog-sections.js";
import { SELECTION_KEY, PREVIOUS_KEY, sanitizeSelection, renderPreviewDocument } from "../../design-studio/engine.js";

const parse = (raw) => { try { const v = JSON.parse(raw || "null"); return v && typeof v === "object" ? sanitizeSelection(v).clean : null; } catch { return null; } };
const strip = ({ css, ...rest }) => rest; // the catalog sent to the browser carries no CSS: previews are rendered server-side

export async function route({ request, env, path, user }) {
  if (path !== "/api/v1/design-studio" && !path.startsWith("/api/v1/design-studio/")) return NOT_HANDLED;
  if (!user || !requireRole(user, "editor")) return failure("Only staff can use the Design Studio", 403);
  const readOnly = request.method === "GET" || path === "/api/v1/design-studio/preview";
  if (!readOnly && !requireRole(user, "admin")) return failure("Only administrators can change the live design.", 403);
  if (!readOnly && crossSite(request)) return failure("Cross-site request refused.", 403);
  const host = new URL(request.url).hostname;
  const stored = await getAllSettings(env.DB);

  if (path === "/api/v1/design-studio" && request.method === "GET") {
    return json({
      selection: parse(stored[SELECTION_KEY]), hasPrevious: !!parse(stored[PREVIOUS_KEY]),
      themes: THEMES, categories: THEME_CATEGORIES, headers: HEADERS.map(strip), heroes: HEROES.map(strip), shapes: SHAPES.map(strip), sections: SECTIONS,
    });
  }
  if (path === "/api/v1/design-studio/preview" && request.method === "POST") {
    const rb = await readJsonCapped(request); if (rb.response) return rb.response;
    const { clean, errors } = sanitizeSelection(rb.body?.selection);
    if (errors.length) return failure(errors.join(" "), 422);
    const c = rb.body?.context && typeof rb.body.context === "object" ? rb.body.context : {};
    const text = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);
    const html = renderPreviewDocument(clean, { siteName: text(c.siteName, 60), title: text(c.title, 140), subtitle: text(c.subtitle, 320), badge: text(c.badge, 60), ctaText: text(c.ctaText, 30), imageUrl: text(c.imageUrl, 500) });
    return json({ html, selection: clean });
  }
  const write = async (next, prev) => {
    await saveSettings(env.DB, { [SELECTION_KEY]: next ? JSON.stringify(next) : "", [PREVIOUS_KEY]: prev ? JSON.stringify(prev) : "", ...(next ? { prostudio_mode: "off" } : {}) }); // one studio at a time
    await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host));
  };
  if (path === "/api/v1/design-studio/apply" && request.method === "POST") {
    const rb = await readJsonCapped(request); if (rb.response) return rb.response;
    const { clean, errors } = sanitizeSelection(rb.body?.selection);
    if (errors.length) return failure(errors.join(" "), 422);
    if (!clean.theme && !clean.header && !clean.hero && !Object.keys(clean.sections).length) return failure("Choose a theme or at least one component.", 422);
    await write(clean, parse(stored[SELECTION_KEY]));
    return json({ saved: true, selection: clean });
  }
  if (path === "/api/v1/design-studio/restore" && request.method === "POST") {
    const prev = parse(stored[PREVIOUS_KEY]); if (!prev) return failure("There is no previous studio design to return to.", 404);
    await write(prev, parse(stored[SELECTION_KEY]));
    return json({ saved: true, selection: prev });
  }
  if (path === "/api/v1/design-studio/reset" && request.method === "POST") {
    await write(null, parse(stored[SELECTION_KEY]));
    return json({ saved: true, selection: null });
  }
  return failure("Not found", 404);
}
