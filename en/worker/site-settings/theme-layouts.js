// Switchable page layouts for the tenant theme (Configuration > Design > Layout, and the Ready-made templates).
// CSS only: the card and page HTML, and all content, stay exactly as they are. Returns "" for the defaults, so a site
// nobody has configured gets exactly the CSS it had before.

import { safeThemeStyle } from "./theme-values.js";

export const LIST_LAYOUTS = ["default", "rows", "compact"];
export const REVIEW_LAYOUTS = ["default", "left", "stacked"];
export const HEADER_LAYOUTS = ["default", "stacked"];
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

// Header: "stacked" is the editorial pattern, logo centred on the first row and the menu centred on a second row. Desktop only:
// on phones the site already shows the logo and a menu button, which stays exactly as it is.
const HEADER_CSS = {
  stacked: `
@media (min-width: 769px) {
  .site-header .header-inner { display: grid; grid-template-columns: 1fr auto 1fr; grid-template-areas: ". logo actions" "nav nav nav"; align-items: center; row-gap: 4px; padding-top: 10px; padding-bottom: 6px; }
  .site-header .header-inner .logo { grid-area: logo; justify-self: center; }
  .site-header .header-inner .header-actions { grid-area: actions; justify-self: end; margin-left: 0; }
  .site-header .header-inner .main-nav { grid-area: nav; justify-content: center; margin: 0; flex: none; }
}`,
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
  const sections = safeThemeStyle(s.themeSectionStyle, SECTION_STYLES, "default");
  const heading = safeThemeStyle(s.themeSectionHeading, SECTION_HEADINGS, "default");
  const css = [LIST_CSS[list], REVIEW_CSS[review], HEADER_CSS[header], SECTION_CSS[sections], HEADING_CSS[heading]].filter(Boolean).join("\n");
  return css ? `\n/* PAGE LAYOUTS */${css}\n` : "";
}
