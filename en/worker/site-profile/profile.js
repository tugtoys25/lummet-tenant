// ============================================================
// SITE PROFILE: normalise, classify, decide
// Pure functions, no I/O. Storage lives in store.js.
// ============================================================
import { getRoute } from "../routes.js";
import {
  FEATURES, MODULES, PRESETS, PAGE_IDS, FEATURE_IDS, CORE_PUBLIC, CORE_DASHBOARD, SITEMAP_CAP,
  capabilityForPublicType, capabilityForDashboardType, capabilityForApiPath, ANALYTICS_DIMENSION_CAP, REPORT_TYPE_CAP,
} from "./registry.js";
import { pruneByCap } from "./cap-blocks.js";

import { systemIsOff } from "./system-flag.js";

export const CONFIG_PATH = "/en/dashboard/configuration";
const ALL = Object.keys(MODULES);

// Default = the whole platform exactly as it behaves today (zero change for existing sites).
export function defaultProfile() {
  return { v: 2, preset: "full", modules: Object.fromEntries(ALL.map((k) => [k, true])), pages: {}, features: {}, homepage: true, landing: "/en",
           disabled: { mode: "404", redirectTo: "" }, header: { sticky: true, autoPrune: true } };
}

const safePath = (p) => (typeof p === "string" && /^\/en(\/[a-z0-9\-_/]*)?$/i.test(p) ? p.replace(/\/+$/, "") || "/en" : null);

export function normalizeProfile(input) {
  const base = defaultProfile();
  if (!input || typeof input !== "object") return base;
  const preset = PRESETS[input.preset] ? input.preset : "custom";
  const mods = { ...base.modules };
  if (input.modules && typeof input.modules === "object") for (const k of ALL) if (k in input.modules) mods[k] = input.modules[k] === true;
  // Sparse page overrides: only explicit "off" is stored; unknown ids are dropped.
  const pages = {};
  if (input.pages && typeof input.pages === "object") {
    for (const id of PAGE_IDS) if (input.pages[id] === false) pages[id] = false;
    // Per custom type switches (Phase 11): content.custom.<slug>. Sparse like the others; the slug is checked against the
    // live custom types by the API, never here (this function is pure).
    for (const id of Object.keys(input.pages)) if (isCustomTypeId(id) && input.pages[id] === false) pages[id] = false;
  }
  const features = {};
  if (input.features && typeof input.features === "object") for (const id of FEATURE_IDS) if (input.features[id] === false) features[id] = false;
  const homepage = input.homepage !== false;
  let landing = homepage ? "/en" : safePath(input.landing);
  if (!homepage && (!landing || landing === "/en")) landing = null;
  const disabled = { mode: ["404", "410", "301"].includes(String(input.disabled?.mode)) ? String(input.disabled.mode) : "404",
                     redirectTo: safePath(input.disabled?.redirectTo) || "" };
  return { v: 2, preset, modules: mods, pages, features, homepage: !!(homepage || !landing), landing: homepage || !landing ? "/en" : landing, disabled,
           header: { sticky: input.header?.sticky !== false, autoPrune: input.header?.autoPrune !== false } };
}

// Per custom type capability: content.custom.<slug>. The slug has no dots, so the id stays a 3 part path.
export const CUSTOM_TYPE_ID = /^content\.custom\.[a-z0-9][a-z0-9_-]{0,62}$/;
export const isCustomTypeId = (id) => typeof id === "string" && CUSTOM_TYPE_ID.test(id);
export const customTypeId = (slug) => { const id = `content.custom.${String(slug || "").toLowerCase()}`; return isCustomTypeId(id) ? id : null; };

// A capability id is a module ("news") or a page family ("news.article").
// Live = its module is on AND the page family has not been switched off.
export function isEnabled(p, id) {
  if (!id) return true;
  if (id.startsWith("features.")) return p.features?.[id.slice(9)] !== false;
  const mod = id.split(".")[0];
  if (p.modules?.[mod] === false) return false;
  // content.custom.<slug> is live only while its parent content.custom is live too.
  if (isCustomTypeId(id) && p.pages?.["content.custom"] === false) return false;
  return p.pages?.[id] !== false;
}

// Returns { ok, errors, profile } so the API can refuse inconsistent configurations instead of saving them.
// A site with every module off is valid: it is a static website (ordinary pages, legal pages, login).
export function validateProfile(input) {
  const profile = normalizeProfile(input);
  const errors = [];
  if (!profile.homepage) {
    const c = classifyPath(profile.landing, profile);
    if (!c.known) errors.push("Landing path does not match any page type.");
    else if (c.capability && !isEnabled(profile, c.capability)) errors.push(`Landing page ${profile.landing} is switched off (${c.capability}).`);
  }
  if (profile.disabled.mode === "301") {
    if (!profile.disabled.redirectTo) errors.push("Redirect mode needs a target path.");
    else {
      const t = classifyPath(profile.disabled.redirectTo, profile);
      if (t.capability && !isEnabled(profile, t.capability)) errors.push("Redirect target is switched off.");
    }
  }
  return { ok: errors.length === 0, errors, profile };
}

export function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return null;
  const profile = defaultProfile();
  for (const k of ALL) profile.modules[k] = p.modules.includes(k);
  for (const id of p.off || []) profile.pages[id] = false;
  for (const id of p.offFeatures || []) profile.features[id] = false;
  profile.preset = name; profile.homepage = p.landing === "/en"; profile.landing = p.landing;
  return profile;
}

// Classify any site path through the real router: { known, type, module, capability }.
export function classifyPath(path, _profile) {
  let route;
  try { route = getRoute({ url: "https://x.invalid" + path }); } catch { return { known: false, type: null, module: null, capability: null }; }
  const type = route.type;
  const hit = capabilityForPublicType(type) || capabilityForDashboardType(type) || null;
  return { known: type !== "not_found", type, module: hit?.module || null, capability: publicCapabilityFor(route, hit?.capability || null) };
}

// A public custom type URL (/en/custom/<typeSlug>/...) belongs to its own capability, which falls back to the parent.
const CUSTOM_PUBLIC = new Set(["custom", "customList", "customReview"]);
function publicCapabilityFor(route, cap) {
  if (cap === "content.custom" && CUSTOM_PUBLIC.has(route && route.type) && route.typeSlug) return customTypeId(route.typeSlug) || cap;
  return cap;
}

export const landingPath = (p) => (p.homepage ? "/en" : p.landing);

// Decision for a routed request. Never throws; unknown => pass (fail open to current behaviour).
//  -> { action: "pass" } | { action: "redirect", status, location } | { action: "gone", status }
export function gate(route, profile) {
  const t = route.type;
  if (t === "redirect" && route.target === "/en" && !profile.homepage) return { action: "redirect", status: 302, location: landingPath(profile) };
  if (t === "home" && !profile.homepage) return { action: "redirect", status: 301, location: landingPath(profile) };
  if (CORE_PUBLIC.has(t) || CORE_DASHBOARD.has(t)) return { action: "pass" };
  if (SITEMAP_CAP[t]) return isEnabled(profile, SITEMAP_CAP[t]) ? { action: "pass" } : { action: "gone", status: 404 };
  const dash = capabilityForDashboardType(t);
  if (dash) return isEnabled(profile, dash.capability) ? { action: "pass" } : { action: "redirect", status: 302, location: CONFIG_PATH };
  const pub = capabilityForPublicType(t);
  if (!pub || isEnabled(profile, publicCapabilityFor(route, pub.capability))) return { action: "pass" };
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
  return c.capability ? isEnabled(profile, c.capability) : true;
}

export const sitemapAllowed = (type, profile) => isEnabled(profile, SITEMAP_CAP[type]);

// Remove disabled links from an HTML fragment of <a href> items (header/footer/mobile nav). Keeps external links.
export function pruneNavHtml(html, profile) {
  if (!html || !profile || profile.header?.autoPrune === false) return html;
  return String(html).replace(/<li\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>\s*<\/li>|<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi,
    (m, h1, h2) => (pathAllowed(h1 || h2, profile) ? m : ""));
}

// Admin sidebar: drop links of disabled capabilities, then any group left empty.
export function pruneAdminNavHtml(html, profile) {
  if (!html) return html;
  let out = String(html);
  // Master switch OFF (Phase 10): the Configuration entry is hidden; every other link stays.
  if (systemIsOff(profile)) out = out.replace(/<a\b[^>]*href="\/en\/dashboard\/configuration"[^>]*>[\s\S]*?<\/a>/gi, "");
  out = out.replace(/<a\b[^>]*href="(\/en\/dashboard[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    (m, h) => { const c = classifyPath(h.split(/[?#]/)[0], profile); return c.capability && !isEnabled(profile, c.capability) ? "" : m; });
  out = out.replace(/<details\b[^>]*class="dash-group"[^>]*>[\s\S]*?<\/details>/gi, (blk) => (/<div class="dash-links">\s*<\/div>/.test(blk) ? "" : blk));
  return out;
}

// Admin API gate: refuses endpoints of switched-off capabilities. Data is never touched.
// -> null when allowed, else { status, body } for the caller to return.
export function apiGate(path, profile) {
  const cap = capabilityForApiPath(path);
  if (!cap || isEnabled(profile, cap)) return null;
  return { status: 404, body: { success: false, code: "feature_disabled", capability: cap,
    error: "This feature is switched off. Turn it on in Dashboard > Configuration." } };
}

// Scheduled-job gate: which cron tasks may run for this profile.
export function cronAllowed(task, profile) {
  for (const [id, f] of Object.entries(FEATURES_FOR_CRON())) if (f.includes(task)) return isEnabled(profile, `features.${id}`);
  return true;
}

function FEATURES_FOR_CRON() { return Object.fromEntries(Object.entries(FEATURES).map(([id, f]) => [id, f.cron || []])); }

// Dashboard blocks tagged data-cap="<capability>" (cards, sections, table rows, <option>s) disappear when that
// capability is off. "a|b" keeps the block while either is on. Parsing rules live in cap-blocks.js. Fails open.
export function pruneCapBlocks(html, profile) {
  if (!html || !profile) return html;
  try { return pruneByCap(String(html), (id) => isEnabled(profile, id)); } catch { return html; }
}

// Analytics dimensions and report types that belong to one module. Unlisted ones are always allowed.
// Used by the admin API so a switched-off module answers with an empty result, never an error.
export function dimensionAllowed(profile, dimensionType) {
  const cap = ANALYTICS_DIMENSION_CAP[dimensionType];
  return !cap || !profile || isEnabled(profile, cap);
}
export function reportTypeAllowed(profile, reportType) {
  const cap = REPORT_TYPE_CAP[reportType];
  return !cap || !profile || isEnabled(profile, cap);
}
export function reportTypeRefusal(reportType) {
  return { status: 404, body: { success: false, code: "feature_disabled", capability: REPORT_TYPE_CAP[reportType],
    error: "This report type belongs to a feature that is switched off. Turn it on in Dashboard > Configuration." } };
}
