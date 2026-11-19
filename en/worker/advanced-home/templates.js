// Advanced Homepage: starter templates. These are ordinary, editable settings, not rules: choosing one in the dashboard copies it into the
// editor (nothing is saved or published until you press Save), and every word, link and section can then be changed or removed.
// The platform itself ships neutral; this file is only a convenience for people who would rather start from a worked example.
import { CASINO_ICON_RULES, CASINO_LABELS, cleanConfig, defaultConfig } from "./schema.js";

const GAMBLING_HELP = [{ label: "GambleAware", url: "https://www.begambleaware.org" }, { label: "GAMSTOP", url: "https://www.gamstop.co.uk" }, { label: "BetBlocker", url: "https://www.betblocker.org" }, { label: "GamCare", url: "https://www.gamcare.org.uk" }];

// overrides: { sectionType: {fields} }, options: partial options, custom: extra custom sections appended at the end.
function build({ options = {}, overrides = {}, order, custom = [] }) {
  const base = defaultConfig();
  base.options = { ...base.options, ...options };
  let sections = base.sections.map((s) => ({ ...s, ...(overrides[s.type] || {}) }));
  if (order) sections = order.map((t) => sections.find((s) => s.type === t)).filter(Boolean).concat(sections.filter((s) => !order.includes(s.type)));
  return { ...base, sections: [...sections, ...custom] };
}

const casino = () => build({
  options: { labels: { ...CASINO_LABELS }, defaultIcon: "🎲", iconRules: CASINO_ICON_RULES },
  overrides: {
    hero: { kicker: "Independent casino research", title: "Find your next casino with better information", body: "Compare {casino_count} reviewed casinos by licence, payments, bonuses and where you can play, then read the latest industry news.",
      primaryLabel: "Browse casinos", primaryUrl: "/en/casino", secondaryLabel: "How we rate", secondaryUrl: "#ah-how_we_rate", proof: "{casino_count} casinos reviewed · showing what is available in {country}" },
    top_picks: { title: "Top picks for {country}", subtitle: "Only casinos that accept players from your location are listed.", viewAllLabel: "View all casinos", viewAllUrl: "/en/casino",
      disclosure: "We may earn a commission if you sign up through our links. 18+. Terms apply. Please play responsibly.", disclosureLabel: "Affiliate disclosure" },
    browse: { title: "Browse by category and country" },
    payments: { title: "Payment methods", viewAllLabel: "All payment methods", viewAllUrl: "/en/payment-methods" },
    how_we_rate: { title: "How we rate casinos", intro: "Each review looks at the same areas, so scores can be compared.", linkLabel: "Read our methodology", criteria: [
      ["Licensing and regulation", "Who licenses the operator and whether the licence can be checked."], ["Security and fair play", "How player data and funds are protected."],
      ["Payments and withdrawals", "Deposit and withdrawal options, limits and speed."], ["Bonuses and wagering terms", "How clear and fair the offers and their conditions are."],
      ["Games and software", "Range and quality of games and providers."], ["Customer support", "How easy it is to get a real answer."],
      ["Reputation", "What players and the industry report over time."], ["Player experience", "Site speed, mobile use and account tools."],
      ["Responsible gambling tools", "Limits, self-exclusion and clear help links."]].map(([label, description]) => ({ label, description, weight: 0 })) },
    reviews_news: { reviewsTitle: "Latest reviews", newsTitle: "Latest news" },
    faq: { title: "Frequently asked questions", items: [
      { q: "Are online casinos legal where I live?", a: "It depends on your country. Each casino page shows where it accepts players, and the picks above only list casinos available in your location when we can detect it. Check your local law before you play." },
      { q: "How are casinos chosen and scored?", a: "Casinos are reviewed against the same areas, such as licensing, payments, bonus terms, games and support. The methodology page explains how." },
      { q: "Does this site earn money from casino links?", a: "Some links are affiliate links, so we may earn a commission if you sign up. A disclosure sits under the top picks." },
      { q: "What is a wagering requirement?", a: "It is how many times you must bet a bonus before you can withdraw winnings from it. For example, 35x on a 100 bonus means 3,500 in bets. Always read the bonus terms." },
      { q: "How can I check that a casino is licensed?", a: "Each review lists the licence and the operator. Confirm the licence on the regulator's own website." },
      { q: "Where can I get help with gambling?", a: "If gambling is a problem for you or someone you know, see our responsible gambling page and the organisations listed on this page." }] },
    trust: { title: "Play responsibly", text: "Gambling should be entertainment, not a way to make money. Set limits, never chase losses and only play where it is legal for you.",
      ageBadge: "18+", pageLabel: "Responsible gambling", pageUrl: "/en/responsible-gambling", links: GAMBLING_HELP },
    newsletter: { enabled: true, title: "Get casino news and bonuses by email", text: "One short email with new reviews and industry news. Unsubscribe any time.", placeholder: "Your email address" },
  },
});

const sportsbook = () => build({
  options: { labels: { ...CASINO_LABELS, geoNote: "Showing sportsbooks available in {country}", emptyText: "No sportsbooks match right now. Check back soon or browse the full list." }, defaultIcon: "⚽", iconRules: [{ match: "football, soccer", icon: "⚽" }, { match: "basketball", icon: "🏀" }, { match: "tennis", icon: "🎾" }, { match: "live, in-play", icon: "📺" }, { match: "bonus, free", icon: "🎁" }, { match: "mobile, app", icon: "📱" }] },
  overrides: {
    hero: { kicker: "Independent sportsbook research", title: "Compare sportsbooks before you bet", body: "Odds, markets, payments and bonus terms for {casino_count} reviewed sportsbooks, with what is available in {country}.", primaryLabel: "Browse sportsbooks", primaryUrl: "/en/casino", proof: "Showing what is available in {country}" },
    top_picks: { title: "Top sportsbooks for {country}", subtitle: "Only those that accept bettors from your location.", viewAllLabel: "View all", viewAllUrl: "/en/casino", disclosure: "We may earn a commission if you sign up through our links. 18+. Terms apply. Bet responsibly.", disclosureLabel: "Affiliate disclosure" },
    browse: { title: "Browse by sport and country" },
    reviews_news: { reviewsTitle: "Latest reviews", newsTitle: "Latest news" },
    trust: { title: "Bet responsibly", text: "Betting should be entertainment. Set limits, never chase losses and only bet where it is legal for you.", ageBadge: "18+", links: GAMBLING_HELP },
  },
});

const publisher = () => build({
  overrides: {
    hero: { title: "{site_name}", body: "Our latest reviews, guides and news.", primaryLabel: "Latest news", primaryUrl: "/en/news" },
    top_picks: { enabled: false }, payments: { enabled: false }, how_we_rate: { enabled: false }, browse: { enabled: false }, filters: { enabled: false },
    reviews_news: { reviewsTitle: "Latest reviews", newsTitle: "Latest news", reviewCount: 4, newsCount: 6 },
    newsletter: { enabled: true, title: "Stay up to date", text: "New articles by email. Unsubscribe any time." },
  },
  order: ["hero", "reviews_news", "faq", "trust", "seo_prose", "newsletter"],
});

const blank = () => defaultConfig();

const LIST = [
  { id: "casino", label: "Casino review site", description: "Hero, top picks by country, categories, payments, how we rate, reviews and news, FAQ, responsible gambling, newsletter.", make: casino },
  { id: "sportsbook", label: "Sportsbook review site", description: "Same structure, worded for sportsbooks, with sport icons.", make: sportsbook },
  { id: "publisher", label: "News and reviews only", description: "A hero, your latest reviews and news, and a newsletter. No casino lists.", make: publisher },
  { id: "blank", label: "Blank", description: "Neutral and empty. Turn on and fill in only what you need.", make: blank },
];

// Each template is passed through the same validator as a save, so choosing one can never produce an invalid homepage.
export function starterTemplates() {
  return LIST.map(({ id, label, description, make }) => ({ id, label, description, config: cleanConfig(make()).config }));
}
