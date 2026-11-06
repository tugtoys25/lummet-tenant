// Resolve site text: stored value wins, otherwise the registry default. Never throws (fail open).
import { ALL_TEXT_FIELDS, TEXT_DEFAULTS } from "./registry.js";

const BY_KEY = new Map(ALL_TEXT_FIELDS.map((x) => [x.key, x]));
const ALLOW_EMPTY = (key) => /_intro$/.test(key); // an owner may clear an introduction; headings and labels never go blank

export function escapeText(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Plain strings for every registered key, with defaults filled in and numbers clamped.
export function buildSiteText(values) {
  const v = values && typeof values === "object" ? values : {};
  const out = {};
  for (const f of ALL_TEXT_FIELDS) {
    const raw = v[f.key];
    let s = raw === undefined || raw === null ? TEXT_DEFAULTS[f.key] : String(raw);
    if (f.type === "int") {
      const n = parseInt(s, 10);
      s = String(Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : parseInt(TEXT_DEFAULTS[f.key], 10));
    } else if (f.type === "bool") {
      s = s === "0" || s === "false" ? "0" : "1";
    } else if (s.trim() === "" && !ALLOW_EMPTY(f.key)) {
      s = TEXT_DEFAULTS[f.key];
    }
    out[f.key] = s;
  }
  return out;
}

export const textOn = (text, key) => (text?.[key] ?? TEXT_DEFAULTS[key]) !== "0";
export const textInt = (text, key) => parseInt(text?.[key] ?? TEXT_DEFAULTS[key], 10);

export function fillTokens(str, tokens = {}) {
  return String(str ?? "").replace(/\{(site|year|count|total|query|type|type_lower|name)\}/g, (m, k) => (tokens[k] === undefined ? m : String(tokens[k])));
}

// One landing page: raw strings (escape the heading and intro before they go into HTML; SEO fields are escaped by buildSEO).
export function landingText(site, page, extraTokens = {}) {
  const t = site?.text || buildSiteText({});
  const tokens = { site: site?.siteName || "", year: new Date().getUTCFullYear(), ...extraTokens };
  const g = (k) => fillTokens(t[`landing_${page}_${k}`] ?? TEXT_DEFAULTS[`landing_${page}_${k}`] ?? "", tokens);
  return { title: g("title"), intro: g("intro"), seoTitle: g("seo_title"), seoDescription: g("seo_description"), titleHtml: escapeText(g("title")), introHtml: escapeText(g("intro")) };
}

// Any registered string with tokens filled in (raw: escape it before it goes into HTML).
export function siteTextValue(site, key, extraTokens = {}) {
  const t = site?.text || buildSiteText({});
  return fillTokens(t[key] ?? TEXT_DEFAULTS[key], { site: site?.siteName || "", year: new Date().getUTCFullYear(), ...extraTokens });
}

export function textField(key) { return BY_KEY.get(key); }

// Template variables (all escaped). `moduleOn(id)` says whether a platform module is switched on.
export function siteTextVars(text, siteName, moduleOn = () => true) {
  const t = text || buildSiteText({});
  const tokens = { site: siteName || "", year: new Date().getUTCFullYear() };
  const s = (k) => escapeText(fillTokens(t[k], tokens));
  const on = (k, mod) => textOn(t, k) && (!mod || moduleOn(mod));
  const vars = {
    hs_casinos: on("home_casinos_enabled", "casino"), hs_casinos_title: s("home_casinos_title"), hs_casinos_link_label: s("home_casinos_link_label"), hs_casinos_link_url: s("home_casinos_link_url"),
    hs_reviews: on("home_reviews_enabled", "reviews"), hs_reviews_title: s("home_reviews_title"), hs_reviews_link_label: s("home_reviews_link_label"), hs_reviews_link_url: s("home_reviews_link_url"),
    hs_reviews_button: s("home_reviews_button_label"), hs_reviews_empty: s("home_reviews_empty"),
    hs_news: on("home_news_enabled", "news"), hs_news_title: s("home_news_title"), hs_news_link_label: s("home_news_link_label"), hs_news_link_url: s("home_news_link_url"), hs_news_empty: s("home_news_empty"), hs_news_count: textInt(t, "home_news_count"),
    sidebar_enabled: textOn(t, "sidebar_enabled"),
    sb_casinos: on("sidebar_casinos_enabled", "casino"), sb_casinos_title: s("sidebar_casinos_title"), sb_casinos_count: textInt(t, "sidebar_casinos_count"), sb_casinos_empty: s("sidebar_casinos_empty"), sb_casinos_order: textInt(t, "sidebar_casinos_order"),
    sb_news: on("sidebar_news_enabled", "news"), sb_news_title: s("sidebar_news_title"), sb_news_count: textInt(t, "sidebar_news_count"), sb_news_empty: s("sidebar_news_empty"), sb_news_order: textInt(t, "sidebar_news_order"),
    sb_countries: on("sidebar_countries_enabled", "taxonomy"), sb_countries_title: s("sidebar_countries_title"), sb_countries_count: textInt(t, "sidebar_countries_count"), sb_countries_search: s("sidebar_countries_search"), sb_countries_empty: s("sidebar_countries_empty"), sb_countries_order: textInt(t, "sidebar_countries_order"),
    sb_categories: on("sidebar_categories_enabled", "taxonomy"), sb_categories_title: s("sidebar_categories_title"), sb_categories_count: textInt(t, "sidebar_categories_count"), sb_categories_order: textInt(t, "sidebar_categories_order"),
    sb_categories_more: s("sidebar_categories_more"), sb_categories_less: s("sidebar_categories_less"), sb_categories_empty: s("sidebar_categories_empty"),
    sb_loading: s("sidebar_loading"), sb_error: s("sidebar_error"),
    ft_title_casinos: s("footer_title_casinos"), ft_title_company: s("footer_title_company"), ft_title_support: s("footer_title_support"), ft_title_legal: s("footer_title_legal"),
    ft_newsletter: on("footer_newsletter_enabled", "subscriptions"), ft_newsletter_title: s("footer_newsletter_title"), ft_newsletter_text: s("footer_newsletter_text"),
    ft_newsletter_placeholder: s("footer_newsletter_placeholder"), ft_newsletter_button: s("footer_newsletter_button"),
    ft_disclaimer_label: s("footer_disclaimer_label"), ft_copyright: s("footer_copyright"), ft_install: s("footer_install_label"),
    // page width
    viewport_content: textOn(t, "layout_force_desktop") ? `width=${textInt(t, "layout_desktop_width")}, viewport-fit=cover` : "width=device-width, initial-scale=1.0, viewport-fit=cover",
    layout_force_desktop: textOn(t, "layout_force_desktop"),
    // account pages
    ac_forgot_title: s("account_forgot_title"), ac_forgot_lead: s("account_forgot_lead"), ac_forgot_email: s("account_forgot_email_label"), ac_forgot_button: s("account_forgot_button"),
    ac_back_to_login: s("account_back_to_login"), ac_reset_title: s("account_reset_title"), ac_reset_password: s("account_reset_password_label"), ac_reset_confirm: s("account_reset_confirm_label"), ac_reset_button: s("account_reset_button"),
    // system pages, filters and screen-reader labels
    sy_404_hint: s("system_404_hint"), sy_404_home: s("system_404_home"), sy_404_casinos: s("system_404_casinos"),
    sy_news_kicker: s("system_news_kicker"), sy_news_search_placeholder: s("system_news_search_placeholder"), sy_news_search_label: s("system_news_search_label"), sy_news_search_button: s("system_news_search_button"),
    sy_authors_heading: s("system_authors_heading"),
    sy_research_all_types: s("system_research_all_types"), sy_research_all_countries: s("system_research_all_countries"), sy_research_all_related: s("system_research_all_related"), sy_research_clear: s("system_research_clear"),
    sy_research_no_match: s("system_research_no_match"), sy_research_showing: s("system_research_showing"), sy_research_type_label: s("system_research_type_label"), sy_research_country_label: s("system_research_country_label"),
    sy_research_related_label: s("system_research_related_label"), sy_research_sort_label: s("system_research_sort_label"),
    sy_aria_search: s("system_aria_search"), sy_aria_menu: s("system_aria_menu"), sy_aria_close_search: s("system_aria_close_search"), sy_aria_scroll_top: s("system_aria_scroll_top"),
    // item pages ({name} and {type} are filled by the page that knows them; see itemText)
    it_age_notice: s("item_age_notice"), it_features: s("item_features_heading"), it_sports: s("item_sports_heading"), it_payments: s("item_payments_heading"),
    it_details: s("item_details_heading"), it_reviews: s("item_reviews_heading"), it_rating: s("item_rating_label"), it_license: s("item_license_label"), it_status: s("item_status_label"),
    country_all_heading: escapeText(fillTokens(t.landing_country_all_heading, tokens)), country_search_placeholder: escapeText(fillTokens(t.landing_country_search_placeholder, tokens)),
  };
  // The sidebar is one block: when every block is off (or the sidebar is), it is not drawn at all.
  vars.sidebar_visible = vars.sidebar_enabled && (vars.sb_casinos || vars.sb_news || vars.sb_countries || vars.sb_categories);
  vars.layout_full = vars.sidebar_visible ? "" : " layout-wrapper--full";
  return vars;
}

// Same, reading the profile (fail open: any read problem = every module on).
export async function buildTextVars(env, request, site) {
  let moduleOn = () => true;
  try {
    const { loadProfile } = await import("../site-profile/store.js");
    const { isEnabled } = await import("../site-profile/profile.js");
    const profile = await loadProfile(env, request ? new URL(request.url).hostname : "");
    moduleOn = (id) => isEnabled(profile, id);
  } catch { /* fail open */ }
  return siteTextVars(site?.text, site?.siteName, moduleOn);
}

// Item page wording that needs the item name or type name filled in (raw strings: escape before HTML).
export function itemText(site, { name = "", type = "" } = {}) {
  const v = (k) => siteTextValue(site, k, { name, type });
  return { visit: v("item_visit_button"), about: v("item_about_heading"), info: v("item_info_heading"), related: v("item_related_heading") };
}
