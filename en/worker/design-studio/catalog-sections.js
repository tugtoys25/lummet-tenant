// LIBRARY 5 (part 2) - SECTION STUDIO. 14 section types x 3 visual variants. Each variant owns a real structure
// (grid template, card treatment, background) rendered by css.js; content comes from existing homepage data, never replaced.
// v = { cols, card, bg, align }  card: flat|bordered|elevated|glass|accent|outline  bg: plain|alt|dark|brand
const V = (id, name, v) => ({ id, name, ...v });
const T = (id, name, desc, variants) => ({ id, name, desc, variants });
export const SECTIONS = [
  T("features", "Feature Grid", "Benefits and capabilities.", [V("grid3", "Three-up", { cols: 3, card: "bordered", bg: "plain" }), V("icon-rows", "Icon Rows", { cols: 1, card: "flat", bg: "alt" }), V("bento", "Bento", { cols: 4, card: "elevated", bg: "plain", bento: 1 })]),
  T("services", "Service Cards", "What you offer.", [V("cards", "Cards", { cols: 3, card: "elevated", bg: "alt" }), V("numbered", "Numbered", { cols: 2, card: "outline", bg: "plain", numbered: 1 }), V("tiles", "Colour Tiles", { cols: 4, card: "accent", bg: "plain" })]),
  T("testimonials", "Testimonials", "Social proof.", [V("trio", "Quote Trio", { cols: 3, card: "bordered", bg: "alt" }), V("spotlight", "Spotlight Quote", { cols: 1, card: "flat", bg: "dark", align: "center" }), V("wall", "Wall", { cols: 4, card: "glass", bg: "brand" })]),
  T("stats", "Statistics", "Numbers that matter.", [V("band", "Band", { cols: 4, card: "flat", bg: "brand", align: "center" }), V("cards", "Cards", { cols: 4, card: "elevated", bg: "plain", align: "center" }), V("split", "Large Split", { cols: 2, card: "flat", bg: "dark" })]),
  T("pricing", "Pricing", "Plans and tiers.", [V("three", "Three Tier", { cols: 3, card: "bordered", bg: "alt", align: "center" }), V("compare", "Feature Compare", { cols: 3, card: "outline", bg: "plain" }), V("highlight", "Highlight Plan", { cols: 3, card: "elevated", bg: "dark", align: "center" })]),
  T("gallery", "Image Gallery", "Photography and work.", [V("masonry", "Masonry", { cols: 4, card: "flat", bg: "plain", masonry: 1 }), V("grid", "Even Grid", { cols: 3, card: "flat", bg: "plain" }), V("filmstrip", "Filmstrip", { cols: 5, card: "flat", bg: "dark", strip: 1 })]),
  T("editorial", "Editorial Layout", "Long-form story blocks.", [V("lead-side", "Lead + Side", { cols: 3, card: "flat", bg: "plain", lead: 1 }), V("columns", "Columns", { cols: 3, card: "flat", bg: "plain", rule: 1 }), V("feature-story", "Feature Story", { cols: 2, card: "flat", bg: "alt" })]),
  T("casino-listings", "Casino Listings", "Ranked casino cards.", [V("cards", "Cards", { cols: 3, card: "elevated", bg: "plain" }), V("rows", "Ranked Rows", { cols: 1, card: "bordered", bg: "plain" }), V("compact", "Compact", { cols: 1, card: "flat", bg: "alt" })]),
  T("comparison", "Comparison Table", "Side by side.", [V("table", "Classic Table", { cols: 1, card: "bordered", bg: "plain" }), V("zebra", "Zebra", { cols: 1, card: "flat", bg: "alt" }), V("cards", "Stacked Cards", { cols: 3, card: "elevated", bg: "plain" })]),
  T("reviews", "Review Summary", "Scores and verdicts.", [V("scorecard", "Scorecard", { cols: 2, card: "bordered", bg: "plain" }), V("pros-cons", "Pros & Cons", { cols: 2, card: "outline", bg: "alt" }), V("rating-strip", "Rating Strip", { cols: 4, card: "flat", bg: "brand", align: "center" })]),
  T("news", "News Layout", "Articles and headlines.", [V("lead-list", "Lead + List", { cols: 3, card: "flat", bg: "plain", lead: 1 }), V("grid", "Card Grid", { cols: 3, card: "elevated", bg: "alt" }), V("ticker-rows", "Ticker Rows", { cols: 1, card: "flat", bg: "plain", rule: 1 })]),
  T("cta", "CTA Banner", "Call to action.", [V("band", "Colour Band", { cols: 1, card: "flat", bg: "brand", align: "center" }), V("split", "Split Card", { cols: 2, card: "elevated", bg: "plain" }), V("outline", "Outlined", { cols: 1, card: "outline", bg: "dark", align: "center" })]),
  T("newsletter", "Newsletter", "Email capture.", [V("inline", "Inline", { cols: 2, card: "flat", bg: "alt" }), V("card", "Floating Card", { cols: 1, card: "elevated", bg: "plain", align: "center" }), V("dark", "Dark Band", { cols: 1, card: "glass", bg: "dark", align: "center" })]),
  T("footer", "Footer", "Site footer designs.", [V("columns", "Columns", { cols: 4, card: "flat", bg: "dark" }), V("centered", "Centred", { cols: 1, card: "flat", bg: "alt", align: "center" }), V("big-brand", "Big Brand", { cols: 3, card: "flat", bg: "brand" })]),
];
export const SECTION_TYPE_IDS = SECTIONS.map((s) => s.id);
export const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));
export const sectionVariantIds = (typeId) => (SECTION_BY_ID.get(typeId)?.variants || []).map((v) => v.id);
