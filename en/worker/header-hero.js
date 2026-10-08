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

const BOOL = "bool";
const ENUM = "enum";
const TEXT = "text";
const LINES = "lines";
const URL_T = "url";
const COLOR = "color";
const VIDEOLINK = "videolink";
const INT = "int";
const SLIDES = "slides";
const CARDS = "cards";

export const MAX_SLIDES = 6;
export const MAX_CARDS = 4;
const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|m4v)(\?[^\s]*)?$/i;

// Font choices. Only system font stacks are offered: nothing is downloaded, so there is no
// extra request, no layout shift and no third-party tracking. "default" keeps the site font.
export const FONT_STACKS = {
  default: "",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  modern: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Quicksand, 'Trebuchet MS', sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  elegant: "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', Georgia, serif",
  display: "Impact, 'Arial Narrow Bold', 'Haettenschweiler', 'Franklin Gothic Medium', sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
};
export const FONT_KEYS = Object.keys(FONT_STACKS);

export const HERO_SUBTITLE_DEFAULT =
  "Expert reviews, exclusive bonuses, and real player data for {{casino_count}}+ casinos worldwide.";

// group: where the field belongs on the admin page.
export const FIELDS = [
  // ---------------------------- announcement bar
  { key: "site_announce_enabled", prop: "announceEnabled", group: "announce", type: BOOL, def: false },
  { key: "site_announce_text", prop: "announceText", group: "announce", type: TEXT, max: 160, def: "" },
  { key: "site_announce_link_text", prop: "announceLinkText", group: "announce", type: TEXT, max: 40, def: "" },
  { key: "site_announce_url", prop: "announceUrl", group: "announce", type: URL_T, max: 300, def: "" },
  { key: "site_announce_tone", prop: "announceTone", group: "announce", type: ENUM, values: ["info", "promo", "success", "warning"], def: "info" },
  { key: "site_announce_dismissible", prop: "announceDismissible", group: "announce", type: BOOL, def: true },

  // ---------------------------- header
  { key: "theme_header_style", prop: "headerStyle", group: "header", type: ENUM, values: ["default", "solid", "glass", "transparent"], def: "default" },
  { key: "theme_header_background", prop: "headerBackground", group: "header", type: COLOR, def: "" },
  { key: "site_header_text_color", prop: "headerTextColor", group: "header", type: COLOR, def: "" },
  { key: "site_header_font", prop: "headerFont", group: "header", type: ENUM, values: FONT_KEYS, def: "default" },
  { key: "site_header_sticky", prop: "headerSticky", group: "header", type: BOOL, def: true },
  { key: "site_header_height", prop: "headerHeight", group: "header", type: ENUM, values: ["compact", "default", "tall"], def: "default" },
  { key: "site_header_logo_mode", prop: "logoMode", group: "header", type: ENUM, values: ["both", "logo", "text"], def: "both" },
  { key: "site_header_logo_size", prop: "logoSize", group: "header", type: ENUM, values: ["sm", "md", "lg"], def: "md" },
  { key: "site_header_nav_align", prop: "navAlign", group: "header", type: ENUM, values: ["left", "center", "right"], def: "left" },
  { key: "site_header_show_search", prop: "showSearch", group: "header", type: BOOL, def: true },
  { key: "site_header_search_placeholder", prop: "searchPlaceholder", group: "header", type: TEXT, max: 60, def: "Search casinos..." },
  { key: "site_header_show_auth", prop: "showAuth", group: "header", type: BOOL, def: true },
  { key: "site_header_login_label", prop: "loginLabel", group: "header", type: TEXT, max: 24, def: "Login" },
  { key: "site_header_dashboard_label", prop: "dashboardLabel", group: "header", type: TEXT, max: 24, def: "Dashboard", fallbackWhenEmpty: true },
  { key: "site_header_logout_label", prop: "logoutLabel", group: "header", type: TEXT, max: 24, def: "Logout", fallbackWhenEmpty: true },
  { key: "site_header_cta_enabled", prop: "ctaEnabled", group: "header", type: BOOL, def: false },
  { key: "site_header_cta_text", prop: "ctaText", group: "header", type: TEXT, max: 30, def: "" },
  { key: "site_header_cta_url", prop: "ctaUrl", group: "header", type: URL_T, max: 300, def: "" },
  { key: "site_header_cta_style", prop: "ctaStyle", group: "header", type: ENUM, values: ["primary", "outline"], def: "primary" },
  { key: "site_header_cta_new_tab", prop: "ctaNewTab", group: "header", type: BOOL, def: false },

  // ---------------------------- hero
  { key: "site_hero_enabled", prop: "heroEnabled", group: "hero", type: BOOL, def: true },
  { key: "site_hero_image", prop: "heroImage", group: "hero", type: URL_T, max: 500, def: "", absoluteOnly: true },
  { key: "site_hero_image_focus", prop: "heroImageFocus", group: "hero", type: ENUM, values: ["center", "top", "bottom"], def: "center" },
  { key: "site_hero_badge_enabled", prop: "heroBadgeEnabled", group: "hero", type: BOOL, def: true },
  { key: "site_hero_badge", prop: "heroBadge", group: "hero", type: TEXT, max: 80, def: "Find Your Perfect Casino", fallbackWhenEmpty: true },
  { key: "site_hero_title", prop: "heroTitle", group: "hero", type: TEXT, max: 140, def: "Find Your Perfect Casino", fallbackWhenEmpty: true },
  { key: "site_hero_subtitle", prop: "heroSubtitle", group: "hero", type: TEXT, max: 320, def: HERO_SUBTITLE_DEFAULT, fallbackWhenEmpty: true },
  { key: "site_hero_description", prop: "heroDescription", group: "hero", type: TEXT, max: 600, def: "" },
  { key: "site_hero_highlights", prop: "heroHighlights", group: "hero", type: LINES, max: 60, maxLines: 4, def: "" },
  { key: "site_hero_button_enabled", prop: "heroButtonEnabled", group: "hero", type: BOOL, def: true },
  { key: "site_hero_button_text", prop: "heroButtonText", group: "hero", type: TEXT, max: 40, def: "Browse Casinos", fallbackWhenEmpty: true },
  { key: "site_hero_button_url", prop: "heroButtonUrl", group: "hero", type: URL_T, max: 300, def: "/en/casino", fallbackWhenEmpty: true },
  { key: "site_hero_button2_text", prop: "heroButton2Text", group: "hero", type: TEXT, max: 40, def: "" },
  { key: "site_hero_button2_url", prop: "heroButton2Url", group: "hero", type: URL_T, max: 300, def: "" },
  { key: "site_hero_watch_enabled", prop: "heroWatchEnabled", group: "hero", type: BOOL, def: false },
  { key: "site_hero_watch_text", prop: "heroWatchText", group: "hero", type: TEXT, max: 30, def: "Watch video", fallbackWhenEmpty: true },
  { key: "site_hero_watch_url", prop: "heroWatchUrl", group: "hero", type: VIDEOLINK, def: "" },
  { key: "site_hero_alignment", prop: "heroAlignment", group: "hero", type: ENUM, values: ["left", "center", "right"], def: "center" },
  { key: "site_hero_height", prop: "heroHeight", group: "hero", type: ENUM, values: ["compact", "standard", "tall", "screen"], def: "standard" },
  { key: "site_hero_bg_mode", prop: "heroBgMode", group: "hero", type: ENUM, values: ["default", "brand", "solid"], def: "default" },
  { key: "site_hero_bg_color", prop: "heroBgColor", group: "hero", type: COLOR, def: "" },
  { key: "site_hero_overlay", prop: "heroOverlay", group: "hero", type: BOOL, def: true },
  { key: "site_hero_overlay_opacity", prop: "heroOverlayOpacity", group: "hero", type: INT, min: 0, max: 85, def: 45 },
  { key: "site_hero_text_theme", prop: "heroTextTheme", group: "hero", type: ENUM, values: ["light", "dark"], def: "light" },
  // ---- hero media (all off by default: the hero looks exactly as before until it is switched on)
  { key: "site_hero_media_enabled", prop: "heroMediaEnabled", group: "hero", type: BOOL, def: false },
  { key: "site_hero_slides", prop: "heroSlides", group: "hero", type: SLIDES, def: "[]" },
  { key: "site_hero_media_autoplay", prop: "heroMediaAutoplay", group: "hero", type: BOOL, def: true },
  { key: "site_hero_media_interval", prop: "heroMediaInterval", group: "hero", type: INT, min: 3, max: 20, def: 6 },
  { key: "site_hero_media_transition", prop: "heroMediaTransition", group: "hero", type: ENUM, values: ["fade", "slide"], def: "fade" },
  { key: "site_hero_media_motion", prop: "heroMediaMotion", group: "hero", type: ENUM, values: ["none", "zoom", "pan"], def: "zoom" },
  { key: "site_hero_media_embed_mobile", prop: "heroMediaEmbedMobile", group: "hero", type: BOOL, def: false },
  { key: "site_hero_media_arrows", prop: "heroMediaArrows", group: "hero", type: BOOL, def: true },
  { key: "site_hero_media_dots", prop: "heroMediaDots", group: "hero", type: BOOL, def: true },
  { key: "site_hero_media_pause_hover", prop: "heroMediaPauseHover", group: "hero", type: BOOL, def: true },
  { key: "site_hero_cards_enabled", prop: "heroCardsEnabled", group: "hero", type: BOOL, def: false },
  { key: "site_hero_cards", prop: "heroCards", group: "hero", type: CARDS, def: "[]" },
  { key: "site_hero_cards_position", prop: "heroCardsPosition", group: "hero", type: ENUM, values: ["below", "side"], def: "below" },
  { key: "site_hero_cards_size", prop: "heroCardsSize", group: "hero", type: ENUM, values: ["sm", "md", "lg"], def: "md" },
  { key: "site_hero_text_color", prop: "heroTextColor", group: "hero", type: COLOR, def: "" },
  { key: "site_hero_title_color", prop: "heroTitleColor", group: "hero", type: COLOR, def: "" },
  { key: "site_hero_heading_font", prop: "heroHeadingFont", group: "hero", type: ENUM, values: FONT_KEYS, def: "default" },
  { key: "site_hero_body_font", prop: "heroBodyFont", group: "hero", type: ENUM, values: FONT_KEYS, def: "default" }
];

export const HEADER_HERO_KEYS = FIELDS.map((f) => f.key);

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

// ------------------------------------------------------------
// Validators
// ------------------------------------------------------------

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim()
    .slice(0, max);
}

function cleanLines(value, max, maxLines) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => cleanText(line, max))
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
}

// Allows an on-site path, an anchor, or an http(s)/mailto/tel link.
// Anything else (javascript:, data:, //host, ...) becomes "".
export function cleanLink(value, max = 300) {
  const v = String(value ?? "").trim().slice(0, max);
  if (!v) return "";
  if (/[\u0000-\u001f\u007f\s"'<>\\]/.test(v)) return "";
  if (/^\/(?!\/)/.test(v)) return v;
  if (/^#[\w-]*$/.test(v)) return v;
  if (/^https?:\/\/[^\s/]+/i.test(v)) return v;
  if (/^mailto:[^\s]+$/i.test(v)) return v;
  if (/^tel:[+\d][\d\s().-]*$/i.test(v)) return v;
  return "";
}

// A background image must be an absolute http(s) URL or an on-site path.
export function cleanImage(value, max) {
  const v = cleanLink(value, max);
  if (!v) return "";
  if (/^(mailto|tel):/i.test(v) || v.startsWith("#")) return "";
  return v;
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

// A video must point at a playable file (mp4, webm, ogg, m4v), not a web page.
function cleanVideoSrc(value) {
  const v = cleanImage(value, 500);
  return v && VIDEO_EXT.test(v) ? v : "";
}

// ------------------------------------------------------------
// Online video (YouTube and Vimeo)
//
// Only the video's provider and id are ever kept. The address that
// reaches a visitor's browser is always built here from a fixed
// template, so a pasted link can never become an arbitrary iframe.
// ------------------------------------------------------------

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

/** @returns {{provider:"youtube"|"vimeo", id:string, hash:string}|null} */
export function parseVideoUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 300 || /[\u0000-\u001f\u007f\s"'<>\\]/.test(raw)) return null;
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    return YT_ID.test(parts[0] || "") ? { provider: "youtube", id: parts[0], hash: "" } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = "";
    if (parts[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1] || "";
    return YT_ID.test(id) ? { provider: "youtube", id, hash: "" } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const segs = host === "player.vimeo.com" ? (parts[0] === "video" ? parts.slice(1) : []) : parts;
    const idIndex = segs.findIndex((x) => VIMEO_ID.test(x));
    if (idIndex === -1) return null;
    const id = segs[idIndex];
    const next = segs[idIndex + 1] || "";
    const hash = VIMEO_HASH.test(next) ? next : VIMEO_HASH.test(u.searchParams.get("h") || "") ? u.searchParams.get("h") : "";
    return { provider: "vimeo", id, hash };
  }
  return null;
}

/** The address people paste back into the form: one clean form per video. */
export function canonicalVideoUrl(video) {
  if (!video) return "";
  if (video.provider === "youtube") return `https://www.youtube.com/watch?v=${video.id}`;
  return `https://vimeo.com/${video.id}${video.hash ? `/${video.hash}` : ""}`;
}

/** The iframe address. mode: "popup" (sound, controls) or "background" (silent loop, no controls). */
export function embedUrl(video, mode) {
  if (!video) return "";
  const bg = mode === "background";
  if (video.provider === "youtube") {
    const q = bg
      ? `autoplay=1&mute=1&controls=0&loop=1&playlist=${video.id}&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3&fs=0`
      : "autoplay=1&rel=0&playsinline=1&modestbranding=1";
    return `https://www.youtube-nocookie.com/embed/${video.id}?${q}`;
  }
  const q = bg ? "background=1&autoplay=1&muted=1&loop=1&dnt=1" : "autoplay=1&dnt=1";
  return `https://player.vimeo.com/video/${video.id}?${q}${video.hash ? `&h=${video.hash}` : ""}`;
}

/** Slides: [{ type: "image"|"video"|"embed", src, poster, alt, link, play? }], at most MAX_SLIDES, bad entries dropped. */
export function cleanSlides(raw) {
  const out = [];
  for (const item of parseJsonArray(raw)) {
    if (out.length >= MAX_SLIDES) break;
    if (!item || typeof item !== "object") continue;
    if (item.type === "embed") {
      const video = parseVideoUrl(item.src);
      if (!video) continue;
      const play = item.play === "background" ? "background" : "popup";
      out.push({
        type: "embed",
        src: canonicalVideoUrl(video),
        poster: cleanImage(item.poster, 500),
        alt: cleanText(item.alt, 140),
        // a pop-up slide opens the video, so it has no separate link
        link: play === "background" ? cleanImage(item.link, 300) : "",
        play
      });
      continue;
    }
    const type = item.type === "video" ? "video" : "image";
    const src = type === "video" ? cleanVideoSrc(item.src) : cleanImage(item.src, 500);
    if (!src) continue;
    out.push({
      type,
      src,
      poster: type === "video" ? cleanImage(item.poster, 500) : "",
      alt: cleanText(item.alt, 140),
      link: cleanImage(item.link, 300)
    });
  }
  return out;
}

/** Cards (images placed inside the hero): [{ src, alt, link, caption }], at most MAX_CARDS. */
export function cleanCards(raw) {
  const out = [];
  for (const item of parseJsonArray(raw)) {
    if (out.length >= MAX_CARDS) break;
    if (!item || typeof item !== "object") continue;
    const src = cleanImage(item.src, 500);
    if (!src) continue;
    out.push({ src, alt: cleanText(item.alt, 140), link: cleanImage(item.link, 300), caption: cleanText(item.caption, 60) });
  }
  return out;
}

export function cleanColor(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d\s.,%/-]+\)$/i.test(v)) return v;
  return "";
}

function toBool(value, def) {
  if (value === true || value === "true" || value === "1" || value === "on") return true;
  if (value === false || value === "false" || value === "0" || value === "off") return false;
  return def;
}

export function normalizeOne(field, raw) {
  const present = raw !== undefined && raw !== null;
  // A setting that was never saved uses its default; one saved as empty stays empty
  // (except where a blank means "use the default", marked fallbackWhenEmpty).
  if (!present && (field.type === TEXT || field.type === LINES || field.type === URL_T)) return field.def;
  switch (field.type) {
    case BOOL:
      return toBool(raw, field.def);
    case ENUM: {
      const v = String(raw ?? "").trim();
      return field.values.includes(v) ? v : field.def;
    }
    case INT: {
      const n = Math.round(Number(raw));
      if (!present || raw === "" || !Number.isFinite(n)) return field.def;
      return Math.min(field.max, Math.max(field.min, n));
    }
    case COLOR:
      return cleanColor(raw);
    case VIDEOLINK:
      return canonicalVideoUrl(parseVideoUrl(raw)) || "";
    case SLIDES:
      return JSON.stringify(cleanSlides(raw));
    case CARDS:
      return JSON.stringify(cleanCards(raw));
    case URL_T: {
      const v = field.absoluteOnly ? cleanImage(raw, field.max) : cleanLink(raw, field.max);
      return v || (field.fallbackWhenEmpty ? field.def : "");
    }
    case LINES:
      return cleanLines(raw, field.max, field.maxLines);
    case TEXT:
    default: {
      const v = cleanText(raw, field.max);
      return v || (field.fallbackWhenEmpty ? field.def : "");
    }
  }
}

// ------------------------------------------------------------
// Reading settings (public site)
// ------------------------------------------------------------

/** @param {Record<string,string>} values rows of the settings table */
export function parseHeaderHero(values = {}) {
  const out = {};
  for (const field of FIELDS) {
    const value = normalizeOne(field, values ? values[field.key] : undefined);
    // slides and cards are stored as JSON text; the rest of the code works with arrays
    out[field.prop] = field.type === SLIDES || field.type === CARDS ? JSON.parse(value) : value;
  }
  return out;
}

export function defaultHeaderHero() {
  return parseHeaderHero({});
}

// ------------------------------------------------------------
// Cleaning values on save
// ------------------------------------------------------------

/**
 * Returns a copy of `body` in which every header/hero key holds a valid,
 * string value. Keys that are not part of this feature pass through
 * untouched. Invalid values are replaced by the default instead of
 * being rejected, so a stray value can never break the public site.
 */
export function sanitizeHeaderHeroInput(body = {}) {
  const out = { ...body };
  for (const key of Object.keys(body)) {
    const field = BY_KEY.get(key);
    if (!field) continue;
    const value = normalizeOne(field, body[key]);
    out[key] = typeof value === "boolean" ? String(value) : String(value);
  }
  return out;
}

// ------------------------------------------------------------
// Template variables
// ------------------------------------------------------------

const HEADER_HEIGHT_PX = { compact: 56, default: 68, tall: 84 };
const LOGO_SIZE_PX = { sm: 32, md: 40, lg: 52 };

function cssUrl(value) {
  return String(value).replace(/['"()\\\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

function hashText(text) {
  let h = 5381;
  const s = String(text);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Classes that describe the header on <body> (and on the admin preview). */
export function headerClasses(hh) {
  return [
    hh.headerSticky ? "hh-sticky" : "hh-static",
    `hh-height-${hh.headerHeight}`,
    `hh-style-${hh.headerStyle}`,
    `hh-logo-${hh.logoMode}`,
    `hh-logo-size-${hh.logoSize}`,
    `hh-nav-${hh.navAlign}`,
    hh.headerTextColor ? "hh-hfg" : "",
    hh.headerFont !== "default" ? "hh-hfont" : ""
  ].filter(Boolean).join(" ");
}

export function heroClasses(hh, hasImage) {
  return [
    `hero--h-${hh.heroHeight}`,
    `hero--text-${hh.heroTextTheme}`,
    `hero--focus-${hh.heroImageFocus}`,
    hasImage ? "hero--image" : `hero--bg-${hh.heroBgMode}`,
    hh.heroTextColor ? "hero--custom-fg" : "",
    hh.heroTitleColor ? "hero--custom-title" : "",
    hh.heroHeadingFont !== "default" ? "hero--font-heading" : "",
    hh.heroBodyFont !== "default" ? "hero--font-body" : "",
    hasMedia(hh) ? "hero--has-media" : "",
    hasMedia(hh) && hh.heroSlides.some((x) => x.link) ? "hero--media-link" : "",
    hasMedia(hh) && hh.heroSlides.length > 1 && hh.heroMediaArrows ? "hero--arrows" : "",
    hasCards(hh) && hh.heroCardsPosition === "side" ? "hero--cards-side" : ""
  ].filter(Boolean).join(" ");
}

function announceHtml(hh, showLink) {
  const id = hashText(`${hh.announceText}|${hh.announceUrl}|${hh.announceTone}`);
  const link = showLink
    ? ` <a class="hh-announce__link" href="${escapeHtml(hh.announceUrl)}">${escapeHtml(hh.announceLinkText)}</a>`
    : "";
  const close = hh.announceDismissible
    ? '<button type="button" class="hh-announce__close" data-announce-close aria-label="Dismiss announcement">&times;</button>'
    : "";
  return (
    `<div class="hh-announce hh-announce--${hh.announceTone}" role="region" aria-label="Announcement" data-announce-id="${id}">` +
    `<div class="container hh-announce__inner"><p class="hh-announce__text">${escapeHtml(hh.announceText)}${link}</p>${close}</div></div>`
  );
}

function hasMedia(hh) {
  return Boolean(hh.heroMediaEnabled && hh.heroSlides && hh.heroSlides.length);
}
function hasCards(hh) {
  return Boolean(hh.heroCardsEnabled && hh.heroCards && hh.heroCards.length);
}

function videoType(src) {
  const m = /\.(mp4|webm|ogv|ogg|m4v)(\?|$)/i.exec(src);
  const ext = m ? m[1].toLowerCase() : "mp4";
  return ext === "webm" ? "video/webm" : ext === "ogv" || ext === "ogg" ? "video/ogg" : "video/mp4";
}

/** The slides layer that sits behind the overlay and the text. */
function mediaHtml(hh, priority = true) {
  const e = escapeHtml;
  const slides = hh.heroSlides;
  const many = slides.length > 1;
  const autoplay = many && hh.heroMediaAutoplay;
  const slideHtml = slides
    .map((sl, i) => {
      const first = i === 0 && priority;
      const isFirst = i === 0;
      let inner;
      if (sl.type === "embed") {
        // The player is created by the script (after load for a background, on click for a pop-up),
        // so nothing from YouTube or Vimeo is requested before it is needed.
        const poster = sl.poster ? `<img src="${e(sl.poster)}" alt="" decoding="async"${first ? ' fetchpriority="high"' : ' loading="lazy"'}>` : "";
        const bg = sl.play === "background" ? `<div class="hero-embed" data-hh-bg-embed="${e(embedUrl(parseVideoUrl(sl.src), "background"))}"></div>` : "";
        inner = poster + bg;
      } else if (sl.type === "video") {
        // Only the first video gets autoplay here; the script plays and pauses the others.
        const attrs = `muted playsinline${first ? " autoplay" : ""}${many && hh.heroMediaAutoplay ? "" : " loop"} preload="${first ? "auto" : "none"}"` +
          (sl.poster ? ` poster="${e(sl.poster)}"` : "") +
          (sl.alt ? ` aria-label="${e(sl.alt)}"` : ' aria-hidden="true"');
        inner = `<video ${attrs}><source src="${e(sl.src)}" type="${videoType(sl.src)}"></video>`;
      } else {
        inner = `<img src="${e(sl.src)}" alt="${e(sl.alt)}" decoding="async"${first ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
      }
      const link = sl.link ? `<a class="hero-slide__link" href="${e(sl.link)}" aria-label="${e(sl.alt || "Learn more")}"${/^https?:/i.test(sl.link) ? ' target="_blank" rel="noopener"' : ""}></a>` : "";
      const label = many ? ` role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}"` : "";
      return `<div class="hero-slide${isFirst ? " is-active" : ""}" data-type="${sl.type}"${label}>${inner}${link}</div>`;
    })
    .join("");
  return (
    `<div class="hero-media hero-media--${hh.heroMediaTransition} hero-media--motion-${hh.heroMediaMotion}" ` +
    `data-autoplay="${autoplay ? "1" : "0"}" data-interval="${hh.heroMediaInterval * 1000}" data-pause-hover="${hh.heroMediaPauseHover ? "1" : "0"}" data-embed-mobile="${hh.heroMediaEmbedMobile ? "1" : "0"}" ` +
    `style="--hh-interval:${hh.heroMediaInterval}s">${slideHtml}</div>`
  );
}

/** Arrows, dots and the pause button. They sit above the text so they can be clicked. */
function mediaControlsHtml(hh) {
  const slides = hh.heroSlides;
  const e = escapeHtml;
  // "Watch video" pills for pop-up slides; the script shows the one that belongs to the visible slide
  const pills = slides
    .map((sl, i) =>
      sl.type === "embed" && sl.play !== "background"
        ? `<button type="button" class="hero-watch" data-hh-embed="${e(embedUrl(parseVideoUrl(sl.src), "popup"))}" data-hh-title="${e(sl.alt || "Video")}" data-hh-watch-for="${i}" aria-haspopup="dialog"${i === 0 ? "" : " hidden"}><span aria-hidden="true">&#9654;</span> ${e(sl.alt || "Watch video")}</button>`
        : ""
    )
    .join("");
  if (slides.length < 2) return pills ? `<div class="hero-media__ui">${pills}</div>` : "";
  const arrows = hh.heroMediaArrows
    ? '<button type="button" class="hero-media__nav hero-media__prev" data-hh-prev aria-label="Previous slide">&#8249;</button>' +
      '<button type="button" class="hero-media__nav hero-media__next" data-hh-next aria-label="Next slide">&#8250;</button>'
    : "";
  const dots = hh.heroMediaDots
    ? `<div class="hero-media__dots">${slides.map((_, i) => `<button type="button" data-hh-dot="${i}" aria-label="Go to slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}></button>`).join("")}</div>`
    : "";
  const pause = hh.heroMediaAutoplay
    ? '<button type="button" class="hero-media__pause" data-hh-toggle aria-label="Pause slideshow" aria-pressed="false"><span aria-hidden="true">&#10074;&#10074;</span></button>'
    : "";
  return `<div class="hero-media__ui">${pills}${arrows}${dots}${pause}</div>`;
}

/** Images placed inside the hero, fixed or clickable. */
function cardsHtml(hh) {
  const e = escapeHtml;
  const cards = hh.heroCards
    .map((c) => {
      const img = `<img src="${e(c.src)}" alt="${e(c.alt)}" loading="lazy" decoding="async">`;
      const external = /^https?:/i.test(c.link);
      const media = c.link ? `<a class="hero-card__link" href="${e(c.link)}"${external ? ' target="_blank" rel="noopener"' : ""}>${img}</a>` : img;
      const caption = c.caption ? `<figcaption>${e(c.caption)}</figcaption>` : "";
      return `<figure class="hero-card${c.link ? " hero-card--link" : ""}">${media}${caption}</figure>`;
    })
    .join("");
  return `<div class="hero-cards hero-cards--${hh.heroCardsSize} hero-cards--n${hh.heroCards.length}">${cards}</div>`;
}

/**
 * Builds the hero section. The homepage calls it with no options (its output is unchanged);
 * a hero component passes `opts`:
 *   id        element id (default "siteHero")
 *   className extra classes
 *   style     extra inline CSS custom properties (already escaped)
 *   priority  false = the first picture is lazy (the hero is not at the top of the page)
 *   compact   true = leave out an empty heading or subtitle
 */
export function heroHtml(hh, hasImage, opts = {}) {
  const e = escapeHtml;
  const styleParts = [];
  if (hasImage) styleParts.push(`background-image:url('${cssUrl(hh.heroImage)}')`);
  if (opts.style) styleParts.push(opts.style);
  const style = styleParts.length ? ` style="${styleParts.join(";")}"` : "";
  const overlay = hh.heroOverlay && hh.heroOverlayOpacity > 0 ? '<div class="hero-overlay" aria-hidden="true"></div>' : "";
  const badge = hh.heroBadgeEnabled && hh.heroBadge ? `<div class="hero-badge">${e(hh.heroBadge)}</div>` : "";
  const description = hh.heroDescription ? `<p class="hero-description">${e(hh.heroDescription)}</p>` : "";
  const highlights = hh.heroHighlights
    ? `<ul class="hero-highlights">${hh.heroHighlights.split("\n").map((t) => `<li>${e(t)}</li>`).join("")}</ul>`
    : "";
  const primary =
    hh.heroButtonEnabled && hh.heroButtonText && hh.heroButtonUrl
      ? `<a href="${e(hh.heroButtonUrl)}" class="btn btn--primary btn--lg"${hh.heroButtonNewTab ? ' target="_blank" rel="noopener"' : ""}>${e(hh.heroButtonText)}</a>`
      : "";
  const secondary =
    hh.heroButton2Text && hh.heroButton2Url
      ? `<a href="${e(hh.heroButton2Url)}" class="btn btn--ghost btn--lg">${e(hh.heroButton2Text)}</a>`
      : "";
  const watchVideo = hh.heroWatchEnabled ? parseVideoUrl(hh.heroWatchUrl) : null;
  const watch = watchVideo
    ? `<button type="button" class="btn btn--ghost btn--lg hero-watch-btn" data-hh-embed="${e(embedUrl(watchVideo, "popup"))}" data-hh-title="${e(hh.heroWatchText)}" aria-haspopup="dialog"><span aria-hidden="true">&#9654;</span> ${e(hh.heroWatchText)}</button>`
    : "";
  const actions = primary || secondary || watch ? `<div class="hero-actions">${primary}${secondary}${watch}</div>` : "";
  const media = hasMedia(hh) ? mediaHtml(hh, opts.priority !== false) : "";
  const controls = hasMedia(hh) ? mediaControlsHtml(hh) : "";
  const cards = hasCards(hh) ? cardsHtml(hh) : "";
  const side = Boolean(cards) && hh.heroCardsPosition === "side";
  const heading = opts.compact && !hh.heroTitle ? "" : `<h1>${e(hh.heroTitle)}</h1>`;
  const subtitle = opts.compact && !hh.heroSubtitle ? "" : `<p class="hero-subtitle">${e(hh.heroSubtitle)}</p>`;
  const body = `${badge}${heading}${subtitle}${description}${highlights}${actions}${side ? "" : cards}`;
  const content = `<div class="hero-content hero-content--${hh.heroAlignment}">${body}</div>`;
  const wrapped = side ? `<div class="container hero-grid">${content}${cards}</div>` : `<div class="container">${content}</div>`;
  return (
    `<section class="hero ${opts.className ? opts.className + " " : ""}${heroClasses(hh, hasImage)}" id="${e(opts.id || "siteHero")}"${style}${media ? " data-hh-hero-media" : ""}>${media}${overlay}` +
    `${wrapped}${controls}</section>`
  );
}

export function headerHeroTemplateVars(hh = defaultHeaderHero()) {
  hh = { ...defaultHeaderHero(), ...(hh || {}) };

  // ---- CSS variables, emitted only when they differ from the defaults
  const vars = [`--hh-header-h:${HEADER_HEIGHT_PX[hh.headerHeight]}px`, `--hh-logo:${LOGO_SIZE_PX[hh.logoSize]}px`];
  if (hh.headerBackground) vars.push(`--hh-header-bg:${hh.headerBackground}`);
  vars.push(`--hh-hero-overlay:${(hh.heroOverlayOpacity / 100).toFixed(2)}`);
  if (hh.heroBgColor) vars.push(`--hh-hero-bg:${hh.heroBgColor}`);
  if (hh.headerTextColor) vars.push(`--hh-header-fg:${hh.headerTextColor}`);
  if (hh.heroTextColor) vars.push(`--hh-hero-fg:${hh.heroTextColor}`);
  if (hh.heroTitleColor) vars.push(`--hh-hero-title:${hh.heroTitleColor}`);
  // Font stacks are fixed strings from FONT_STACKS, never user input.
  if (FONT_STACKS[hh.headerFont]) vars.push(`--hh-header-font:${FONT_STACKS[hh.headerFont]}`);
  if (FONT_STACKS[hh.heroHeadingFont]) vars.push(`--hh-hero-heading-font:${FONT_STACKS[hh.heroHeadingFont]}`);
  if (FONT_STACKS[hh.heroBodyFont]) vars.push(`--hh-hero-body-font:${FONT_STACKS[hh.heroBodyFont]}`);

  const hasImage = Boolean(hh.heroImage);
  const showCta = hh.ctaEnabled && hh.ctaText && hh.ctaUrl;
  const showAnnounce = hh.announceEnabled && hh.announceText;
  const showLink = Boolean(hh.announceLinkText && hh.announceUrl);

  return {
    hh_css: `<style id="hh-vars">:root{${vars.join(";")}}</style>`,
    hh_body_class: headerClasses(hh),

    // header
    hh_logo_img: hh.logoMode !== "text",
    hh_logo_text: hh.logoMode !== "logo",
    hh_show_search: hh.showSearch,
    hh_search_placeholder: escapeHtml(hh.searchPlaceholder),
    hh_show_auth: hh.showAuth,
    hh_login_label: escapeHtml(hh.loginLabel || "Login"),
    hh_dashboard_label: escapeHtml(hh.dashboardLabel),
    hh_logout_label: escapeHtml(hh.logoutLabel),
    hh_cta: Boolean(showCta),
    hh_cta_text: escapeHtml(hh.ctaText),
    hh_cta_url: escapeHtml(hh.ctaUrl),
    hh_cta_class: hh.ctaStyle === "outline" ? "btn--outline" : "btn--primary",
    hh_cta_target: hh.ctaNewTab ? ' target="_blank" rel="noopener"' : "",

    // announcement bar (built here because it has optional parts)
    hh_announce: Boolean(showAnnounce),
    hh_announce_html: showAnnounce ? announceHtml(hh, showLink) : "",

    // hero (built here because most of its parts are optional)
    hh_hero: hh.heroEnabled,
    hh_hero_html: hh.heroEnabled ? heroHtml(hh, hasImage) : ""
  };
}

/** Defaults as strings keyed by setting key, for the admin page. */
export function headerHeroDefaultsForAdmin() {
  const out = {};
  for (const f of FIELDS) out[f.key] = String(f.def);
  return out;
}

/**
 * JSON that is safe inside <script type="application/json">: angle brackets,
 * ampersands and curly braces are written as \u escapes (the page template engine
 * would otherwise treat a "{{name}}" token in a default as a variable).
 */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\{\{/g, "{\\u007b")
    .replace(/\}\}/g, "\\u007d}")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
