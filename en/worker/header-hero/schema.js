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

export const BOOL = "bool";

export const ENUM = "enum";

export const TEXT = "text";

export const LINES = "lines";

export const URL_T = "url";

export const COLOR = "color";

export const VIDEOLINK = "videolink";

export const INT = "int";

export const SLIDES = "slides";

export const CARDS = "cards";

export const MAX_SLIDES = 6;

export const MAX_CARDS = 4;

export const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|m4v)(\?[^\s]*)?$/i;

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

export const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
