// Design Studio settings. All values live in the existing `settings` key/value table under the new prefix "prostudio_", so they can
// never overwrite a Library 1 key (theme_*, site_*). A missing key means "studio off", which reproduces the site exactly as before.
import { cleanHex } from "./util.js";
import { THEME_IDS } from "./themes.js";
import { HEADER_IDS } from "./headers.js";
import { HERO_IDS } from "./heroes.js";
import { SECTION_KIND_IDS, sectionVariants } from "./sections.js";
import { SHAPE_IDS, SURFACE_IDS } from "./shapes.js";
import { FONT_KEYS } from "../header-hero/schema.js";
import { validateCardsInput, parseCards } from "./cards.js";

export const MODES = ["off", "theme", "components"];
export const STUDIO_KEYS = ["prostudio_mode", "prostudio_theme", "prostudio_header", "prostudio_hero", "prostudio_sections", "prostudio_custom", "prostudio_cards", "prostudio_previous"];
const int = (v, lo, hi) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const oneOf = (v, list) => (list.includes(v) ? v : null);
const safeImage = (v) => { const s = String(v || "").trim(); if (!s) return ""; if (s.length > 500 || /[\s"'<>()\\]/.test(s)) return null; return /^https:\/\/[^\s]+$/i.test(s) || /^\/(?!\/)[^\s]*$/.test(s) ? s : null; };

// Allow-listed customisation. Unknown keys are dropped, bad values are rejected, so nothing arbitrary can reach the CSS.
export function cleanCustom(input) {
  const o = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {}; const errors = [];
  const put = (k, v, label) => { if (v === null) errors.push(`${label} is not valid.`); else if (v !== undefined && v !== "") out[k] = v; };
  for (const k of ["p", "p2", "bg", "sf", "tx"]) if (o[k] !== undefined && o[k] !== "") put(k, cleanHex(o[k]) || null, `Colour ${k}`);
  if (o.hf !== undefined) put("hf", oneOf(o.hf, FONT_KEYS), "Heading font");
  if (o.bf !== undefined) put("bf", oneOf(o.bf, FONT_KEYS), "Body font");
  if (o.fs !== undefined) put("fs", int(o.fs, 85, 125), "Font size");
  if (o.br !== undefined) put("br", int(o.br, 0, 40), "Button radius");
  if (o.cr !== undefined) put("cr", int(o.cr, 0, 40), "Card radius");
  if (o.hh !== undefined) put("hh", int(o.hh, 40, 140), "Header height");
  if (o.heroH !== undefined) put("heroH", int(o.heroH, 320, 900), "Hero height");
  if (o.sp !== undefined) put("sp", int(o.sp, 24, 140), "Section spacing");
  if (o.w !== undefined) put("w", int(o.w, 960, 1440), "Content width");
  if (o.ov !== undefined) put("ov", int(o.ov, 0, 90), "Overlay");
  if (o.align !== undefined) put("align", oneOf(o.align, ["left", "center", "right"]), "Alignment");
  if (o.shadow !== undefined) put("shadow", oneOf(o.shadow, ["none", "soft", "deep"]), "Shadow");
  if (o.shape !== undefined) put("shape", oneOf(o.shape, SHAPE_IDS), "Shape");
  if (o.surface !== undefined) put("surface", oneOf(o.surface, SURFACE_IDS), "Surface");
  if (o.image !== undefined && o.image !== "") put("image", safeImage(o.image), "Hero picture");
  return { clean: out, errors };
}
export function cleanSections(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const row of input.slice(0, 14)) {
    const [k, v] = Array.isArray(row) ? row : [];
    if (SECTION_KIND_IDS.includes(k)) out.push([k, sectionVariants(k).includes(v) ? v : sectionVariants(k)[0]]);
  }
  return out;
}

// Validates a body {mode, theme, header, hero, sections, custom} and returns the flat settings to store.
export function validateStudioInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const clean = {}; const errors = [];
  if (b.mode !== undefined) { const m = oneOf(b.mode, MODES); if (!m) errors.push("Unknown mode."); else clean.prostudio_mode = m; }
  if (b.theme !== undefined) { if (b.theme === "" || THEME_IDS.includes(b.theme)) clean.prostudio_theme = b.theme; else errors.push("Unknown theme."); }
  if (b.header !== undefined) { if (b.header === "" || HEADER_IDS.includes(b.header)) clean.prostudio_header = b.header; else errors.push("Unknown header."); }
  if (b.hero !== undefined) { if (b.hero === "" || HERO_IDS.includes(b.hero)) clean.prostudio_hero = b.hero; else errors.push("Unknown hero."); }
  if (b.sections === null) clean.prostudio_sections = ""; // null = "no custom order" (a theme pick sends it)
  else if (b.sections !== undefined) { const s = cleanSections(b.sections); if (!s) errors.push("Sections must be a list."); else clean.prostudio_sections = JSON.stringify(s); }
  if (b.cards !== undefined) { const r = validateCardsInput(b.cards); errors.push(...r.errors); if (!r.errors.length) clean.prostudio_cards = r.value; }
  if (b.custom !== undefined) { const r = cleanCustom(b.custom); errors.push(...r.errors); clean.prostudio_custom = JSON.stringify(r.clean); }
  return { clean, errors };
}

const parse = (s, fb) => { try { const v = JSON.parse(s); return v ?? fb; } catch { return fb; } };
// Reads the stored settings into a state object. Anything invalid falls back to "off", never throwing.
export function parseProStudio(values = {}) {
  const mode = oneOf(values.prostudio_mode, MODES) || "off";
  const theme = THEME_IDS.includes(values.prostudio_theme) ? values.prostudio_theme : "";
  const header = HEADER_IDS.includes(values.prostudio_header) ? values.prostudio_header : "";
  const hero = HERO_IDS.includes(values.prostudio_hero) ? values.prostudio_hero : "";
  const sections = cleanSections(parse(values.prostudio_sections, null)) || null;
  const custom = cleanCustom(parse(values.prostudio_custom, {})).clean;
  const cards = parseCards(values.prostudio_cards);
  return { mode, theme, header, hero, sections, custom, cards };
}
export const STUDIO_DEFAULTS = { mode: "off", theme: "", header: "", hero: "", sections: null, custom: {}, cards: null };
