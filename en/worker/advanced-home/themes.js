// Advanced Homepage themes: a dedicated library, separate from Design Studio Pro's Themes. A theme only restyles the Advanced Homepage
// (its colours, section backgrounds, headings, bands and chips), never the header, footer or any other page.
// pal: p = accent, p2 = second accent, bg = page, sf = panels, tx = text, mu = muted text, bd = borders, btn = button text, ft = dark band.
// hf: heading font feel (display, serif, elegant, rounded, modern). br / cr: button / card corner radius. skin: layout layer from theme-skins.js.
export const ADVANCED_THEMES = [
  { id: "midnight-aurora", label: "Midnight Aurora", category: "Casino Affiliate", style: "Aurora", dark: true, skin: "aurora", hf: "display", br: "999px", cr: "20px",
    desc: "Deep midnight with violet and cyan aurora glow behind every section.",
    pal: {"p":"#8b5cf6","p2":"#22d3ee","bg":"#0b0b1a","sf":"#14142b","tx":"#f1f0ff","mu":"#a6a3cf","bd":"#26264a","btn":"#0b0b1a","ft":"#070712"} },
  { id: "gold-vault", label: "Gold Vault", category: "Casino Affiliate", style: "Dark luxury", dark: true, skin: "vault", hf: "elegant", br: "2px", cr: "4px",
    desc: "Black and antique gold with a fine grid, framed headings and a vault-dark newsletter band.",
    pal: {"p":"#e0b84f","p2":"#f6e7b4","bg":"#080808","sf":"#121212","tx":"#f6ecd0","mu":"#b9ad88","bd":"#2d2713","btn":"#120e02","ft":"#000000"} },
  { id: "emerald-table", label: "Emerald Table", category: "Casino Affiliate", style: "Classic", dark: true, skin: "felt", hf: "serif", br: "8px", cr: "12px",
    desc: "Deep felt green with brass-gold accents and centred section headings.",
    pal: {"p":"#10b981","p2":"#fbbf24","bg":"#071a14","sf":"#0e2a21","tx":"#ecfdf5","mu":"#97c9b6","bd":"#1b4a3a","btn":"#03130d","ft":"#04110c"} },
  { id: "ivory-ledger", label: "Ivory Ledger", category: "Reviews & Editorial", style: "Editorial", dark: false, skin: "ledger", hf: "serif", br: "4px", cr: "6px",
    desc: "Light ivory pages, small-caps section labels and hairline dividers. Calm and credible.",
    pal: {"p":"#9a3412","p2":"#1e293b","bg":"#fbf9f4","sf":"#ffffff","tx":"#1c1917","mu":"#6b6258","bd":"#e6dfd0","btn":"#ffffff","ft":"#1c1917"} },
  { id: "neon-noir", label: "Neon Noir", category: "Gaming & Esports", style: "Neon", dark: true, skin: "noir", hf: "display", br: "6px", cr: "10px",
    desc: "Near-black with magenta and cyan neon, a dot-matrix backdrop and outlined chips.",
    pal: {"p":"#ff3df0","p2":"#22e6ff","bg":"#07070c","sf":"#12121c","tx":"#f5f3ff","mu":"#a6a3c7","bd":"#262640","btn":"#12000f","ft":"#04040a"} },
  { id: "slate-pro", label: "Slate Pro", category: "Corporate Business", style: "Clean", dark: false, skin: "slate", hf: "modern", br: "8px", cr: "12px",
    desc: "Cool slate and indigo. Each section sits on a clean raised panel.",
    pal: {"p":"#4f46e5","p2":"#0ea5e9","bg":"#eef1f6","sf":"#ffffff","tx":"#0f172a","mu":"#475569","bd":"#d9deea","btn":"#ffffff","ft":"#0f172a"} },
  { id: "sunset-gradient", label: "Sunset Gradient", category: "Lifestyle & Entertainment", style: "Gradient", dark: false, skin: "sunset", hf: "rounded", br: "999px", cr: "22px",
    desc: "Warm coral to violet gradients, rounded chips and a glowing newsletter band.",
    pal: {"p":"#e11d48","p2":"#8b5cf6","bg":"#fff7f5","sf":"#ffffff","tx":"#2a1220","mu":"#74505f","bd":"#f4d9e0","btn":"#ffffff","ft":"#2a1220"} },
  { id: "arctic-glass", label: "Arctic Glass", category: "SaaS / Technology", style: "Glass", dark: false, skin: "frost", hf: "modern", br: "14px", cr: "22px",
    desc: "Light frosted glass over a pale blue wash. Panels float, text stays crisp.",
    pal: {"p":"#2563eb","p2":"#06b6d4","bg":"#f0f6ff","sf":"#ffffff","tx":"#0b1b33","mu":"#4a607f","bd":"#d3e0f3","btn":"#ffffff","ft":"#0b1b33"} },
  { id: "royal-purple", label: "Royal Purple", category: "Casino News & Magazine", style: "Regal", dark: true, skin: "royal", hf: "elegant", br: "999px", cr: "14px",
    desc: "Imperial purple with amber highlights, centred headings and a regal magazine cover.",
    pal: {"p":"#a855f7","p2":"#f59e0b","bg":"#120a1f","sf":"#1d1230","tx":"#f7f0ff","mu":"#b9a6d3","bd":"#34224f","btn":"#14081f","ft":"#0b0614"} },
  { id: "crimson-sport", label: "Crimson Sport", category: "Sports Betting Affiliate", style: "Bold", dark: false, skin: "sport", hf: "display", br: "4px", cr: "6px",
    desc: "White and crimson with angled bands, match-day bars and compact sections.",
    pal: {"p":"#dc2626","p2":"#111827","bg":"#f7f7f8","sf":"#ffffff","tx":"#0f1115","mu":"#555a66","bd":"#e0e1e6","btn":"#ffffff","ft":"#0f1115"} },
  { id: "desert-sand", label: "Desert Sand", category: "Lifestyle & Travel", style: "Warm", dark: false, skin: "sand", hf: "serif", br: "12px", cr: "18px",
    desc: "Sand, terracotta and olive. Soft raised panels and underlined headings.",
    pal: {"p":"#c2410c","p2":"#4d7c0f","bg":"#fbf5ea","sf":"#fffdf8","tx":"#2b1d10","mu":"#74634f","bd":"#eadcc3","btn":"#ffffff","ft":"#2b1d10"} },
  { id: "mono-ink", label: "Mono Ink", category: "Creative Portfolio", style: "Minimal", dark: false, skin: "ink", hf: "modern", br: "0", cr: "0",
    desc: "Pure black ink on white, small-caps labels, generous space and hairline rules.",
    pal: {"p":"#111111","p2":"#ef4444","bg":"#ffffff","sf":"#f5f5f5","tx":"#0a0a0a","mu":"#6b6b6b","bd":"#e5e5e5","btn":"#ffffff","ft":"#0a0a0a"} },
];
export const THEME_IDS = ADVANCED_THEMES.map((t) => t.id);
export const getAdvancedTheme = (id) => ADVANCED_THEMES.find((t) => t.id === id) || null;
