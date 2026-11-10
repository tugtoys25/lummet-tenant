// Library 3: Header Studio. 25 headers built from 11 structural families (the markup differs) plus surface/shape skins (the look differs).
// "over: true" headers sit on top of the hero so header and hero read as one composition. Mobile uses a menu button below 760px.
import { esc } from "./util.js";

const H = (id, label, desc, family, skin, extra = {}) => ({ id, label, desc, family, skin, over: false, tags: [], ...extra });

export const HEADERS = [
  H("classic-bar", "Classic horizontal", "Logo left, links centre-right, solid bar with a hairline.", "bar", "solid", { tags: ["classic"] }),
  H("minimal-flat", "Minimal flat", "No border, no shadow, generous air.", "bar", "flat", { tags: ["minimal", "flat"] }),
  H("hero-connected", "Connected to hero", "Shares the hero background with no visible edge.", "bar", "connected", { over: true, tags: ["connected", "flat"] }),
  H("transparent-over", "Transparent over image", "Clear navigation floating on the hero picture.", "bar", "transparent", { over: true, tags: ["transparent", "connected"] }),
  H("floating-pill", "Floating rounded", "A rounded bar floating inside the hero.", "floating", "pill", { over: true, tags: ["floating", "rounded"] }),
  H("brand-solid", "Full-width colour", "Bold full-width brand colour bar.", "bar", "brand", { tags: ["colour"] }),
  H("dark-luxury", "Dark luxury", "Black bar, gold hairline, spaced capitals.", "bar", "luxury", { tags: ["luxury", "dark"] }),
  H("glass", "Glassmorphism", "Frosted glass over the hero.", "bar", "glass", { over: true, tags: ["glass", "connected"] }),
  H("split-centre", "Split with centred logo", "Links either side of a central logo.", "split", "solid", { tags: ["split", "centred"] }),
  H("logo-left-right", "Logo left, links right", "Everything pushed to the edges.", "bar", "edge", { tags: ["classic"] }),
  H("centre-stack", "Centred logo, links below", "Logo on top, links in a row underneath.", "center", "solid", { tags: ["centred"] }),
  H("two-row", "Two-row corporate", "Utility strip above the main navigation.", "tworow", "corp", { tags: ["corporate"] }),
  H("announce-nav", "Announcement + navigation", "Promo strip on top of a clean bar.", "announce", "solid", { tags: ["promo"] }),
  H("mega-menu", "Mega-menu", "Wide dropdown panel with grouped links.", "mega", "solid", { tags: ["mega"] }),
  H("sidebar-rail", "Sidebar navigation", "A vertical rail down the left side.", "sidebar", "rail", { tags: ["sidebar"] }),
  H("asymmetric", "Asymmetrical", "Offset logo block with a staggered link row.", "bar", "asym", { tags: ["asymmetric"] }),
  H("angled", "Angled / trapezoid", "A bar with slanted ends.", "bar", "angled", { tags: ["angled"] }),
  H("round-bottom", "Rounded bottom", "Soft curved lower edge.", "bar", "roundb", { tags: ["rounded"] }),
  H("wave-bottom", "Wave bottom", "Flowing wave under the bar.", "bar", "wave", { tags: ["curved"] }),
  H("compact-sticky", "Compact sticky", "Slim bar that stays with you.", "bar", "compact", { tags: ["sticky", "minimal"] }),
  H("search-forward", "Integrated search", "A wide search field is the centrepiece.", "search", "solid", { tags: ["search"] }),
  H("cta-forward", "Prominent call to action", "One loud button, quiet links.", "bar", "cta", { tags: ["cta"] }),
  H("editorial-masthead", "Editorial newspaper", "Date line, serif masthead, ruled section row.", "editorial", "paper", { tags: ["editorial", "news"] }),
  H("luxury-minimal", "Luxury minimal", "Centred wordmark, widely spaced links.", "center", "lux-min", { tags: ["luxury", "minimal"] }),
  H("gradient", "Modern gradient", "Brand gradient bar flowing into the hero.", "bar", "gradient", { over: true, tags: ["gradient", "connected"] }),
];
export const HEADER_IDS = HEADERS.map((h) => h.id);
export const getHeader = (id) => HEADERS.find((h) => h.id === id) || HEADERS[0];

const links = (nav, cls = "") => nav.map((n, i) => `<a href="#" class="${cls}${i === 0 ? " is-on" : ""}">${esc(n)}</a>`).join("");
const logo = (c) => `<a href="#" class="lds-logo"><span class="lds-mark" aria-hidden="true"></span><span class="lds-name">${esc(c.name)}</span></a>`;
const cta = (c, cls = "") => `<a href="#" class="lds-btn ${cls}">${esc(c.cta)}</a>`;
const burger = `<label class="lds-burger" for="lds-mm" aria-label="Menu"><span></span><span></span><span></span></label><input type="checkbox" id="lds-mm" class="lds-mm">`;
const search = (c) => `<label class="lds-search"><span class="lds-sr">Search</span><input type="search" placeholder="${esc(c.search)}" tabindex="-1"></label>`;

export function renderHeader(id, c) {
  const h = getHeader(id);
  const cls = `lds-h lds-f-${h.family} lds-k-${h.skin}${h.over ? " lds-over" : ""}`;
  const nav = c.nav;
  let inner;
  switch (h.family) {
    case "split": inner = `<nav class="lds-nav">${links(nav.slice(0, 2))}</nav>${logo(c)}<nav class="lds-nav lds-r">${links(nav.slice(2))}${cta(c)}</nav>`; break;
    case "center": inner = `${logo(c)}<nav class="lds-nav">${links(nav)}</nav>`; break;
    case "tworow": inner = `<div class="lds-top"><span>${esc(c.tagline)}</span><span><a href="#">Support</a><a href="#">Login</a></span></div><div class="lds-row">${logo(c)}<nav class="lds-nav">${links(nav)}</nav>${cta(c)}</div>`; break;
    case "announce": inner = `<div class="lds-top lds-promo"><span>${esc(c.promo)}</span><a href="#">${esc(c.cta)} &rarr;</a></div><div class="lds-row">${logo(c)}<nav class="lds-nav">${links(nav)}</nav>${search(c)}</div>`; break;
    case "mega": inner = `<div class="lds-row">${logo(c)}<nav class="lds-nav">${links(nav)}</nav>${cta(c)}</div><div class="lds-megapanel">${nav.slice(0, 3).map((n) => `<div><strong>${esc(n)}</strong><a href="#">Top picks</a><a href="#">Newest</a><a href="#">Guides</a></div>`).join("")}<div class="lds-megafeat"><strong>Featured</strong><span>${esc(c.tagline)}</span></div></div>`; break;
    case "sidebar": inner = `${logo(c)}<nav class="lds-nav">${links(nav)}</nav>${cta(c)}`; break;
    case "search": inner = `<div class="lds-row">${logo(c)}${search(c)}${cta(c)}</div><nav class="lds-nav lds-sub">${links(nav)}</nav>`; break;
    case "editorial": inner = `<div class="lds-dateline"><span>${esc(c.date)}</span><span>${esc(c.tagline)}</span><span>Sign in</span></div><div class="lds-masthead">${esc(c.name)}</div><nav class="lds-nav">${links(nav)}</nav>`; break;
    case "floating": inner = `<div class="lds-pillbar">${logo(c)}<nav class="lds-nav">${links(nav)}</nav>${cta(c)}</div>`; break;
    default: inner = `${logo(c)}<nav class="lds-nav">${links(nav)}</nav><div class="lds-act">${cta(c)}</div>`;
  }
  return `<header class="${cls}" data-header="${esc(h.id)}"><div class="lds-in">${inner}${h.family === "sidebar" ? "" : burger}</div></header>`;
}

// Layout CSS. Colours come only from the --p/--bg/... variables set by the theme; nothing here reads a user value.
export function headerCss() {
  return `
.lds-h{position:relative;z-index:5;font-family:var(--hf);color:var(--hdr-fg,var(--tx))}
.lds-in{max-width:var(--w);margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:24px;min-height:var(--hh,68px)}
.lds-logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;font-weight:800;font-size:1.15rem;letter-spacing:.2px}
.lds-mark{width:28px;height:28px;background:linear-gradient(135deg,var(--p),var(--p2));border-radius:var(--mk,8px);flex:none}
.lds-nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.lds-nav a{color:inherit;text-decoration:none;padding:8px 12px;border-radius:var(--br);font-size:.92rem;opacity:.82}.lds-nav a:hover,.lds-nav a.is-on{opacity:1}
.lds-nav a.is-on{box-shadow:inset 0 -2px 0 var(--p)}
.lds-btn{display:inline-block;background:var(--p);color:var(--btn);padding:10px 20px;border-radius:var(--br);font-weight:700;text-decoration:none;font-size:.9rem;white-space:nowrap}
.lds-act,.lds-r{margin-left:auto;display:flex;gap:10px;align-items:center}
.lds-f-bar .lds-nav{margin-left:auto}.lds-f-bar .lds-act{margin-left:0}
.lds-search input{background:rgba(127,127,127,.14);border:1px solid rgba(127,127,127,.3);color:inherit;border-radius:var(--br);padding:9px 14px;min-width:220px;font:inherit}
.lds-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.lds-burger{display:none;margin-left:auto;cursor:pointer;flex-direction:column;gap:5px;padding:10px}.lds-burger span{width:22px;height:2px;background:currentColor;display:block}
.lds-mm{position:absolute;opacity:0;pointer-events:none}
/* skins */
.lds-k-solid{background:var(--sf);border-bottom:1px solid var(--bd)}
.lds-k-flat{background:var(--bg)}.lds-k-flat .lds-in{min-height:76px}
.lds-k-connected{background:transparent}
.lds-k-transparent{background:transparent;color:#fff}
.lds-k-glass{background:rgba(255,255,255,.1);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.2);color:#fff}
.lds-k-brand{background:var(--p);color:var(--btn)}.lds-k-brand .lds-btn{background:var(--btn);color:var(--p)}
.lds-k-luxury{background:#0a0a0a;color:#f3e7c4;border-bottom:1px solid #b79a4b}.lds-k-luxury .lds-nav a{text-transform:uppercase;letter-spacing:.16em;font-size:.74rem}.lds-k-luxury .lds-btn{background:transparent;border:1px solid #b79a4b;color:#e6cd86}
.lds-k-edge .lds-in{max-width:none;padding:0 32px}
.lds-k-corp{background:var(--sf)}.lds-k-corp .lds-top{background:var(--tx);color:var(--bg);font-size:.78rem}
.lds-top{display:flex;justify-content:space-between;gap:16px;padding:7px max(20px,calc((100% - var(--w))/2));width:100%}
.lds-top a{color:inherit;margin-left:14px}
.lds-f-tworow .lds-in,.lds-f-announce .lds-in,.lds-f-search .lds-in,.lds-f-editorial .lds-in,.lds-f-mega .lds-in{display:block;padding:0;max-width:none}
.lds-row{max-width:var(--w);margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:24px;min-height:var(--hh,68px)}
.lds-row .lds-nav{margin-left:auto}.lds-f-announce .lds-row .lds-nav{margin-left:24px}.lds-f-announce .lds-search{margin-left:auto}
.lds-promo{background:linear-gradient(90deg,var(--p),var(--p2));color:var(--btn);font-weight:600;font-size:.82rem}
.lds-f-search .lds-search{flex:1}.lds-f-search .lds-search input{width:100%;padding:13px 20px;border-radius:999px}
.lds-sub{max-width:var(--w);margin:0 auto;padding:0 20px 10px}
.lds-f-split .lds-in{justify-content:space-between}.lds-f-split .lds-logo{font-size:1.5rem}.lds-f-split .lds-r{margin-left:0}
.lds-f-center .lds-in{flex-direction:column;gap:6px;padding:18px 20px 10px}.lds-f-center .lds-logo{font-size:1.5rem}.lds-f-center .lds-nav{justify-content:center}
.lds-k-lux-min{background:var(--bg)}.lds-k-lux-min .lds-logo{font-weight:400;letter-spacing:.42em;text-transform:uppercase;font-size:1.1rem}.lds-k-lux-min .lds-nav{gap:26px}.lds-k-lux-min .lds-nav a{letter-spacing:.2em;text-transform:uppercase;font-size:.7rem}.lds-k-lux-min .lds-mark{display:none}
.lds-f-floating{padding:18px 20px 0;background:transparent}.lds-f-floating .lds-in{padding:0}
.lds-pillbar{width:100%;display:flex;align-items:center;gap:20px;padding:8px 10px 8px 22px;background:rgba(255,255,255,.92);color:#111;border-radius:999px;box-shadow:0 14px 40px rgba(0,0,0,.25)}.lds-pillbar .lds-nav{margin-left:auto}
.lds-k-asym .lds-in{padding-left:0}.lds-k-asym .lds-logo{background:var(--p);color:var(--btn);padding:26px 34px 26px 28px;align-self:stretch;clip-path:polygon(0 0,100% 0,88% 100%,0 100%)}.lds-k-asym .lds-mark{background:var(--btn)}.lds-k-asym .lds-nav{margin-left:40px}.lds-k-asym .lds-nav a:nth-child(even){transform:translateY(7px)}
.lds-k-angled{background:var(--sf);clip-path:polygon(0 0,100% 0,100% 62%,97% 100%,3% 100%,0 62%);padding-bottom:6px;border:0}
.lds-k-roundb{background:var(--p);color:var(--btn);border-radius:0 0 34px 34px;box-shadow:0 12px 30px rgba(0,0,0,.18)}.lds-k-roundb .lds-btn{background:var(--btn);color:var(--p)}
.lds-k-wave{background:var(--sf);margin-bottom:36px}.lds-k-wave::after{content:"";position:absolute;left:0;right:0;bottom:-35px;height:36px;background:var(--sf);clip-path:polygon(0 0,100% 0,100% 30%,88% 62%,72% 85%,55% 70%,38% 48%,22% 60%,10% 82%,0 70%)}
.lds-k-compact{position:sticky;top:0;background:var(--sf);border-bottom:1px solid var(--bd);box-shadow:0 2px 12px rgba(0,0,0,.08)}.lds-k-compact .lds-in{min-height:48px}.lds-k-compact .lds-mark{width:20px;height:20px}.lds-k-compact .lds-nav a{padding:5px 10px;font-size:.84rem}.lds-k-compact .lds-btn{padding:6px 14px}
.lds-k-cta{background:var(--bg)}.lds-k-cta .lds-nav a{opacity:.6}.lds-k-cta .lds-btn{padding:14px 34px;font-size:1rem;box-shadow:0 10px 26px color-mix(in srgb,var(--p) 45%,transparent)}
.lds-k-gradient{background:linear-gradient(100deg,var(--p),var(--p2));color:var(--btn)}.lds-k-gradient .lds-btn{background:var(--btn);color:var(--p)}
.lds-k-paper{background:#f7f3ea;color:#1b1710;border-bottom:3px double #1b1710}
.lds-dateline{display:flex;justify-content:space-between;padding:7px max(20px,calc((100% - var(--w))/2));font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;border-bottom:1px solid #1b1710}
.lds-masthead{font-family:Georgia,'Times New Roman',serif;font-size:clamp(2rem,6vw,3.6rem);font-weight:900;text-align:center;padding:12px 0 6px;letter-spacing:-.5px}
.lds-f-editorial .lds-nav{justify-content:center;border-top:1px solid #1b1710;padding:4px 0}.lds-f-editorial .lds-nav a{text-transform:uppercase;letter-spacing:.12em;font-size:.76rem}
.lds-megapanel{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;max-width:var(--w);margin:0 auto;padding:18px 20px 22px;border-top:1px solid var(--bd)}.lds-megapanel div{display:flex;flex-direction:column;gap:6px;font-size:.86rem}.lds-megapanel a{color:inherit;opacity:.75;text-decoration:none}.lds-megafeat{background:linear-gradient(135deg,var(--p),var(--p2));color:var(--btn);padding:14px;border-radius:var(--cr)}
.lds-f-sidebar{position:absolute;left:0;top:0;bottom:0;width:210px;z-index:6;background:var(--sf);border-right:1px solid var(--bd)}.lds-f-sidebar .lds-in{flex-direction:column;align-items:stretch;padding:22px 16px;gap:18px;min-height:100%}.lds-f-sidebar .lds-nav{flex-direction:column;align-items:stretch}.lds-f-sidebar .lds-btn{text-align:center}
.lds-over{position:absolute;left:0;right:0;top:0}
.lds-stage{position:relative}
/* tablet and mobile */
@media(max-width:900px){.lds-search input{min-width:130px}.lds-megapanel{grid-template-columns:1fr 1fr}.lds-f-sidebar{position:relative;width:auto}}
@media(max-width:760px){
.lds-nav,.lds-act,.lds-r,.lds-search,.lds-sub{display:none}.lds-burger{display:flex}.lds-f-center .lds-burger,.lds-f-editorial .lds-burger{margin:0 auto}
.lds-mm:checked~*{}.lds-in:has(.lds-mm:checked) .lds-nav{display:flex;flex-direction:column;align-items:stretch;width:100%}
.lds-in:has(.lds-mm:checked){flex-wrap:wrap}.lds-pillbar{border-radius:28px;flex-wrap:wrap}
.lds-top span:last-child,.lds-megapanel{display:none}.lds-k-asym .lds-logo{padding:18px 26px 18px 20px}.lds-k-luxury .lds-nav a{letter-spacing:.1em}}
@media(prefers-reduced-motion:no-preference){.lds-nav a{transition:opacity .2s,box-shadow .2s}.lds-btn{transition:transform .2s}.lds-btn:hover{transform:translateY(-1px)}}
`;
}
