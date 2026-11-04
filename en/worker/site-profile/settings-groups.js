// ============================================================
// SITE PROFILE (Phase 5): unified settings manifest
// ============================================================
// Every look-and-feel setting key belongs to exactly one GROUP below. A group says what the settings
// do in plain language, which existing screen still edits them, and (for dashboard rendering) the
// type, allowed values, default and help of each field.
//
// Header, announcement bar and hero fields are NOT repeated here: they come from the existing
// declarative table in header-hero/schema.js, so there is still one definition per key.
//
// Storage is unchanged: values live in the `settings` key/value table. Saving goes through the same
// validators the old screens use (header-hero/clean.js) plus the small validators below.
import { FIELDS as HEADER_HERO_FIELDS, FONT_KEYS } from "../header-hero/schema.js";
import { cleanText, cleanLink, cleanImage, cleanColor, normalizeOne } from "../header-hero/clean.js";

const COLOR = "color", ENUM = "enum", TEXT = "text", URL_T = "url", IMAGE = "image", BOOL = "bool", LENGTH = "length", INT = "int", LINES = "lines";

export const THEME_PRESETS = ["professional", "corporate", "slate", "nordic", "forest", "sunset", "rose", "sand", "light",
  "midnight", "ocean", "emerald", "ruby", "gold", "graphite", "aurora", "custom"];

// Fields that exist only in this file (the header/hero ones are derived below).
const EXTRA = [
  // ---- identity
  { key: "site_name", group: "identity", type: TEXT, max: 60, label: "Site name", help: "Shown in the header, browser tab and emails." },
  { key: "site_short_name", group: "identity", type: TEXT, max: 24, label: "Short name", help: "Used under the app icon on phones." },
  { key: "site_title", group: "identity", type: TEXT, max: 70, label: "Default page title", help: "Used when a page has no title of its own. Aim for under 60 characters." },
  { key: "site_description", group: "identity", type: TEXT, max: 200, label: "Default description", help: "Used by search engines when a page has no description. Aim for 120 to 160 characters." },
  { key: "site_url", group: "identity", type: URL_T, max: 200, absolute: true, label: "Site address", help: "Your public address, for example https://example.com." },
  { key: "site_logo", group: "identity", type: IMAGE, max: 500, label: "Logo", help: "Link to your logo image. Pick one from the Media library, then paste its link." },
  { key: "site_og_image", group: "identity", type: IMAGE, max: 500, label: "Social share image", help: "The picture shown when a page is shared. 1200 by 630 pixels works best." },
  { key: "site_favicon_svg", group: "identity", type: IMAGE, max: 500, label: "Favicon (SVG)", help: "Modern browsers use this one first." },
  { key: "site_favicon_ico", group: "identity", type: IMAGE, max: 500, label: "Favicon (ICO)", help: "Fallback for older browsers." },
  { key: "site_favicon_96", group: "identity", type: IMAGE, max: 500, label: "Favicon (96 px)", help: "PNG, 96 by 96 pixels." },
  { key: "site_apple_touch_icon", group: "identity", type: IMAGE, max: 500, label: "Home-screen icon (Apple)", help: "PNG, 180 by 180 pixels." },
  { key: "site_pwa_icon_192", group: "identity", type: IMAGE, max: 500, label: "App icon 192", help: "PNG, 192 by 192 pixels." },
  { key: "site_pwa_icon_512", group: "identity", type: IMAGE, max: 500, label: "App icon 512", help: "PNG, 512 by 512 pixels." },
  { key: "site_manifest_display", group: "identity", type: ENUM, values: ["standalone", "minimal-ui", "browser"], label: "App display mode", help: "How the site opens when added to a phone home screen." },
  { key: "site_manifest_start_url", group: "identity", type: URL_T, max: 200, label: "App start page", help: "The page the installed app opens first." },
  { key: "site_manifest_scope", group: "identity", type: URL_T, max: 200, label: "App scope", help: "Pages that belong to the installed app. Usually /." },
  { key: "contact_name", group: "identity", type: TEXT, max: 80, label: "Contact name", help: "Shown on contact and legal pages." },
  { key: "contact_email", group: "identity", type: TEXT, max: 120, email: true, label: "Contact email", help: "Shown on contact and legal pages." },
  { key: "contact_phone", group: "identity", type: TEXT, max: 40, label: "Contact phone", help: "Optional." },
  { key: "default_country", group: "identity", type: TEXT, max: 2, upper: true, label: "Default country code", help: "Two letters, for example GB. Used when a visitor's country is unknown.", needs: "taxonomy" },
  { key: "country_directory_featured_label", group: "identity", type: TEXT, max: 40, label: "Featured label on the country list", help: "Small label above featured countries.", needs: "taxonomy" },

  // ---- theme: colours
  { key: "theme_preset", group: "theme", type: ENUM, values: THEME_PRESETS, label: "Colour theme", help: "Pick a ready-made look. Choose Custom to set every colour yourself." },
  ...[
    ["theme_primary", "Primary colour", "Main buttons and links."],
    ["theme_primary_hover", "Primary (hover)", "Primary colour when the mouse is over it."],
    ["theme_secondary", "Secondary colour", "Secondary buttons and highlights."],
    ["theme_secondary_hover", "Secondary (hover)", "Secondary colour when the mouse is over it."],
    ["theme_accent", "Accent colour", "Badges and small highlights."],
    ["theme_background", "Page background", "Behind everything."],
    ["theme_surface", "Card background", "Cards and panels."],
    ["theme_surface_alt", "Alternate card background", "Striped rows and nested panels."],
    ["theme_border", "Border colour", "Lines around cards and inputs."],
    ["theme_text", "Text colour", "Body text."],
    ["theme_text_muted", "Muted text colour", "Captions and hints."],
    ["theme_button_text", "Button text colour", "Text on primary buttons."],
    ["theme_footer_background", "Footer background", "Leave empty to follow the theme."],
  ].map(([key, label, help]) => ({ key, group: "theme", type: COLOR, label, help })),

  // ---- layout
  { key: "theme_container_width", group: "layout", type: ENUM, values: ["1080px", "1200px", "1440px"], label: "Content width", help: "1200 px suits most sites. Use 1440 px for wide tables." },
  { key: "theme_layout_style", group: "layout", type: ENUM, values: ["default", "compact", "wide"], label: "Page spacing", help: "Compact packs more on screen; wide gives more breathing room." },
  { key: "theme_card_style", group: "layout", type: ENUM, values: ["default", "flat", "bordered", "glass", "elevated"], label: "Card style", help: "How cards look across the site." },
  { key: "theme_button_style", group: "layout", type: ENUM, values: ["default", "rounded", "pill", "square"], label: "Button style", help: "Shape of buttons." },
  { key: "theme_card_radius", group: "layout", type: LENGTH, label: "Card corner radius", help: "For example 12px. Leave empty for the default." },
  { key: "theme_button_radius", group: "layout", type: LENGTH, label: "Button corner radius", help: "For example 8px. Leave empty for the default." },

  // ---- footer and responsible gambling
  { key: "footer_disclaimer", group: "footer", type: TEXT, max: 600, label: "Footer disclaimer", help: "Short legal or affiliate disclosure shown in the footer." },
  { key: "footer_responsible_text", group: "compliance", type: TEXT, max: 400, label: "Responsible gambling message", help: "Shown in the footer. Many licences require it.", needs: "casino" },
  { key: "footer_responsible_url", group: "compliance", type: URL_T, max: 300, label: "Responsible gambling link", help: "Where the message links to.", needs: "casino" },
  { key: "footer_responsible_help_label", group: "compliance", type: TEXT, max: 60, label: "Help line label", help: "For example Need help?", needs: "casino" },
  { key: "footer_responsible_help_text", group: "compliance", type: TEXT, max: 200, label: "Help line text", help: "Short text next to the label.", needs: "casino" },
  { key: "footer_responsible_help_url", group: "compliance", type: URL_T, max: 300, label: "Help line link", help: "Link to a support organisation.", needs: "casino" },

  // ---- analytics
  { key: "ga_measurement_id", group: "analytics", type: TEXT, max: 24, pattern: /^(G-[A-Z0-9]{4,16}|)$/i, label: "Google Analytics ID", help: "Looks like G-XXXXXXXXXX. Leave empty to turn tracking off." },

  // ---- ads
  { key: "news_inline_ad", group: "ads", type: TEXT, max: 500, label: "News in-article ad label", help: "Ad rules decide where ads appear; this only sets the label.", needs: "news" },
];

// Keys that belong to a group but are edited on their existing screen (raw markup, JSON blobs, generated files).
// Listing them here means "owned": the ownership test passes and the group page links to the right screen.
export const OWNED_ELSEWHERE = {
  gpwa_seal_enabled: { group: "analytics", screen: "/en/dashboard/settings#gpwa", why: "Trusted verification markup" },
  gpwa_seal_html: { group: "analytics", screen: "/en/dashboard/settings#gpwa", why: "Trusted verification markup" },
  gpwa_script_enabled: { group: "analytics", screen: "/en/dashboard/settings#gpwa", why: "Trusted verification markup" },
  gpwa_script_html: { group: "analytics", screen: "/en/dashboard/settings#gpwa", why: "Trusted verification markup" },
  ga_script: { group: "analytics", screen: "/en/dashboard/settings#analytics", why: "Custom tracking script" },
  site_manifest: { group: "identity", screen: "/en/dashboard/settings#branding", why: "Generated from the app fields above" },
  theme_css: { group: "theme", screen: "/en/dashboard/settings#theme", why: "Generated from the colour fields" },
  theme_color: { group: "theme", screen: "/en/dashboard/settings#theme", why: "Generated from the colour fields" },
  ad_mode: { group: "ads", screen: "/en/dashboard/settings#ad-rules", why: "Edited with the ad rules" },
  ad_html: { group: "ads", screen: "/en/dashboard/settings#ad-rules", why: "Edited with the ad rules" },
  ad_rules: { group: "ads", screen: "/en/dashboard/settings#ad-rules", why: "Edited with the ad rules" },
  ad_override_rules: { group: "ads", screen: "/en/dashboard/settings#ad-rules", why: "Edited with the ad rules" },
  home_html: { group: "hero", screen: "/en/dashboard/pages", why: "Homepage sections" },
};

export const GROUPS = [
  { id: "identity", label: "Site identity", help: "Name, logo, icons and contact details. Start here.", screen: "/en/dashboard/settings#branding" },
  { id: "theme", label: "Colours", help: "Pick a theme, or set every colour yourself.", screen: "/en/dashboard/settings#theme" },
  { id: "layout", label: "Layout and shapes", help: "Content width, spacing, card and button style.", screen: "/en/dashboard/settings#layout" },
  { id: "announce", label: "Announcement bar", help: "A thin message bar above the header.", screen: "/en/dashboard/header-hero" },
  { id: "header", label: "Header", help: "Menu bar: stickiness, logo, search, login and call-to-action button.", screen: "/en/dashboard/header-hero" },
  { id: "hero", label: "Homepage hero", help: "The large banner at the top of the homepage.", screen: "/en/dashboard/header-hero" },
  { id: "footer", label: "Footer", help: "Disclosure text at the bottom of every page.", screen: "/en/dashboard/settings#footer" },
  { id: "compliance", label: "Responsible gambling", help: "Messages and links your licence or partners may require.", screen: "/en/dashboard/settings#responsible-gambling", needs: "casino" },
  { id: "analytics", label: "Analytics and verification", help: "Tracking ID and verification seals.", screen: "/en/dashboard/settings#analytics" },
  { id: "ads", label: "Ads", help: "Ad labels. Placement rules live with the ad rules.", screen: "/en/dashboard/settings#ad-rules" },
];

// Plain-language labels for header/hero fields (derived from the key unless listed).
const LABELS = {
  site_announce_enabled: ["Show announcement bar", "Turn the bar on or off."],
  site_announce_text: ["Message", "Up to 160 characters."],
  site_announce_link_text: ["Link text", "Optional text for a link at the end."],
  site_announce_url: ["Link address", "Where the link goes."],
  site_announce_tone: ["Colour tone", "Info is blue, promo is purple, success is green, warning is amber."],
  site_announce_dismissible: ["Visitors can close it", "Adds a close button."],
  theme_header_style: ["Header style", "Default, solid, glass or transparent."],
  theme_header_background: ["Header background", "Leave empty to follow the theme."],
  site_header_text_color: ["Header text colour", "Leave empty to follow the theme."],
  site_header_font: ["Header font", "System fonts only, so nothing is downloaded."],
  site_header_sticky: ["Keep header visible while scrolling", "Same switch as in Header options."],
  site_header_height: ["Header height", "Compact, default or tall."],
  site_header_logo_mode: ["Logo display", "Show logo and name, only the logo, or only the name."],
  site_header_logo_size: ["Logo size", "Small, medium or large."],
  site_header_nav_align: ["Menu alignment", "Left, centre or right."],
  site_header_show_search: ["Show search box", "Needs the Site search module.", "search"],
  site_header_search_placeholder: ["Search box hint", "Text inside the empty search box.", "search"],
  site_header_show_auth: ["Show login and register links", "Needs Visitor accounts.", "accounts"],
  site_header_login_label: ["Login label", "Text of the login link.", "accounts"],
  site_header_dashboard_label: ["Dashboard label", "Text of the dashboard link.", "accounts"],
  site_header_logout_label: ["Logout label", "Text of the logout link.", "accounts"],
  site_header_cta_enabled: ["Show call-to-action button", "One highlighted button in the header."],
  site_header_cta_text: ["Button text", "Up to 30 characters."],
  site_header_cta_url: ["Button address", "Where the button goes."],
  site_header_cta_style: ["Button style", "Filled or outline."],
  site_header_cta_new_tab: ["Open in a new tab", "Keeps visitors on your site."],
  site_hero_enabled: ["Show hero banner", "Turn the homepage banner on or off."],
  site_hero_title: ["Headline", "The big text."],
  site_hero_subtitle: ["Subtitle", "One or two sentences under the headline."],
  site_hero_badge: ["Badge text", "Small label above the headline."],
  site_hero_button_text: ["Main button text", "Up to 40 characters."],
  site_hero_button_url: ["Main button address", "Point it at a page that is switched on."],
};
const humanise = (key) => key.replace(/^(site|theme)_/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function fromHeaderHero(f) {
  const [label, help, needs] = LABELS[f.key] || [humanise(f.key), "", undefined];
  const type = f.type === "url" ? URL_T : f.type;
  return { key: f.key, group: f.group, type, label, help, needs, values: f.values, max: f.max, min: f.min, def: f.def, heroHh: true };
}

// All fields in display order.
export function allFields() {
  const hh = HEADER_HERO_FIELDS.map(fromHeaderHero);
  return [...EXTRA, ...hh];
}

export function ownedKeys() {
  return new Set([...allFields().map((f) => f.key), ...Object.keys(OWNED_ELSEWHERE)]);
}

export function groupOf(key) {
  const f = allFields().find((x) => x.key === key);
  return f ? f.group : OWNED_ELSEWHERE[key]?.group || null;
}

// ---- manifest sent to the dashboard (no secrets, no regexes)
export function settingsManifest(profileLive = () => true) {
  const fields = allFields();
  return GROUPS.map((g) => ({
    id: g.id, label: g.label, help: g.help, screen: g.screen,
    available: !g.needs || profileLive(g.needs),
    fields: fields.filter((f) => f.group === g.id).map((f) => ({
      key: f.key, type: f.type, label: f.label, help: f.help, values: f.values, max: f.max, min: f.min,
      needs: f.needs, available: !f.needs || profileLive(f.needs),
    })),
    elsewhere: Object.entries(OWNED_ELSEWHERE).filter(([, v]) => v.group === g.id).map(([key, v]) => ({ key, screen: v.screen, why: v.why })),
  }));
}

const LENGTH_RE = /^\d{1,3}(\.\d{1,2})?(px|rem|em|%)$/;

// Clean one value. Returns { value } or { error }.
export function cleanSetting(field, raw) {
  const s = raw === undefined || raw === null ? "" : raw;
  switch (field.type) {
    case TEXT: {
      let v = cleanText(s, field.max || 200);
      if (field.upper) v = v.toUpperCase();
      if (field.email && v && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)) return { error: `${field.label}: enter a valid email address.` };
      if (field.pattern && !field.pattern.test(v)) return { error: `${field.label}: that does not look right.` };
      return { value: v };
    }
    case URL_T: {
      const v = cleanLink(s, field.max || 300);
      if (String(s).trim() && !v) return { error: `${field.label}: enter a full address (https://...) or a path starting with /.` };
      if (field.absolute && v && !/^https?:\/\//i.test(v)) return { error: `${field.label}: must start with https://.` };
      return { value: v };
    }
    case IMAGE: {
      const v = cleanImage(s, field.max || 500);
      if (String(s).trim() && !v) return { error: `${field.label}: enter an image address (https://... or /media/...).` };
      return { value: v };
    }
    case COLOR: {
      const v = cleanColor(s);
      if (String(s).trim() && !v) return { error: `${field.label}: use a colour like #1a73e8.` };
      return { value: v };
    }
    case ENUM:
      if (!field.values.includes(String(s))) return { error: `${field.label}: choose one of the listed options.` };
      return { value: String(s) };
    case LENGTH: {
      const v = String(s).trim();
      if (v && !LENGTH_RE.test(v)) return { error: `${field.label}: use a size like 12px.` };
      return { value: v };
    }
    case BOOL:
      return { value: s === true || s === "1" || s === 1 || s === "true" ? "1" : "0" };
    default:
      return { value: String(normalizeOne({ ...field, def: field.def ?? "" }, s) ?? "") };
  }
}

// Validate a partial settings object. Unknown keys are rejected. Returns { clean, errors }.
export function validateSettingsInput(input) {
  const errors = [], clean = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return { clean, errors: ["Send an object of settings."] };
  const byKey = new Map(allFields().map((f) => [f.key, f]));
  for (const [key, raw] of Object.entries(input)) {
    const f = byKey.get(key);
    if (!f) { errors.push(`"${key}" cannot be changed here.`); continue; }
    if (f.heroHh) {
      // Header/hero keys keep their original, stricter validators (slides, cards, video links, fallbacks).
      const hh = HEADER_HERO_FIELDS.find((x) => x.key === key);
      clean[key] = String(normalizeOne(hh, raw) ?? "");
      if (typeof normalizeOne(hh, raw) === "boolean") clean[key] = normalizeOne(hh, raw) ? "1" : "0";
      continue;
    }
    const r = cleanSetting(f, raw);
    if (r.error) errors.push(r.error); else clean[key] = r.value;
  }
  return { clean, errors };
}
