// DESIGN STUDIO ENGINE (Libraries 2-5). Pure functions, no I/O, no imports from Library 1 except read-only font stacks.
// Safety: user values never reach CSS/HTML unless they matched an allow-list or a strict pattern. Static catalog CSS is trusted.
import { FONT_STACKS } from "../header-hero/schema.js";
import { HEADERS, HEADER_BY_ID } from "./catalog-headers.js";
import { HEROES, HERO_BY_ID } from "./catalog-heroes.js";
import { SHAPES, SHAPE_BY_ID } from "./catalog-shapes.js";
import { SECTIONS, SECTION_BY_ID } from "./catalog-sections.js";
import { THEME_BY_ID } from "./catalog-themes.js";
import { studioCtx } from "./site-ctx.js";

export const SELECTION_KEY = "ds_selection";          // new, namespaced settings keys: never collide with Library 1 keys
export const PREVIOUS_KEY = "ds_selection_previous";
export const MODES = ["theme", "components"];
const COLOR_FIELDS = ["primary", "accent", "bg", "surface", "fg", "border"];
const BUTTONS = ["square", "rounded", "pill"];
const ALIGNS = ["left", "center", "right"];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

// ---- colour maths (WCAG) used to guarantee readable text on the brand colour
const rgb = (h) => { let x = h.slice(1); if (x.length === 3) x = [...x].map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
export const luminance = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const onColor = (bg) => (contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111");

// ---- selection validation. Returns { clean, errors }; unknown ids are rejected, never stored.
export function sanitizeSelection(input) {
  const errors = []; const clean = {};
  const i = input && typeof input === "object" ? input : {};
  clean.mode = MODES.includes(i.mode) ? i.mode : "theme";
  if (i.theme) { if (THEME_BY_ID.has(i.theme)) clean.theme = i.theme; else errors.push("Unknown theme."); }
  if (i.header) { if (HEADER_BY_ID.has(i.header)) clean.header = i.header; else errors.push("Unknown header."); }
  if (i.hero) { if (HERO_BY_ID.has(i.hero)) clean.hero = i.hero; else errors.push("Unknown hero."); }
  clean.sections = {};
  for (const [t, v] of Object.entries(i.sections && typeof i.sections === "object" ? i.sections : {})) {
    const type = SECTION_BY_ID.get(t);
    if (type && type.variants.some((x) => x.id === v)) clean.sections[t] = v; else errors.push(`Unknown section choice: ${String(t).slice(0, 30)}.`);
  }
  clean.shapes = [];
  for (const s of (Array.isArray(i.shapes) ? i.shapes : []).slice(0, 6)) { if (SHAPE_BY_ID.has(s)) clean.shapes.push(s); else errors.push("Unknown shape."); }
  const o = i.overrides && typeof i.overrides === "object" ? i.overrides : {}; const ov = {};
  for (const k of COLOR_FIELDS) if (o[k] !== undefined && o[k] !== "") { if (HEX.test(String(o[k]))) ov[k] = String(o[k]).toLowerCase(); else errors.push(`Invalid colour for ${k}.`); }
  for (const [k, lo, hi] of [["radius", 0, 48], ["headerHeight", 48, 140], ["heroOverlay", 0, 85], ["width", 900, 1440], ["sectionSpacing", 24, 160]]) if (o[k] !== undefined && o[k] !== "") { const n = int(o[k], lo, hi); if (n === null) errors.push(`${k} must be ${lo}-${hi}.`); else ov[k] = n; }
  for (const k of ["fontHeading", "fontBody"]) if (o[k] !== undefined && o[k] !== "") { if (Object.hasOwn(FONT_STACKS, o[k])) ov[k] = o[k]; else errors.push("Unknown font."); }
  if (o.button !== undefined && o.button !== "") { if (BUTTONS.includes(o.button)) ov.button = o.button; else errors.push("Unknown button style."); }
  if (o.align !== undefined && o.align !== "") { if (ALIGNS.includes(o.align)) ov.align = o.align; else errors.push("Unknown alignment."); }
  clean.overrides = ov;
  return { clean, errors };
}

// ---- resolve: theme recipe < explicit component picks < overrides. Mode "components" ignores the theme's header/hero/sections.
export function resolveSelection(sel) {
  const { clean } = sanitizeSelection(sel); const th = THEME_BY_ID.get(clean.theme);
  if (!th && !clean.header && !clean.hero && !Object.keys(clean.sections).length && !clean.shapes.length && !Object.keys(clean.overrides).length) return null;
  const useTheme = th && clean.mode === "theme";
  const base = th || { colors: {}, radius: 14, button: "rounded", width: 1200, fontHeading: "system", fontBody: "system", bgTreatment: "plain", shapes: [], sections: {} };
  const colors = { primary: "#2563eb", accent: "#0891b2", bg: "#f5f7fb", surface: "#ffffff", fg: "#0f172a", border: "#dbe2ec", ...(th ? th.colors : {}) };
  const o = clean.overrides; for (const k of COLOR_FIELDS) if (o[k]) colors[k] = o[k];
  return {
    theme: th || null, colors, onPrimary: onColor(colors.primary),
    header: clean.header || (useTheme ? th.header : null), hero: clean.hero || (useTheme ? th.hero : null),
    sections: { ...(useTheme ? base.sections : {}), ...clean.sections }, shapes: clean.shapes.length ? clean.shapes : (useTheme ? base.shapes : []),
    radius: o.radius ?? base.radius, button: o.button || base.button, width: o.width || base.width, headerHeight: o.headerHeight || null,
    overlay: o.heroOverlay ?? null, spacing: o.sectionSpacing || null, align: o.align || null,
    fontHeading: o.fontHeading || base.fontHeading, fontBody: o.fontBody || base.fontBody, bgTreatment: base.bgTreatment,
  };
}

const BG = {
  plain: "", grain: "background-image:radial-gradient(rgba(0,0,0,.05) 1px,transparent 1px);background-size:3px 3px;",
  wood: "background-image:repeating-linear-gradient(92deg,rgba(120,70,20,.05) 0 2px,transparent 2px 11px);",
  mesh: "background-image:radial-gradient(circle at 10% 0,color-mix(in srgb,var(--ds-accent) 14%,transparent),transparent 40%),radial-gradient(circle at 95% 30%,color-mix(in srgb,var(--ds-primary) 12%,transparent),transparent 40%);",
  dots: "background-image:radial-gradient(var(--ds-border) 1.2px,transparent 1.2px);background-size:22px 22px;",
};
const BTN = { square: "0", rounded: "10px", pill: "999px" };

const BASE_CSS = `.ds-root{background:var(--ds-bg);color:var(--ds-fg);font-family:var(--ds-font-body);line-height:1.55}.ds-root *{box-sizing:border-box}.ds-wrap{max-width:var(--ds-width,1200px);margin:0 auto;padding:0 24px}
.ds-h{position:relative;width:100%;z-index:10}.ds-h__row{display:flex;align-items:center;gap:20px;max-width:var(--ds-width,1200px);margin:0 auto;padding:0 24px}.ds-h a{color:inherit;text-decoration:none}.ds-h__logo{font:800 20px var(--ds-font-heading)}.ds-h nav{display:flex;gap:6px;align-items:center}.ds-h nav a{padding:10px 12px;font-size:14px;font-weight:600}.ds-root .ds-h__cta,.ds-root .ds-btn{display:inline-block;background:var(--ds-primary);color:var(--ds-on-primary);padding:11px 22px;border-radius:var(--ds-btn);font-weight:700;text-decoration:none}.ds-h__search input{border:1px solid var(--ds-border);border-radius:var(--ds-btn);padding:9px 14px;background:var(--ds-surface);color:var(--ds-fg);min-width:200px}.ds-h__burger,.ds-h__toggle{display:none}
.ds-hero{position:relative;width:100%}.ds-root .ds-hero h1,.ds-root .ds-hero h2,.ds-root .ds-hero h3,.ds-root .ds-hero p,.ds-root .ds-hero li,.ds-root .ds-hero b,.ds-root .ds-hero small{color:inherit}.ds-hero__col{position:relative;z-index:2;min-width:0}.ds-hero__title,.ds-hero__headline{font-family:var(--ds-font-heading);font-size:clamp(32px,5vw,60px);line-height:1.05;margin:0 0 16px}.ds-hero__sub{font-size:18px;opacity:.88;max-width:56ch;margin:0 0 26px}.ds-hero__badge{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ds-accent);margin-bottom:14px}.ds-hero__cta2{margin-left:10px;background:transparent;border:2px solid currentColor;color:inherit!important}.ds-hero__list{list-style:none;margin:0;padding:0}.ds-hero__cards b,.ds-hero__stats b{font-weight:800}.ds-hero__media{min-height:200px}.ds-hero__collage{min-height:0}
.ds-sec{padding:var(--ds-space,72px) 0}.ds-sec--alt{background:var(--ds-surface)}.ds-sec--dark{background:#0f1218;color:#f3f4f6}.ds-sec--brand{background:var(--ds-primary);color:var(--ds-on-primary)}.ds-sec h2{font:800 clamp(24px,3.4vw,38px) var(--ds-font-heading);margin:0 0 28px}.ds-sec__grid{display:grid;grid-template-columns:repeat(var(--ds-cols,3),minmax(0,1fr));gap:20px}.ds-card{padding:24px;border-radius:var(--ds-radius,12px);background:var(--ds-surface);color:var(--ds-fg)}.ds-card--flat{background:transparent;padding:12px 0}.ds-card--bordered{border:1px solid var(--ds-border)}.ds-card--elevated{box-shadow:0 14px 36px rgba(0,0,0,.1)}.ds-card--glass{background:rgba(255,255,255,.12);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.3);color:inherit}.ds-card--accent{background:var(--ds-accent);color:${"#111"}}.ds-card--outline{border:2px solid var(--ds-primary);background:transparent;color:inherit}.ds-sec--center{text-align:center}.ds-sec--rule .ds-card{border-top:2px solid currentColor;border-radius:0}.ds-sec--masonry .ds-card:nth-child(3n+1){grid-row:span 2}.ds-sec--strip .ds-sec__grid{overflow-x:auto;grid-auto-flow:column;grid-auto-columns:220px;grid-template-columns:none}.ds-sec--lead .ds-card:first-child{grid-column:span 2}.ds-sec--bento .ds-card:first-child{grid-column:span 2;grid-row:span 2}
@media(max-width:1023px){.ds-sec__grid{grid-template-columns:repeat(min(var(--ds-cols,3),2),minmax(0,1fr))}}
@media(max-width:820px){.ds-h__row{flex-wrap:wrap;min-height:56px}.ds-h__burger{display:inline-block;margin-left:auto;padding:10px 14px;border:1px solid currentColor;border-radius:8px;cursor:pointer}.ds-h nav,.ds-h__search{display:none;width:100%;flex-direction:column;align-items:stretch}.ds-h__toggle:checked~.ds-h__row nav,.ds-h__toggle:checked~.ds-h__row .ds-h__search{display:flex}.ds-sec__grid{grid-template-columns:1fr}.ds-sec--lead .ds-card:first-child,.ds-sec--bento .ds-card:first-child{grid-column:auto;grid-row:auto}.ds-hero{padding-left:0}}
.ds-h .main-nav a,.ds-h .main-nav a:hover,.ds-h .main-nav.active a{color:inherit!important;background:none;min-height:0;transform:none;box-shadow:none}.ds-h .main-nav a:hover,.ds-h .main-nav a.active,.ds-h .main-nav a[aria-current=page]{color:var(--ds-primary)!important;background:none}.ds-h .nav-toggle,.ds-h .mobile-search-btn{display:none;background:none;border:1px solid currentColor;color:inherit;border-radius:8px;padding:6px 12px;font-size:20px;line-height:1;cursor:pointer}.ds-h .search-box{position:relative}.ds-h .search-results{color:var(--ds-fg);background:var(--ds-surface);border:1px solid var(--ds-border);z-index:70}.ds-h .mobile-search-container{background:var(--ds-surface);color:var(--ds-fg);border-top:1px solid var(--ds-border)}.ds-h .mobile-search-container input{background:var(--ds-bg);color:var(--ds-fg);border:1px solid var(--ds-border)}.ds-h .mobile-search-container input::placeholder{color:var(--ds-fg);opacity:.55}.ds-h .mobile-search-close{color:var(--ds-fg)}
@media(max-width:820px){.ds-h .nav-toggle,.ds-h .mobile-search-btn{display:inline-block}.ds-h .mobile-search-btn{margin-left:auto}.ds-h .mobile-search-btn~.nav-toggle{margin-left:8px}.ds-h .nav-toggle:only-of-type{margin-left:auto}.ds-h .search-box{display:none}.ds-h .main-nav.active{display:flex;flex-direction:column;align-items:stretch;position:absolute;left:0;right:0;top:100%;width:auto;margin:0;padding:12px 24px 18px;border-radius:0;background:var(--ds-surface);color:var(--ds-fg);box-shadow:0 18px 30px rgba(0,0,0,.18);z-index:60}.ds-h .main-nav.active a{color:inherit}.ds-h .main-nav.active a:hover{color:var(--ds-primary)}}
@media(prefers-reduced-motion:reduce){.ds-root *{animation:none!important;transition:none!important}}`;

// ---- tenant-facing CSS for a selection. Returns "" when nothing is chosen, so un-configured sites render exactly as before.
const heroUsesPicture = (id) => { const h = HERO_BY_ID.get(id); return !!h && new RegExp("\\.ds-hero--" + id + "\\{[^}]*--ds-hero-img").test(h.css); };
export function buildStudioCss(sel, opts = {}) {
  const r = resolveSelection(sel); if (!r) return "";
  const c = r.colors; const vars = [
    `--ds-primary:${c.primary}`, `--ds-accent:${c.accent}`, `--ds-bg:${c.bg}`, `--ds-surface:${c.surface}`, `--ds-fg:${c.fg}`, `--ds-border:${c.border}`, `--ds-on-primary:${r.onPrimary}`,
    `--ds-radius:${r.radius}px`, `--ds-radius-lg:${Math.round(r.radius * 1.6)}px`, `--ds-btn:${BTN[r.button]}`, `--ds-width:${r.width}px`,
    `--ds-font-heading:${FONT_STACKS[r.fontHeading] || FONT_STACKS.system}`, `--ds-font-body:${FONT_STACKS[r.fontBody] || FONT_STACKS.system}`,
  ];
  if (r.headerHeight) vars.push(`--ds-h-height:${r.headerHeight}px`);
  if (r.overlay !== null) vars.push(`--ds-overlay:${(r.overlay / 100).toFixed(2)}`);
  if (r.spacing) vars.push(`--ds-space:${r.spacing}px`);
  const parts = [`.ds-root{${vars.join(";")};${BG[r.bgTreatment] || ""}}`, BASE_CSS];
  if (r.header) {
    const hd = HEADER_BY_ID.get(r.header); parts.push(hd.css);
    if (hd.overHero && !(opts.hasImage && r.hero && heroUsesPicture(r.hero))) parts.push(`.ds-h--${hd.id}{position:relative!important;inset:auto!important;top:auto!important;background:var(--ds-surface)!important;color:var(--ds-fg)!important;border-bottom:1px solid var(--ds-border)!important}.ds-h--${hd.id} a{color:inherit!important}`);
  }
  if (r.hero) parts.push(HERO_BY_ID.get(r.hero).css);
  for (const id of r.shapes) parts.push(`.ds-shape--${id}{${SHAPE_BY_ID.get(id).css}}`);
  return parts.join("\n");
}

// ---- HTML renderers. ctx = { siteName, nav:[{label,url}], title, subtitle, badge, ctaText, ctaUrl, imageUrl }. All text escaped.
const safeUrl = (u) => (/^(https?:\/\/|\/)[^\s"'<>]*$/.test(String(u || "")) ? String(u) : "#");
export function renderHeaderHtml(id, ctx = {}) {
  const h = HEADER_BY_ID.get(id); if (!h) return "";
  const nav = (ctx.nav?.length ? ctx.nav : ctx.live ? [] : [{ label: "Home", url: "/" }, { label: "Reviews", url: "/" }, { label: "News", url: "/" }, { label: "About", url: "/" }]).slice(0, 8);
  const links = (list) => list.map((n) => `<a href="${esc(safeUrl(n.url))}">${esc(n.label)}</a>`).join("");
  const half = Math.ceil(nav.length / 2);
  // live: only what the site has (its own logo, navigation, search, login and header button). Preview: sample wording only where the site has none.
  const live = ctx.live === true; const sample = (v, s) => (v ? v : live ? "" : s);
  const name = sample(ctx.siteName, "Your Site");
  const logoImg = ctx.logoUrl && ctx.logoMode !== "text" ? `<img src="${esc(ctx.logoUrl)}" alt="" width="40" height="40">` : "";
  const logo = `<a class="ds-h__logo" href="/en">${logoImg}${ctx.logoMode === "logo" && logoImg ? "" : esc(name)}</a>`;
  const navLinks = ctx.navHtml || (ctx.nav?.length || !live ? links(nav) : "");
  const hCta = sample(ctx.headerCtaText, "Get started");
  // live: the site's own navigation markup (class main-nav, id mainNav) and menu button (id navToggle) are used, so the site's mobile menu script works.
  const slot = { logo, nav: live ? `<nav class="main-nav" id="mainNav" aria-label="Main">${navLinks}</nav>` : `<nav aria-label="Main">${navLinks}</nav>`,
    navL: live ? `<nav class="main-nav" id="mainNav" aria-label="Main">${ctx.navHtml || links(nav)}</nav>` : `<nav aria-label="Main left">${links(nav.slice(0, half))}</nav>`, navR: live ? "" : `<nav aria-label="Main right">${links(nav.slice(half))}</nav>`,
    search: !live ? `<form class="ds-h__search" role="search" action="/en/search"><input type="search" name="q" placeholder="${esc(sample(ctx.searchPlaceholder, "Search..."))}" aria-label="Search"></form>`
      : ctx.showSearch ? `<div class="search-box ds-h__search"><input type="text" id="searchInput" placeholder="${esc(ctx.searchPlaceholder)}" aria-label="Search" autocomplete="off"><div id="searchResults" class="search-results"></div></div><button type="button" class="mobile-search-btn" id="mobileSearchBtn" aria-label="Search">&#128269;</button>` : "",
    cta: hCta ? `<a class="ds-h__cta" href="${esc(safeUrl(ctx.headerCtaUrl))}">${esc(hCta)}</a>` : "",
    auth: live ? (ctx.showAuth ? `<a href="/en/login" id="headerLoginBtn">${esc(ctx.loginLabel)}</a><a href="/en/api/v1/auth/logout" id="headerLogoutBtn" style="display:none">${esc(ctx.logoutLabel)}</a><a href="/en/dashboard" id="headerDashboardBtn" style="display:none">${esc(ctx.dashboardLabel)}</a>` : "") : (ctx.showAuth === false ? "" : `<a href="/en/login">${esc(ctx.loginLabel || "Login")}</a>`),
    announce: live ? "" : `<span>${esc(sample(ctx.announce, "New: exclusive welcome offers this week"))}</span>`, tagline: live ? "" : `<span>${esc(ctx.tagline || "Independent reviews you can trust")}</span>`,
    date: live ? "" : `<span>${esc(ctx.dateText || "Today")}</span>`, menu: live ? `<button type="button" class="nav-toggle" id="navToggle" aria-label="Open menu">&#9776;</button>` : `<label class="ds-h__burger" for="ds-h-toggle" aria-label="Menu">Menu</label>` };
  const rows = h.rows.map((row, n) => `<div class="ds-h__row ds-h__row--${n}">${row.map((s) => slot[s] || "").join("")}</div>`).join("");
  const mobileSearch = live && ctx.showSearch ? `<div class="mobile-search-container" id="mobileSearchContainer"><input type="text" id="mobileSearchInput" placeholder="${esc(ctx.searchPlaceholder)}" aria-label="Search" autocomplete="off"><button type="button" class="mobile-search-close" id="mobileSearchClose" aria-label="Close search">&times;</button><div id="mobileSearchResults" class="search-results" style="position:absolute;top:100%;left:0;right:0"></div></div>` : "";
  return `<header class="ds-h ds-h--${h.id}"><input type="checkbox" id="ds-h-toggle" class="ds-h__toggle" aria-hidden="true">${rows}${mobileSearch}</header>`;
}
export function renderHeroHtml(id, ctx = {}) {
  const h = HERO_BY_ID.get(id); if (!h) return "";
  // live: only the site's own words, links and pictures; whatever it does not have is left out. Preview: sample wording only where the site has none.
  const live = ctx.live === true; const pick = (v, s) => (v ? v : live ? "" : s);
  const title = pick(ctx.title, "Find what you are looking for"), subtitle = pick(ctx.subtitle, "A clear, trustworthy starting point with everything in one place.");
  const badge = pick(ctx.badge, "Featured"), cta = pick(ctx.ctaText, "Explore"), cta2 = ctx.cta2Text || (live ? "" : ctx.ctaText ? "" : "Learn more");
  const cards = ctx.cards?.length ? ctx.cards : live ? [] : ["Fast", "Trusted", "Free"];
  const lines = ctx.highlights?.length ? ctx.highlights : live ? [] : ["Top stories", "Latest reviews", "Editor picks"];
  const slot = { badge: badge ? `<span class="ds-hero__badge">${esc(badge)}</span>` : "", title: title ? `<h1 class="ds-hero__title">${esc(title)}</h1>` : "", headline: title ? `<h1 class="ds-hero__headline">${esc(title)}</h1>` : "", sub: subtitle ? `<p class="ds-hero__sub">${esc(subtitle)}</p>` : "",
    cta: cta ? `<a class="ds-btn ds-hero__cta" href="${esc(safeUrl(ctx.ctaUrl))}">${esc(cta)}</a>` : "", cta2: cta2 ? `<a class="ds-btn ds-hero__cta ds-hero__cta2" href="${esc(safeUrl(ctx.cta2Url))}">${esc(cta2)}</a>` : "",
    media: `<div class="ds-hero__media" role="img" aria-label=""></div>`, collage: `<div class="ds-hero__collage" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`,
    stats: live ? "" : `<div class="ds-hero__stats"><b>120+<small> reviews</small></b><b>4.8<small> avg rating</small></b><b>24h<small> updates</small></b></div>`,
    cards: cards.length ? `<div class="ds-hero__cards">${cards.slice(0, 4).map((c) => `<b>${esc(c)}</b>`).join("")}</div>` : "",
    search: live ? "" : `<form class="ds-hero__search" role="search" action="/en/search"><input type="search" name="q" placeholder="Search..." aria-label="Search"><button class="ds-btn" type="submit">Search</button></form>`,
    ticker: live ? "" : `<div class="ds-hero__ticker ds-wrap">Live &bull; Match of the day &bull; Odds updated</div>`, list: lines.length ? `<ul class="ds-hero__list">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "" };
  const video = h.video && ctx.videoUrl && /^https:\/\/[^\s"'<>]+\.(mp4|webm)$/i.test(ctx.videoUrl) ? `<video autoplay muted loop playsinline src="${esc(ctx.videoUrl)}"></video>` : "";
  const cols = h.cols.map((c) => `<div class="ds-hero__col">${c.map((s) => slot[s] || "").join("")}</div>`).join("");
  const inner = h.cols.length === 1 || /full-photo|full-screen|video-bg|gradient-wash|dark-luxury|curved|diagonal|search-interface|centered|minimal|giant|feature-cards|floating/.test(h.id) ? `<div class="ds-wrap">${cols}</div>` : cols;
  const imgVar = ctx.imageUrl && /^(https:\/\/|\/(?!\/))[^\s"'<>()]+$/.test(ctx.imageUrl) ? ` style="--ds-hero-img:url('${esc(ctx.imageUrl)}')"` : "";
  return `<section class="ds-hero ds-hero--${h.id}"${imgVar}>${video}${inner}</section>`;
}
export function renderSectionHtml(typeId, variantId, ctx = {}) {
  const type = SECTION_BY_ID.get(typeId); const v = type?.variants.find((x) => x.id === variantId); if (!v) return "";
  const n = Math.max(1, Math.min(v.cols * (v.cols === 1 ? 3 : 1), 6)); const cls = ["ds-sec", `ds-sec--${v.bg === "plain" ? "plain" : v.bg}`, v.align === "center" ? "ds-sec--center" : "", v.masonry ? "ds-sec--masonry" : "", v.strip ? "ds-sec--strip" : "", v.lead ? "ds-sec--lead" : "", v.rule ? "ds-sec--rule" : "", v.bento ? "ds-sec--bento" : ""].filter(Boolean).join(" ");
  const cards = Array.from({ length: n }, (_, i) => `<div class="ds-card ds-card--${v.card}"><strong>${v.numbered ? String(i + 1).padStart(2, "0") + " " : ""}${esc(type.name)} ${i + 1}</strong><p>${esc(ctx.body || type.desc)}</p></div>`).join("");
  return `<section class="${cls}" data-ds-section="${type.id}:${v.id}"><div class="ds-wrap"><h2>${esc(type.name)}</h2><div class="ds-sec__grid" style="--ds-cols:${v.cols}">${cards}</div></div></section>`;
}

// ---- full preview document for an iframe (srcdoc). Used for desktop / tablet / mobile previews and thumbnails.
export function renderPreviewDocument(sel, ctx = {}) {
  const r = resolveSelection(sel); if (!r) return "";
  const sections = Object.entries(r.sections).map(([t, v]) => renderSectionHtml(t, v, ctx)).join("");
  const demo = !r.header && !r.hero && r.shapes.length ? `<div class="ds-wrap" style="padding:40px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:28px">${r.shapes.map((id) => `<div class="ds-shape--${id}" style="height:150px;background-color:var(--ds-primary)"></div>`).join("")}</div>` : "";
  const body = `<div class="ds-root${r.header === "sidebar-rail" ? " ds-h-offset-sidebar" : ""}">${r.header ? renderHeaderHtml(r.header, ctx) : ""}${r.hero ? renderHeroHtml(r.hero, ctx) : ""}${sections}${demo}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; media-src https:"><style>body{margin:0}${buildStudioCss(sel, { hasImage: !!ctx.imageUrl })}</style></head><body>${body}</body></html>`;
}
export const LIBRARY_COUNTS = () => ({ headers: HEADERS.length, heroes: HEROES.length, shapes: SHAPES.length, sectionTypes: SECTIONS.length });

// ---- tenant site integration. navHtml is the site's own, already-built navigation (trusted, server side), never user input here.
export function parseSelectionSetting(raw) {
  if (!raw) return null; try { const v = JSON.parse(raw); return v && typeof v === "object" ? sanitizeSelection(v).clean : null; } catch { return null; }
}
// Always returns ds_css/ds_header_html (empty when nothing is chosen, so un-configured tenants render as before).
export function studioTemplateVars(selection, site = {}, data = {}) {
  const out = { ds_css: "", ds_header_html: "" };
  const r = resolveSelection(selection); if (!r) return out;
  const own = studioCtx(site, { navHtml: data.header_nav, live: true });
  const css = buildStudioCss(selection, { hasImage: !!own.imageUrl }) + (r.header ? "\n.site-header{display:none!important}" : "");
  out.ds_css = `<style id="ds-studio">${css}</style>`;
  const ctx = own; // the site's own content only
  if (r.header) out.ds_header_html = `<div class="ds-root${r.header === "sidebar-rail" ? " ds-h-offset-sidebar" : ""}">${renderHeaderHtml(r.header, ctx)}</div>`;
  if (r.hero && site.headerHero?.heroEnabled !== false) out.hh_hero_html = `<div class="ds-root">${renderHeroHtml(r.hero, ctx)}</div>`;
  return out;
}
