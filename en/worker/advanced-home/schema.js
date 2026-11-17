// Advanced Homepage: settings, defaults and validation.
// Everything lives in the existing `settings` key/value table under the prefix "advhome_", so it can never overwrite another
// setting. A missing key means "off", which keeps the current homepage exactly as it is.
export const KEYS = ["advhome_mode", "advhome_config", "advhome_previous"];
export const MODES = ["off", "on"];
export const SECTION_TYPES = ["hero", "filters", "top_picks", "browse", "payments", "how_we_rate", "reviews_news", "faq", "trust", "seo_prose", "newsletter"];

export const SECTION_META = {
  hero: { label: "Hero", help: "The first thing visitors see: a clear promise, one main button and a line of proof." },
  filters: { label: "Quick filters", help: "Chips that jump to a category, a country or a payment method." },
  top_picks: { label: "Top picks", help: "A short, ranked list of casinos that are available in the visitor's country, with the bonus terms, a score and one Visit button." },
  browse: { label: "Browse by category and country", help: "Icon cards that lead to your category and country pages." },
  payments: { label: "Payment methods", help: "A strip of the payment methods you cover." },
  how_we_rate: { label: "How we rate casinos", help: "Shows what a score is based on, with a link to your methodology page." },
  reviews_news: { label: "Latest reviews and news", help: "Your newest reviews and news, side by side." },
  faq: { label: "FAQ", help: "Questions and answers. Also sent to search engines as FAQ structured data." },
  trust: { label: "Responsible gambling and trust", help: "A short responsible gambling message with help organisations." },
  seo_prose: { label: "Long text (collapsed)", help: "Your longer search-friendly text, folded under a Read more button so it does not push content down." },
  newsletter: { label: "Newsletter", help: "An email sign-up, placed just above the footer." },
};

const BENEFIT_CRITERIA = [
  ["Licensing and regulation", "Who licenses the operator and whether the licence can be checked."],
  ["Security and fair play", "How player data and funds are protected."],
  ["Payments and withdrawals", "Deposit and withdrawal options, limits and speed."],
  ["Bonuses and wagering terms", "How clear and fair the offers and their conditions are."],
  ["Games and software", "Range and quality of games and providers."],
  ["Customer support", "How easy it is to get a real answer."],
  ["Reputation", "What players and the industry report over time."],
  ["Player experience", "Site speed, mobile use and account tools."],
  ["Responsible gambling tools", "Limits, self-exclusion and clear help links."],
];

export function defaultConfig() {
  return {
    version: 1,
    options: { siteHero: false, builder: false },
    sections: [
      { type: "hero", enabled: true, kicker: "Independent casino research", title: "Find your next casino with better information",
        body: "Compare {casino_count} reviewed casinos by licence, payments, bonuses and where you can play, then read the latest industry news.",
        primaryLabel: "Browse casinos", primaryUrl: "/en/casino", secondaryLabel: "How we rate", secondaryUrl: "#ah-how_we_rate",
        proof: "{casino_count} casinos reviewed · showing what is available in {country}", align: "center" },
      { type: "filters", enabled: true, showCategories: true, categoryLimit: 8, showCountries: true, countryLimit: 6, showPayments: true, paymentLimit: 6 },
      { type: "top_picks", enabled: true, title: "Top picks for {country}", subtitle: "Only casinos that accept players from your location are listed.",
        count: 10, minRating: 0, requireBonus: true, mode: "auto", picks: [], showReason: true, showScore: true,
        viewAllLabel: "View all casinos", viewAllUrl: "/en/casino",
        disclosure: "We may earn a commission if you sign up through our links. 18+. Terms apply. Please play responsibly.",
        disclosureLabel: "Affiliate disclosure", disclosureUrl: "" },
      { type: "browse", enabled: true, title: "Browse by category and country", categoryLimit: 8, countryLimit: 8, showCategories: true, showCountries: true },
      { type: "payments", enabled: true, title: "Payment methods", subtitle: "", limit: 12, viewAllLabel: "All payment methods", viewAllUrl: "/en/payment-methods" },
      { type: "how_we_rate", enabled: true, title: "How we rate casinos",
        intro: "Each review looks at the same areas, so scores can be compared.",
        criteria: BENEFIT_CRITERIA.map(([label, description]) => ({ label, description, weight: 0 })), weightsConfirmed: false,
        linkLabel: "Read our methodology", linkUrl: "" },
      { type: "reviews_news", enabled: true, showReviews: true, showNews: true, reviewsTitle: "Latest reviews", reviewCount: 4, newsTitle: "Latest news", newsCount: 4 },
      { type: "faq", enabled: true, title: "Frequently asked questions", items: [
        { q: "Are online casinos legal where I live?", a: "It depends on your country. Each casino page shows where it accepts players, and the picks above only list casinos available in your location when we can detect it. Check your local law before you play." },
        { q: "How are casinos chosen and scored?", a: "Casinos are reviewed against the same areas, such as licensing, payments, bonus terms, games and support. The methodology page explains how." },
        { q: "Does this site earn money from casino links?", a: "Some links are affiliate links, so we may earn a commission if you sign up. A disclosure sits under the top picks." },
        { q: "What is a wagering requirement?", a: "It is how many times you must bet a bonus before you can withdraw winnings from it. For example, 35x on a 100 bonus means 3,500 in bets. Always read the bonus terms." },
        { q: "How can I check that a casino is licensed?", a: "Each review lists the licence and the operator. Confirm the licence on the regulator's own website." },
        { q: "Where can I get help with gambling?", a: "If gambling is a problem for you or someone you know, see our responsible gambling page and the organisations listed on this page." },
      ] },
      { type: "trust", enabled: true, title: "Play responsibly",
        text: "Gambling should be entertainment, not a way to make money. Set limits, never chase losses and only play where it is legal for you.",
        showAge: true, pageLabel: "Responsible gambling", pageUrl: "/en/responsible-gambling",
        links: [{ label: "GambleAware", url: "https://www.begambleaware.org" }, { label: "GAMSTOP", url: "https://www.gamstop.co.uk" }, { label: "BetBlocker", url: "https://www.betblocker.org" }, { label: "GamCare", url: "https://www.gamcare.org.uk" }] },
      { type: "seo_prose", enabled: true, title: "About this site", summaryLabel: "Read more", text: "" },
      { type: "newsletter", enabled: true, title: "Get casino news and bonuses by email", text: "One short email with new reviews and industry news. Unsubscribe any time.", placeholder: "Your email address", button: "Subscribe" },
    ],
  };
}

// ---------- cleaning helpers ----------
const ctrl = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const txt = (v, max) => String(v ?? "").replace(ctrl, "").trim().slice(0, max);
const bool = (v, fb) => (typeof v === "boolean" ? v : fb);
const int = (v, lo, hi, fb) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };
const num = (v, lo, hi, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };
const oneOf = (v, list, fb) => (list.includes(v) ? v : fb);
// A link is a path on this site, an anchor, or https. Anything else (javascript:, data:, //host) is dropped.
export function cleanUrl(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.length > 500 || /[\s"'<>\\]/.test(s)) return null;
  if (/^\/(?!\/)/.test(s) || /^#[A-Za-z0-9_-]+$/.test(s) || /^https:\/\/[^\s/]+/i.test(s)) return s;
  return null;
}

export function cleanSection(raw, base, errors) {
  const o = raw && typeof raw === "object" ? raw : {};
  const out = { type: base.type, enabled: bool(o.enabled, base.enabled) };
  const t = (k, max) => { out[k] = o[k] === undefined ? base[k] : txt(o[k], max); };
  const u = (k) => { if (o[k] === undefined) { out[k] = base[k]; return; } const c = cleanUrl(o[k]); if (c === null) { errors.push(`${SECTION_META[base.type].label}: "${k}" is not a valid link.`); out[k] = base[k]; } else out[k] = c; };
  const b = (k) => { out[k] = bool(o[k], base[k]); };
  switch (base.type) {
    case "hero":
      t("kicker", 80); t("title", 140); t("body", 400); t("primaryLabel", 40); u("primaryUrl"); t("secondaryLabel", 40); u("secondaryUrl"); t("proof", 160);
      out.align = oneOf(o.align, ["left", "center"], base.align); break;
    case "filters":
      b("showCategories"); b("showCountries"); b("showPayments");
      out.categoryLimit = int(o.categoryLimit, 0, 20, base.categoryLimit); out.countryLimit = int(o.countryLimit, 0, 20, base.countryLimit); out.paymentLimit = int(o.paymentLimit, 0, 20, base.paymentLimit); break;
    case "top_picks": {
      t("title", 120); t("subtitle", 200); t("viewAllLabel", 40); u("viewAllUrl"); t("disclosure", 300); t("disclosureLabel", 40); u("disclosureUrl");
      out.count = int(o.count, 1, 12, base.count); out.minRating = num(o.minRating, 0, 5, base.minRating);
      b("requireBonus"); b("showReason"); b("showScore"); out.mode = oneOf(o.mode, ["auto", "manual"], base.mode);
      const picks = Array.isArray(o.picks) ? o.picks : base.picks; const seen = new Set(); out.picks = [];
      for (const p of picks.slice(0, 12)) {
        const id = int(p && p.casino_id, 1, 1e9, null); if (!id || seen.has(id)) continue; seen.add(id);
        out.picks.push({ casino_id: id, reason: txt(p.reason, 60), bonusNote: txt(p.bonusNote, 120) });
      }
      break; }
    case "browse":
      t("title", 120); b("showCategories"); b("showCountries"); out.categoryLimit = int(o.categoryLimit, 0, 20, base.categoryLimit); out.countryLimit = int(o.countryLimit, 0, 24, base.countryLimit); break;
    case "payments":
      t("title", 120); t("subtitle", 200); out.limit = int(o.limit, 1, 30, base.limit); t("viewAllLabel", 40); u("viewAllUrl"); break;
    case "how_we_rate": {
      t("title", 120); t("intro", 300); t("linkLabel", 40); u("linkUrl"); b("weightsConfirmed");
      const list = Array.isArray(o.criteria) ? o.criteria : base.criteria; out.criteria = [];
      for (const c of list.slice(0, 12)) { const label = txt(c && c.label, 60); if (!label) continue; out.criteria.push({ label, description: txt(c.description, 160), weight: int(c.weight, 0, 100, 0) }); }
      if (!out.criteria.length) { errors.push("How we rate: add at least one criterion."); out.criteria = base.criteria; }
      break; }
    case "reviews_news":
      b("showReviews"); b("showNews"); t("reviewsTitle", 80); t("newsTitle", 80); out.reviewCount = int(o.reviewCount, 1, 8, base.reviewCount); out.newsCount = int(o.newsCount, 1, 8, base.newsCount); break;
    case "faq": {
      t("title", 120); const list = Array.isArray(o.items) ? o.items : base.items; out.items = [];
      for (const it of list.slice(0, 12)) { const q = txt(it && it.q, 200), a = txt(it && it.a, 1200); if (q && a) out.items.push({ q, a }); }
      break; }
    case "trust": {
      t("title", 120); t("text", 500); b("showAge"); t("pageLabel", 40); u("pageUrl");
      const list = Array.isArray(o.links) ? o.links : base.links; out.links = [];
      for (const l of list.slice(0, 8)) { const label = txt(l && l.label, 40); const url = cleanUrl(l && l.url); if (label && url) out.links.push({ label, url }); else if (label || (l && l.url)) errors.push("Trust row: each link needs a name and a valid address."); }
      break; }
    case "seo_prose": t("title", 120); t("summaryLabel", 40); t("text", 12000); break;
    case "newsletter": t("title", 120); t("text", 300); t("placeholder", 60); t("button", 30); break;
  }
  return out;
}

// Turns anything into a valid config: unknown sections are dropped, missing ones come back with their defaults, bad values are reported.
export function cleanConfig(input) {
  const base = defaultConfig();
  const errors = [];
  const o = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const options = { siteHero: bool(o.options && o.options.siteHero, false), builder: bool(o.options && o.options.builder, false) };
  const byType = new Map(base.sections.map((s) => [s.type, s]));
  const sections = []; const seen = new Set();
  for (const raw of Array.isArray(o.sections) ? o.sections : []) {
    const type = raw && raw.type;
    if (!byType.has(type) || seen.has(type)) continue;
    seen.add(type); sections.push(cleanSection(raw, byType.get(type), errors));
  }
  for (const s of base.sections) if (!seen.has(s.type)) sections.push(cleanSection({}, s, errors));
  return { config: { version: 1, options, sections }, errors };
}

const parse = (s, fb) => { try { const v = JSON.parse(s); return v ?? fb; } catch { return fb; } };
export function parseAdvancedHome(values = {}) {
  const mode = MODES.includes(values.advhome_mode) ? values.advhome_mode : "off";
  const stored = parse(values.advhome_config, null);
  const config = cleanConfig(stored || defaultConfig()).config;
  return { mode, config, hasConfig: Boolean(stored) };
}

export const fill = (text, vars) => String(text || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
