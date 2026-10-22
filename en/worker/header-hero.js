// ============================================================
// HEADER & HERO SETTINGS
//
// One declarative table (FIELDS) describes every setting the
// "Header & Hero" admin page manages: its key in the `settings`
// table, its type, its allowed values and its default. The same
// table drives
//   - parseHeaderHero()           reading settings for the public site
//   - sanitizeHeaderHeroInput()   cleaning values on save
//   - headerHeroTemplateVars()    the variables the templates use
//
// Nothing here needs a database migration: values live in the
// existing `settings` key/value table, and a missing key falls back
// to the default below, which reproduces the site as it looked
// before this feature existed.
//
// Every value is validated against an allow-list (enums, colors,
// URLs, lengths) and every piece of text is HTML-escaped before it
// reaches a template, because the template engine inserts
// {{variables}} without escaping them.
// ============================================================

// The code lives in header-hero/*.js (see docs/ARCHITECTURE_HEADER_HERO.md); this file keeps the public import path.
export { MAX_SLIDES, MAX_CARDS, FONT_STACKS, FONT_KEYS, HERO_SUBTITLE_DEFAULT, FIELDS, HEADER_HERO_KEYS } from "./header-hero/schema.js";
export { escapeHtml, cleanText, cleanLink, cleanImage, parseVideoUrl, canonicalVideoUrl, embedUrl, cleanSlides, cleanCards, cleanColor, normalizeOne, parseHeaderHero, defaultHeaderHero, sanitizeHeaderHeroInput } from "./header-hero/clean.js";
export { headerClasses, heroClasses, heroHtml, headerHeroTemplateVars, headerHeroDefaultsForAdmin, jsonForScript } from "./header-hero/render.js";
