// The first "Design Studio" is merged into Design Studio Pro. A design that was applied through the first studio keeps working: its
// choices are translated to the matching Pro ids and rendered by Pro on the site's own header. The first studio no longer renders
// anything of its own on the public site.
import { parseProStudio } from "./settings.js";

const THEME = { "dst-luxe": "dsp-luxury", "dst-editorial-mag": "dsp-magazine", "dst-boutique": "dsp-luxury-shop", "dst-estates": "dsp-real-estate", "dst-invest": "dsp-property-invest", "dst-academy": "dsp-education", "dst-personal": "dsp-professional" };
const HEADER = { "hero-fused": "hero-connected", "transparent-overlay": "transparent-over", "solid-brand": "brand-solid", "split-center": "split-centre", "logo-left-right-nav": "logo-left-right", "centered-stacked": "centre-stack", "two-row-corporate": "two-row", "angled-trapezoid": "angled", "rounded-bottom": "round-bottom", "cta-focused": "cta-forward", "gradient-modern": "gradient" };
const HERO = { "full-photo": "photo-wide", "full-screen": "fullscreen", "split-screen": "split-half", "centered-type": "centred-type", "gradient-wash": "gradient-mesh", "overlap-composition": "overlap-images", "asymmetric-editorial": "asym-editorial", "layered-images": "layered-image", "giant-type": "big-type", "search-interface": "search-hero" };
const COLOR = { primary: "p", accent: "p2", bg: "bg", surface: "sf", fg: "tx" };

export const proThemeId = (id) => (id ? THEME[id] || String(id).replace(/^dst-/, "dsp-") : "");
export const proHeaderId = (id) => (id ? HEADER[id] || id : "");
export const proHeroId = (id) => (id ? HERO[id] || id : "");

// Returns the Pro state for a first-studio selection (or null when nothing usable was chosen).
export function proFromFirstStudio(sel) {
  if (!sel || typeof sel !== "object") return null;
  const custom = {};
  const o = sel.overrides && typeof sel.overrides === "object" ? sel.overrides : {};
  for (const [from, to] of Object.entries(COLOR)) if (o[from]) custom[to] = o[from];
  const values = {
    prostudio_mode: sel.mode === "theme" ? "theme" : "components",
    prostudio_theme: proThemeId(sel.theme), prostudio_header: proHeaderId(sel.header), prostudio_hero: proHeroId(sel.hero),
    prostudio_custom: JSON.stringify(custom),
  };
  const state = parseProStudio(values);
  if (!state || state.mode === "off") return null;
  if (!state.theme && !state.header && !state.hero) return null;
  return state;
}

// The studio the site actually renders: Pro when it is on, otherwise a design applied through the first studio (translated to Pro).
export function effectiveProState(site) {
  const pro = site && site.designStudioPro;
  if (pro && pro.mode && pro.mode !== "off") return pro;
  return proFromFirstStudio(site && site.designStudio) || pro || null;
}
