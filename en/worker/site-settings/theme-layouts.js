// Switchable page layouts for the tenant theme (Configuration > Design > Layout, and the Ready-made templates).
// CSS only: the card and page HTML, and all content, stay exactly as they are. Returns "" for the defaults, so a site
// nobody has configured gets exactly the CSS it had before.

import { safeThemeStyle } from "./theme-values.js";

export const LIST_LAYOUTS = ["default", "rows", "compact"];
export const REVIEW_LAYOUTS = ["default", "left", "stacked"];
export const HEADER_LAYOUTS = ["default", "stacked", "split", "twoline", "floating", "sidebar", "line"];
export const HERO_LAYOUTS = ["default", "split", "card", "framed", "diagonal", "spotlight", "cinematic", "banner"];
export const PAGE_FRAMES = ["default", "thin", "bold", "double", "accent", "inset"];
export const SECTION_BACKGROUNDS = ["default", "tints", "alternate-dark", "gradient", "dots", "primary-bands"];
export const SECTION_DIVIDERS = ["default", "slant", "curve", "accent-line"];
export const SECTION_STYLES = ["default", "bands", "boxed", "divided"];
export const SECTION_HEADINGS = ["default", "centered", "accent", "centered-accent"];

// Casino list: "rows" is one horizontal row per casino (rank, logo, offer, buttons); "compact" is a denser row.
// Below 768px every layout keeps the stacked card, only smaller, because rows do not fit a phone.
const LIST_CSS = {
  rows: `
.casino-grid { grid-template-columns: 1fr; gap: 12px; }
.casino-card { height: auto; }
.casino-card:hover { transform: none; }
.casino-card__number { background: var(--theme-primary); color: var(--theme-button-text); }
.casino-card__logo-wrap { width: 96px; height: 96px; }
@media (min-width: 768px) {
  .casino-card { display: grid; grid-template-columns: 150px minmax(0, 1fr) 200px; align-items: center; }
  .casino-card__header { flex-direction: column; text-align: center; padding: 16px; }
  .casino-card__body { padding: 16px; }
  .casino-card__actions { flex-direction: column; margin-top: 0; padding: 16px; }
  .casino-card__actions .btn { flex: none; }
}`,
  compact: `
.casino-grid { grid-template-columns: 1fr; gap: 8px; }
.casino-card { height: auto; }
.casino-card:hover { transform: none; }
.casino-card__logo-wrap { width: 64px; height: 64px; }
.casino-card__header { padding: 10px 14px 0; }
.bonus-value { font-size: 15px; }
@media (min-width: 768px) {
  .casino-card { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr) auto; align-items: center; }
  .casino-card__logo-wrap { width: 56px; height: 56px; }
  .casino-card__header { padding: 10px 14px; }
  .casino-card__body { padding: 10px 14px; gap: 6px; }
  .casino-card__actions { margin-top: 0; padding: 10px 14px; }
  .casino-card__actions .btn { flex: none; }
}`,
};

// Review, casino and category pages: where the sidebar sits. On narrow screens the site already hides or stacks it.
const REVIEW_CSS = {
  left: `
@media (min-width: 969px) {
  .layout-wrapper { grid-template-columns: 300px 1fr; }
  .layout-wrapper .sidebar { order: -1; }
}`,
  stacked: `
@media (min-width: 969px) {
  .layout-wrapper { grid-template-columns: 1fr; }
}`,
};

// Header types. All desktop-only (769px and up; "sidebar" 1025px and up): on phones and tablets the site keeps its logo and
// menu button exactly as it is. Only positions, borders and backgrounds change, so nothing is hidden and no link is moved
// out of the page.
//   stacked  = logo centred on the first row, menu centred below (editorial)
//   split    = menu on the left, logo in the middle, buttons on the right
//   twoline  = logo and buttons on the first row, the menu on a second row underneath
//   floating = the header becomes a rounded bar that floats a little below the top edge
//   sidebar  = a fixed vertical menu down the left of the page (wide screens only)
//   line     = taller bar, centred menu and a thick coloured line along the bottom
const HEADER_CSS = {
  stacked: `
@media (min-width: 769px) {
  .site-header .header-inner { display: grid; grid-template-columns: 1fr auto 1fr; grid-template-areas: ". logo actions" "nav nav nav"; align-items: center; row-gap: 4px; padding-top: 10px; padding-bottom: 6px; }
  .site-header .header-inner .logo { grid-area: logo; justify-self: center; }
  .site-header .header-inner .header-actions { grid-area: actions; justify-self: end; margin-left: 0; }
  .site-header .header-inner .main-nav { grid-area: nav; justify-content: center; margin: 0; flex: none; }
}`,
  split: `
@media (min-width: 769px) {
  .site-header .header-inner { display: grid; grid-template-columns: 1fr auto 1fr; grid-template-areas: "nav logo actions"; align-items: center; column-gap: 20px; height: auto; min-height: var(--hh-header-h, 68px); }
  .site-header .header-inner .logo { grid-area: logo; justify-self: center; }
  .site-header .header-inner .header-actions { grid-area: actions; justify-self: end; margin-left: 0; }
  .site-header .header-inner .main-nav { grid-area: nav; justify-self: start; justify-content: flex-start; margin: 0; flex: none; }
}`,
  twoline: `
@media (min-width: 769px) {
  .site-header .header-inner { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "logo actions" "nav nav"; align-items: center; row-gap: 0; height: auto; padding-top: 12px; }
  .site-header .header-inner .logo { grid-area: logo; }
  .site-header .header-inner .header-actions { grid-area: actions; margin-left: 0; }
  .site-header .header-inner .main-nav { grid-area: nav; justify-content: flex-start; margin: 10px 0 0; padding: 10px 0; flex: none; border-top: 1px solid rgba(255,255,255,0.14); }
}`,
  floating: `
@media (min-width: 769px) {
  body .site-header { background: transparent !important; box-shadow: none; border-bottom: 0; backdrop-filter: none; -webkit-backdrop-filter: none; }
  body .site-header .header-inner { height: auto; min-height: var(--hh-header-h, 68px); margin-top: 12px; width: calc(100% - 40px); max-width: calc(var(--container) - 40px); padding: 0 28px; border-radius: 999px; background: var(--hh-header-bg, var(--theme-header-background, #0f172a)); box-shadow: var(--shadow-lg); }
}`,
  sidebar: `
@media (min-width: 1025px) {
  body { padding-left: 260px; }
  body .site-header { position: fixed !important; top: 0; left: 0; bottom: 0; width: 260px; overflow-y: auto; z-index: 100; }
  body .site-header .header-inner { flex-direction: column; align-items: stretch; justify-content: flex-start; height: auto; min-height: 100%; max-width: none; margin: 0; padding: 28px 20px; gap: 24px; }
  body .site-header .header-inner .main-nav { display: flex; flex-direction: column; align-items: stretch; gap: 2px; margin: 0; flex: none; }
  body .site-header .header-inner .main-nav a { padding: 10px 12px; border-radius: 8px; }
  body .site-header .header-inner .main-nav a:hover { background: rgba(255,255,255,0.08); }
  body .site-header .header-inner .header-actions { flex-wrap: wrap; margin: auto 0 0; }
}`,
  line: `
@media (min-width: 769px) {
  body .site-header { border-bottom: 3px solid var(--theme-primary, #2563eb); }
  .site-header .header-inner { height: auto; min-height: 84px; }
  .site-header .header-inner .main-nav { flex: 1; justify-content: center; }
}`,
};

// Hero types. CSS only: the hero text, buttons, slides, video and cards all stay as they are, and nothing is hidden. They work
// with a plain colour, a gradient, a background image or the slideshow.
//   split     = text on the left half, the hero image on the right half (wide screens; a plain hero keeps its colour)
//   card      = the text sits on a translucent card over a full-width hero
//   framed    = the hero is inset from the page edges with rounded corners
//   diagonal  = a slanted bottom edge
//   spotlight = a soft glow of the main colour from the top
//   cinematic = text at the bottom-left over a dark fade, tall like a film poster
//   banner    = a slim strip: headline and text on the left, buttons on the right
const HERO_CSS = {
  split: `
@media (min-width: 900px) {
  body .hero { background-color: var(--hh-hero-bg, var(--surface-dark, #111)); }
  body .hero.hero--text-dark { background-color: var(--bg, #f5f7fc); }
  body .hero.hero--image { background-size: 50% 100%; background-repeat: no-repeat; background-position: right center; }
  body .hero.hero--image .hero-overlay { right: 50%; }
  body .hero .hero-content { max-width: 50%; margin-left: 0; margin-right: auto; text-align: left; }
  body .hero .hero-actions, body .hero .hero-highlights { justify-content: flex-start; }
}`,
  card: `
body .hero .hero-content { padding: 32px 36px; border-radius: calc(var(--radius, 12px) * 1.4); background: color-mix(in srgb, var(--theme-chrome, #0f172a) 82%, transparent); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); box-shadow: var(--shadow-lg); max-width: 680px; }
body .hero.hero--text-dark .hero-content { background: color-mix(in srgb, var(--theme-background, #ffffff) 82%, transparent); }
@media (max-width: 640px) { body .hero .hero-content { padding: 22px 18px; } }`,
  framed: `
body .hero { width: calc(100% - 40px); max-width: calc(var(--container) - 0px); margin: 20px auto 0; border-radius: calc(var(--radius, 12px) * 1.8); }
@media (max-width: 640px) { body .hero { width: calc(100% - 24px); margin-top: 12px; } }`,
  diagonal: `
body .hero { clip-path: polygon(0 0, 100% 0, 100% calc(100% - 44px), 0 100%); padding-bottom: 104px; }
body .hero.hero--h-compact { padding-bottom: 80px; }`,
  spotlight: `
body .hero::before { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--theme-primary, #2563eb) 42%, transparent), transparent 62%); }
body .hero h1 { letter-spacing: -0.02em; }`,
  cinematic: `
body .hero { display: flex; align-items: flex-end; min-height: 520px; padding-bottom: 56px; }
body .hero > .container { width: 100%; }
body .hero .hero-overlay { background: linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.12) 65%) !important; }
body .hero .hero-content { margin-left: 0; margin-right: auto; text-align: left; max-width: 720px; }
body .hero h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); line-height: 1.05; }
body .hero .hero-actions, body .hero .hero-highlights { justify-content: flex-start; }`,
  banner: `
body .hero { padding: 22px 0; min-height: 0; text-align: left; }
body .hero > .container { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px 28px; }
body .hero .hero-content { margin: 0; max-width: 720px; text-align: left; flex: 1 1 320px; }
body .hero h1 { font-size: clamp(1.3rem, 3vw, 1.9rem); margin-bottom: 6px; }
body .hero .hero-subtitle, body .hero p { font-size: 1rem; margin-bottom: 10px; }
body .hero .hero-actions, body .hero .hero-highlights { justify-content: flex-start; }`,
};

// Site frame: a border drawn around the browser window, above the page but below pop-ups. It takes no space and changes no
// layout, so nothing moves. Smaller on phones.
const FRAME_BASE = `position: fixed; inset: 0; z-index: 900; pointer-events: none; content: "";`;
const FRAME_CSS = {
  thin: `\nbody::after { ${FRAME_BASE} border: 6px solid var(--theme-primary, #2563eb); }`,
  bold: `\nbody::after { ${FRAME_BASE} border: 14px solid var(--theme-primary, #2563eb); }`,
  double: `\nbody::after { ${FRAME_BASE} border: 12px double var(--theme-primary, #2563eb); }`,
  accent: `\nbody::after { ${FRAME_BASE} border: 8px solid transparent; border-image: linear-gradient(135deg, var(--theme-primary, #2563eb), var(--theme-accent, var(--theme-primary, #2563eb))) 1; }`,
  inset: `\nbody::after { ${FRAME_BASE} border: 12px solid var(--theme-background, #ffffff); box-shadow: inset 0 0 0 2px var(--theme-primary, #2563eb); }`,
};
const FRAME_MOBILE = `\n@media (max-width: 640px) { body::after { border-width: 4px !important; } }`;

// Section backgrounds: colours that run down the page in a pattern. A section that has its own colour or image set in the
// homepage builder keeps it (an inline style always wins). Tints are mixed from the page colour, so they suit light and dark.
const BG_CSS = {
  tints: `
body .section:nth-of-type(3n + 1) { background-color: color-mix(in srgb, var(--theme-primary, #2563eb) 8%, var(--theme-background, #ffffff)); }
body .section:nth-of-type(3n + 2) { background-color: color-mix(in srgb, var(--theme-secondary, var(--theme-primary, #2563eb)) 8%, var(--theme-background, #ffffff)); }`,
  "alternate-dark": `
body .section:nth-of-type(even) { background-color: var(--theme-surface, #0f172a); color: #ffffff; }
body .section:nth-of-type(even) :is(.section-header h2, .section-header p, .homepage-section__subtitle, .homepage-section__description, .feature-card h3, .feature-card p) { color: #ffffff; }
body .section:nth-of-type(even) .link { color: var(--theme-link-on-dark, var(--primary)) !important; }`,
  gradient: `
body .section { background-image: linear-gradient(180deg, color-mix(in srgb, var(--theme-primary, #2563eb) 10%, var(--theme-background, #ffffff)), var(--theme-background, #ffffff)); }`,
  dots: `
body .section:nth-of-type(odd) { background-image: radial-gradient(color-mix(in srgb, var(--theme-primary, #2563eb) 24%, transparent) 1.2px, transparent 1.2px); background-size: 22px 22px; }`,
  "primary-bands": `
body .section:nth-of-type(even) { background-color: color-mix(in srgb, var(--theme-primary, #2563eb) 12%, var(--theme-background, #ffffff)); border-top: 1px solid color-mix(in srgb, var(--theme-primary, #2563eb) 30%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--theme-primary, #2563eb) 30%, transparent); }`,
};

// Section dividers: the edge between one section and the next. Shapes only, nothing is hidden.
const DIVIDER_CSS = {
  slant: `
body .section { padding-bottom: 82px; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 32px), 0 100%); }
body .section + .section { margin-top: -32px; padding-top: 82px; }`,
  curve: `
body .section { border-bottom-left-radius: 50% 28px; border-bottom-right-radius: 50% 28px; padding-bottom: 70px; }
body .section + .section { margin-top: -28px; padding-top: 78px; }`,
  "accent-line": `
body .section + .section::before { content: ""; display: block; width: 64px; height: 4px; margin: 0 auto 32px; border-radius: 2px; background: var(--theme-primary, #2563eb); }`,
};

// Sections: how the stacked blocks on a page are separated. Only borders, backgrounds and spacing: nothing is hidden.
const SECTION_CSS = {
  bands: `
.section, .section + .section { margin-top: 0; margin-bottom: 0; }
.section:nth-of-type(even) { background: var(--theme-section-alt); }`,
  boxed: `
.section > .container { border: 1px solid var(--theme-border); border-radius: var(--radius); padding: 20px; }`,
  divided: `
.section + .section { margin-top: 0; border-top: 1px solid var(--theme-border); }`,
};

const HEADING_CSS = {
  centered: `
.section-header { flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 6px; }`,
  accent: `
.section-header h2::after { content: ""; display: block; width: 48px; height: 4px; margin-top: 8px; border-radius: 2px; background: var(--theme-primary); }`,
  "centered-accent": `
.section-header { flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 6px; }
.section-header h2::after { content: ""; display: block; width: 48px; height: 4px; margin: 8px auto 0; border-radius: 2px; background: var(--theme-primary); }`,
};

export function buildLayoutBlock(s) {
  const list = safeThemeStyle(s.themeListLayout, LIST_LAYOUTS, "default");
  const review = safeThemeStyle(s.themeReviewLayout, REVIEW_LAYOUTS, "default");
  const header = safeThemeStyle(s.themeHeaderLayout, HEADER_LAYOUTS, "default");
  const hero = safeThemeStyle(s.themeHeroLayout, HERO_LAYOUTS, "default");
  const frame = safeThemeStyle(s.themePageFrame, PAGE_FRAMES, "default");
  const backgrounds = safeThemeStyle(s.themeSectionBackgrounds, SECTION_BACKGROUNDS, "default");
  const divider = safeThemeStyle(s.themeSectionDivider, SECTION_DIVIDERS, "default");
  const sections = safeThemeStyle(s.themeSectionStyle, SECTION_STYLES, "default");
  const heading = safeThemeStyle(s.themeSectionHeading, SECTION_HEADINGS, "default");
  const css = [LIST_CSS[list], REVIEW_CSS[review], HEADER_CSS[header], HERO_CSS[hero], SECTION_CSS[sections], BG_CSS[backgrounds], DIVIDER_CSS[divider], HEADING_CSS[heading], frame !== "default" ? FRAME_CSS[frame] + FRAME_MOBILE : ""].filter(Boolean).join("\n");
  return css ? `\n/* PAGE LAYOUTS */${css}\n` : "";
}
