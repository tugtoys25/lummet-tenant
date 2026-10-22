import { cleanLink, cleanText, cleanImage, escapeHtml } from "../header-hero.js";
import { isSource, isValidKey, SOURCE_KEYS } from "../component-sources.js";

export const STUDIO_TYPES = ["content_grid", "data_table", "section"];

export const MAX_GRID_ITEMS = 24;

export const MAX_TABLE_COLS = 8;

export const MAX_TABLE_ROWS = 60;

export const MAX_BLOCKS = 30;

export const e = escapeHtml;

const SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/i;

// ---------------------------------------------------------------------------
// small value cleaners
// ---------------------------------------------------------------------------

export function pickEnum(v, values, def) {
  const s = String(v ?? "").trim();
  return values.includes(s) ? s : def;
}

export function bool(v, def) {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return def;
}

export function int(v, min, max, def) {
  const n = Math.round(Number(v));
  if (v === "" || v === null || v === undefined || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function text(v, max) {
  return cleanText(v, max);
}

export function arr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

export function obj(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; }
  }
  return {};
}

export function link(v, max = 300) {
  return cleanLink(v, max);
}

export function image(v) {
  return cleanImage(v, 500);
}

export function slugOrEmpty(v) {
  const s = String(v ?? "").trim();
  return SLUG.test(s) ? s : "";
}

/** [{source,key,label?}] with only valid sources and keys, no duplicates, at most `max` */
export function cleanPicks(raw, max = MAX_GRID_ITEMS, allowed = SOURCE_KEYS) {
  const out = [];
  const seen = new Set();
  for (const item of arr(raw)) {
    if (out.length >= max) break;
    if (!item || typeof item !== "object") continue;
    const source = String(item.source || "");
    if (!allowed.includes(source) || !isSource(source) || !isValidKey(source, item.key)) continue;
    const key = String(item.key);
    const id = `${source}:${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = { source, key };
    const label = text(item.label, 160);
    if (label) entry.label = label;
    out.push(entry);
  }
  return out;
}
