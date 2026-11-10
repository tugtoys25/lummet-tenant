// Ready-made DESIGNS and TEMPLATES (Configuration > Design > Ready-made designs / Ready-made templates).
// A design is the visual look only: colours, fonts, shapes, header and hero. A template is the page layout only: casino list as
// cards, rows or compact, sidebar position, page width and spacing. They are independent, so any design can be combined with any
// template. Page content is never touched. A design is a COMPLETE set of look values, so applying one replaces the whole look at once and nothing from a
// previous design is left behind. Every key below is an ordinary setting that the other Design tabs edit one by one.
// Only system fonts are used (nothing is downloaded). Values are checked by test/design-packs.test.js with the same
// validator the dashboard uses, and colour pairs are checked for readable contrast.

const BASE = {
  theme_preset: "custom",
  theme_primary: "", theme_primary_hover: "", theme_secondary: "", theme_secondary_hover: "", theme_accent: "",
  theme_background: "", theme_surface: "", theme_surface_alt: "", theme_border: "", theme_text: "", theme_text_muted: "",
  theme_button_text: "", theme_footer_background: "", theme_header_background: "", theme_section_background: "",
  theme_font_body: "default", theme_font_heading: "default", theme_font_size: "default",
  theme_card_style: "default", theme_button_style: "default",
  theme_card_radius: "", theme_button_radius: "", theme_header_style: "default",
  site_header_text_color: "", site_header_font: "default",
  site_hero_bg_mode: "default", site_hero_bg_color: "", site_hero_text_theme: "light", site_hero_text_color: "", site_hero_title_color: "",
  site_hero_heading_font: "default", site_hero_body_font: "default",
};

export const DESIGN_KEYS = Object.keys(BASE);
// Template keys, grouped by what they structure. All are existing settings, so nothing here is hidden anywhere else.
export const TEMPLATE_KEYS = [
  // page: casino list, sidebar, width and spacing
  "theme_list_layout", "theme_review_layout", "theme_container_width", "theme_layout_style",
  // header: arrangement, menu position, height, logo size, stays-on-top
  "theme_header_layout", "site_header_nav_align", "site_header_height", "site_header_logo_size", "site_header_sticky",
  // hero: alignment, height, small badge above the title
  "site_hero_alignment", "site_hero_height", "site_hero_badge_enabled",
  // sections: how stacked blocks are separated, and how their headings look
  "theme_section_style", "theme_section_heading",
];

const make = (id, label, help, tone, settings) => ({ id, label, help, tone, settings: { ...BASE, ...settings } });

export const DESIGN_PACKS = [
  make("neon-green", "Neon Green", "Near-black pages, bright green buttons and gold touches. Bold and modern.", "dark", {
    theme_primary: "#00e676", theme_primary_hover: "#00c853", theme_secondary: "#c9a45c", theme_secondary_hover: "#b08d45", theme_accent: "#c9a45c",
    theme_background: "#1a1a1a", theme_surface: "#111111", theme_surface_alt: "#222222", theme_border: "#333333", theme_text: "#ffffff", theme_text_muted: "#b3b3b3",
    theme_button_text: "#0a0a0a", theme_footer_background: "#111111", theme_header_background: "#141414", theme_section_background: "#222222",
    theme_header_style: "solid", theme_font_body: "system", theme_font_heading: "modern", theme_card_style: "bordered", theme_button_style: "rounded",
    theme_card_radius: "6px", theme_button_radius: "10px",
  }),
  make("classic-blue", "Classic Blue", "Light pages with a trustworthy blue. A safe choice for most sites.", "light", {
    theme_primary: "#2563eb", theme_primary_hover: "#1d4ed8", theme_secondary: "#0369a1", theme_secondary_hover: "#075985", theme_accent: "#0e7490",
    theme_background: "#f5f7fb", theme_surface: "#0f172a", theme_surface_alt: "#1e293b", theme_border: "#dbe2ec", theme_text: "#0f172a", theme_text_muted: "#475569",
    theme_button_text: "#ffffff", theme_footer_background: "#0f172a", theme_section_background: "#eaeff7",
    theme_font_body: "system", theme_font_heading: "system", theme_button_style: "rounded", theme_card_radius: "12px", theme_button_radius: "8px",
    site_hero_bg_mode: "brand",
  }),
  make("royal-gold", "Royal Gold", "Deep navy with gold and elegant serif headings. Premium feel.", "dark", {
    theme_primary: "#d4af37", theme_primary_hover: "#b8962e", theme_secondary: "#9aa7d0", theme_secondary_hover: "#7f8db8", theme_accent: "#d4af37",
    theme_background: "#0b1020", theme_surface: "#070b17", theme_surface_alt: "#141a2e", theme_border: "#2a3350", theme_text: "#f8fafc", theme_text_muted: "#aab3c5",
    theme_button_text: "#111827", theme_footer_background: "#070b17", theme_header_background: "#070b17", theme_section_background: "#10162a",
    theme_header_style: "glass", theme_font_body: "system", theme_font_heading: "elegant", theme_card_style: "bordered", theme_button_style: "rounded",
    theme_card_radius: "10px", theme_button_radius: "6px",
  }),
  make("fresh-green", "Fresh Green", "Bright white pages, soft green bands and rounded pill buttons. Friendly and clean.", "light", {
    theme_primary: "#15803d", theme_primary_hover: "#166534", theme_secondary: "#0f766e", theme_secondary_hover: "#115e59", theme_accent: "#b45309",
    theme_background: "#ffffff", theme_surface: "#0f2a1d", theme_surface_alt: "#14382a", theme_border: "#d1fae5", theme_text: "#0f172a", theme_text_muted: "#475569",
    theme_button_text: "#ffffff", theme_footer_background: "#0f2a1d", theme_header_background: "#0f2a1d", theme_section_background: "#f0fdf4",
    theme_header_style: "solid", theme_font_body: "rounded", theme_font_heading: "rounded", theme_card_style: "elevated", theme_button_style: "pill",
    theme_card_radius: "16px", site_hero_bg_mode: "solid", site_hero_bg_color: "#14532d",
  }),
  make("sunset-dark", "Sunset Dark", "Warm dark browns with orange and pink. Strong, energetic headlines.", "dark", {
    theme_primary: "#f97316", theme_primary_hover: "#ea580c", theme_secondary: "#ec4899", theme_secondary_hover: "#db2777", theme_accent: "#fbbf24",
    theme_background: "#1c1210", theme_surface: "#140c0a", theme_surface_alt: "#2a1a15", theme_border: "#3b2620", theme_text: "#fff7ed", theme_text_muted: "#d6b8a8",
    theme_button_text: "#1c0f08", theme_footer_background: "#140c0a", theme_header_background: "#140c0a", theme_section_background: "#241713",
    theme_header_style: "solid", theme_font_body: "modern", theme_font_heading: "display", theme_card_style: "elevated", theme_button_style: "pill",
    theme_card_radius: "14px", site_hero_bg_mode: "solid", site_hero_bg_color: "#3b1d12",
  }),
  make("clean-minimal", "Clean Minimal", "Plain greys and black with sharp corners. Calm and editorial.", "light", {
    theme_primary: "#111827", theme_primary_hover: "#000000", theme_secondary: "#4b5563", theme_secondary_hover: "#374151", theme_accent: "#2563eb",
    theme_background: "#fafafa", theme_surface: "#111827", theme_surface_alt: "#1f2937", theme_border: "#e5e7eb", theme_text: "#111827", theme_text_muted: "#4b5563",
    theme_button_text: "#ffffff", theme_footer_background: "#111827", theme_section_background: "#f1f1f1",
    theme_font_body: "system", theme_font_heading: "serif", theme_card_style: "flat", theme_button_style: "square", theme_card_radius: "2px",
    site_hero_bg_mode: "solid", site_hero_bg_color: "#111827",
  }),
  make("crimson-arena", "Crimson Arena", "Black pages with red and gold, bold display headings. Made for sports betting.", "dark", {
    theme_primary: "#e11d48", theme_primary_hover: "#be123c", theme_secondary: "#fbbf24", theme_secondary_hover: "#d97706", theme_accent: "#fbbf24",
    theme_background: "#121212", theme_surface: "#0d0d0d", theme_surface_alt: "#1c1c1c", theme_border: "#2a2a2a", theme_text: "#ffffff", theme_text_muted: "#b3b3b3",
    theme_button_text: "#ffffff", theme_footer_background: "#0d0d0d", theme_header_background: "#0d0d0d", theme_section_background: "#1a1a1a",
    theme_header_style: "solid", theme_font_body: "modern", theme_font_heading: "display", theme_card_style: "bordered", theme_button_style: "rounded",
    theme_card_radius: "4px", theme_button_radius: "6px",
  }),
  make("ocean-breeze", "Ocean Breeze", "Pale blue pages, deep navy header and soft rounded cards. Fresh and light.", "light", {
    theme_primary: "#0369a1", theme_primary_hover: "#075985", theme_secondary: "#0f766e", theme_secondary_hover: "#115e59", theme_accent: "#b45309",
    theme_background: "#f0f9ff", theme_surface: "#0c2d48", theme_surface_alt: "#0f3a5c", theme_border: "#bae6fd", theme_text: "#0c4a6e", theme_text_muted: "#475569",
    theme_button_text: "#ffffff", theme_footer_background: "#0c2d48", theme_header_background: "#0c2d48", theme_section_background: "#e0f2fe",
    theme_header_style: "solid", theme_font_body: "rounded", theme_font_heading: "modern", theme_card_style: "elevated", theme_button_style: "rounded",
    theme_card_radius: "14px", theme_button_radius: "12px", site_hero_bg_mode: "solid", site_hero_bg_color: "#075985",
  }),
];

// Every template sets every template key (so applying one fully replaces the previous structure). The patterns follow what
// professional sites use: logo-left with menu right or centred, a stacked editorial header, left-aligned or centred heroes,
// and banded, boxed or divided sections.
const TEMPLATE_BASE = {
  theme_list_layout: "default", theme_review_layout: "default", theme_container_width: "1200px", theme_layout_style: "default",
  theme_header_layout: "default", site_header_nav_align: "left", site_header_height: "default", site_header_logo_size: "md", site_header_sticky: "1",
  site_hero_alignment: "center", site_hero_height: "standard", site_hero_badge_enabled: "1",
  theme_section_style: "default", theme_section_heading: "default",
};

const tpl = (id, label, help, o) => ({ id, label, help, tone: "layout", settings: { ...TEMPLATE_BASE, ...o } });

export const TEMPLATE_PACKS = [
  tpl("classic-cards", "Classic Portal", "The standard layout: casinos as cards, menu next to the logo, centred hero, sidebar on the right.", {}),
  tpl("stadium-rows", "Stadium Rows", "A compact centred hero, then one wide row per casino with rank, logo, offer and buttons. Titles get an accent bar.", {
    theme_list_layout: "rows", site_hero_height: "compact", theme_section_heading: "accent",
  }),
  tpl("modern-bands", "Modern Bands", "Menu centred in the header, a tall left-aligned hero and alternating coloured bands. Clean and current.", {
    site_header_nav_align: "center", site_hero_alignment: "left", site_hero_height: "tall", theme_section_style: "bands", theme_section_heading: "centered",
  }),
  tpl("wide-rows", "Wide Rows", "Menu on the right, a left-aligned hero, rows on a wide page with the sidebar on the left. Roomy and bold.", {
    theme_list_layout: "rows", theme_review_layout: "left", theme_container_width: "1440px", theme_layout_style: "wide",
    site_header_nav_align: "right", site_header_logo_size: "lg", site_hero_alignment: "left", theme_section_style: "bands",
  }),
  tpl("compact-list", "Compact List", "A short header and hero, dense rows on a narrow page, thin lines between sections. Many casinos on screen.", {
    theme_list_layout: "compact", theme_container_width: "1080px", theme_layout_style: "compact",
    site_header_height: "compact", site_header_logo_size: "sm", site_hero_height: "compact", site_hero_badge_enabled: "0", theme_section_style: "divided",
  }),
  tpl("editorial", "Editorial", "Logo centred with the menu below, cards on a narrow page, sidebar below the content. Reads like a magazine.", {
    theme_review_layout: "stacked", theme_container_width: "1080px", theme_header_layout: "stacked", site_header_nav_align: "center",
    site_header_logo_size: "lg", theme_section_heading: "centered-accent",
  }),
  tpl("magazine", "Magazine", "Stacked header, left-aligned hero, each section in an outlined box with accent-bar titles.", {
    theme_header_layout: "stacked", site_header_nav_align: "center", site_hero_alignment: "left", theme_section_style: "boxed", theme_section_heading: "accent",
  }),
  tpl("dense-wide", "Dense Wide", "Short header, compact left-aligned hero, dense rows on a wide page with the sidebar on the left. For long lists.", {
    theme_list_layout: "compact", theme_review_layout: "left", theme_container_width: "1440px", theme_layout_style: "wide",
    site_header_height: "compact", site_header_nav_align: "right", site_header_logo_size: "sm", site_hero_alignment: "left", site_hero_height: "compact",
    site_hero_badge_enabled: "0", theme_section_style: "boxed",
  }),
];
