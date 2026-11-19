// Advanced Homepage: settings, defaults and validation.
// Everything lives in the existing `settings` key/value table under the prefix "advhome_", so it can never overwrite another
// setting. A missing key means "off", which keeps the current homepage exactly as it is.
// This is a reusable platform: no wording, list or link is built into the code. The defaults below are neutral and empty; ready-made
// starting points live in templates.js and are only ever copied into the editor when the owner chooses one.
export const HERO_SOURCES = ["auto", "site", "own"];
import { THEME_IDS } from "./themes.js";
export const KEYS = ["advhome_mode", "advhome_config", "advhome_previous"];
export const MODES = ["off", "on"];
// Built-in sections: each exists once and can be switched on or off and reordered.
export const SECTION_TYPES = ["hero", "filters", "top_picks", "browse", "payments", "how_we_rate", "reviews_news", "faq", "trust", "seo_prose", "newsletter"];
// Custom sections: add as many as you need (up to MAX_CUSTOM), each with its own id.
export const CUSTOM_TYPES = ["text_block", "link_cards"];
export const MAX_CUSTOM = 8;

export const SECTION_META = {
  hero: { label: "Hero", help: "The first thing visitors see: a clear promise, one main button and a line of proof." },
  filters: { label: "Quick filters", help: "Chips that jump to a category, a country or a payment method." },
  top_picks: { label: "Top picks", help: "A short, ranked list of listings that are available in the visitor's country, with the bonus terms, a score and one Visit button." },
  browse: { label: "Browse by category and country", help: "Icon cards that lead to your category and country pages." },
  payments: { label: "Payment methods", help: "A strip of the payment methods you cover." },
  how_we_rate: { label: "How we rate", help: "Shows what a score is based on, with a link to your methodology page." },
  reviews_news: { label: "Latest reviews and news", help: "Your newest reviews and news, in two stacked groups." },
  faq: { label: "FAQ", help: "Questions and answers. Also sent to search engines as FAQ structured data." },
  trust: { label: "Trust and responsible use", help: "A short message with an optional age badge and help organisations." },
  seo_prose: { label: "Long text (collapsed)", help: "Your longer search-friendly text, folded under a button so it does not push content down." },
  newsletter: { label: "Newsletter", help: "An email sign-up, placed just above the footer." },
  text_block: { label: "Text block", help: "A custom heading, text and an optional button. Add as many as you like." },
  link_cards: { label: "Link cards", help: "A custom grid of cards, each with an icon, a title, a line of text and a link." },
};

// Every visitor-facing word that is not a section's own content. All editable in the dashboard (Wording panel).
export const DEFAULT_LABELS = {
  categories: "Categories", countries: "Countries", payments: "Payments",
  geoNote: "Showing options available in {country}",
  emptyText: "Nothing matches right now. Check back soon or browse the full list.",
  readReview: "Read review", emailLabel: "Email address", fallbackCountry: "your location",
  wagering: "{value}x wagering", minDeposit: "min. deposit {value} {currency}", maxBonus: "max. bonus {value} {currency}",
};
export const LABEL_KEYS = Object.keys(DEFAULT_LABELS);
export const DEFAULT_ICON = "★";

export function defaultConfig() {
  return {
    version: 1,
    options: { heroSource: "auto", builder: false, theme: "", labels: { ...DEFAULT_LABELS }, defaultIcon: DEFAULT_ICON, iconRules: [] },
    sections: [
      { type: "hero", enabled: true, kicker: "", title: "{site_name}", body: "", primaryLabel: "", primaryUrl: "", secondaryLabel: "", secondaryUrl: "", proof: "", align: "center" },
      { type: "filters", enabled: true, showCategories: true, categoryLimit: 8, showCountries: true, countryLimit: 6, showPayments: true, paymentLimit: 6 },
      { type: "top_picks", enabled: true, title: "", subtitle: "", count: 10, minRating: 0, requireBonus: true, mode: "auto", picks: [], showReason: true, showScore: true,
        viewAllLabel: "", viewAllUrl: "", disclosure: "", disclosureLabel: "", disclosureUrl: "" },
      { type: "browse", enabled: true, title: "", categoryLimit: 8, countryLimit: 8, showCategories: true, showCountries: true },
      { type: "payments", enabled: true, title: "", subtitle: "", limit: 12, viewAllLabel: "", viewAllUrl: "" },
      { type: "how_we_rate", enabled: true, title: "", intro: "", criteria: [], weightsConfirmed: false, linkLabel: "", linkUrl: "" },
      { type: "reviews_news", enabled: true, showReviews: true, showNews: true, reviewsTitle: "", reviewCount: 4, newsTitle: "", newsCount: 4 },
      { type: "faq", enabled: true, title: "", items: [] },
      { type: "trust", enabled: true, title: "", text: "", ageBadge: "", pageLabel: "", pageUrl: "", links: [] },
      { type: "seo_prose", enabled: true, title: "", summaryLabel: "Read more", text: "" },
      { type: "newsletter", enabled: false, title: "", text: "", placeholder: "Email address", button: "Subscribe" },
    ],
  };
}

const CUSTOM_BASE = {
  text_block: { type: "text_block", enabled: true, id: "", title: "", body: "", align: "left", tone: "plain", buttonLabel: "", buttonUrl: "" },
  link_cards: { type: "link_cards", enabled: true, id: "", title: "", subtitle: "", columns: 3, tone: "plain", items: [] },
};
export const newCustomSection = (type) => JSON.parse(JSON.stringify(CUSTOM_BASE[type]));

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
      break; }
    case "reviews_news":
      b("showReviews"); b("showNews"); t("reviewsTitle", 80); t("newsTitle", 80); out.reviewCount = int(o.reviewCount, 1, 8, base.reviewCount); out.newsCount = int(o.newsCount, 1, 8, base.newsCount); break;
    case "faq": {
      t("title", 120); const list = Array.isArray(o.items) ? o.items : base.items; out.items = [];
      for (const it of list.slice(0, 12)) { const q = txt(it && it.q, 200), a = txt(it && it.a, 1200); if (q && a) out.items.push({ q, a }); }
      break; }
    case "trust": {
      t("title", 120); t("text", 500); t("pageLabel", 40); u("pageUrl");
      // Older saves had a showAge tick box that meant the badge "18+"; now the badge text is yours to write (empty = no badge).
      out.ageBadge = o.ageBadge !== undefined ? txt(o.ageBadge, 8) : (o.showAge === true ? "18+" : base.ageBadge);
      const list = Array.isArray(o.links) ? o.links : base.links; out.links = [];
      for (const l of list.slice(0, 8)) { const label = txt(l && l.label, 40); const url = cleanUrl(l && l.url); if (label && url) out.links.push({ label, url }); else if (label || (l && l.url)) errors.push("Trust row: each link needs a name and a valid address."); }
      break; }
    case "seo_prose": t("title", 120); t("summaryLabel", 40); t("text", 12000); break;
    case "newsletter": t("title", 120); t("text", 300); t("placeholder", 60); t("button", 30); break;
    case "text_block":
      t("title", 120); t("body", 6000); t("buttonLabel", 40); u("buttonUrl");
      out.align = oneOf(o.align, ["left", "center"], base.align); out.tone = oneOf(o.tone, ["plain", "alt"], base.tone); break;
    case "link_cards": {
      t("title", 120); t("subtitle", 200); out.columns = int(o.columns, 2, 4, base.columns); out.tone = oneOf(o.tone, ["plain", "alt"], base.tone);
      const list = Array.isArray(o.items) ? o.items : base.items; out.items = [];
      for (const c of list.slice(0, 12)) {
        const title = txt(c && c.title, 60); if (!title) continue;
        const url = cleanUrl(c.url); if (url === null) { errors.push(`Link cards: the address for "${title}" is not valid.`); continue; }
        out.items.push({ title, text: txt(c.text, 160), url, icon: txt(c.icon, 8) });
      }
      break; }
  }
  return out;
}

function cleanLabels(src) {
  const o = src && typeof src === "object" ? src : {};
  const out = {};
  for (const k of LABEL_KEYS) out[k] = o[k] === undefined ? DEFAULT_LABELS[k] : txt(o[k], 120);
  return out;
}
function cleanIconRules(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list.slice(0, 24) : []) {
    const match = txt(r && r.match, 80), icon = txt(r && r.icon, 8);
    if (match && icon) out.push({ match, icon });
  }
  return out;
}

// Turns anything into a valid config. Unknown sections are dropped, a missing built-in section comes back with its neutral default,
// custom sections keep their own ids (a missing or repeated id is replaced), and bad values are reported.
export function cleanConfig(input) {
  const base = defaultConfig();
  const errors = [];
  const o = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const op = o.options && typeof o.options === "object" ? o.options : {};
  // "auto" = use the hero from Header & Hero / Hero Studio when the site has one, else the hero section below. (Older saves used siteHero: true.)
  const heroSource = HERO_SOURCES.includes(op.heroSource) ? op.heroSource : (op.siteHero === true ? "site" : "auto");
  const options = {
    heroSource, builder: bool(op.builder, false), theme: THEME_IDS.includes(op.theme) ? op.theme : "",
    labels: cleanLabels(op.labels),
    defaultIcon: op.defaultIcon === undefined ? DEFAULT_ICON : txt(op.defaultIcon, 8),
    iconRules: op.iconRules === undefined ? [] : cleanIconRules(op.iconRules),
  };
  const byType = new Map(base.sections.map((s) => [s.type, s]));
  const raws = Array.isArray(o.sections) ? o.sections : [];
  const usedIds = new Set(raws.map((r) => r && r.id).filter((x) => typeof x === "string"));
  const sections = []; const seen = new Set(); const ids = new Set(); let custom = 0, n = 0;
  for (const raw of raws) {
    const type = raw && raw.type;
    if (byType.has(type)) {
      if (seen.has(type)) continue;
      seen.add(type); sections.push(cleanSection(raw, byType.get(type), errors)); continue;
    }
    if (CUSTOM_TYPES.includes(type)) {
      if (custom >= MAX_CUSTOM) { errors.push(`You can have up to ${MAX_CUSTOM} custom sections.`); continue; }
      const sec = cleanSection(raw, CUSTOM_BASE[type], errors);
      let id = typeof raw.id === "string" && /^custom-[a-z0-9]{2,12}$/.test(raw.id) && !ids.has(raw.id) ? raw.id : "";
      while (!id) { n += 1; const c = `custom-${n}`; if (!ids.has(c) && !usedIds.has(c)) id = c; }
      ids.add(id); sec.id = id; custom += 1; sections.push(sec);
    }
  }
  for (const s of base.sections) if (!seen.has(s.type)) sections.push(cleanSection({}, s, errors));
  return { config: { version: 1, options, sections }, errors };
}

// Wording and icons that earlier versions had built in. Used for the casino starter template and, once, to keep a homepage that was
// saved before these became editable looking exactly as it did.
export const CASINO_LABELS = {
  categories: "Categories", countries: "Countries", payments: "Payments", geoNote: "Showing casinos available in {country}",
  emptyText: "No casinos match right now. Check back soon or browse the full list.", readReview: "Read review", emailLabel: "Email address", fallbackCountry: "your location",
  wagering: "{value}x wagering", minDeposit: "min. deposit {value} {currency}", maxBonus: "max. bonus {value} {currency}",
};
export const CASINO_ICON_RULES = [
  ["crypto, bitcoin", "₿"], ["live, dealer", "🎥"], ["slot", "🎰"], ["bonus, free, spin", "🎁"], ["sport, bet", "⚽"], ["new", "✨"], ["mobile, app", "📱"],
  ["fast, instant, payout, withdraw", "⚡"], ["high, vip, roller", "💎"], ["deposit, low, min", "💵"], ["jackpot", "🏆"], ["poker", "♠️"], ["table, roulette, blackjack", "🃏"],
].map(([match, icon]) => ({ match, icon }));

const parse = (s, fb) => { try { const v = JSON.parse(s); return v ?? fb; } catch { return fb; } };
export function parseAdvancedHome(values = {}) {
  const mode = MODES.includes(values.advhome_mode) ? values.advhome_mode : "off";
  let stored = parse(values.advhome_config, null);
  // A save from before the wording became editable has no labels: give it the wording it always had, so the live page does not change.
  if (stored && typeof stored === "object" && !(stored.options && stored.options.labels)) {
    stored = { ...stored, options: { ...(stored.options || {}), labels: { ...CASINO_LABELS }, defaultIcon: "🎲", iconRules: CASINO_ICON_RULES } };
  }
  const config = cleanConfig(stored || defaultConfig()).config;
  return { mode, config, hasConfig: Boolean(stored) };
}

export const fill = (text, vars) => String(text || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
