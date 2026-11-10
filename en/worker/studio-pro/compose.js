// Composes a studio design into CSS variables + markup. Used by the admin preview (iframe) and by the public site, so the preview and
// the published page come from the same code. Mode A uses a theme's header, hero and sections; Mode B lets header/hero be chosen on
// their own and leaves everything else as it was.
import { esc, cleanHex } from "./util.js";
import { THEMES, getTheme, themeCopy } from "./themes.js";
import { getHeader, renderHeader, headerCss } from "./headers.js";
import { getHero, renderHero } from "./heroes.js";
import { renderSection, sectionCss } from "./sections.js";
import { heroCss } from "./heroes-css.js";
import { shapeCss } from "./shapes.js";
import { FONT_STACKS } from "../header-hero/schema.js";

const SHADOWS = { none: "none", soft: "0 10px 30px rgba(15,23,42,.10)", deep: "0 24px 60px rgba(15,23,42,.28)" };
const px = (n) => `${n}px`;
const stack = (k, fb) => FONT_STACKS[k] || FONT_STACKS[fb] || FONT_STACKS.system;

// Resolve what is being shown: theme + optional component overrides + custom values.
export function resolve(state = {}) {
  const base = getTheme(state.theme) || THEMES[0];
  const mode = state.mode === "components" ? "components" : "theme";
  const header = (mode === "components" ? state.header : "") || (mode === "theme" ? state.header : "") || base.header;
  const hero = (mode === "components" ? state.hero : "") || (mode === "theme" ? state.hero : "") || base.hero;
  const sections = Array.isArray(state.sections) && state.sections.length ? state.sections : base.sections;
  return { base, mode, header, hero, sections, custom: state.custom || {}, copy: themeCopy(base) };
}

export function cssVars(r) {
  const p = r.base.pal, c = r.custom, v = [];
  const col = (k, def) => cleanHex(c[k], def);
  const set = (n, val) => v.push(`--${n}:${val}`);
  set("p", col("p", p.p)); set("p2", col("p2", p.p2)); set("bg", col("bg", p.bg)); set("sf", col("sf", p.sf)); set("tx", col("tx", p.tx));
  set("mu", p.mu); set("bd", p.bd); set("btn", p.btn); set("ft", p.ft);
  set("hf", stack(c.hf, r.base.hf)); set("bf", stack(c.bf, r.base.bf));
  set("br", px(c.br ?? Number.parseInt(r.base.br, 10) ?? 8)); set("cr", px(c.cr ?? Number.parseInt(r.base.cr, 10) ?? 12));
  set("w", px(c.w ?? r.base.w)); set("hh", px(c.hh ?? 68)); set("hero-h", px(c.heroH ?? 520)); set("sp", px(c.sp ?? 72)); set("hero-pad", px(Math.round((c.heroH ?? 520) / 7)));
  set("ov", ((c.ov ?? 70) / 100).toFixed(2)); set("ta", c.align || "left"); set("sh", SHADOWS[c.shadow] || SHADOWS.none);
  set("fs", `${c.fs ?? 100}%`);
  return v.join(";");
}

export const studioCss = () => headerCss() + heroCss() + sectionCss() + shapeCss() + `
.lds-page{font-size:var(--fs,100%);background:var(--bg);color:var(--tx);min-height:100%}.lds-page *{box-sizing:border-box}
.lds-btn{border-radius:var(--br)}.lds-hero .lds-btn{padding:13px 26px}
.lds-page.lds-has-rail{padding-left:210px}@media(max-width:900px){.lds-page.lds-has-rail{padding-left:0}}
`;

function pageParts(r) {
  const c = { ...r.copy };
  const img = cleanHex ? r.custom.image : "";
  const ctx = { ...c, p: cleanHex(r.custom.p, r.base.pal.p), p2: cleanHex(r.custom.p2, r.base.pal.p2), sceneBg: cleanHex(r.custom.bg, r.base.pal.tx), image: img || "", imageAlt: "" };
  const hdr = getHeader(r.header);
  const stage = `<div class="lds-stage">${renderHeader(r.header, ctx)}${renderHero(r.hero, { ...ctx, sceneBg: "#1e293b" })}</div>`;
  const secs = r.sections.map(([k, v]) => renderSection(k, v, ctx)).join("");
  return { stage, secs, rail: hdr.family === "sidebar" };
}

// A complete HTML document for the admin preview iframe (sandboxed, no script).
export function renderPreviewDocument(state) {
  const r = resolve(state);
  const { stage, secs, rail } = pageParts(r);
  const surface = r.custom.surface || r.base.surface;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title><style>html,body{margin:0}body{font-family:system-ui,sans-serif}${studioCss()}</style></head><body><div class="lds-page${rail ? " lds-has-rail" : ""}${surface && surface !== "none" ? ` lds-sf-${esc(surface)}-page` : ""}" style="${cssVars(r)}">${stage}${secs}</div></body></html>`;
}

// Thumbnail markup used by the gallery cards: a scaled-down render of the real preview, built from the same functions.
export function renderThumbMarkup(kind, id, themeId) {
  const base = getTheme(themeId) || THEMES[0];
  const r = resolve({ mode: "theme", theme: base.id, header: kind === "header" ? id : "", hero: kind === "hero" ? id : "", sections: kind === "theme" ? null : [] });
  if (kind === "theme") { r.base = getTheme(id) || base; r.header = r.base.header; r.hero = r.base.hero; r.sections = r.base.sections.slice(0, 2); r.copy = themeCopy(r.base); }
  const parts = pageParts(r);
  return `<div class="lds-page" style="${cssVars(r)}">${parts.stage}${kind === "theme" ? parts.secs : ""}</div>`;
}

// ---- Public site hook. Returns null when the studio is off, so existing sites render exactly as before.
// Mode A (theme): palette, shape and type values re-point the site's own --theme-* variables, plus the theme's header skin and hero.
// Mode B (components): only the header and/or hero the customer picked are touched; palette and everything else stay as they were.
export function studioPublicParts(state, copyFromSite = {}) {
  if (!state || state.mode === "off") return null;
  const themeMode = state.mode === "theme";
  const r = resolve(state);
  const useHeader = themeMode || Boolean(state.header);
  const useHero = themeMode || Boolean(state.hero);
  if (!themeMode && !useHeader && !useHero) return null;
  const p = r.base.pal, c = r.custom;
  const ctx = { ...r.copy, p: cleanHex(c.p, p.p), p2: cleanHex(c.p2, p.p2), sceneBg: "#1e293b", image: c.image || "", imageAlt: "" };
  if (copyFromSite.name) ctx.name = copyFromSite.name;
  if (copyFromSite.title) ctx.title = copyFromSite.title;
  if (copyFromSite.sub) ctx.sub = copyFromSite.sub;
  if (copyFromSite.badge) ctx.badge = copyFromSite.badge;
  if (copyFromSite.cta) ctx.cta = copyFromSite.cta;
  const hdr = getHeader(r.header);
  const vars = cssVars(r);
  const themeVars = themeMode ? `--theme-primary:${cleanHex(c.p, p.p)};--theme-secondary:${cleanHex(c.p2, p.p2)};--theme-background:${cleanHex(c.bg, p.bg)};--theme-text:${cleanHex(c.tx, p.tx)};--theme-text-muted:${p.mu};--theme-border:${p.bd};` : "";
  const head = [];
  if (useHeader) {
    const o = [];
    if (hdr.over) o.push("position:absolute;left:0;right:0;top:0;background:transparent!important;border:0!important;box-shadow:none!important;z-index:20");
    if (hdr.skin === "brand" || hdr.skin === "gradient") o.push("background:linear-gradient(100deg,var(--p),var(--p2))!important;color:var(--btn)!important");
    if (hdr.skin === "luxury") o.push("background:#0a0a0a!important;color:#f3e7c4!important;border-bottom:1px solid #b79a4b!important");
    if (hdr.skin === "glass") o.push("backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)");
    if (hdr.skin === "roundb") o.push("border-radius:0 0 34px 34px");
    if (hdr.skin === "angled") o.push("clip-path:polygon(0 0,100% 0,100% 62%,97% 100%,3% 100%,0 62%)");
    if (o.length) head.push(`.dsp-has-header .site-header{${o.join(";")}}`);
  }
  return {
    css: `<style id="dsp-vars">.dsp-on{${themeVars}${vars}}.dsp-hero-scope{${vars}}${studioCss()}${head.join("")}</style>`,
    bodyClass: `dsp-on${useHeader ? " dsp-has-header dsp-h-" + hdr.skin : ""}`,
    heroHtml: useHero ? `<div class="lds-page dsp-hero-scope" style="background:transparent">${renderHero(r.hero, ctx)}</div>` : "",
    useHero, useHeader, headerId: hdr.id, heroId: r.hero,
  };
}
