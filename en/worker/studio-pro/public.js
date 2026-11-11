// Bridge between the stored studio settings and the public template variables. Returns the variables UNCHANGED when the studio is off,
// so a site that never used the studio renders byte-for-byte as before.
import { studioPublicParts } from "./compose.js";
import { headerHeroTemplateVars } from "../header-hero.js";

export function applyStudioVars(vars, studio, site = {}) {
  if (!studio || studio.mode === "off") return vars;
  let parts;
  try { parts = studioPublicParts(studio, { site: { siteName: site.siteName || "", headerHero: site.headerHero || {} } }); } catch { return vars; }
  if (!parts) return vars;
  const out = { ...vars, hh_css: String(vars.hh_css || "") + parts.css, hh_body_class: `${vars.hh_body_class || ""} ${parts.bodyClass}${parts.over && !(parts.useHero && vars.hh_hero) ? " dsp-no-over" : ""}`.trim() };
  // A hero the customer switched off stays off; otherwise the studio hero replaces the standard one.
  if (parts.useHero && vars.hh_hero) out.hh_hero_html = parts.heroHtml;
  return out;
}

// Only the variables the studio changes. {} when the studio is off, so nothing from Library 1 is replaced.
export function proStudioOverrides(site = {}) {
  const studio = site.designStudioPro;
  if (!studio || studio.mode === "off") return {};
  const base = headerHeroTemplateVars(site.headerHero);
  const out = applyStudioVars(base, studio, site);
  if (out === base) return {};
  const diff = {};
  for (const k of Object.keys(out)) if (out[k] !== base[k]) diff[k] = out[k];
  return diff;
}
