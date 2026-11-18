// Scoped CSS for an Advanced Homepage theme. Everything is inside .ahx-<id>, the wrapper the homepage template puts around the
// Advanced Homepage content only, so the header, footer, hero and every other page keep the site's own look.
import { getAdvancedTheme } from "./themes.js";
import { skinCss } from "./theme-skins.js";

const HEADING_FONTS = {
  display: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  elegant: "'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif",
  rounded: "ui-rounded,'SF Pro Rounded',Nunito,'Segoe UI',system-ui,sans-serif",
  modern: "inherit",
};

export const themeClass = (id) => (getAdvancedTheme(id) ? `ahx-${id}` : "");

export function themeCss(id) {
  const t = getAdvancedTheme(id);
  if (!t) return "";
  const S = `.ahx-${t.id}`, p = t.pal;
  const vars = `--primary:${p.p};--primary-dark:color-mix(in srgb,${p.p} 82%,#000);--accent:${p.p2};--bg:${p.bg};--sf:${p.sf};--ah-surface:${p.sf};--dark:${p.tx};--text-strong:${p.tx};--text-body:${p.tx};--text-secondary:${p.mu};--gray:${p.mu};--light-gray:${p.bd};--surface-dark:${p.ft};--radius:${t.cr}`;
  let css = `${S}{${vars};background-color:${p.bg};color:${p.tx};border-radius:${t.cr};padding:1px 0}`;
  css += `${S} h1,${S} h2,${S} h3{font-family:${HEADING_FONTS[t.hf] || "inherit"}${t.hf === "display" ? ";letter-spacing:-.03em" : ""}}`;
  css += `${S} .btn--primary{background:${p.p};border-color:${p.p};color:${p.btn};border-radius:${t.br}}${S} .btn--primary:hover{background:color-mix(in srgb,${p.p} 82%,#000)}`;
  css += `${S} .btn--secondary{border-radius:${t.br}}`;
  css += skinCss(t.skin, S);
  return css;
}
