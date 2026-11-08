// Builds the public markup. Inline banners go to named slots; floating/edge/bar go in one #live-banners container.
// Everything interpolated passes through esc(); colours and sizes are validated before they reach a style attribute.
import { esc, safeColor } from "./escape.js";
import { renderTemplate } from "./templates.js";
import { PRESETS, DEVICES, MAX_PER_ANCHOR_CAP } from "./limits.js";

export const INLINE_SLOTS = ["after_header", "before_main", "after_main", "sidebar", "top", "content_bottom", "bottom"];
const EVENT_URL = "/en/api/v1/live-banner/event";

function dim(s, key, fallback) {
  const p = s?.preset && s.preset !== "custom" ? PRESETS[s.preset] : null;
  if (p) return key === "w" ? (s.preset === "full" ? "100%" : `${p.w}px`) : fallback;
  if (s?.value) return `${Number(s.value)}${s.unit === "%" || s.unit === "vw" ? s.unit : "px"}`;
  return fallback;
}
const devSize = (d) => (d && d.value ? `${Number(d.value)}${d.unit === "%" || d.unit === "vw" ? d.unit : "px"}` : "");

export function styleVars(b) {
  const s = b.style || {};
  const v = [];
  const add = (k, val) => { if (val !== "" && val !== undefined && val !== null) v.push(`--lb-${k}:${val}`); };
  const bg = safeColor(s.bg), fg = safeColor(s.text), ac = safeColor(s.accent);
  add("bg", bg); add("fg", fg); add("accent", ac);
  add("radius", `${Number(s.radius ?? 12)}px`); add("opacity", Number(s.opacity ?? 1)); add("scale", Number(s.font_scale ?? 1));
  add("ox", `${Number(b.offset_x ?? 16)}px`); add("oy", `${Number(b.offset_y ?? 16)}px`);
  add("w", dim(b.width, "w", "")); add("h", dim(b.height, "h", ""));
  add("w-t", devSize(b.width?.tablet)); add("w-m", devSize(b.width?.mobile));
  add("h-t", devSize(b.height?.tablet)); add("h-m", devSize(b.height?.mobile));
  add("delay", `${Number(b.motion?.delay_ms || 0)}ms`);
  return v.join(";");
}

function classes(b) {
  const s = b.style || {};
  const c = ["lb", `lb--${b.placement_mode}`, `lb--${b.placement_mode}-${b.anchor}`, `lb-tpl-${b.template_key}`, `lb-z${Number(b.z_tier) || 1}`, `lb-in-${b.motion?.entrance || "none"}`, `lb-loop-${b.motion?.loop || "none"}`];
  if (s.gradient) c.push("lb--gradient");
  if (s.shadow !== false) c.push("lb--shadow");
  if (s.border) c.push("lb--border");
  if (s.scheme === "light" || s.scheme === "dark") c.push(`lb--${s.scheme}`);
  return c.join(" ");
}

export function renderOne(b) {
  const hide = DEVICES.filter((d) => !(b.targeting?.devices || DEVICES).includes(d)).join(" ");
  const t = b.trigger || {}, f = b.frequency || {}, s = b.style || {};
  const data = [`data-lb-id="${Number(b.id)}"`, `data-mode="${esc(b.placement_mode)}"`, `data-anchor="${esc(b.anchor)}"`, `data-prio="${Number(b.priority) || 0}"`,
    `data-trigger="${esc(t.type || "immediate")}"`, `data-secs="${Number(t.seconds) || 0}"`, `data-scroll="${Number(t.scroll) || 0}"`, `data-freq="${esc(f.type || "every")}"`, `data-days="${Number(f.days) || 1}"`,
    `data-max="${Math.min(MAX_PER_ANCHOR_CAP, Number(s.max_per_anchor) || 3)}"`, hide ? `data-hide="${esc(hide)}"` : ""].filter(Boolean).join(" ");
  const inner = renderTemplate(b.template_key, { c: b.content || {}, items: b.cards || [], b });
  if (!inner) return "";
  const close = b.dismissible ? `<button type="button" class="lb-close" data-lb-close aria-label="Close banner">×</button>` : "";
  const edge = b.placement_mode === "edge" ? `<button type="button" class="lb-tab" data-lb-tab aria-expanded="false">${esc(s.tab_label || b.content?.headline || "Offer")}</button>` : "";
  const modal = b.placement_mode === "floating" && b.anchor === "center";
  const role = modal ? ' role="dialog" aria-modal="true"' : ' role="region"';
  return `<aside class="${classes(b)}" ${data}${role} aria-label="${esc(b.name || "Promotion")}" style="${esc(styleVars(b))}">${edge}<div class="lb-card">${close}${inner}</div></aside>`;
}

/** @returns {{ slots: Record<string,string>, overlay: string, count: number }} */
export function renderLiveBanners(banners) {
  const slots = Object.fromEntries(INLINE_SLOTS.map((k) => [k, ""]));
  let overlay = "", count = 0;
  const sorted = [...banners].sort((a, b) => (a.priority - b.priority) || (a.id - b.id));
  for (const b of sorted) {
    const html = renderOne(b);
    if (!html) continue;
    count++;
    if (b.placement_mode === "inline") slots[b.anchor] = (slots[b.anchor] || "") + html;
    else overlay += html;
  }
  if (overlay) {
    const cfg = esc(JSON.stringify({ v: 1, event: EVENT_URL }));
    overlay = `<div id="live-banners" class="lb-root" data-lb="${cfg}">${overlay}</div>`;
  }
  const script = count ? `<script defer src="/static/js/live-banners.js"></script>` : "";
  return { slots, overlay: overlay + script, count };
}

/** Page type and slug from the URL, e.g. /en/casino/foo -> casino, foo; /en -> home. */
export function pageInfo(pathname) {
  const parts = String(pathname || "/").split("?")[0].split("/").filter(Boolean);
  if (parts[0] === "en") parts.shift();
  if (!parts.length) return { pageType: "home", slug: "" };
  return { pageType: parts[0].toLowerCase().slice(0, 40), slug: parts.slice(1).join("/").toLowerCase().slice(0, 120) };
}
