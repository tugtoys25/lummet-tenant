// Switchable page layouts for the tenant theme (Configuration > Design > Layout, and the Ready-made templates).
// CSS only: the card and page HTML, and all content, stay exactly as they are. Returns "" for the defaults, so a site
// nobody has configured gets exactly the CSS it had before.

import { safeThemeStyle } from "./theme-values.js";

export const LIST_LAYOUTS = ["default", "rows", "compact"];
export const REVIEW_LAYOUTS = ["default", "left", "stacked"];

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

export function buildLayoutBlock(s) {
  const list = safeThemeStyle(s.themeListLayout, LIST_LAYOUTS, "default");
  const review = safeThemeStyle(s.themeReviewLayout, REVIEW_LAYOUTS, "default");
  const css = [LIST_CSS[list], REVIEW_CSS[review]].filter(Boolean).join("\n");
  return css ? `\n/* PAGE LAYOUTS */${css}\n` : "";
}
