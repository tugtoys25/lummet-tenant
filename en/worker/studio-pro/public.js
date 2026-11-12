// Bridge between the stored studio settings and the public template variables. Returns the variables UNCHANGED when the studio is off,
// so a site that never used the studio renders byte-for-byte as before.
import { studioPublicParts } from "./compose.js";
import { headerHeroTemplateVars } from "../header-hero.js";
import { cardsCss } from "./cards.js";

const cardParts = (studio) => (studio && studio.cards ? { css: `<style id="dsp-cards">${cardsCss(studio.cards)}</style>`, cls: "dsp-cards" } : null);

export function applyStudioVars(vars, studio, site = {}) {
  const cp = cardParts(studio);
  const withCards = (o) => (cp ? { ...o, hh_css: String(o.hh_css || "") + cp.css, hh_body_class: `${o.hh_body_class || ""} ${cp.cls}`.trim() } : o);
  if (!studio || studio.mode === "off") return withCards(vars);
  let parts;
  try { parts = studioPublicParts(studio, { site: { siteName: site.siteName || "", headerHero: site.headerHero || {} }, settings: site }); } catch { return withCards(vars); }
  if (!parts) return withCards(vars);
  const out = { ...vars, hh_css: String(vars.hh_css || "") + parts.css, hh_body_class: `${vars.hh_body_class || ""} ${parts.bodyClass}${parts.over && !(parts.useHero && vars.hh_hero) ? " dsp-no-over" : ""}`.trim() };
  // A hero the customer switched off stays off; otherwise the studio hero replaces the standard one.
  if (parts.useHero && vars.hh_hero) out.hh_hero_html = parts.heroHtml;
  return withCards(out);
}

// Only the variables the studio changes. {} when the studio is off, so nothing from Library 1 is replaced.
export function proStudioOverrides(site = {}) {
  const studio = site.designStudioPro;
  if (!studio || (studio.mode === "off" && !studio.cards)) return {};
  const base = headerHeroTemplateVars(site.headerHero);
  const out = applyStudioVars(base, studio, site);
  if (out === base) return {};
  const diff = {};
  for (const k of Object.keys(out)) if (out[k] !== base[k]) diff[k] = out[k];
  return diff;
}
