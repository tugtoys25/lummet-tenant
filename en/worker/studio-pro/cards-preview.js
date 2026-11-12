// Card Studio previews. Sample cards use the SAME class names and structure the site's own card builders emit (casino-cards.js, the
// content grid, news, reviews ...), so the preview is the real public.css plus the chosen card CSS. Where the site already has casinos or
// news, their names/titles are used; otherwise neutral sample wording. Nothing here is ever rendered on the public site.
import { esc } from "./util.js";
import { cardsCss } from "./cards.js";

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
const FALLBACK_CASINOS = [
  { name: "Royal Spin", rating: 5, bonus: "100% up to $500 + 50 spins" },
  { name: "Lucky Stadium", rating: 4, bonus: "Bet $10, get $30 in free bets" },
];
const FALLBACK_NEWS = [
  { title: "New licence rules explained", excerpt: "What the latest regulator update means for players." },
  { title: "Weekend odds and tips", excerpt: "A quick look at the biggest matches this weekend." },
];
const logo = (n) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" rx="8" fill="#334155"/><text x="60" y="37" font-family="Arial" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">${String(n).slice(0, 2).toUpperCase()}</text></svg>`)}`;

function casino(c, i) {
  const n = esc(c.name);
  return `<div class="casino-card"><span class="casino-card__number" aria-hidden="true">${i + 1}</span><div class="casino-card__header"><div class="casino-card__logo-wrap"><img src="${logo(c.name)}" alt="" class="casino-card__logo"></div><div class="casino-card__title-group"><h3 class="casino-card__name">${n}</h3><div class="casino-card__rating">${stars(c.rating)}</div></div></div><div class="casino-card__body"><ul class="casino-card__bonus-list"><li class="bonus-row is-open"><button type="button" class="bonus-row__toggle"><span class="bonus-row__title">Welcome Bonus</span></button><div class="bonus-row__details"><span class="bonus-value">${esc(c.bonus)}</span></div></li></ul><div class="casino-card__compliance"><div class="compliance-row"><span class="compliance-label">License:</span> <span class="compliance-value">Licensed operator</span></div><div class="compliance-row"><span>18+ Play responsibly, T&amp;Cs apply</span></div></div></div><div class="casino-card__actions"><a href="#" class="btn btn--secondary">Review</a><a href="#" class="btn btn--primary">Visit</a></div></div>`;
}
const cg = (t, x) => `<article class="cg-card"><div class="cg-card__body"><span class="cg-badge">Featured</span><h3 class="cg-card__title"><a href="#">${esc(t)}</a></h3><span class="cg-card__rating">${stars(4)}</span><p class="cg-card__bonus">${esc(x)}</p><p class="cg-card__excerpt">Any content type from Component Studio uses this card.</p><time class="cg-card__date">12 Nov 2026</time><div class="cg-card__actions"><a class="btn btn--primary btn--sm" href="#">Read more</a></div></div></article>`;
const news = (n) => `<a href="#" class="news-card"><h3>${esc(n.title)}</h3><p class="muted">${esc(n.excerpt)}</p><p class="muted">12 Nov 2026</p></a>`;
const feature = () => `<div class="feature-card"><h3>Fast payouts</h3><p>Most withdrawals are processed within 24 hours.</p></div>`;
const research = () => `<div class="research-card"><span class="research-card__type">Guide</span><h3 class="research-card__title">How welcome bonuses work</h3><p class="research-card__excerpt">Wagering, limits and game weighting in plain language.</p></div>`;
const review = () => `<div class="rv-card"><div class="rv-card__body"><h3>Royal Spin review</h3><p>Our verdict after testing deposits, games and support.</p><a class="btn btn--primary btn--sm" href="#">Read review</a></div></div>`;

export function sampleCardsHtml(real = {}) {
  const cs = (real.casinos && real.casinos.length ? real.casinos : FALLBACK_CASINOS).slice(0, 2).map((c) => ({ name: c.name || c.title || "Casino", rating: Math.max(1, Math.min(5, Math.round(Number(c.rating) || 4))), bonus: c.bonus || c.bonus_value || "Welcome offer" }));
  const ns = (real.news && real.news.length ? real.news : FALLBACK_NEWS).slice(0, 2).map((n) => ({ title: n.title || "News", excerpt: String(n.excerpt || "").slice(0, 110) }));
  return `<h2 class="dsc-h">Casino and sportsbook cards</h2><div class="casino-grid">${cs.map(casino).join("")}</div><h2 class="dsc-h">Content-type cards</h2><div class="dsc-grid dsc-grid-3">${cg(ns[0].title, "Up to 200% bonus")}${cg(ns[1].title, "Free bet offer")}${review()}</div><h2 class="dsc-h">News, features and guides</h2><div class="dsc-grid dsc-grid-3">${ns.map(news).join("")}${feature()}${research()}</div>`;
}

const DOC_CSS = `body{margin:0;padding:24px;background:var(--theme-background,#f8fafc)}.dsc-h{font-size:1.05rem;margin:22px 0 12px;color:var(--theme-text,#0f172a)}.dsc-h:first-child{margin-top:0}.dsc-grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}.dsc-grid-3{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}.dsc-grid>*{margin:0}`;
const head = (themeCss) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title><link rel="stylesheet" href="/static/css/public.css">${themeCss || ""}<style>${DOC_CSS}</style>`;

// Full preview. sel = {id, custom} or null (= the site's own cards).
export function renderCardsPreviewDocument(sel, { themeCss = "", real = {} } = {}) {
  return `${head(themeCss)}<style id="dsp-cards">${sel ? cardsCss(sel) : ""}</style></head><body class="${sel ? "dsp-cards" : ""}">${sampleCardsHtml(real)}</body></html>`;
}

// Gallery thumbnail: a small document (shown in a scaled, sandboxed iframe) with one casino card and two content cards.
export function cardThumbDocument(sel, { themeCss = "" } = {}) {
  const inner = `<div class="dsc-grid dsc-grid-t">${casino(FALLBACK_CASINOS[0], 0)}${cg("Content card", "Up to 200% bonus")}${news(FALLBACK_NEWS[0])}</div>`;
  return `${head(themeCss)}<style>.dsc-grid-t{grid-template-columns:repeat(3,1fr)!important}body{padding:20px}</style><style id="dsp-cards">${cardsCss(sel)}</style></head><body class="dsp-cards">${inner}</body></html>`;
}
