// Card Studio (Design Studio Pro, library 5).
// One look for EVERY card the site draws: casino and sportsbook listings (.casino-card), news, generic content-type cards from Component Studio
// (.cg-card), review cards, update, research, feature and component cards. It is CSS only: the site's own card markup, links, ratings,
// bonuses and buttons are untouched, so every content type keeps working. Stored as one setting (prostudio_cards = {id, custom}) that is
// independent of the theme / header / hero choice.
import { cleanHex } from "./util.js";

export const CARD_ROOTS = [".casino-card", ".cg-card", ".rv-card", ".review-block-card", ".news-card", ".update-card", ".research-card", ".feature-card", ".content-card", ".component-card"];
const TITLES = [".casino-card__name", ".casino-card__body > h3", ".cg-card__title", ".cg-card__title a", ".rv-card__body h3", ".news-card h3", ".update-card h3", ".research-card__title", ".feature-card h3", ".content-card h3", ".component-card h3"];
const BODIES = [".casino-card__body", ".cg-card__body", ".rv-card__body", ".update-card-body"];
const PAD_BOXES = [".news-card", ".feature-card", ".research-card", ".content-card", ".component-card"];
const SOFT = "0 2px 8px rgba(15,23,42,.08)", LIFT = "0 14px 34px rgba(15,23,42,.18)", NONE = "none", DEEP = "0 20px 50px rgba(15,23,42,.22)";

// v: bg, fg, title, bd, bw, r, sh, shh (hover shadow), hov (hover transform), acc (accent), dark, tf (title font), extra(A, P)
const C = (id, label, category, style, desc, v, o = {}) => ({ id, label, category, style, desc, v: { bg: "#ffffff", fg: "#0f172a", title: "#0f172a", bd: "#e2e8f0", bw: "1px", r: "14px", sh: SOFT, shh: LIFT, hov: "translateY(-4px)", acc: "", dark: false, tf: "", br: "", ...v }, extra: o.extra || null, featured: !!o.f, popular: !!o.p, added: o.added || 12 });

export const CARDS = [
  C("classic-lift", "Classic Lift", "Universal", "Clean", "White cards with a soft shadow that lifts on hover. A safe default for any content type.", {}, { f: 1, p: 1 }),
  C("flat-outline", "Flat Outline", "Universal", "Clean", "No shadow, a crisp outline that turns to your brand colour on hover.", { bd: "#cbd5e1", bw: "1.5px", r: "10px", sh: NONE, shh: "0 0 0 1px var(--dc-acc)", hov: "none" }, { p: 1, extra: (A) => `${A}:hover{border-color:var(--dc-acc)!important}` }),
  C("soft-pastel", "Soft Pastel", "Universal", "Soft", "A faint tint of your brand colour behind every card, no border.", { bg: "#f4f7ff", bd: "transparent", bw: "0", r: "18px", sh: "0 6px 18px rgba(15,23,42,.06)" }, { extra: (A, P) => `@supports (background:color-mix(in srgb,red,blue)){${P}{--dc-bg:color-mix(in srgb,var(--dc-acc) 8%,#ffffff)}}` }),
  C("top-accent", "Top Accent", "Universal", "Clean", "A thick brand-colour bar across the top of each card.", { r: "12px" }, { f: 1, extra: (A) => `${A}{border-top:4px solid var(--dc-acc)!important}` }),
  C("left-accent", "Left Accent", "Universal", "Clean", "A bold brand-colour stripe down the left edge. Reads like a ranked list.", { r: "10px" }, { extra: (A) => `${A}{border-left:6px solid var(--dc-acc)!important}` }),
  C("ticket", "Ticket", "Universal", "Playful", "Dashed ticket-style border, great for bonuses and offers.", { bd: "var(--dc-acc)", bw: "2px", r: "10px", sh: NONE, shh: SOFT, hov: "none" }, { extra: (A) => `${A}{border-style:dashed!important}` }),
  C("minimal-line", "Minimal Line", "Editorial", "Minimal", "No box at all: just a clean rule under each card. Lets content breathe.", { bg: "transparent", fg: "inherit", title: "inherit", bd: "#cbd5e1", bw: "0", r: "0", sh: NONE, shh: NONE, hov: "none" }, { extra: (A) => `${A}{border-bottom:2px solid var(--dc-bd)!important;padding-bottom:18px}` }),
  C("magazine", "Magazine", "Editorial", "Editorial", "Square corners, a heavy top rule and serif headlines.", { bd: "#e5e5e5", r: "0", sh: NONE, shh: SOFT, hov: "none", tf: "Georgia,'Times New Roman',serif" }, { extra: (A) => `${A}{border-top:5px solid #111!important}` }),
  C("pill-soft", "Soft Pill", "Universal", "Playful", "Very round corners and a gentle shadow. Friendly and modern.", { bd: "transparent", bw: "0", r: "28px", br: "999px" }),
  C("brutalist", "Brutalist", "Universal", "Bold", "Thick black outline with a hard offset shadow. Loud and unforgettable.", { bd: "#111111", bw: "3px", r: "0", sh: "6px 6px 0 #111111", shh: "3px 3px 0 #111111", hov: "translate(3px,3px)", br: "0" }),
  C("paper", "Paper", "Editorial", "Warm", "Warm off-white stock with a double rule, like a printed page.", { bg: "#fbf7ee", fg: "#2b2417", title: "#2b2417", bd: "#2b2417", bw: "4px", r: "4px", sh: NONE, shh: SOFT, hov: "none", tf: "Georgia,'Times New Roman',serif" }, { extra: (A) => `${A}{border-style:double!important}` }),
  C("glow-hover", "Glow Hover", "Universal", "Modern", "Quiet until you hover: then a brand-colour ring and glow.", { sh: SOFT, shh: "0 0 0 2px var(--dc-acc),0 12px 34px rgba(15,23,42,.2)", hov: "translateY(-2px)" }),
  C("gradient-border", "Gradient Border", "Universal", "Modern", "A two-colour gradient edge drawn from your brand colours.", { bw: "2px", bd: "transparent", r: "16px" }, { extra: (A) => `${A}{background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--dc-acc),var(--theme-secondary,#0ea5e9)) border-box!important}` }),
  C("floating-deep", "Floating Deep", "Universal", "Modern", "Large, soft, deep shadows. Cards seem to float above the page.", { bd: "transparent", bw: "0", r: "20px", sh: DEEP, shh: "0 28px 60px rgba(15,23,42,.3)", hov: "translateY(-6px)" }),
  C("dark-premium", "Dark Premium", "Casino", "Dark", "Near-black cards with light text and a brand-colour accent. Premium casino feel.", { bg: "#0f1218", fg: "#e8ecf4", title: "#ffffff", bd: "#232a38", dark: true, sh: "0 10px 30px rgba(0,0,0,.45)", shh: "0 18px 44px rgba(0,0,0,.6)" }, { f: 1, p: 1 }),
  C("neon-edge", "Neon Edge", "Casino", "Dark", "Midnight navy with a neon-green edge and glow. Made for online casinos.", { bg: "#0a1026", fg: "#dbe7ff", title: "#ffffff", bd: "#22e08a", acc: "#22e08a", dark: true, r: "12px", sh: "0 0 0 1px rgba(34,224,138,.5),0 0 22px rgba(34,224,138,.22)", shh: "0 0 0 1px #22e08a,0 0 34px rgba(34,224,138,.4)", hov: "translateY(-3px)" }, { p: 1 }),
  C("sportsbook-board", "Sportsbook Board", "Sportsbook", "Dark", "Dark odds-board look with a red stripe and tight, upper-case headings.", { bg: "#12141a", fg: "#e5e7ee", title: "#ffffff", bd: "#262a33", acc: "#ff2d55", dark: true, r: "8px", sh: "0 6px 20px rgba(0,0,0,.4)", shh: "0 12px 30px rgba(0,0,0,.55)", hov: "translateY(-2px)" }, { f: 1, p: 1, extra: (A) => `${A}{border-left:6px solid var(--dc-acc)!important}` }),
  C("glass-dark", "Glass Dark", "Universal", "Dark", "Smoked glass panels. Works over photos and gradients.", { bg: "rgba(15,23,42,.78)", fg: "#f1f5f9", title: "#ffffff", bd: "rgba(255,255,255,.2)", dark: true, r: "18px", sh: "0 10px 34px rgba(0,0,0,.3)", shh: "0 18px 44px rgba(0,0,0,.42)" }, { extra: (A) => `${A}{-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}` }),
  C("gold-luxe", "Gold Luxe", "Casino", "Luxury", "Black cards, gold rules and serif headlines for VIP and high-roller brands.", { bg: "#0b0b0b", fg: "#efe6cf", title: "#f5d98a", bd: "#b79a4b", acc: "#d7b85d", dark: true, r: "2px", sh: "0 12px 30px rgba(0,0,0,.5)", shh: "0 18px 44px rgba(183,154,75,.25)", tf: "Georgia,'Times New Roman',serif", hov: "translateY(-3px)" }),
  C("scoreboard", "Scoreboard", "Sportsbook", "Dark", "Deep-blue scoreboard panels with monospace figures.", { bg: "#0b1220", fg: "#cfe3ff", title: "#ffffff", bd: "#1e3a8a", acc: "#38bdf8", dark: true, r: "6px", sh: "0 8px 24px rgba(0,0,0,.4)", shh: "0 14px 34px rgba(30,58,138,.5)", tf: "ui-monospace,SFMono-Regular,Menlo,monospace" }, { extra: (A) => `${A}{border-top:3px solid var(--dc-acc)!important}` }),
  C("row-list", "Ranked Rows", "Casino", "Layout", "Casino cards become wide rows (logo, offer and button side by side) on desktop. Best for top-10 lists.", { r: "12px", hov: "translateY(-2px)" }, { f: 1, extra: (A, P) => `@media(min-width:900px){${P} .casino-grid{grid-template-columns:1fr!important}${P} .casino-card{display:grid!important;grid-template-columns:minmax(280px,340px) 1fr auto;align-items:center;column-gap:24px}${P} .casino-card__header{margin:0}${P} .casino-card__actions{flex-direction:column;min-width:150px}}` }),
  C("compact-dense", "Compact", "Universal", "Layout", "Tighter padding and smaller headings to fit more cards on screen.", { r: "8px", sh: "0 1px 4px rgba(15,23,42,.1)", shh: SOFT, hov: "none" }, { extra: (A) => `${A}{font-size:.94em}` }),
  C("roomy-showcase", "Roomy Showcase", "Universal", "Layout", "Generous padding, larger radius and bigger titles. Good for a few featured items.", { r: "24px", sh: "0 10px 30px rgba(15,23,42,.12)" }, { extra: (A) => `${A}{font-size:1.04em}` }),
  C("rank-badge", "Rank Badge", "Casino", "Layout", "A bold brand-colour number badge on each casino in a ranked list.", { r: "14px" }, { extra: (A, P) => `${P} .casino-card{overflow:visible}${P} .casino-card__number{position:absolute!important;top:-12px!important;left:-12px!important;width:40px!important;height:40px!important;border-radius:50%!important;background:var(--dc-acc)!important;color:var(--dc-accfg)!important;display:flex!important;align-items:center;justify-content:center;font-weight:800;font-size:1.05rem;box-shadow:0 6px 14px rgba(0,0,0,.25);z-index:3}` }),
];

export const CARD_IDS = CARDS.map((c) => c.id);
export const CARD_CATEGORIES = [...new Set(CARDS.map((c) => c.category))];
export const getCard = (id) => CARDS.find((c) => c.id === id) || null;

const SHADOWS = { none: ["none", "none"], soft: [SOFT, LIFT], deep: [DEEP, "0 28px 60px rgba(15,23,42,.3)"] };
const PADS = { compact: "12px", cozy: "20px", roomy: "30px" };
const int = (v, lo, hi) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const oneOf = (v, list) => (list.includes(v) ? v : null);

// Allow-listed customisation, like the rest of the studio: unknown keys are dropped, bad values rejected.
export function cleanCardCustom(input) {
  const o = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {}; const errors = [];
  if (o.acc !== undefined && o.acc !== "") { const h = cleanHex(o.acc); if (h) out.acc = h; else errors.push("Accent colour is not valid."); }
  if (o.r !== undefined && o.r !== "") { const n = int(o.r, 0, 40); if (n === null) errors.push("Corner radius is not valid."); else out.r = n; }
  if (o.sh !== undefined && o.sh !== "") { const s = oneOf(o.sh, Object.keys(SHADOWS)); if (!s) errors.push("Shadow is not valid."); else out.sh = s; }
  if (o.pad !== undefined && o.pad !== "") { const s = oneOf(o.pad, Object.keys(PADS)); if (!s) errors.push("Spacing is not valid."); else out.pad = s; }
  if (o.lift !== undefined && o.lift !== "") { if (o.lift === 0 || o.lift === 1 || o.lift === "0" || o.lift === "1") out.lift = Number(o.lift); else errors.push("Hover effect is not valid."); }
  return { clean: out, errors };
}

// Validates a body.cards = {id, custom}. id "" removes the card style.
export function validateCardsInput(cards) {
  if (cards === null) return { value: "", errors: [] };
  if (!cards || typeof cards !== "object" || Array.isArray(cards)) return { value: null, errors: ["Cards must be an object."] };
  if (cards.id !== "" && !CARD_IDS.includes(cards.id)) return { value: null, errors: ["Unknown card style."] };
  if (cards.id === "") return { value: "", errors: [] };
  const r = cleanCardCustom(cards.custom);
  return { value: JSON.stringify({ id: cards.id, custom: r.clean }), errors: r.errors };
}

export function parseCards(raw) {
  let v = null; try { v = JSON.parse(raw || "null"); } catch { v = null; }
  if (!v || typeof v !== "object" || !CARD_IDS.includes(v.id)) return null;
  return { id: v.id, custom: cleanCardCustom(v.custom).clean };
}

const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return 0.3; const n = parseInt(m[1], 16); const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; };
const onAccent = (hex) => (lum(hex) > 0.4 ? "#0f172a" : "#ffffff");

// The CSS for one card style. `scope` is the selector everything hangs from: "body.dsp-cards" on the live site and in the preview,
// or a per-card class for gallery thumbnails.
export function cardsCss(sel, scope = "body.dsp-cards") {
  const card = sel && getCard(sel.id); if (!card) return "";
  const x = cleanCardCustom(sel.custom).clean; const v = card.v; const P = scope;
  const A = CARD_ROOTS.map((r) => `${P} ${r}`).join(",");
  const acc = x.acc || v.acc || "var(--primary,#2563eb)";
  const accfg = x.acc ? onAccent(x.acc) : v.acc && /^#/.test(v.acc) ? onAccent(v.acc) : "var(--theme-button-text,#ffffff)";
  const sh = x.sh ? SHADOWS[x.sh] : [v.sh, v.shh];
  const lift = x.lift === 0 ? "none" : v.hov;
  const vars = `--dc-bg:${v.bg};--dc-fg:${v.fg};--dc-title:${v.title};--dc-bd:${v.bd};--dc-bw:${v.bw};--dc-r:${x.r !== undefined ? x.r + "px" : v.r};--dc-sh:${sh[0]};--dc-shh:${sh[1]};--dc-hov:${lift};--dc-acc:${acc};--dc-accfg:${accfg}`;
  const t = (list, decl) => list.map((s) => `${P} ${s}`).join(",") + `{${decl}}`;
  let css = `${P}{${vars}}`;
  css += `${A}{background:var(--dc-bg)!important;color:var(--dc-fg)!important;border:var(--dc-bw) solid var(--dc-bd)!important;border-radius:var(--dc-r)!important;box-shadow:var(--dc-sh)!important;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}`;
  css += CARD_ROOTS.map((r) => `${P} ${r}:hover`).join(",") + `{box-shadow:var(--dc-shh)!important;transform:var(--dc-hov)}`;
  css += t(TITLES, `color:var(--dc-title)!important${v.tf ? `;font-family:${v.tf}` : ""}`);
  // Buttons inside cards take the accent (primary) and an outlined version of it (secondary).
  css += `${P} .casino-card .btn--primary,${P} .cg-card .btn--primary,${P} .news-card .btn--primary,${P} .rv-card .btn--primary,${P} .update-card .btn--primary,${P} .research-card .btn--primary{background:var(--dc-acc)!important;border-color:var(--dc-acc)!important;color:var(--dc-accfg)!important}`;
  css += `${P} .casino-card .btn--secondary{background:transparent!important;color:${v.dark ? "var(--dc-title)" : "var(--dc-acc)"}!important;border:1px solid ${v.dark ? "var(--dc-bd)" : "var(--dc-acc)"}!important}`;
  if (v.br !== "") css += `${P} .casino-card .btn,${P} .cg-card .btn,${P} .news-card .btn,${P} .update-card .btn{border-radius:${v.br}!important}`;
  if (x.pad) css += t(BODIES, `padding:${PADS[x.pad]}!important`) + t(PAD_BOXES, `padding:${PADS[x.pad]}!important`);
  if (v.dark) {
    // The site draws cards white with dark text; on a dark card every text role has to be told, or it stays dark on dark.
    const TEXT = `:is(h2,h3,h4,p,li,span,strong,small,div,time,dt,dd,label,em,b)`;
    css += CARD_ROOTS.map((r) => `${P} ${r} ${TEXT}:not(.btn):not([class*="geo-"]):not([class*="rating"]):not(.bonus-value):not(.casino-card__number):not(.cg-badge)`).join(",") + `{color:var(--dc-fg)!important}`;
    css += t(TITLES, "color:var(--dc-title)!important");
    css += CARD_ROOTS.map((r) => `${P} ${r} a:not(.btn)`).join(",") + `{color:var(--dc-title)!important}`;
    css += CARD_ROOTS.map((r) => `${P} ${r} :is([class*="rating"],.bonus-value)`).join(",") + `{color:${/^#/.test(acc) && lum(acc) > 0.25 ? "var(--dc-acc)" : "var(--dc-title)"}!important}`; // the accent only if it is light enough to read on a dark card
    css += CARD_ROOTS.map((r) => `${P} ${r} :is(.bonus-row__toggle,.payment-method-icon,.cg-badge)`).join(",") + `{background:rgba(255,255,255,.08)!important;color:var(--dc-fg)!important;border-color:var(--dc-bd)!important}`;
    css += `${P} .casino-card .bonus-row,${P} .casino-card .bonus-row__details{background:rgba(255,255,255,.06)!important;border-color:var(--dc-bd)!important}`;
    css += CARD_ROOTS.map((r) => `${P} ${r} :is(.compliance-row,.casino-card__compliance)`).join(",") + `{color:var(--dc-fg)!important;opacity:.85}`;
  }
  if (card.extra) css += card.extra(A, P);
  return css;
}
