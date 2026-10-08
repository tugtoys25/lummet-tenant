// Hero component (Dashboard > Components > type "Hero Section").
//
// A hero component can do everything the homepage hero can: picture slider, short
// video, YouTube/Vimeo, pictures inside the hero, colours, fonts, alignment, height.
// It reuses the homepage hero's field rules and markup (worker/header-hero.js), so the
// two can never drift apart. Settings live in the component's settings JSON; each key is
// the homepage setting name without its "site_hero_" prefix ("media_enabled", "slides", ...).
//
// A hero component that has only the original keys (link, button_text, bg_image, new_tab)
// keeps rendering with templates/components/hero.html, exactly as before. The advanced
// layout starts only when "design":"advanced" or any new key is present.

import {
  FIELDS,
  FONT_STACKS,
  cleanLink,
  cleanText,
  escapeHtml,
  heroHtml,
  normalizeOne
} from "./header-hero.js";

const PREFIX = "site_hero_";
// The headline is the component's Title and the subtitle is its Content, so they are not settings.
const SKIP = new Set(["site_hero_enabled", "site_hero_title", "site_hero_subtitle"]);

// A component hero starts empty: no default badge, no default button.
const OVERRIDE = {
  site_hero_badge: { def: "", fallbackWhenEmpty: false },
  site_hero_button_text: { def: "", fallbackWhenEmpty: false },
  site_hero_button_url: { def: "", fallbackWhenEmpty: false }
};

const EXTRA = [{ key: "site_hero_button_new_tab", prop: "heroButtonNewTab", group: "hero", type: "bool", def: false }];

/** [{ ckey, key, prop, type, ... }] for every setting a hero component accepts. */
export const COMPONENT_HERO_FIELDS = FIELDS.filter((f) => f.group === "hero" && !SKIP.has(f.key))
  .map((f) => ({ ...f, ...(OVERRIDE[f.key] || {}) }))
  .concat(EXTRA)
  .map((f) => ({ ...f, ckey: f.key.slice(PREFIX.length) }));

export const COMPONENT_HERO_KEYS = COMPONENT_HERO_FIELDS.map((f) => f.ckey);

// Keys from the first version of this component, still understood.
const LEGACY = { link: "button_url", bg_image: "image", new_tab: "button_new_tab" };

function settingsObject(settings) {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
}

/** True when the component uses the advanced layout. */
export function isAdvancedHero(settings) {
  const s = settingsObject(settings);
  if (s.design === "advanced") return true;
  // button_text already existed in the original hero, so it does not count
  return COMPONENT_HERO_KEYS.some((k) => k !== "button_text" && Object.prototype.hasOwnProperty.call(s, k));
}

function rawValue(s, ckey) {
  if (s[ckey] !== undefined && s[ckey] !== null) return s[ckey];
  for (const [old, now] of Object.entries(LEGACY)) if (now === ckey && s[old] !== undefined && s[old] !== null) return s[old];
  return undefined;
}

/** The hero model (same shape as the homepage's parseHeaderHero) for a component. */
export function componentHeroModel(component) {
  const s = settingsObject(component && component.settings);
  const hh = {};
  for (const f of COMPONENT_HERO_FIELDS) {
    const value = normalizeOne(f, rawValue(s, f.ckey));
    hh[f.prop] = f.type === "slides" || f.type === "cards" ? JSON.parse(value) : value;
  }
  hh.heroTitle = cleanText(component && component.title, 140);
  // The content may hold simple markup from the old template; the advanced hero shows plain text.
  hh.heroSubtitle = cleanText(String((component && component.content) || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " "), 600);
  return hh;
}

function styleVars(hh) {
  const v = [`--hh-hero-overlay:${(hh.heroOverlayOpacity / 100).toFixed(2)}`];
  if (hh.heroBgColor) v.push(`--hh-hero-bg:${hh.heroBgColor}`);
  if (hh.heroTextColor) v.push(`--hh-hero-fg:${hh.heroTextColor}`);
  if (hh.heroTitleColor) v.push(`--hh-hero-title:${hh.heroTitleColor}`);
  if (FONT_STACKS[hh.heroHeadingFont]) v.push(`--hh-hero-heading-font:${FONT_STACKS[hh.heroHeadingFont]}`);
  if (FONT_STACKS[hh.heroBodyFont]) v.push(`--hh-hero-body-font:${FONT_STACKS[hh.heroBodyFont]}`);
  // colours are validated, font stacks are fixed strings; escape anyway (the value sits in an attribute)
  return escapeHtml(v.join(";"));
}

/** HTML of an advanced hero component. */
export function renderAdvancedHero(component) {
  const hh = componentHeroModel(component);
  const id = `hero-c${Number(component.id) || 0}`;
  return heroHtml(hh, Boolean(hh.heroImage), {
    id,
    className: "component-hero component-hero--advanced",
    style: styleVars(hh),
    // only a hero at the very top of the page loads its first picture with priority
    priority: component.injection_point === "top",
    compact: true
  });
}

/**
 * Cleans the settings JSON of a hero component before it is stored. Known keys get valid
 * values (slides and cards stay arrays), every other key is kept as it was. Returns the JSON
 * text, or throws an Error with a plain message when the text is not a JSON object.
 */
export function cleanHeroSettingsJson(text) {
  if (text === undefined || text === null || String(text).trim() === "") return null;
  let parsed;
  try {
    parsed = typeof text === "string" ? JSON.parse(text) : text;
  } catch (e) {
    throw new Error("Settings must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Settings must be a JSON object");
  const out = { ...parsed };
  for (const f of COMPONENT_HERO_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(out, f.ckey)) continue;
    const value = normalizeOne(f, out[f.ckey]);
    out[f.ckey] = f.type === "slides" || f.type === "cards" ? JSON.parse(value) : value;
  }
  // legacy link keys stay as they are, but a bad link never reaches the page
  if (typeof out.link === "string") out.link = cleanLink(out.link);
  return JSON.stringify(out);
}

/** Defaults by key, for the admin panel. */
export function componentHeroDefaultsForAdmin() {
  const out = {};
  for (const f of COMPONENT_HERO_FIELDS) out[f.ckey] = f.def;
  return out;
}
