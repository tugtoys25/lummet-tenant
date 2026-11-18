// Composes a studio design into CSS variables + markup. Used by the admin preview (iframe) and by the public site, so the preview and
// the published page come from the same code. Mode A uses a theme's header, hero and sections; Mode B lets header/hero be chosen on
// their own and leaves everything else as it was.
import { esc, cleanHex } from "./util.js";
import { THEMES, getTheme, themeCopy } from "./themes.js";
import { getHeader, renderHeader, headerCss } from "./headers.js";
import { liveHeaderCss } from "./live-header.js";
import { buildThemeCss } from "../site-settings/theme.js";
import { getHero, renderHero } from "./heroes.js";
import { renderSection, sectionCss } from "./sections.js";
import { heroCss } from "./heroes-css.js";
import { shapeCss } from "./shapes.js";
import { FONT_STACKS } from "../header-hero/schema.js";
import { liveCopy, previewCopy } from "./site-copy.js";


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

// Preview: the site's own wording first (site/nav), theme sample text only where the site has none.
function pageParts(r, site, nav) {
  const c = previewCopy(r.base, site, nav);
  const img = cleanHex ? r.custom.image : "";
  const ctx = { ...c, p: cleanHex(r.custom.p, r.base.pal.p), p2: cleanHex(r.custom.p2, r.base.pal.p2), sceneBg: cleanHex(r.custom.bg, r.base.pal.tx), image: img || "", imageAlt: "" };
  const hdr = getHeader(r.header);
  const stage = `<div class="lds-stage">${renderHeader(r.header, ctx)}${renderHero(r.hero, { ...ctx, sceneBg: "#1e293b" })}</div>`;
  const secs = r.sections.map(([k, v]) => renderSection(k, v, ctx)).join("");
  return { stage, secs, rail: hdr.family === "sidebar" };
}

// A complete HTML document for the admin preview iframe (sandboxed, no script).
export function renderPreviewDocument(state, site = {}, nav = []) {
  const r = resolve(state);
  const { stage, secs, rail } = pageParts(r, site, nav);
  const surface = r.custom.surface || r.base.surface;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title><style>html,body{margin:0}body{font-family:system-ui,sans-serif}${studioCss()}</style></head><body><div class="lds-page${rail ? " lds-has-rail" : ""}${surface && surface !== "none" ? ` lds-sf-${esc(surface)}-page` : ""}" style="${cssVars(r)}">${stage}${secs}</div></body></html>`;
}

// Thumbnail markup used by the gallery cards: a scaled-down render of the real preview, built from the same functions.
export function renderThumbMarkup(kind, id, themeId, site = {}, nav = []) {
  const base = getTheme(themeId) || THEMES[0];
  const r = resolve({ mode: "theme", theme: base.id, header: kind === "header" ? id : "", hero: kind === "hero" ? id : "", sections: kind === "theme" ? null : [] });
  if (kind === "theme") { r.base = getTheme(id) || base; r.header = r.base.header; r.hero = r.base.hero; r.sections = r.base.sections.slice(0, 2); r.copy = themeCopy(r.base); }
  const parts = pageParts(r, site, nav);
  return `<div class="lds-page" style="${cssVars(r)}">${parts.stage}${kind === "theme" ? parts.secs : ""}</div>`;
}

// ---- Public site hook. Returns null when the studio is off, so existing sites render exactly as before.
// Mode A (theme): palette, shape and type values re-point the site's own --theme-* variables, plus the theme's header skin and hero.
// Mode B (components): only the header and/or hero the customer picked are touched; palette and everything else stay as they were.
// copyFromSite = { site: { siteName, headerHero } }
export function studioPublicParts(state, copyFromSite = {}) {
  if (!state || state.mode === "off") return null;
  const themeMode = state.mode === "theme";
  const r = resolve(state);
  const useHeader = themeMode || Boolean(state.header);
  const useHero = themeMode || Boolean(state.hero);
  if (!themeMode && !useHeader && !useHero) return null;
  const p = r.base.pal, c = r.custom;
  // Live site: ONLY the site's own content (Header & Hero settings). No theme sample wording is ever used here.
  const own = liveCopy(copyFromSite.site || {}, []);
  const ctx = { ...own, scene: r.copy.scene, p: cleanHex(c.p, p.p), p2: cleanHex(c.p2, p.p2), sceneBg: "#1e293b", image: c.image || own.image || "", imageAlt: "" };
  const hdr = getHeader(r.header);
  const vars = cssVars(r);
  // Theme mode must speak the site's OWN theme language: the site derives ~30 tokens (--primary, --bg, chrome, link, button text, card text,
  // section background ...) on :root from its theme settings. So the theme's palette is run through the site's own buildThemeCss and its :root
  // block is emitted (with a specificity bump so it wins over the tenant's block), instead of setting a few --theme-* values on <body>,
  // which the :root-resolved tokens would never see.
  const themeVars = "";
  const themeRoot = themeMode ? siteThemeRoot(copyFromSite.settings || {}, p, c, r) : "";
  // The site's OWN header, restyled with CSS (live-header.js). No second header is ever added to the page.
  const head = useHeader ? liveHeaderCss(hdr) : "";
  return {
    css: `<style id="dsp-vars">${themeRoot}.dsp-on{${themeVars}${vars}}.dsp-hero-scope{${vars}}${studioCss()}${head}</style>`,
    bodyClass: `dsp-on${useHeader ? " dsp-has-header dsp-h-" + hdr.skin + " dsp-f-" + hdr.family + (hdr.over ? " dsp-over" : "") : ""}${useHero && getHero(r.hero).dark ? " dsp-hero-dark" : ""}`,
    heroHtml: useHero ? `<div class="lds-page dsp-hero-scope" style="background:transparent">${renderHero(r.hero, ctx)}</div>` : "",
    useHero, useHeader, over: Boolean(useHeader && hdr.over), headerId: hdr.id, heroId: r.hero,
  };
}

// The :root token block the site's own theme engine produces for this studio theme's palette.
const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return 1; const n = parseInt(m[1], 16); const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; };
function siteThemeRoot(settings, p, c, r) {
  const bg = cleanHex(c.bg, p.bg), tx = cleanHex(c.tx, p.tx), sf = cleanHex(c.sf, p.sf);
  const darkPage = lum(bg) < 0.179;
  const chrome = darkPage ? sf : lum(tx) < 0.15 ? tx : "#0f172a"; // header / footer / dark panels
  const css = buildThemeCss({
    ...settings,
    themePrimary: cleanHex(c.p, p.p), themePrimaryHover: "", themeSecondary: cleanHex(c.p2, p.p2), themeSecondaryHover: "", themeAccent: cleanHex(c.p2, p.p2),
    themeBackground: bg, themeText: tx, themeTextMuted: p.mu, themeBorder: p.bd, themeButtonText: p.btn,
    themeSurface: chrome, themeSurfaceAlt: darkPage ? sf : "", themeFooterBackground: p.ft || "", themeHeaderBackground: "", themeSectionBackground: "",
    themeCardRadius: `${c.cr ?? Number.parseInt(r.base.cr, 10) ?? 12}px`, themeButtonRadius: `${c.br ?? Number.parseInt(r.base.br, 10) ?? 8}px`, themeContainerWidth: `${c.w ?? r.base.w ?? 1200}px`,
  });
  const m = /:root\s*\{[^}]*\}/.exec(String(css || ""));
  return m ? m[0].replace(/^:root/, "html:root") : "";
}
