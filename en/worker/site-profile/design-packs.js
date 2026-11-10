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

// Compact builder for the added designs: c = [primary, primary hover, secondary, secondary hover, accent, page, surface, surface alt, border, text, muted, button text].
// o = { sec: section band, hf/bf: heading/body font, hs: header style, cs: card style, bs: button style, cr/br: card/button radius, hero: solid hero colour }.
const mk = (id, label, help, tone, c, o = {}) => make(id, label, help, tone, {
  theme_primary: c[0], theme_primary_hover: c[1], theme_secondary: c[2], theme_secondary_hover: c[3], theme_accent: c[4],
  theme_background: c[5], theme_surface: c[6], theme_surface_alt: c[7], theme_border: c[8], theme_text: c[9], theme_text_muted: c[10], theme_button_text: c[11],
  theme_footer_background: c[6], theme_header_background: c[6], theme_section_background: o.sec,
  theme_font_heading: o.hf, theme_font_body: o.bf, theme_header_style: o.hs, theme_card_style: o.cs, theme_button_style: o.bs,
  theme_card_radius: o.cr, ...(o.br ? { theme_button_radius: o.br } : {}),
  ...(o.hero ? { site_hero_bg_mode: "solid", site_hero_bg_color: o.hero } : {}),
});

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
  // ---- Added designs (luxury, premium, dark and light). Colour order: primary, primary hover, secondary, secondary hover, accent, page, header/footer surface, surface alt, border, text, muted text, button text.
  // Dark premium
  mk("obsidian-gold", "Obsidian Gold", "Black pages with champagne gold and cream text. The classic luxury pair.", "dark",
    ["#d4af37", "#b8962e", "#f5f0e1", "#d9d2bd", "#d4af37", "#0d0d0d", "#070707", "#1a1a1a", "#2e2a1e", "#f5f0e1", "#b8b2a0", "#111111"],
    { sec: "#151515", hf: "elegant", bf: "system", hs: "glass", cs: "bordered", bs: "rounded", cr: "6px", br: "4px" }),
  mk("emerald-vault", "Emerald Vault", "Deep emerald green with antique gold. Old-world wealth and prestige.", "dark",
    ["#d4af37", "#b8962e", "#9fd4bd", "#7fbfa4", "#d4af37", "#07261c", "#04170f", "#0d3a2b", "#1f5a44", "#f3efe0", "#b5c7bd", "#10200f"],
    { sec: "#0a3023", hf: "elegant", bf: "system", hs: "solid", cs: "bordered", bs: "rounded", cr: "8px", br: "6px", hero: "#0d3a2b" }),
  mk("midnight-sapphire", "Midnight Sapphire", "Deep navy with a bright sapphire blue and a gold touch. Calm and trustworthy.", "dark",
    ["#5b9cff", "#3b82f6", "#d4af37", "#b8962e", "#d4af37", "#0a1426", "#060d1a", "#12203a", "#25375c", "#eef3fb", "#a9b8d3", "#08122a"],
    { sec: "#0e1a30", hf: "modern", bf: "system", hs: "solid", cs: "elevated", bs: "rounded", cr: "12px", br: "8px" }),
  mk("burgundy-velvet", "Burgundy Velvet", "Wine red darkness with soft gold. Rich, warm and exclusive.", "dark",
    ["#e0b872", "#c99f55", "#be3455", "#a02844", "#e0b872", "#1c0a10", "#12060a", "#2a1018", "#4a1c28", "#fbeff1", "#d1aeb5", "#1c0a10"],
    { sec: "#240d15", hf: "elegant", bf: "system", hs: "glass", cs: "bordered", bs: "rounded", cr: "10px", br: "6px", hero: "#3a0f1c" }),
  mk("royal-amethyst", "Royal Amethyst", "Deep purple with lilac buttons and a gold accent. Regal and creative.", "dark",
    ["#c4a7ff", "#a98af5", "#f5c542", "#d9a92b", "#f5c542", "#170f2a", "#0f0920", "#231744", "#3d2c70", "#f5f1ff", "#bdb2dd", "#170f2a"],
    { sec: "#1d1436", hf: "elegant", bf: "rounded", hs: "glass", cs: "elevated", bs: "pill", cr: "16px", hero: "#2a1d52" }),
  mk("graphite-copper", "Graphite Copper", "Charcoal greys with warm copper. Industrial and refined.", "dark",
    ["#d98a5b", "#c2713f", "#9ca3af", "#7c8491", "#d98a5b", "#1a1c1f", "#111214", "#25282c", "#363a40", "#f4f4f5", "#b4b8bd", "#1a0e07"],
    { sec: "#202327", hf: "modern", bf: "modern", hs: "solid", cs: "flat", bs: "square", cr: "2px" }),
  mk("noir-champagne", "Noir Champagne", "Soft black with pale champagne and serif headings. Fashion-house elegance.", "dark",
    ["#e8d5a6", "#d4bd85", "#9a9a9a", "#7d7d7d", "#e8d5a6", "#121212", "#0a0a0a", "#1e1e1e", "#333333", "#fafafa", "#b5b5b5", "#121212"],
    { sec: "#181818", hf: "serif", bf: "system", hs: "glass", cs: "flat", bs: "square", cr: "0px", br: "0px" }),
  mk("teal-lagoon", "Teal Lagoon", "Deep teal water with turquoise buttons and a sunny accent. Fresh and premium.", "dark",
    ["#2dd4bf", "#14b8a6", "#fbbf24", "#d99a0b", "#fbbf24", "#062a2e", "#031a1d", "#0b3d42", "#14585f", "#ecfeff", "#a8d0d4", "#04201f"],
    { sec: "#08353a", hf: "rounded", bf: "rounded", hs: "solid", cs: "elevated", bs: "pill", cr: "16px", hero: "#0b3d42" }),
  mk("electric-violet", "Electric Violet", "Near-black indigo with vivid violet and cyan. Modern and tech-forward.", "dark",
    ["#7c3aed", "#6d28d9", "#22d3ee", "#06b6d4", "#22d3ee", "#12101f", "#0b0a15", "#1c1932", "#332f5a", "#f5f3ff", "#b9b4d9", "#ffffff"],
    { sec: "#171428", hf: "modern", bf: "modern", hs: "glass", cs: "glass", bs: "rounded", cr: "14px", br: "10px" }),
  mk("cyber-mint", "Cyber Mint", "Dark green-black with glowing mint and a pink spark. Gaming energy.", "dark",
    ["#34f5a5", "#1fd98c", "#f0abfc", "#d97ef0", "#f0abfc", "#0b1512", "#060d0b", "#12231e", "#1f3d34", "#effdf7", "#a3c7b8", "#04130d"],
    { sec: "#0f1d19", hf: "mono", bf: "system", hs: "solid", cs: "bordered", bs: "rounded", cr: "6px", br: "4px" }),
  mk("volcano-ember", "Volcano Ember", "Burnt dark brown with glowing orange and amber. Intense and bold.", "dark",
    ["#ff5a36", "#e8431f", "#ffb703", "#d99700", "#ffb703", "#1a0d0a", "#110806", "#2b1510", "#4a2419", "#fff4ef", "#dbb5a8", "#1a0905"],
    { sec: "#231210", hf: "display", bf: "modern", hs: "solid", cs: "elevated", bs: "rounded", cr: "8px", hero: "#4a1d10" }),
  mk("arctic-night", "Arctic Night", "Cold blue-grey dark with icy sky-blue highlights. Crisp and professional.", "dark",
    ["#7dd3fc", "#38bdf8", "#94a3b8", "#7a8aa0", "#7dd3fc", "#0e1621", "#08101a", "#172334", "#2a3b52", "#f1f5f9", "#a8b6c8", "#08131c"],
    { sec: "#121d2b", hf: "system", bf: "system", hs: "glass", cs: "bordered", bs: "rounded", cr: "10px" }),
  mk("espresso-latte", "Espresso Latte", "Coffee-bean browns with creamy latte buttons. Cosy and upscale.", "dark",
    ["#e6c9a0", "#d1b185", "#c08457", "#a66a3f", "#e6c9a0", "#1b130e", "#120c08", "#2a1d15", "#4a3425", "#faf3ea", "#c9b8a5", "#1b130e"],
    { sec: "#22170f", hf: "elegant", bf: "rounded", hs: "solid", cs: "elevated", bs: "pill", cr: "14px", hero: "#3a281b" }),
  mk("rose-noir", "Rose Noir", "Dark plum-black with rose pink and blush. Glamorous and bold.", "dark",
    ["#f472b6", "#ec4899", "#fbcfe8", "#f0abd0", "#fbcfe8", "#170d12", "#0f070b", "#25141c", "#43232f", "#fdf2f8", "#d7b4c6", "#1a0612"],
    { sec: "#1f1119", hf: "elegant", bf: "rounded", hs: "glass", cs: "glass", bs: "pill", cr: "18px" }),
  mk("stadium-night", "Stadium Night", "Night-match navy with pitch green and gold. Built for sports and live odds.", "dark",
    ["#22c55e", "#16a34a", "#facc15", "#d4a90a", "#facc15", "#0a0f1c", "#060912", "#131a2e", "#26304d", "#ffffff", "#b0b8cc", "#04140a"],
    { sec: "#0f1526", hf: "display", bf: "modern", hs: "solid", cs: "bordered", bs: "rounded", cr: "6px", br: "6px", hero: "#10331f" }),
  mk("ruby-onyx", "Ruby Onyx", "Onyx black with ruby red and a gold line. Dramatic high-roller style.", "dark",
    ["#dc2626", "#b91c1c", "#d4af37", "#b8962e", "#d4af37", "#101010", "#080808", "#1c1c1c", "#302020", "#ffffff", "#b8b8b8", "#ffffff"],
    { sec: "#161616", hf: "serif", bf: "system", hs: "solid", cs: "bordered", bs: "square", cr: "2px" }),
  // Light premium
  mk("ivory-gold", "Ivory Gold", "Warm ivory pages with antique gold and a dark header. Quiet luxury.", "light",
    ["#8a6a14", "#6f550f", "#1c1a14", "#000000", "#b8860b", "#faf6ec", "#1c1a14", "#2a2719", "#e6dcc2", "#2a2417", "#5e5640", "#ffffff"],
    { sec: "#f1e9d3", hf: "elegant", bf: "system", hs: "solid", cs: "bordered", bs: "rounded", cr: "8px", br: "4px", hero: "#2a2719" }),
  mk("champagne-cream", "Champagne Cream", "Soft cream and bronze with a deep brown header. Elegant and warm.", "light",
    ["#8f5f27", "#744c1d", "#2b2420", "#000000", "#b07a3a", "#fbf7f0", "#2b2420", "#3a312b", "#e8ddcf", "#2b2420", "#62574d", "#ffffff"],
    { sec: "#f3eadc", hf: "elegant", bf: "system", hs: "solid", cs: "elevated", bs: "rounded", cr: "12px", br: "8px", hero: "#3a312b" }),
  mk("pearl-silver", "Pearl Silver", "Cool pearl greys with slate buttons and a soft gold detail. Clean and corporate-premium.", "light",
    ["#334155", "#1e293b", "#64748b", "#475569", "#b08d57", "#f5f6f8", "#1a1f27", "#262d38", "#dfe3e9", "#1a1f27", "#525c6b", "#ffffff"],
    { sec: "#eceef2", hf: "modern", bf: "modern", hs: "solid", cs: "flat", bs: "rounded", cr: "6px", br: "6px", hero: "#262d38" }),
  mk("blush-rose", "Blush Rose", "Blush white with raspberry buttons and soft pill shapes. Lovely and feminine.", "light",
    ["#be185d", "#9d174d", "#9f1239", "#881337", "#b45309", "#fff7f8", "#3a1a24", "#4d2331", "#f6d9df", "#3a1a24", "#75505c", "#ffffff"],
    { sec: "#fdebee", hf: "rounded", bf: "rounded", hs: "solid", cs: "elevated", bs: "pill", cr: "18px", hero: "#4d2331" }),
  mk("sage-linen", "Sage Linen", "Linen white with sage green. Natural, calm and refined.", "light",
    ["#3f6b4a", "#2f5238", "#a16207", "#854d0e", "#a16207", "#f6f8f4", "#1f2b22", "#2b3b2f", "#dde5d8", "#1f2b22", "#516052", "#ffffff"],
    { sec: "#e9efe4", hf: "serif", bf: "rounded", hs: "solid", cs: "bordered", bs: "rounded", cr: "12px", hero: "#2b3b2f" }),
  mk("sand-dune", "Sand Dune", "Sandy cream with terracotta and a teal accent. Warm and inviting.", "light",
    ["#b45309", "#92400e", "#78350f", "#5c2a0b", "#0f766e", "#fbf5ea", "#2e2416", "#3d311f", "#eadfc8", "#2e2416", "#6b5a3e", "#ffffff"],
    { sec: "#f2e7d0", hf: "elegant", bf: "rounded", hs: "solid", cs: "elevated", bs: "rounded", cr: "14px", hero: "#3d311f" }),
  mk("lavender-mist", "Lavender Mist", "Pale lavender with royal purple buttons. Soft, modern and creative.", "light",
    ["#6d28d9", "#5b21b6", "#db2777", "#be185d", "#db2777", "#f8f6ff", "#241b3d", "#31264f", "#e2dcf5", "#241b3d", "#5d5380", "#ffffff"],
    { sec: "#eeeaf9", hf: "rounded", bf: "rounded", hs: "solid", cs: "elevated", bs: "pill", cr: "16px", hero: "#31264f" }),
  mk("coastal-white", "Coastal White", "Crisp white and sea blue with a sunset-orange accent. Bright and airy.", "light",
    ["#0e7490", "#155e75", "#0b2b3c", "#061c28", "#d97706", "#f7fbfd", "#0b2b3c", "#123b50", "#d4e8f0", "#0b2b3c", "#43606f", "#ffffff"],
    { sec: "#e8f3f8", hf: "modern", bf: "rounded", hs: "solid", cs: "elevated", bs: "rounded", cr: "14px", br: "10px", hero: "#123b50" }),
  mk("mint-spa", "Mint Spa", "Fresh mint whites with deep green buttons. Clean and wellness-calm.", "light",
    ["#0f766e", "#115e59", "#c2410c", "#9a3412", "#c2410c", "#f2fbf8", "#0f3b35", "#174d46", "#cdeee5", "#0f3b35", "#44675f", "#ffffff"],
    { sec: "#e2f6f0", hf: "rounded", bf: "rounded", hs: "solid", cs: "elevated", bs: "pill", cr: "18px", hero: "#174d46" }),
  mk("peach-sorbet", "Peach Sorbet", "Peach cream with burnt orange and berry. Friendly and playful.", "light",
    ["#c2410c", "#9a3412", "#be185d", "#9d174d", "#0f766e", "#fff8f3", "#3b1f14", "#4f2a1b", "#fbdcc8", "#3b1f14", "#7a5240", "#ffffff"],
    { sec: "#ffeadb", hf: "rounded", bf: "rounded", hs: "solid", cs: "elevated", bs: "pill", cr: "18px", hero: "#4f2a1b" }),
  mk("paper-ink", "Paper & Ink", "White paper, black ink and one red accent. Pure newspaper editorial.", "light",
    ["#b91c1c", "#991b1b", "#111111", "#000000", "#b91c1c", "#ffffff", "#111111", "#1d1d1d", "#e4e4e4", "#111111", "#525252", "#ffffff"],
    { sec: "#f5f5f5", hf: "serif", bf: "serif", hs: "solid", cs: "flat", bs: "square", cr: "0px", br: "0px", hero: "#111111" }),
  mk("navy-executive", "Navy Executive", "Light grey-blue with navy and a gold detail. Boardroom professional.", "light",
    ["#1d4ed8", "#1e40af", "#b8860b", "#946b09", "#b8860b", "#f4f6fa", "#0b1f3a", "#14305a", "#d5dcea", "#0b1f3a", "#475a78", "#ffffff"],
    { sec: "#e8edf6", hf: "system", bf: "system", hs: "solid", cs: "bordered", bs: "rounded", cr: "8px", br: "6px", hero: "#14305a" }),
  mk("olive-terracotta", "Olive Terracotta", "Cream with olive and terracotta. Earthy, handcrafted and boutique.", "light",
    ["#a0522d", "#7f3f22", "#6b7a2a", "#556120", "#6b7a2a", "#faf6ef", "#2d3320", "#3b4329", "#e6dfcb", "#2d3320", "#5d6347", "#ffffff"],
    { sec: "#f0ead9", hf: "elegant", bf: "rounded", hs: "solid", cs: "elevated", bs: "rounded", cr: "12px", hero: "#3b4329" }),
  mk("golden-hour", "Golden Hour", "Buttery cream with warm amber and a deep brown header. Sunny and upbeat.", "light",
    ["#a16207", "#854d0e", "#292107", "#000000", "#a16207", "#fffbeb", "#292107", "#3a2e0b", "#fde68a", "#292107", "#6b5a1c", "#ffffff"],
    { sec: "#fef3c7", hf: "display", bf: "modern", hs: "solid", cs: "bordered", bs: "rounded", cr: "10px", hero: "#3a2e0b" }),
  mk("slate-modern", "Slate Modern", "Cool white with indigo buttons and a slate header. Crisp SaaS style.", "light",
    ["#4f46e5", "#4338ca", "#0891b2", "#0e7490", "#0891b2", "#f8fafc", "#0f172a", "#1e293b", "#e2e8f0", "#0f172a", "#475569", "#ffffff"],
    { sec: "#eef2f7", hf: "modern", bf: "modern", hs: "glass", cs: "elevated", bs: "rounded", cr: "14px", br: "10px", hero: "#1e293b" }),
  mk("platinum-emerald", "Platinum Emerald", "Pale platinum with emerald green and gold. Light, rich and prestigious.", "light",
    ["#046307", "#034d06", "#b8860b", "#946b09", "#b8860b", "#f3f7f5", "#0c3b2e", "#13503f", "#d3e4dc", "#0c3b2e", "#4a655b", "#ffffff"],
    { sec: "#e4efe9", hf: "elegant", bf: "system", hs: "solid", cs: "bordered", bs: "rounded", cr: "10px", br: "6px", hero: "#13503f" }),
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
  // ---- Added templates (page structure only). Each one changes the header, hero, list, sidebar, width and section arrangement.
  tpl("luxe-boutique", "Luxe Boutique", "Logo centred over the menu in a tall header, a tall centred hero and thin lines between sections. Boutique-hotel feel.", {
    theme_container_width: "1080px", theme_layout_style: "wide", theme_header_layout: "stacked", site_header_nav_align: "center", site_header_height: "tall",
    site_header_logo_size: "lg", site_hero_height: "tall", theme_section_style: "divided", theme_section_heading: "centered-accent",
  }),
  tpl("grand-hall", "Grand Hall", "Tall header with the menu centred, a full-screen centred hero and coloured bands. Opens with impact.", {
    theme_layout_style: "wide", site_header_nav_align: "center", site_header_height: "tall", site_hero_height: "screen", theme_section_style: "bands", theme_section_heading: "centered",
  }),
  tpl("showcase-left", "Showcase Left", "Sidebar on the left, a tall left-aligned hero and boxed sections with accent titles. Menu on the right.", {
    theme_review_layout: "left", site_header_nav_align: "right", site_hero_alignment: "left", site_hero_height: "tall", theme_section_style: "boxed", theme_section_heading: "accent",
  }),
  tpl("split-sidebar", "Split Sidebar", "Casino rows with a left sidebar and a right-aligned hero. Lines between sections keep it tidy.", {
    theme_list_layout: "rows", theme_review_layout: "left", site_hero_alignment: "right", theme_section_style: "divided", theme_section_heading: "accent",
  }),
  tpl("velvet-lounge", "Velvet Lounge", "Stacked tall header, a full-screen centred hero, roomy spacing and alternating bands. Premium and spacious.", {
    theme_container_width: "1080px", theme_layout_style: "wide", theme_header_layout: "stacked", site_header_nav_align: "center", site_header_height: "tall",
    site_header_logo_size: "lg", site_hero_height: "screen", theme_section_style: "bands", theme_section_heading: "centered-accent",
  }),
  tpl("news-front", "News Front", "Short header, a thin left-aligned hero, compact rows on a wide page and divided sections. News-desk density.", {
    theme_list_layout: "compact", theme_container_width: "1440px", theme_layout_style: "compact", site_header_height: "compact", site_header_logo_size: "sm",
    site_hero_alignment: "left", site_hero_height: "compact", site_hero_badge_enabled: "0", theme_section_style: "divided", theme_section_heading: "accent",
  }),
  tpl("broadsheet", "Broadsheet", "Stacked header, left-aligned hero, rows and centred section titles with lines between sections. Newspaper rhythm.", {
    theme_list_layout: "rows", theme_header_layout: "stacked", site_header_nav_align: "center", site_hero_alignment: "left", theme_section_style: "divided", theme_section_heading: "centered",
  }),
  tpl("spotlight-hero", "Spotlight Hero", "A full-screen centred hero with the menu on the right, roomy spacing and centred titles.", {
    theme_layout_style: "wide", site_header_nav_align: "right", site_hero_height: "screen", theme_section_heading: "centered",
  }),
  tpl("gallery-right", "Gallery Right", "Right-aligned tall hero, cards on a wide page with the sidebar below, and alternating bands.", {
    theme_review_layout: "stacked", theme_container_width: "1440px", theme_layout_style: "wide", site_hero_alignment: "right", site_hero_height: "tall", theme_section_style: "bands", theme_section_heading: "accent",
  }),
  tpl("boxed-compact", "Boxed Compact", "Narrow page, short header and hero, compact list and every section in its own box.", {
    theme_list_layout: "compact", theme_container_width: "1080px", theme_layout_style: "compact", site_header_height: "compact", site_header_logo_size: "sm",
    site_hero_height: "compact", site_hero_badge_enabled: "0", theme_section_style: "boxed",
  }),
  tpl("airy-minimal", "Airy Minimal", "Narrow page, lots of space, menu centred, a plain centred hero without badge and sidebar below. Calm and minimal.", {
    theme_review_layout: "stacked", theme_container_width: "1080px", theme_layout_style: "wide", site_header_nav_align: "center", site_hero_badge_enabled: "0", theme_section_heading: "centered",
  }),
  tpl("bold-banner", "Bold Banner", "Tall header with a large logo, a full-screen left-aligned hero and rows on a wide page with coloured bands.", {
    theme_list_layout: "rows", theme_container_width: "1440px", theme_layout_style: "wide", site_header_nav_align: "right", site_header_height: "tall", site_header_logo_size: "lg",
    site_hero_alignment: "left", site_hero_height: "screen", theme_section_style: "bands", theme_section_heading: "accent",
  }),
  tpl("centered-stack", "Centred Stack", "Stacked tall header, centred hero, cards with the sidebar below and boxed sections with centred accent titles.", {
    theme_review_layout: "stacked", theme_header_layout: "stacked", site_header_nav_align: "center", site_header_height: "tall", site_header_logo_size: "lg",
    theme_section_style: "boxed", theme_section_heading: "centered-accent",
  }),
  tpl("sidebar-bands", "Sidebar Bands", "Left sidebar, centred menu, a left-aligned hero and alternating coloured bands with accent titles.", {
    theme_review_layout: "left", site_header_nav_align: "center", site_hero_alignment: "left", theme_section_style: "bands", theme_section_heading: "accent",
  }),
  tpl("slim-top", "Slim Top", "A slim header with the menu on the right, a short centred hero, rows and thin dividers. Content comes first.", {
    theme_list_layout: "rows", theme_layout_style: "compact", site_header_nav_align: "right", site_header_height: "compact", site_header_logo_size: "sm",
    site_hero_height: "compact", site_hero_badge_enabled: "0", theme_section_style: "divided",
  }),
  tpl("static-classic", "Static Classic", "The classic card layout but the header scrolls away, with divided sections and centred titles.", {
    site_header_sticky: "0", theme_section_style: "divided", theme_section_heading: "centered",
  }),
  tpl("wide-gallery", "Wide Gallery", "Extra-wide page with roomy spacing, a tall header, a tall centred hero and the sidebar below the cards.", {
    theme_review_layout: "stacked", theme_container_width: "1440px", theme_layout_style: "wide", site_header_nav_align: "center", site_header_height: "tall",
    site_hero_height: "tall", theme_section_heading: "centered-accent",
  }),
  tpl("narrow-reader", "Narrow Reader", "A narrow reading column with rows, a short left-aligned hero and accent titles. Easy on the eyes on phones.", {
    theme_list_layout: "rows", theme_review_layout: "stacked", theme_container_width: "1080px", theme_layout_style: "compact", site_hero_alignment: "left",
    site_hero_height: "compact", site_hero_badge_enabled: "0", theme_section_heading: "accent",
  }),
  tpl("premium-rows-left", "Premium Rows", "Large logo, centred menu, a tall centred hero, rows with the sidebar on the left on a wide page with bands.", {
    theme_list_layout: "rows", theme_review_layout: "left", theme_container_width: "1440px", theme_layout_style: "wide", site_header_nav_align: "center", site_header_height: "tall",
    site_header_logo_size: "lg", site_hero_height: "tall", theme_section_style: "bands", theme_section_heading: "centered",
  }),
  tpl("split-hero-boxes", "Split Hero Boxes", "A short header, a right-aligned hero, compact rows and boxed sections. Dense but tidy.", {
    theme_list_layout: "compact", site_header_height: "compact", site_hero_alignment: "right", theme_section_style: "boxed",
  }),
  tpl("grand-editorial", "Grand Editorial", "Stacked tall header, a tall left-aligned hero, narrow cards with the sidebar below and lined sections. Long-read magazine.", {
    theme_review_layout: "stacked", theme_container_width: "1080px", theme_layout_style: "wide", theme_header_layout: "stacked", site_header_nav_align: "center", site_header_height: "tall",
    site_header_logo_size: "lg", site_hero_alignment: "left", site_hero_height: "tall", theme_section_style: "divided", theme_section_heading: "centered-accent",
  }),
  tpl("fast-scan", "Fast Scan", "Left sidebar, compact rows, short header and hero and coloured bands. Built for scanning many offers.", {
    theme_list_layout: "compact", theme_review_layout: "left", theme_layout_style: "compact", site_header_height: "compact", site_header_logo_size: "sm",
    site_hero_alignment: "left", site_hero_height: "compact", site_hero_badge_enabled: "0", theme_section_style: "bands",
  }),
];
