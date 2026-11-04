// ============================================================
// SITE PROFILE: normalise, classify, decide
// Pure functions, no I/O. Storage lives in store.js.
// ============================================================
import { getRoute } from "../routes.js";
import { MODULES, PRESETS, CORE_PUBLIC, SITEMAP_MODULE, moduleForPublicType, moduleForDashboardType } from "./registry.js";

export const CONFIG_PATH = "/en/dashboard/configuration";
const ALL = Object.keys(MODULES);

// Default = the whole platform exactly as it behaves today (zero change for existing sites).
export function defaultProfile() {
  return { v: 1, preset: "full", modules: Object.fromEntries(ALL.map((k) => [k, true])), homepage: true, landing: "/en",
           disabled: { mode: "404", redirectTo: "" }, header: { sticky: true, autoPrune: true } };
}

const safePath = (p) => (typeof p === "string" && /^\/en(\/[a-z0-9\-_/]*)?$/i.test(p) ? p.replace(/\/+$/, "") || "/en" : null);

export function normalizeProfile(input) {
  const base = defaultProfile();
  if (!input || typeof input !== "object") return base;
  const preset = PRESETS[input.preset] ? input.preset : "custom";
  const mods = { ...base.modules };
  if (input.modules && typeof input.modules === "object") for (const k of ALL) if (k in input.modules) mods[k] = input.modules[k] === true;
  const homepage = input.homepage !== false;
  let landing = homepage ? "/en" : safePath(input.landing);
  if (!homepage && (!landing || landing === "/en")) landing = null;
  const disabled = { mode: ["404", "410", "301"].includes(String(input.disabled?.mode)) ? String(input.disabled.mode) : "404",
                     redirectTo: safePath(input.disabled?.redirectTo) || "" };
  return { v: 1, preset, modules: mods, homepage: !!(homepage || !landing), landing: homepage || !landing ? "/en" : landing, disabled,
           header: { sticky: input.header?.sticky !== false, autoPrune: input.header?.autoPrune !== false } };
}

// Returns { ok, errors, profile } so the API can refuse inconsistent configurations instead of saving them.
export function validateProfile(input) {
  const profile = normalizeProfile(input);
  const errors = [];
  if (!ALL.some((k) => profile.modules[k])) errors.push("Enable at least one module.");
  if (!profile.homepage) {
    const mod = classifyPath(profile.landing, profile);
    if (!mod.known) errors.push("Landing path does not match any page type.");
    else if (mod.module && !profile.modules[mod.module]) errors.push(`Landing page ${profile.landing} belongs to a disabled module (${mod.module}).`);
  }
  if (profile.disabled.mode === "301") {
    if (!profile.disabled.redirectTo) errors.push("Redirect mode needs a target path.");
    else { const t = classifyPath(profile.disabled.redirectTo, profile); if (t.module && !profile.modules[t.module]) errors.push("Redirect target belongs to a disabled module."); }
  }
  return { ok: errors.length === 0, errors, profile };
}

export function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return null;
  const profile = defaultProfile();
  for (const k of ALL) profile.modules[k] = p.modules.includes(k);
  profile.preset = name; profile.homepage = p.landing === "/en"; profile.landing = p.landing;
  return profile;
}

// Classify any site path through the real router: { known, type, module }.
export function classifyPath(path, _profile) {
  let route;
  try { route = getRoute({ url: "https://x.invalid" + path }); } catch { return { known: false, type: null, module: null }; }
  const type = route.type;
  const module = moduleForPublicType(type) || moduleForDashboardType(type) || null;
  return { known: type !== "not_found", type, module };
}

export const landingPath = (p) => (p.homepage ? "/en" : p.landing);
export const isEnabled = (p, id) => !id || p.modules[id] !== false;

// Decision for a routed request. Never throws; unknown => pass (fail open to current behaviour).
//  -> { action: "pass" } | { action: "redirect", status, location } | { action: "gone", status }
export function gate(route, profile) {
  const t = route.type;
  if (t === "redirect" && route.target === "/en" && !profile.homepage) return { action: "redirect", status: 302, location: landingPath(profile) };
  if (t === "home" && !profile.homepage) return { action: "redirect", status: 301, location: landingPath(profile) };
  if (CORE_PUBLIC.has(t)) return { action: "pass" };
  if (t === "dashboardConfiguration") return { action: "pass" };
  if (SITEMAP_MODULE[t]) return isEnabled(profile, SITEMAP_MODULE[t]) ? { action: "pass" } : { action: "gone", status: 404 };
  const dm = moduleForDashboardType(t);
  if (dm) return isEnabled(profile, dm) ? { action: "pass" } : { action: "redirect", status: 302, location: CONFIG_PATH };
  const pm = moduleForPublicType(t);
  if (!pm || isEnabled(profile, pm)) return { action: "pass" };
  const { mode, redirectTo } = profile.disabled;
  if (mode === "301" && redirectTo) return { action: "redirect", status: 301, location: redirectTo };
  return { action: "gone", status: mode === "410" ? 410 : 404 };
}

// Is this public URL path part of the live site? Used by nav, sitemap, search, internal link pruning.
export function pathAllowed(path, profile) {
  if (!path || /^(https?:)?\/\//i.test(path) || !path.startsWith("/")) return true;
  let clean = path.split(/[?#]/)[0];
  if (clean.length > 1 && clean.endsWith("/")) clean = clean.slice(0, -1);
  if (clean === "/en" && !profile.homepage) return false;
  const c = classifyPath(clean, profile);
  return c.module ? isEnabled(profile, c.module) : true;
}

export const sitemapAllowed = (type, profile) => isEnabled(profile, SITEMAP_MODULE[type]);

// Remove disabled links from an HTML fragment of <a href> items (header/footer/mobile nav). Keeps external links.
export function pruneNavHtml(html, profile) {
  if (!html || !profile || profile.header?.autoPrune === false) return html;
  return String(html).replace(/<li\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>\s*<\/li>|<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi,
    (m, h1, h2) => (pathAllowed(h1 || h2, profile) ? m : ""));
}

// Admin sidebar: drop links of disabled modules, then any group left empty.
export function pruneAdminNavHtml(html, profile) {
  if (!html) return html;
  let out = String(html).replace(/<a\b[^>]*href="(\/en\/dashboard[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    (m, h) => { const c = classifyPath(h.split(/[?#]/)[0], profile); return c.module && !isEnabled(profile, c.module) ? "" : m; });
  out = out.replace(/<details\b[^>]*class="dash-group"[^>]*>[\s\S]*?<\/details>/gi, (blk) => (/<div class="dash-links">\s*<\/div>/.test(blk) ? "" : blk));
  return out;
}
