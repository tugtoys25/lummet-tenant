// LIBRARY 3 - HEADER STUDIO. Independent of Library 1 (theme_header_layout etc. are never read or written here).
// Every header has its own slot structure (rows) AND its own CSS block, so no two look alike. All CSS below is static
// and scoped to .ds-h--<id>; the only dynamic input is a handful of validated CSS variables (see css.js).
// Slots: logo, nav, navL, navR, search, cta, auth, announce, tagline, date, menu (mobile burger).

const H = (id, name, group, desc, rows, css, o = {}) => ({ id, name, group, desc, rows, css, overHero: !!o.overHero, sticky: o.sticky !== false, tags: o.tags || [] });

export const HEADERS = [
  H("classic-bar", "Classic Bar", "Flat", "Logo left, links right. The dependable horizontal bar.", [["logo", "nav", "auth", "menu"]],
    ".ds-h--classic-bar{background:var(--ds-surface);border-bottom:1px solid var(--ds-border)}.ds-h--classic-bar .ds-h__row{min-height:var(--ds-h-height,68px)}.ds-h--classic-bar nav{margin-left:auto}"),
  H("minimal-flat", "Minimal Flat", "Flat", "Hairline-only header with generous spacing and tiny caps links.", [["logo", "nav", "menu"]],
    ".ds-h--minimal-flat{background:transparent}.ds-h--minimal-flat .ds-h__row{min-height:var(--ds-h-height,84px)}.ds-h--minimal-flat nav a{font-size:12px;letter-spacing:.16em;text-transform:uppercase}.ds-h--minimal-flat nav{margin-left:auto}"),
  H("hero-fused", "Hero Fused", "Connected to hero", "No bottom edge: the header shares the hero background so both read as one canvas.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--hero-fused{background:transparent;border:0;position:absolute;inset:0 0 auto 0;z-index:5}.ds-h--hero-fused nav{margin-left:auto}.ds-h--hero-fused .ds-h__row{min-height:var(--ds-h-height,80px)}", { overHero: true }),
  H("transparent-overlay", "Transparent Overlay", "Connected to hero", "Clear navigation floating over a full-bleed hero image, light text.", [["logo", "nav", "search", "menu"]],
    ".ds-h--transparent-overlay{position:absolute;inset:0 0 auto 0;z-index:5;background:linear-gradient(180deg,rgba(0,0,0,.55),transparent);color:#fff}.ds-h--transparent-overlay a{color:#fff}.ds-h--transparent-overlay nav{margin-left:auto}", { overHero: true }),
  H("floating-pill", "Floating Pill", "Floating", "A rounded pill bar floating inside the hero with soft depth.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--floating-pill{position:absolute;top:18px;left:0;right:0;z-index:5;background:none}.ds-h--floating-pill .ds-h__row{background:var(--ds-surface);border-radius:999px;box-shadow:0 14px 40px rgba(0,0,0,.22);padding:8px 14px 8px 26px;max-width:min(1100px,94%)}.ds-h--floating-pill nav{margin:0 auto}", { overHero: true }),
  H("solid-brand", "Solid Brand Bar", "Flat", "Full-width bar in the brand colour with high-contrast links.", [["logo", "nav", "search", "auth", "menu"]],
    ".ds-h--solid-brand{background:var(--ds-primary);color:var(--ds-on-primary)}.ds-h--solid-brand a{color:var(--ds-on-primary)}.ds-h--solid-brand nav{margin-left:28px}.ds-h--solid-brand .ds-h__row{min-height:var(--ds-h-height,64px)}"),
  H("dark-luxury", "Dark Luxury", "Luxury", "Near-black bar, gold hairline and widely tracked serif links.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--dark-luxury{background:#0b0b0d;color:#f3ead2;border-bottom:1px solid var(--ds-accent)}.ds-h--dark-luxury a{color:#f3ead2;font-family:var(--ds-font-heading);letter-spacing:.14em;text-transform:uppercase;font-size:12px}.ds-h--dark-luxury nav{margin:0 auto}"),
  H("glass", "Glassmorphism", "Glass", "Frosted translucent bar that blurs the page behind it.", [["logo", "nav", "auth", "menu"]],
    ".ds-h--glass{background:rgba(255,255,255,.12);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border-bottom:1px solid rgba(255,255,255,.25);color:var(--ds-fg)}.ds-h--glass nav{margin-left:auto}", { overHero: true }),
  H("split-center", "Split Nav, Centred Logo", "Split", "Links on both sides of a centred logo.", [["navL", "logo", "navR", "menu"]],
    ".ds-h--split-center{background:var(--ds-surface);border-bottom:1px solid var(--ds-border)}.ds-h--split-center .ds-h__row{display:grid;grid-template-columns:1fr auto 1fr;gap:28px;min-height:var(--ds-h-height,78px)}.ds-h--split-center navL{justify-self:end}"),
  H("logo-left-right-nav", "Logo Left, Nav Right", "Flat", "Compact brand block left, links and a button right.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--logo-left-right-nav{background:var(--ds-surface);box-shadow:0 1px 0 var(--ds-border)}.ds-h--logo-left-right-nav nav{margin-left:auto}"),
  H("centered-stacked", "Centred Logo, Nav Below", "Centred", "Large centred logo with the menu on its own line.", [["logo"], ["nav", "menu"]],
    ".ds-h--centered-stacked{background:var(--ds-surface);text-align:center}.ds-h--centered-stacked .ds-h__row{justify-content:center}.ds-h--centered-stacked .ds-h__row--0{padding:22px 0 6px}.ds-h--centered-stacked .ds-h__row--1{border-top:1px solid var(--ds-border);min-height:48px}"),
  H("two-row-corporate", "Two-Row Corporate", "Corporate", "Utility strip with contact and login above the main navigation.", [["tagline", "auth"], ["logo", "nav", "cta", "menu"]],
    ".ds-h--two-row-corporate{background:var(--ds-surface)}.ds-h--two-row-corporate .ds-h__row--0{background:var(--ds-primary);color:var(--ds-on-primary);font-size:12px;min-height:34px;justify-content:space-between}.ds-h--two-row-corporate .ds-h__row--0 a{color:var(--ds-on-primary)}.ds-h--two-row-corporate .ds-h__row--1{min-height:72px}.ds-h--two-row-corporate nav{margin-left:auto}"),
  H("announce-nav", "Announcement + Nav", "Corporate", "Promo strip above a clean navigation row.", [["announce"], ["logo", "nav", "cta", "menu"]],
    ".ds-h--announce-nav{background:var(--ds-surface)}.ds-h--announce-nav .ds-h__row--0{background:linear-gradient(90deg,var(--ds-primary),var(--ds-accent));color:var(--ds-on-primary);justify-content:center;min-height:36px;font-size:13px;font-weight:600}.ds-h--announce-nav nav{margin-left:auto}"),
  H("mega-menu", "Mega Menu", "Mega", "Wide hover panel with grouped links under each top item.", [["logo", "nav", "search", "cta", "menu"]],
    ".ds-h--mega-menu{background:var(--ds-surface);border-bottom:1px solid var(--ds-border)}.ds-h--mega-menu nav{margin-left:24px}.ds-h--mega-menu nav a:hover::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--ds-accent)}.ds-h--mega-menu nav a{position:relative;padding:26px 14px}", { tags: ["mega"] }),
  H("sidebar-rail", "Sidebar Rail", "Sidebar", "Slim vertical rail on desktop that becomes a top bar on mobile.", [["logo", "nav", "cta", "menu"]],
    "@media(min-width:1024px){.ds-h--sidebar-rail{position:fixed;inset:0 auto 0 0;width:92px;background:var(--ds-surface);border-right:1px solid var(--ds-border);z-index:20}.ds-h--sidebar-rail .ds-h__row{flex-direction:column;height:100%;padding:22px 0;gap:22px;max-width:none}.ds-h--sidebar-rail nav{flex-direction:column;margin:0}.ds-h--sidebar-rail nav a{writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px;letter-spacing:.12em}.ds-h-offset-sidebar{padding-left:92px}}.ds-h--sidebar-rail{background:var(--ds-surface)}"),
  H("asymmetric", "Asymmetric", "Asymmetric", "Off-centre logo block with a tilted accent tab and offset links.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--asymmetric{background:var(--ds-surface)}.ds-h--asymmetric .ds-h__logo{background:var(--ds-primary);color:var(--ds-on-primary);padding:22px 40px 22px 26px;clip-path:polygon(0 0,100% 0,88% 100%,0 100%);margin-right:auto}.ds-h--asymmetric nav{margin-right:26px}"),
  H("angled-trapezoid", "Angled Trapezoid", "Angled", "Bar whose lower edge is cut at an angle.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--angled-trapezoid{background:var(--ds-primary);color:var(--ds-on-primary);clip-path:polygon(0 0,100% 0,100% 62%,92% 100%,8% 100%,0 62%);padding-bottom:18px}.ds-h--angled-trapezoid a{color:var(--ds-on-primary)}.ds-h--angled-trapezoid nav{margin-left:auto}"),
  H("rounded-bottom", "Rounded Bottom", "Rounded", "Soft rounded lower corners that sit like a tray.", [["logo", "nav", "auth", "menu"]],
    ".ds-h--rounded-bottom{background:var(--ds-surface);border-radius:0 0 var(--ds-radius-lg,28px) var(--ds-radius-lg,28px);box-shadow:0 10px 30px rgba(0,0,0,.12)}.ds-h--rounded-bottom nav{margin-left:auto}"),
  H("wave-bottom", "Wave Bottom", "Curved", "Brand-coloured header ending in an SVG-style wave edge.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--wave-bottom{background:var(--ds-primary);color:var(--ds-on-primary);padding-bottom:30px;-webkit-mask:radial-gradient(60px 22px at 50% 100%,transparent 98%,#000) 0 100%/120px 100% repeat-x,linear-gradient(#000,#000) 0 0/100% calc(100% - 22px) no-repeat;mask:radial-gradient(60px 22px at 50% 100%,transparent 98%,#000) 0 100%/120px 100% repeat-x,linear-gradient(#000,#000) 0 0/100% calc(100% - 22px) no-repeat}.ds-h--wave-bottom a{color:var(--ds-on-primary)}.ds-h--wave-bottom nav{margin-left:auto}"),
  H("compact-sticky", "Compact Sticky", "Sticky", "Slim 52px bar that stays put and tightens on scroll.", [["logo", "nav", "search", "menu"]],
    ".ds-h--compact-sticky{background:var(--ds-surface);border-bottom:1px solid var(--ds-border);position:sticky;top:0;z-index:30}.ds-h--compact-sticky .ds-h__row{min-height:52px}.ds-h--compact-sticky nav{margin-left:auto;font-size:13px}"),
  H("search-forward", "Search Forward", "Search", "Wide integrated search field is the centrepiece.", [["logo", "search", "auth", "menu"], ["nav"]],
    ".ds-h--search-forward{background:var(--ds-surface)}.ds-h--search-forward .ds-h__search{flex:1;max-width:560px;margin:0 auto}.ds-h--search-forward .ds-h__row--1{border-top:1px solid var(--ds-border);min-height:44px;font-size:13px}"),
  H("cta-focused", "CTA Focused", "CTA", "Minimal links, one large high-contrast action button.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--cta-focused{background:var(--ds-surface)}.ds-h--cta-focused .ds-h__cta{padding:14px 30px;font-size:15px;font-weight:800;box-shadow:0 8px 24px color-mix(in srgb,var(--ds-primary) 45%,transparent)}.ds-h--cta-focused nav{margin-left:auto;margin-right:20px}"),
  H("editorial-masthead", "Editorial Masthead", "Editorial", "Newspaper masthead: date rule, giant serif title, section links.", [["date", "tagline"], ["logo"], ["nav", "menu"]],
    ".ds-h--editorial-masthead{background:var(--ds-surface);text-align:center;border-bottom:3px double var(--ds-fg)}.ds-h--editorial-masthead .ds-h__row--0{font-size:11px;letter-spacing:.14em;text-transform:uppercase;justify-content:space-between;border-bottom:1px solid var(--ds-border);min-height:32px}.ds-h--editorial-masthead .ds-h__logo{font:900 clamp(30px,6vw,56px)/1 var(--ds-font-heading)}.ds-h--editorial-masthead .ds-h__row--1{justify-content:center;padding:10px 0}.ds-h--editorial-masthead .ds-h__row--2{justify-content:center;border-top:1px solid var(--ds-fg);min-height:42px}"),
  H("luxury-minimal", "Luxury Minimal", "Luxury", "Centred wordmark, whisper-thin links, vast negative space.", [["nav", "logo", "search", "menu"]],
    ".ds-h--luxury-minimal{background:var(--ds-surface)}.ds-h--luxury-minimal .ds-h__row{display:grid;grid-template-columns:1fr auto 1fr;min-height:var(--ds-h-height,96px)}.ds-h--luxury-minimal nav a{font-weight:300;letter-spacing:.22em;text-transform:uppercase;font-size:11px}.ds-h--luxury-minimal .ds-h__logo{font:300 22px var(--ds-font-heading);letter-spacing:.4em;text-transform:uppercase}"),
  H("gradient-modern", "Modern Gradient", "Gradient", "Diagonal two-tone gradient with a glowing CTA.", [["logo", "nav", "cta", "menu"]],
    ".ds-h--gradient-modern{background:linear-gradient(110deg,var(--ds-primary),var(--ds-accent));color:var(--ds-on-primary)}.ds-h--gradient-modern a{color:var(--ds-on-primary)}.ds-h--gradient-modern nav{margin-left:auto}.ds-h--gradient-modern .ds-h__cta{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.5)}"),
];

export const HEADER_IDS = HEADERS.map((h) => h.id);
export const HEADER_BY_ID = new Map(HEADERS.map((h) => [h.id, h]));
