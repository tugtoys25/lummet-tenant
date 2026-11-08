// Validate and normalise a live banner payload. Allow-lists everywhere, unknown keys rejected, hard size caps.
import { safeUrl, safeImage, safeColor } from "./escape.js";
import { TEMPLATES } from "./templates.js";
import { MODES, ENTRANCE, LOOP, TRIGGERS, FREQUENCY, DEVICES, SOURCES, MAX_ITEMS, MAX_PER_ANCHOR_CAP, JSON_CAPS, SIZE_LIMITS, HEIGHT_LIMITS } from "./limits.js";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 100) / 100)) : d; };
const txt = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

function strict(obj, allowed, where, errs) {
  if (obj === undefined || obj === null) return {};
  if (!isObj(obj)) { errs.push(`${where} must be an object`); return {}; }
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errs.push(`${where}: unknown field "${k}"`);
  return obj;
}

function size(v, where, limits, errs) {
  const o = strict(v, ["preset", "value", "unit", "tablet", "mobile"], where, errs);
  const out = {};
  if (o.preset !== undefined) { if (!["s", "m", "l", "full", "custom"].includes(o.preset)) errs.push(`${where}: bad preset`); else out.preset = o.preset; }
  if (o.value !== undefined) {
    const unit = oneOf(o.unit, Object.keys(limits), null);
    if (!unit) errs.push(`${where}: unit must be px, % or vw`);
    else { out.unit = unit; out.value = num(o.value, limits[unit][0], limits[unit][1], limits[unit][0]); }
  }
  for (const d of ["tablet", "mobile"]) if (o[d] !== undefined) {
    const s = strict(o[d], ["value", "unit"], `${where}.${d}`, errs);
    const unit = oneOf(s.unit, Object.keys(limits), "px");
    out[d] = { unit, value: num(s.value, limits[unit][0], limits[unit][1], limits[unit][0]) };
  }
  return out;
}

function color(v, where, errs) {
  if (v === undefined || v === "") return "";
  const c = safeColor(v);
  if (!c) errs.push(`${where}: use a hex (#rrggbb) or rgb() colour`);
  return c;
}

function dateOf(v, where, errs) {
  if (v === undefined || v === null || v === "") return null;
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?$/);
  if (!m || Number.isNaN(Date.parse(m[1]))) { errs.push(`${where}: invalid date`); return null; }
  return `${m[1]} ${m[2] || "00:00"}:${m[3] || "00"}`;
}

function content(v, errs) {
  const KEYS = ["headline", "text", "cta_label", "link", "new_tab", "image", "image_2x", "alt", "disclaimer", "badge", "messages", "chips", "rows", "countdown_end", "marquee_text"];
  const o = strict(v, KEYS, "content", errs);
  const out = { headline: txt(o.headline, 120), text: txt(o.text, 400), cta_label: txt(o.cta_label, 40), new_tab: !!o.new_tab, alt: txt(o.alt, 120), disclaimer: txt(o.disclaimer, 240), badge: txt(o.badge, 30), marquee_text: txt(o.marquee_text, 300) };
  if (o.link) { out.link = safeUrl(o.link); if (!out.link) errs.push("content.link: use /path, https:// or mailto: only"); } else out.link = "";
  for (const k of ["image", "image_2x"]) { if (o[k]) { out[k] = safeImage(o[k]); if (!out[k]) errs.push(`content.${k}: use a Media library picture or an https:// address`); } else out[k] = ""; }
  out.messages = (Array.isArray(o.messages) ? o.messages : []).slice(0, 3).map((m) => txt(m, 200)).filter(Boolean);
  out.chips = (Array.isArray(o.chips) ? o.chips : []).slice(0, 4).map((c) => ({ label: txt(c?.label, 40), url: safeUrl(c?.url) })).filter((c) => c.label && c.url);
  out.rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, 8).map((r) => ({ k: txt(r?.k, 40), v: txt(r?.v, 80) })).filter((r) => r.k);
  out.countdown_end = o.countdown_end ? (dateOf(o.countdown_end, "content.countdown_end", errs) || "") : "";
  return out;
}

function style(v, errs) {
  const o = strict(v, ["bg", "text", "accent", "gradient", "radius", "shadow", "border", "opacity", "font_scale", "scheme", "max_per_anchor", "tab_label"], "style", errs);
  return { bg: color(o.bg, "style.bg", errs), text: color(o.text, "style.text", errs), accent: color(o.accent, "style.accent", errs), gradient: !!o.gradient, radius: num(o.radius, 0, 40, 12), shadow: o.shadow !== false, border: !!o.border,
    opacity: num(o.opacity, 0.3, 1, 1), font_scale: num(o.font_scale, 0.8, 1.4, 1), scheme: oneOf(o.scheme, ["auto", "light", "dark"], "auto"), max_per_anchor: num(o.max_per_anchor, 1, MAX_PER_ANCHOR_CAP, 3), tab_label: txt(o.tab_label, 24) };
}

function list(v, max, re, where, errs, upper = false) {
  const out = [];
  for (const x of (Array.isArray(v) ? v : []).slice(0, max)) {
    const s = upper ? String(x).trim().toUpperCase() : String(x).trim();
    if (!re.test(s)) errs.push(`${where}: "${txt(x, 20)}" is not valid`); else if (!out.includes(s)) out.push(s);
  }
  return out;
}

function targeting(v, errs) {
  const o = strict(v, ["countries_mode", "countries", "devices", "pages_mode", "page_types", "slugs", "auth"], "targeting", errs);
  const devices = (Array.isArray(o.devices) ? o.devices : DEVICES).filter((d) => DEVICES.includes(d));
  return { countries_mode: oneOf(o.countries_mode, ["include", "exclude"], "include"), countries: list(o.countries, 60, /^[A-Z]{2}$/, "targeting.countries", errs, true), devices: devices.length ? devices : [...DEVICES],
    pages_mode: oneOf(o.pages_mode, ["include", "exclude"], "include"), page_types: list(o.page_types, 20, /^[a-z0-9_-]{1,40}$/, "targeting.page_types", errs), slugs: list(o.slugs, 30, /^[a-z0-9][a-z0-9/_-]{0,119}$/i, "targeting.slugs", errs), auth: oneOf(o.auth, ["any", "signed_in", "anonymous"], "any") };
}

function items(v, tpl, errs) {
  const arr = Array.isArray(v) ? v : [];
  const max = Math.min(MAX_ITEMS, tpl.maxItems);
  if (arr.length > max) errs.push(`items: at most ${max} for this template`);
  const out = [];
  for (const it of arr.slice(0, max)) {
    const o = strict(it, ["source_type", "source_key", "overrides"], "item", errs);
    if (!SOURCES.includes(o.source_type) || !tpl.sources.includes(o.source_type)) { errs.push(`items: source "${txt(o.source_type, 20)}" is not allowed for this template`); continue; }
    const key = txt(o.source_key, 140);
    if (!/^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,139}$/.test(key)) { errs.push("items: invalid item key"); continue; }
    const ov = strict(o.overrides, ["label", "image", "badge", "url"], "item.overrides", errs);
    const overrides = { label: txt(ov.label, 120), badge: txt(ov.badge, 30), image: ov.image ? safeImage(ov.image) : "", url: ov.url ? safeUrl(ov.url) : "" };
    if (ov.image && !overrides.image) errs.push("item image: Media library or https:// only");
    if (ov.url && !overrides.url) errs.push("item link: /path, https:// or mailto: only");
    out.push({ source_type: o.source_type, source_key: key, overrides });
  }
  if (tpl.key === "slider") for (const i of out) if (!i.overrides.image) errs.push("slider: every slide needs a picture");
  return out;
}

/** Returns { ok, errors, banner, items }. `banner` has parsed JSON sections (width, height, style, ...). */
export function validateBanner(input) {
  const errs = [];
  const KEYS = ["id", "name", "status", "template_key", "placement_mode", "anchor", "offset_x", "offset_y", "z_tier", "priority", "width", "height", "style", "motion", "trigger", "frequency", "targeting", "content", "dismissible", "start_at", "end_at", "items"];
  const o = strict(input, KEYS, "banner", errs);
  const tpl = TEMPLATES[o.template_key];
  if (!tpl) { errs.push("template_key: unknown template"); return { ok: false, errors: errs }; }
  const name = txt(o.name, 80);
  if (!name) errs.push("name is required");
  const mode = oneOf(o.placement_mode, Object.keys(MODES), null);
  if (!mode) errs.push("placement_mode: floating, edge, bar or inline");
  const anchor = mode && MODES[mode].includes(o.anchor) ? o.anchor : null;
  if (mode && !anchor) errs.push(`anchor: not valid for ${mode}`);
  const m = strict(o.motion, ["entrance", "loop", "delay_ms"], "motion", errs);
  const t = strict(o.trigger, ["type", "seconds", "scroll"], "trigger", errs);
  const f = strict(o.frequency, ["type", "days"], "frequency", errs);
  const w = size(o.width, "width", SIZE_LIMITS, errs), h = size(o.height, "height", HEIGHT_LIMITS, errs);
  const c = content(o.content, errs);
  for (const req of tpl.required) {
    const ok = req === "messages" || req === "rows" ? c[req].length : c[req];
    if (!ok) errs.push(`${req.replace(/_/g, " ")} is required for the ${tpl.label} template`);
  }
  const banner = {
    name, status: oneOf(o.status, ["draft", "live", "paused"], "draft"), template_key: tpl.key, placement_mode: mode, anchor,
    offset_x: num(o.offset_x, 0, 200, 16), offset_y: num(o.offset_y, 0, 200, 16), z_tier: num(o.z_tier, 1, 3, 1), priority: num(o.priority, 0, 100000, 100),
    width: w, height: h, style: style(o.style, errs),
    motion: { entrance: oneOf(m.entrance, ENTRANCE, "none"), loop: oneOf(m.loop, LOOP, "none"), delay_ms: num(m.delay_ms, 0, 30000, 0) },
    trigger: { type: oneOf(t.type, TRIGGERS, "immediate"), seconds: num(t.seconds, 0, 300, 5), scroll: num(t.scroll, 0, 100, 50) },
    frequency: { type: oneOf(f.type, FREQUENCY, "every"), days: num(f.days, 1, 365, 7) },
    targeting: targeting(o.targeting, errs), content: c, dismissible: o.dismissible !== false,
    start_at: dateOf(o.start_at, "start_at", errs), end_at: dateOf(o.end_at, "end_at", errs),
  };
  if (banner.start_at && banner.end_at && banner.end_at < banner.start_at) errs.push("end_at must be after start_at");
  const its = items(o.items, tpl, errs);
  for (const [k, cap] of Object.entries(JSON_CAPS)) if (k !== "items" && banner[k] && JSON.stringify(banner[k]).length > cap) errs.push(`${k} is too large`);
  if (JSON.stringify(its).length > JSON_CAPS.items) errs.push("items are too large");
  return errs.length ? { ok: false, errors: errs } : { ok: true, errors: [], banner, items: its };
}
