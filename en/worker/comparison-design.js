// Look and custom values of one comparison page.
//
// Stored as one JSON document in the existing `settings` table under
// `comparison_design:{type}:{slug}`, so no database change is needed and a comparison
// without a design renders exactly as before.
//
// {
//   page:  { head_bg, head_text, label_bg, label_text, cell_bg, cell_text, stripe_bg, border, accent,
//            font, size, radius }                      whole table
//   items: { "casino:12": { head_bg, head_text, col_bg, col_text, accent, font } }   one column
//   rows:  { "license":   { label_bg, label_text, cell_bg, cell_text } }              one row
//   cells: { "license":   { "casino:12": "My own text" } }                            custom values
// }
// Precedence for a cell: the item's column colours, then the row's, then the whole table's.
// A custom value replaces the real value of that cell only; an empty one means "use the real value".

import { cleanPicks } from "./component-studio.js";
import { resolvePicks } from "./component-sources.js";

export const FONTS = {
  site: "",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'SFMono-Regular', Menlo, Consolas, monospace",
  rounded: "'Trebuchet MS', 'Segoe UI', sans-serif",
  classic: "Verdana, Geneva, sans-serif",
  elegant: "'Palatino Linotype', Palatino, serif"
};
export const SIZES = { sm: "13px", md: "", lg: "17px" };
export const RADII = { sq: "0px", md: "", lg: "22px" };

const PAGE_COLORS = ["head_bg", "head_text", "label_bg", "label_text", "cell_bg", "cell_text", "stripe_bg", "border", "accent"];
const ITEM_COLORS = ["head_bg", "head_text", "col_bg", "col_text", "accent"];
const ROW_COLORS = ["label_bg", "label_text", "cell_bg", "cell_text"];
const ITEM_KEY = /^(casino|sportsbook|affiliate_partner|custom):\d{1,12}$/;
const ROW_KEY = /^[a-z0-9_]{1,60}$/i;
const MAX_ITEMS = 24;
const MAX_ROWS = 80;
const MAX_VALUE = 200;

function color(v) {
  const s = String(v ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : "";
}
function pick(map, v) {
  const s = String(v ?? "");
  return Object.prototype.hasOwnProperty.call(map, s) ? s : "";
}
function pickColors(src, names) {
  const out = {};
  for (const n of names) { const c = color(src && src[n]); if (c) out[n] = c; }
  return out;
}
function text(v) {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_VALUE);
}
function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

// ---------------------------------------------------------------------------
// Content sections shown as text below the table
// ---------------------------------------------------------------------------
export const SECTION_TYPES = ["heading", "text", "bullets", "callout", "picks", "link", "image", "divider"];
const MAX_BLOCKS = 30;

function safeLink(v) {
  const s = String(v ?? "").trim().slice(0, 300);
  return /^(\/(?!\/)|https?:\/\/)/i.test(s) && !/[\u0000-\u001f\s"'<>]/.test(s) ? s : "";
}
function oneOf(v, list, def) { return list.includes(v) ? v : def; }
function longText(v, max) {
  return String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

export function cleanSections(input) {
  const out = [];
  for (const raw of (Array.isArray(input) ? input : []).slice(0, MAX_BLOCKS)) {
    const b = obj(raw);
    switch (b.type) {
      case "heading": { const t = text(b.text); if (t) out.push({ type: "heading", text: t, level: oneOf(b.level, ["h2", "h3"], "h2") }); break; }
      case "text": { const t = longText(b.text, 3000); if (t) out.push({ type: "text", text: t }); break; }
      case "bullets": {
        const items = (Array.isArray(b.items) ? b.items : []).slice(0, 20).map((i) => text(i)).filter(Boolean);
        if (items.length) out.push({ type: "bullets", items, style: oneOf(b.style, ["bullet", "number"], "bullet") });
        break;
      }
      case "callout": {
        const t = longText(b.text, 600); const title = text(b.title).slice(0, 100);
        if (t || title) out.push({ type: "callout", title, text: t, tone: oneOf(b.tone, ["info", "good", "warn"], "info") });
        break;
      }
      case "picks": {
        const picks = cleanPicks(b.picks, 12);
        if (picks.length) out.push({ type: "picks", title: text(b.title).slice(0, 100), picks });
        break;
      }
      case "link": { const l = safeLink(b.link); const t = text(b.text).slice(0, 80); if (l && t) out.push({ type: "link", text: t, link: l, style: oneOf(b.style, ["primary", "ghost"], "primary") }); break; }
      case "image": { const src = safeLink(b.src); if (src) out.push({ type: "image", src, alt: text(b.alt).slice(0, 160), caption: text(b.caption).slice(0, 200) }); break; }
      case "divider": out.push({ type: "divider" }); break;
      default: break;
    }
  }
  return out;
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** HTML of the sections (text, lists, callouts, picked items as text rows) */
export async function renderComparisonSections(db, sections) {
  const blocks = cleanSections(sections);
  if (!blocks.length) return "";
  const html = [];
  for (const b of blocks) {
    if (b.type === "heading") html.push(`<${b.level} class="cmps-heading">${esc(b.text)}</${b.level}>`);
    else if (b.type === "text") html.push(b.text.split(/\n{2,}/).map((p) => `<p class="cmps-text">${esc(p).replace(/\n/g, "<br>")}</p>`).join(""));
    else if (b.type === "bullets") { const tag = b.style === "number" ? "ol" : "ul"; html.push(`<${tag} class="cmps-list">${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</${tag}>`); }
    else if (b.type === "callout") html.push(`<aside class="cmps-callout cmps-callout--${b.tone}">${b.title ? `<strong>${esc(b.title)}</strong>` : ""}${b.text ? `<p>${esc(b.text).replace(/\n/g, "<br>")}</p>` : ""}</aside>`);
    else if (b.type === "link") html.push(`<p class="cmps-link"><a class="btn ${b.style === "ghost" ? "btn--ghost" : "btn--primary"}" href="${esc(b.link)}"${/^https?:/i.test(b.link) ? ' target="_blank" rel="noopener"' : ""}>${esc(b.text)}</a></p>`);
    else if (b.type === "image") html.push(`<figure class="cmps-image"><img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`);
    else if (b.type === "divider") html.push(`<hr class="cmps-divider">`);
    else if (b.type === "picks") {
      const cards = await resolvePicks(db, b.picks);
      if (!cards.length) continue;
      html.push(`<div class="cmps-picks">${b.title ? `<h3 class="cmps-heading">${esc(b.title)}</h3>` : ""}<ul class="cmps-pickrows">${cards.map((c) => `<li><a href="${esc(c.url)}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span class="cmps-pick__body"><strong>${esc(c.title)}</strong>${c.badge ? ` <em>${esc(c.badge)}</em>` : ""}${c.rating ? ` <span class="cmps-pick__rating">${Number(c.rating).toFixed(1)} / 5</span>` : ""}${c.excerpt ? `<span class="cmps-pick__text">${esc(c.excerpt)}</span>` : ""}</span></a></li>`).join("")}</ul></div>`);
    }
  }
  return html.length ? `<section class="cmp-sections">${html.join("")}</section>` : "";
}

/** Only known fields survive, colours must be #rrggbb, fonts come from a fixed list, text is plain. */
export function cleanDesign(input) {
  let src = input;
  if (typeof src === "string") { try { src = JSON.parse(src); } catch { src = {}; } }
  src = obj(src);

  const page = pickColors(obj(src.page), PAGE_COLORS);
  const font = pick(FONTS, obj(src.page).font); if (font && font !== "site") page.font = font;
  const size = pick(SIZES, obj(src.page).size); if (size && size !== "md") page.size = size;
  const radius = pick(RADII, obj(src.page).radius); if (radius && radius !== "md") page.radius = radius;

  const items = {};
  for (const [k, v] of Object.entries(obj(src.items)).slice(0, MAX_ITEMS)) {
    if (!ITEM_KEY.test(k)) continue;
    const one = pickColors(obj(v), ITEM_COLORS);
    const f = pick(FONTS, obj(v).font); if (f && f !== "site") one.font = f;
    if (Object.keys(one).length) items[k] = one;
  }

  const rows = {};
  for (const [k, v] of Object.entries(obj(src.rows)).slice(0, MAX_ROWS)) {
    if (!ROW_KEY.test(k)) continue;
    const one = pickColors(obj(v), ROW_COLORS);
    if (Object.keys(one).length) rows[k] = one;
  }

  const cells = {};
  for (const [k, v] of Object.entries(obj(src.cells)).slice(0, MAX_ROWS)) {
    if (!ROW_KEY.test(k)) continue;
    const perItem = {};
    for (const [ik, val] of Object.entries(obj(v)).slice(0, MAX_ITEMS)) {
      const t = text(val);
      if (ITEM_KEY.test(ik) && t) perItem[ik] = t;
    }
    if (Object.keys(perItem).length) cells[k] = perItem;
  }

  return { page, items, rows, cells, sections: cleanSections(src.sections) };
}

export function isEmptyDesign(d) {
  return !d || (!Object.keys(d.page || {}).length && !Object.keys(d.items || {}).length && !Object.keys(d.rows || {}).length && !Object.keys(d.cells || {}).length && !(d.sections || []).length);
}

const keyFor = (type, slug) => `comparison_design:${type}:${slug}`;

export async function getComparisonDesign(db, type, slug) {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(keyFor(type, slug)).first();
    return cleanDesign(row && row.value);
  } catch (err) {
    console.error("comparison design unavailable:", err && err.message);
    return cleanDesign({});
  }
}

export async function saveComparisonDesign(db, type, slug, design) {
  const clean = cleanDesign(design);
  if (isEmptyDesign(clean)) {
    await db.prepare("DELETE FROM settings WHERE key = ?").bind(keyFor(type, slug)).run();
  } else {
    await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").bind(keyFor(type, slug), JSON.stringify(clean)).run();
  }
  return clean;
}

export async function deleteComparisonDesign(db, type, slug) {
  await db.prepare("DELETE FROM settings WHERE key = ?").bind(keyFor(type, slug)).run();
}

// ---------------------------------------------------------------------------
// Rendering helpers (every value here has already passed cleanDesign)
// ---------------------------------------------------------------------------

/** CSS variables for the whole table, as an inline style value */
export function pageStyle(design) {
  const p = (design && design.page) || {};
  const v = [];
  const map = { head_bg: "head-bg", head_text: "head-text", label_bg: "label-bg", label_text: "label-text", cell_bg: "cell-bg", cell_text: "cell-text", stripe_bg: "stripe-bg", border: "border", accent: "accent" };
  for (const [k, css] of Object.entries(map)) if (p[k]) v.push(`--cmp-${css}:${p[k]}`);
  if (p.font && FONTS[p.font]) v.push(`--cmp-font:${FONTS[p.font].replace(/"/g, "'")}`);
  if (p.size && SIZES[p.size]) v.push(`--cmp-size:${SIZES[p.size]}`);
  if (p.radius && RADII[p.radius]) v.push(`--cmp-radius:${RADII[p.radius]}`);
  return v.join(";");
}

/** inline style for one cell: a row's colours, then the item column's on top */
export function cellStyle(rowStyle, itemStyle) {
  const r = rowStyle || {}; const i = itemStyle || {};
  const bg = i.col_bg || r.cell_bg; const fg = i.col_text || r.cell_text;
  const v = [];
  if (bg) v.push(`background:${bg}`);
  if (fg) v.push(`color:${fg}`);
  if (i.font && FONTS[i.font]) v.push(`font-family:${FONTS[i.font].replace(/"/g, "'")}`);
  return v.join(";");
}

export function headStyle(itemStyle) {
  const i = itemStyle || {};
  const v = [];
  if (i.head_bg) v.push(`background:${i.head_bg}`);
  if (i.head_text) v.push(`color:${i.head_text}`);
  if (i.accent) v.push(`box-shadow:inset 0 3px 0 ${i.accent}`);
  if (i.font && FONTS[i.font]) v.push(`font-family:${FONTS[i.font].replace(/"/g, "'")}`);
  return v.join(";");
}

export function labelStyle(rowStyle) {
  const r = rowStyle || {};
  const v = [];
  if (r.label_bg) v.push(`background:${r.label_bg}`);
  if (r.label_text) v.push(`color:${r.label_text}`);
  return v.join(";");
}
