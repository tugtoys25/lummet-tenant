import { Renderer } from "./render.js";
import { getSiteContext } from "./site-context.js";
import * as authors from "./database/authors.js";
import * as categories from "./database/categories.js";
import * as paymentMethods from "./database/payment-methods.js";
import * as casinos from "./database/casinos.js";
import * as contentItems from "./database/content-items.js";
import * as customTypes from "./database/custom-types.js";
import * as reviewCriteria from "./database/review-criteria.js";
import * as comparisonsDb from "./database/comparisons.js";
import * as landingPagesDB from "./database/content-landing-pages.js";
import { resolveAffiliateLink, resolveContentItemById } from "./content-resolver.js";import { renderCustomFieldsHtml } from "./custom-field-render.js";
import * as reviews from "./database/reviews.js";
import * as genericReviewsDb from "./database/generic-reviews.js";
import * as pages from "./database/pages.js";
import * as countries from "./database/countries.js";
import * as research from "./database/research.js";
import * as researchSources from "./database/research-sources.js";
import * as researchClaims from "./database/research-claims.js";
import * as researchRelations from "./database/research-relations.js";
import * as researchDatasets from "./database/research-datasets.js";
import * as news from "./database/news.js";
import * as newsroom from "./database/newsroom.js";
import * as nrRender from "./newsroom-render.js";
import * as nrTrust from "./newsroom-trust.js";
import * as nrHome from "./newsroom-home.js";
import * as nrAnalytics from "./newsroom-analytics.js";
import * as nrSearch from "./newsroom-search.js";
import { sanitizeHtml } from "./sanitize.js";
import * as platformUpdates from "./database/platform-updates.js";
import * as seoPages from "./database/seo-pages.js";
import { logClick }
from "./database/clicks.js";
import { getEnabledAdRules } from "./database/ad-rules.js";

import {
  getCurrentUser
} from "./auth.js";
import { getGeoRule } from "./database/geo.js";
import { geoEngine } from "./geo.js";
import { resolveRedirectTarget } from "./tracking/redirect.js";
import { logEvent as logAnalyticsEvent } from "./database/analytics.js";
import { resolveOfferForCasino, resolveOffersForCasinos } from "./offers/selection.js";
import * as componentsDB from "./database/components.js";
import * as seoMetaDB from "./database/seo_meta.js";
import * as nav from "./database/nav.js";
import { getSetting } from "./database/settings.js";
import { headerHeroDefaultsForAdmin, jsonForScript } from "./header-hero.js";
import { getRelatedCasinos } from "./database/related-casinos.js";
import { getCached, setCached } from "./cache.js";
import {
    buildBreadcrumbs
} from "./breadcrumbs.js";


function cacheHeaders() {
  return {
    "Content-Type": "text/html",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
  };
}

function formatDate(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}


function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(text = "") {
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text = "", max = 160) {
  const clean = stripHtml(text);

  if (clean.length <= max) {
    return clean;
  }

  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// Guards against meaningless ALT text (empty, or a bare database/media
// ID such as "5782" or "1000044672") slipping into rendered <img alt>
// attributes. Falls back to the given title/description instead.
function safeAlt(altText, fallback = "") {
  const trimmed = String(altText || "").trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return fallback;
  return trimmed;
}

function toIsoDate(value) {
  if (!value) return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}
const COUNTRY_NAMES = {
  // — Africa —
  DZ:"Algeria", AO:"Angola", BJ:"Benin", BW:"Botswana", BF:"Burkina Faso",
  BI:"Burundi", CM:"Cameroon", CV:"Cape Verde", CF:"Central African Republic",
  TD:"Chad", KM:"Comoros", CG:"Congo", CD:"Democratic Republic of the Congo",
  CI:"Côte d'Ivoire", DJ:"Djibouti", EG:"Egypt", GQ:"Equatorial Guinea",
  ER:"Eritrea", SZ:"Eswatini", ET:"Ethiopia", GA:"Gabon", GM:"Gambia",
  GH:"Ghana", GN:"Guinea", GW:"Guinea-Bissau", KE:"Kenya", LS:"Lesotho",
  LR:"Liberia", LY:"Libya", MG:"Madagascar", MW:"Malawi", ML:"Mali",
  MR:"Mauritania", MU:"Mauritius", MA:"Morocco", MZ:"Mozambique",
  NA:"Namibia", NE:"Niger", NG:"Nigeria", RW:"Rwanda", ST:"São Tomé and Príncipe",
  SN:"Senegal", SC:"Seychelles", SL:"Sierra Leone", SO:"Somalia",
  ZA:"South Africa", SS:"South Sudan", SD:"Sudan", TZ:"Tanzania", TG:"Togo",
  TN:"Tunisia", UG:"Uganda", ZM:"Zambia", ZW:"Zimbabwe",
  EH:"Western Sahara",

  // — Asia —
  AF:"Afghanistan", AM:"Armenia", AZ:"Azerbaijan", BH:"Bahrain",
  BD:"Bangladesh", BT:"Bhutan", BN:"Brunei", KH:"Cambodia", CN:"China",
  CY:"Cyprus", GE:"Georgia", IN:"India", ID:"Indonesia", IR:"Iran",
  IQ:"Iraq", IL:"Israel", JP:"Japan", JO:"Jordan", KZ:"Kazakhstan",
  KP:"North Korea", KR:"South Korea", KW:"Kuwait", KG:"Kyrgyzstan",
  LA:"Laos", LB:"Lebanon", MY:"Malaysia", MV:"Maldives", MN:"Mongolia",
  MM:"Myanmar", NP:"Nepal", OM:"Oman", PK:"Pakistan", PS:"Palestine",
  PH:"Philippines", QA:"Qatar", SA:"Saudi Arabia", SG:"Singapore",
  LK:"Sri Lanka", SY:"Syria", TW:"Taiwan", TJ:"Tajikistan", TH:"Thailand",
  TL:"Timor-Leste", TR:"Turkey", TM:"Turkmenistan", AE:"United Arab Emirates",
  UZ:"Uzbekistan", VN:"Vietnam", YE:"Yemen",

  // — Europe —
  AL:"Albania", AD:"Andorra", AT:"Austria", BY:"Belarus", BE:"Belgium",
  BA:"Bosnia and Herzegovina", BG:"Bulgaria", HR:"Croatia", CZ:"Czech Republic",
  DK:"Denmark", EE:"Estonia", FI:"Finland", FR:"France", DE:"Germany",
  GR:"Greece", HU:"Hungary", IS:"Iceland", IE:"Ireland", IT:"Italy",
  XK:"Kosovo", LV:"Latvia", LI:"Liechtenstein", LT:"Lithuania",
  LU:"Luxembourg", MT:"Malta", MD:"Moldova", MC:"Monaco", ME:"Montenegro",
  NL:"Netherlands", MK:"North Macedonia", NO:"Norway", PL:"Poland",
  PT:"Portugal", RO:"Romania", RU:"Russia", SM:"San Marino", RS:"Serbia",
  SK:"Slovakia", SI:"Slovenia", ES:"Spain", SE:"Sweden", CH:"Switzerland",
  UA:"Ukraine", GB:"United Kingdom", VA:"Vatican City",

  // — Americas —
  AG:"Antigua and Barbuda", AR:"Argentina", BS:"Bahamas", BB:"Barbados",
  BZ:"Belize", BO:"Bolivia", BR:"Brazil", CA:"Canada", CL:"Chile",
  CO:"Colombia", CR:"Costa Rica", CU:"Cuba", DM:"Dominica",
  DO:"Dominican Republic", EC:"Ecuador", SV:"El Salvador", GD:"Grenada",
  GT:"Guatemala", GY:"Guyana", HT:"Haiti", HN:"Honduras", JM:"Jamaica",
  MX:"Mexico", NI:"Nicaragua", PA:"Panama", PY:"Paraguay", PE:"Peru",
  KN:"Saint Kitts and Nevis", LC:"Saint Lucia",
  VC:"Saint Vincent and the Grenadines", SR:"Suriname", TT:"Trinidad and Tobago",
  US:"United States", UY:"Uruguay", VE:"Venezuela",

  // — Oceania —
  AU:"Australia", FJ:"Fiji", KI:"Kiribati", MH:"Marshall Islands",
  FM:"Micronesia", NR:"Nauru", NZ:"New Zealand", PW:"Palau",
  PG:"Papua New Guinea", WS:"Samoa", SB:"Solomon Islands", TO:"Tonga",
  TV:"Tuvalu", VU:"Vanuatu",

  // — Territories / Special (optional) —
  HK:"Hong Kong", MO:"Macao",
  GL:"Greenland", PR:"Puerto Rico", KY:"Cayman Islands",
  BM:"Bermuda", FO:"Faroe Islands", GI:"Gibraltar",
  GG:"Guernsey", JE:"Jersey", IM:"Isle of Man",
  AX:"Åland Islands", SJ:"Svalbard and Jan Mayen",
};

function countryFullName(code) {
  return COUNTRY_NAMES[code] || code;
}



function buildBreadcrumbsbackup(path, data = {}) {
  const crumbs = [{ label: "Home", url: "/en" }];

  if (path === "casinoList") {
    crumbs.push({ label: "All Casinos", url: "/en/casino" });
  } else if (path === "casino" && data.name) {
    crumbs.push({ label: "All Casinos", url: "/en/casino" });
    crumbs.push({ label: data.name, url: null });
  } else if (path === "reviewList") {
    crumbs.push({ label: "All Reviews", url: "/en/review" });
  } else if (path === "review" && data.title) {
    crumbs.push({ label: "All Reviews", url: "/en/review" });
    crumbs.push({ label: data.title, url: null });
  } else if (path === "newsList") {
    crumbs.push({ label: "News", url: "/en/news" });
  } else if (path === "news" && data.title) {
    crumbs.push({ label: "News", url: "/en/news" });
    crumbs.push({ label: data.title, url: null });
  } else if (path === "categoryList") {
    crumbs.push({ label: "Categories", url: "/en/category" });
  } else if (path === "category" && data.category) {
    crumbs.push({ label: "Categories", url: "/en/category" });
    crumbs.push({ label: data.category, url: null });
  } else if (path === "countryList") {
    crumbs.push({ label: "Countries", url: "/en/country" });
  } else if (path === "country" && data.name) {
    crumbs.push({ label: "Countries", url: "/en/country" });
    crumbs.push({ label: data.name, url: null });
  } else if (path === "dashboard") {
    crumbs.push({ label: "Dashboard", url: null });
  } else if (path === "page" && data.title) {
    crumbs.push({ label: data.title, url: null });
  } else if (path === "affiliate" && data.title) {
    crumbs.push({ label: data.title, url: null });
  }

  return crumbs;
}

// The actual cold render -- everything renderHome used to do. This
// still hits D1/casinos/reviews/news/components on every call; it's
// only ever invoked directly on a cache miss, and otherwise runs in
// the background to refresh a stale cached copy (see renderHome()
// below, which is the exported/routed entry point now).
async function renderHomeHtml(request, env) {
  const renderer = new Renderer(env, request);

  // site, casinoList, components/SEO, and the latest-reviews/news
  // lists are all independent of each other — fetch them concurrently.
  const [site, casinoList, allComponents, dynamicSeo, latestReviews, allNews] = await Promise.all([
    getSiteContext(request, env),
    casinos.getAllCasinos(env.DB),
    renderer.renderAllComponents("homepage", "homepage"),
    renderer.loadDynamicSeo("homepage", "homepage"),
    reviews.getLatestReviews(env.DB, 6),
    news.getAllNews(env.DB),
  ]);
  const latestNews = allNews.slice(0, 4);

  const geoData = await prepareGeoData(env, request, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);

  const available = sortedCasinos.filter(c =>
    geoData.statuses[c.slug] !== "blocked" && geoData.statuses[c.slug] !== "restricted"
  );
  const others = sortedCasinos.filter(c =>
    geoData.statuses[c.slug] === "blocked" || geoData.statuses[c.slug] === "restricted"
  );
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);

  const reviewCardsHtml = latestReviews.map(r => `
    <div class="casino-card">
      <div class="casino-card__header">
        <div class="casino-card__logo-wrap">
          <img src="${r.casino_logo || '/static/images/default.png'}" alt="${r.casino_name}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
        </div>
        <div class="casino-card__title-group">
          <h3 class="casino-card__name"><a href="/en/review/${r.slug}">${r.title}</a></h3>
          <div class="casino-card__rating">${'★'.repeat(Math.round(r.rating || 0))}${'☆'.repeat(5 - Math.round(r.rating || 0))}</div>
        </div>
      </div>
      <div class="casino-card__body">
        <p class="muted">${r.casino_name}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--secondary">Read Review</a>
      </div>
    </div>`).join("");

  const newsCardsHtml = latestNews.map(n => `
    <a href="/en/news/${n.slug}" class="news-card">
      ${n.featured_image_thumbnail || n.featured_image_url ? `<img src="${n.featured_image_thumbnail || n.featured_image_url}" alt="${n.title}" loading="lazy">` : ""}
      <h3>${n.title}</h3>
      ${n.excerpt ? `<p class="muted">${n.excerpt}</p>` : ""}
      <p class="muted">${new Date(n.published_at || n.created_at).toLocaleDateString()}</p>
    </a>`).join("");

  const homeSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": site.origin,
    "name": site.siteName,
    "description":site.description || "Expert casino reviews, exclusive bonuses, and real player data.",
    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "logo": {
        "@type": "ImageObject",
        "url": site.logoUrl
      }
    }
  };

      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("home.html", {
    seo_title: dynamicSeo.seo_title || site.title || `${site.siteName} — Expert Casino Reviews & Bonuses`,
    seo_description: dynamicSeo.seo_description || site.description || "Expert casino reviews, exclusive bonuses, and real player data for casinos worldwide.",
    seo_keywords: dynamicSeo.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url("/en"),
    og_image: dynamicSeo.og_image || "",
    casino_cards: buildCasinoCards(available, geoData, bonusOverrides, paymentMethodsByCasino),
    casino_count: casinoList.length,
    hidden_casino_cards: buildCasinoCards(others, geoData, bonusOverrides, paymentMethodsByCasino),
    has_hidden: others.length > 0,
    hidden_count: others.length,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    review_cards: reviewCardsHtml,
    has_reviews: latestReviews.length > 0,
    no_reviews: latestReviews.length === 0,
    news_cards: newsCardsHtml,
    has_news: latestNews.length > 0,
    no_news: latestNews.length === 0
  }, homeSchema, buildBreadcrumbs("home"));

  return html;
}

// =====================================================
// HOMEPAGE -- full-page cache wrapper (stale-while-revalidate)
// =====================================================
// This is the routed entry point (see index.js). It caches the
// ENTIRE rendered HTML per (hostname, visitor country) in KV, so a
// cache hit costs zero D1 reads. See cache.js's PAGE_CACHE /
// getCachedPage / setCachedPage / tryAcquireRegenLock for the
// mechanics. `ctx` is optional -- if it's not passed (or has no
// waitUntil), a stale hit is still served immediately, it just
// won't trigger a background refresh; the next miss/expiry will
// re-render synchronously instead.
export async function renderHome(request, env, ctx) {
  const { getCachedPage, setCachedPage, tryAcquireRegenLock, CACHE_KEYS, PAGE_CACHE } =
    await import("./cache.js");

  const hostname = new URL(request.url).hostname;
  const country = request.cf?.country || "XX";
  const cacheKey = CACHE_KEYS.PAGE_HOME(hostname, country);

  const cached = await getCachedPage(env, cacheKey);

  if (cached) {
    const ageSeconds = (Date.now() - cached.generatedAt) / 1000;

    if (ageSeconds > PAGE_CACHE.FRESH_SECONDS && ctx?.waitUntil) {
      ctx.waitUntil(regenerateHome(request, env, cacheKey));
    }

    return new Response(cached.html, { headers: cacheHeaders() });
  }

  // Nothing cached at all -- render synchronously, this visitor pays
  // the D1 cost once, everyone else gets it from cache until it expires.
  const html = await renderHomeHtml(request, env);
  await setCachedPage(env, cacheKey, html);
  return new Response(html, { headers: cacheHeaders() });
}

async function regenerateHome(request, env, cacheKey) {
  const { setCachedPage, tryAcquireRegenLock } = await import("./cache.js");

  const gotLock = await tryAcquireRegenLock(env, cacheKey);
  if (!gotLock) return; // another request is already regenerating this exact page

  try {
    const html = await renderHomeHtml(request, env);
    await setCachedPage(env, cacheKey, html);
  } catch (err) {
    // Regeneration failed (D1 still over quota, etc.) -- leave the
    // existing stale copy in place; it keeps being served as-is
    // until this succeeds or the KV entry's TTL runs out.
    console.error("Home page background regeneration failed:", err.message);
  }
}


// System 2 (Offers) integration: maps an offer_type to the short
// label the existing bonus_title/bonus_value template slots expect
// (e.g. "Welcome Bonus", matching the style of the legacy
// casinos.bonus_title values already in use). Kept local to this file
// since it's purely a display concern, not a data-layer one.
const OFFER_TYPE_LABELS = {
  welcome: "Welcome Bonus",
  deposit: "Deposit Bonus",
  no_deposit: "No Deposit Bonus",
  free_spins: "Free Spins",
  cashback: "Cashback",
  reload: "Reload Bonus",
  vip: "VIP Offer",
  tournament: "Tournament Offer",
  custom: "Special Offer",
};

/**
 * Resolves the bonus_title/bonus_value shown on a casino page/card,
 * per the three-rung fallback chain documented in
 * migrations/0024_offers.sql:
 *   1. An active, GEO-eligible Offer for this casino
 *   2. geo_rules.bonus_override for the visitor's country (pre-existing)
 *   3. casinos.bonus_title / casinos.bonus_value (pre-existing, legacy)
 * Never throws -- a failure anywhere in offer resolution falls back
 * to the casino's own legacy fields rather than breaking the page.
 */
async function resolveBonusDisplay(env, casino, countryCode) {
  const fallback = {
    bonus_title: casino.bonus_title || "Welcome Bonus",
    bonus_value: casino.bonus_value || "",
    offer_id: null,
  };

  try {
    const result = await resolveOfferForCasino(env.DB, { casinoId: casino.id, countryCode });
    // offer_id is purely additive here -- bonusDisplayFromResult() below
    // is untouched, still returns only bonus_title/bonus_value from its
    // own mapping. Adding a sibling field to resolveBonusDisplay's own
    // return object doesn't change what any existing caller destructures.
    const display = bonusDisplayFromResult(result, fallback);
    return { ...display, offer_id: result?.offer?.id ?? null };
  } catch (err) {
    console.error("Offer resolution failed, falling back to legacy bonus fields:", err.message);
    return fallback;
  }
}

/**
 * Pure mapping from a resolveOfferForCasino()/resolveOffersForCasinos()
 * result to the two fields the templates actually render. Factored out
 * so the single-casino and batched-list paths can never drift from
 * each other's display logic.
 */
function bonusDisplayFromResult(result, fallback) {
  if (result.offer) {
    return {
      bonus_title: OFFER_TYPE_LABELS[result.offer.offer_type] || fallback.bonus_title,
      bonus_value: result.offer.public_headline || fallback.bonus_value,
    };
  }
  if (!result.geoBlocked && result.geoRule?.bonus_override) {
    return {
      bonus_title: fallback.bonus_title,
      bonus_value: result.geoRule.bonus_override,
    };
  }
  return fallback;
}

/**
 * All GEO-eligible offers for one casino, as the {title, value} pairs
 * a card renders -- not just the single winning one. Used to show a
 * "1st Deposit Bonus / 2nd Deposit Bonus / ..." expandable list per
 * card instead of one collapsed bonus line. Falls back to a single
 * legacy-field row when there are no active Offers for the casino at
 * all yet, so cards for casinos not yet migrated onto the Offer
 * system still show something.
 */
function bonusRowsFromResult(result, fallback) {
  const eligible = result.eligibleOffers || [];
  if (eligible.length) {
    return eligible.map((offer) => ({
      bonus_title: OFFER_TYPE_LABELS[offer.offer_type] || fallback.bonus_title,
      bonus_value: offer.public_headline || fallback.bonus_value,
    }));
  }
  if (!result.geoBlocked && result.geoRule?.bonus_override) {
    return [{ bonus_title: fallback.bonus_title, bonus_value: result.geoRule.bonus_override }];
  }
  if (fallback.bonus_value) {
    return [fallback];
  }
  return [];
}

/**
 * Batched version of resolveBonusDisplay() for list/grid contexts
 * (buildCasinoCards/buildReviewCasinoCards). Calls
 * resolveOffersForCasinos() -- the batched sibling of
 * resolveOfferForCasino() living in the SAME canonical selection
 * module, sharing its exact eligibility logic -- so this does 2 D1
 * queries total for the whole list instead of ~2 queries PER casino.
 * That per-casino loop was the primary cause of slow list-page loads
 * in production; this is the fix, not a rewrite of the eligibility
 * rules themselves.
 */
async function resolveBonusOverridesForList(env, casinoList, countryCode) {
  const overrides = {};
  try {
    const results = await resolveOffersForCasinos(env.DB, casinoList, countryCode);
    for (const casino of casinoList) {
      if (!casino.id) continue;
      const fallback = {
        bonus_title: casino.bonus_title || "Welcome Bonus",
        bonus_value: casino.bonus_value || "",
      };
      const result = results[casino.id] || { offer: null, eligibleOffers: [], geoBlocked: false, geoRule: null };
      overrides[casino.id] = bonusDisplayFromResult(result, fallback);
      overrides[casino.id].bonus_rows = bonusRowsFromResult(result, fallback);
    }
  } catch (err) {
    console.error("Batched offer resolution failed, falling back to legacy bonus fields for the whole list:", err.message);
    for (const casino of casinoList) {
      if (!casino.id) continue;
      const fallback = {
        bonus_title: casino.bonus_title || "Welcome Bonus",
        bonus_value: casino.bonus_value || "",
      };
      overrides[casino.id] = { ...fallback, bonus_rows: fallback.bonus_value ? [fallback] : [] };
    }
  }
  return overrides;
}

/**
 * Batched payment-method lookup for a casino list, mirroring
 * resolveBonusOverridesForList()'s degrade-on-failure shape: a
 * broken payment-methods query should never take a listing page
 * down, it should just render cards without the payment-icon row.
 */
async function resolvePaymentMethodsForList(env, casinoList) {
  try {
    const ids = casinoList.map((c) => c.id).filter((id) => id != null);
    return await paymentMethods.getPaymentMethodsForCasinos(env.DB, ids);
  } catch (err) {
    console.error("Payment method lookup failed, cards will render without payment icons:", err.message);
    return {};
  }
}

// ── TEMPORARY DIAGNOSTIC — remove once the slow-page investigation
// is done. createTimer() returns a per-request `timed()` wrapper
// that both console.logs AND collects entries into `log`, so the
// breakdown can be returned as response headers (visible directly
// in `curl -D -`, no dashboard or CLI needed) as well as showing up
// in any log stream that happens to be open.
function createTimer() {
  const log = [];
  function timed(label, promise) {
    const start = Date.now();
    return Promise.resolve(promise).then(
      (result) => {
        const ms = Date.now() - start;
        log.push(`${label}=${ms}ms`);
        console.log(`[TIMING] ${label}: ${ms}ms`);
        return result;
      },
      (err) => {
        const ms = Date.now() - start;
        log.push(`${label}=${ms}ms(REJECTED)`);
        console.log(`[TIMING] ${label}: ${ms}ms (REJECTED: ${err.message})`);
        throw err;
      }
    );
  }
  return { timed, log };
}

export async function renderCasino(request, env, slug, ctx = null) {
  const __pageStart = Date.now();
  const { timed, log } = createTimer();
  const casino = await timed("casinoFetch", casinos.getCasino(env.DB, slug));
  if (!casino) return render404(request, env);

  const renderer = new Renderer(env, request);

  // Parse features from JSON string
  let features = [];
  try { features = JSON.parse(casino.features || "[]"); } catch { features = []; }

  const featuresHtml = features
    .map(f => `<span class="feature-tag">${f}</span>`)
    .join("");

  // Build star display
  const rating = casino.rating || 0;
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const ratingDisplay =
    "★".repeat(fullStars) +
    (hasHalf ? "½" : "") +
    "☆".repeat(5 - fullStars - (hasHalf ? 1 : 0));

  const edgeGeo = {
    country: request.cf?.country || null,
    city: request.cf?.city || "Unknown"
  };
  const geoInfo = geoEngine.process(request, edgeGeo);

  // Analytics (Phase: page-view instrumentation). Fire-and-forget via
  // ctx.waitUntil — does not delay this render. Reuses the geoInfo
  // already computed above for GEO-rule evaluation, so this adds no
  // extra request/CPU cost beyond the insert itself.
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'CASINO_VIEW',
        casinoId: casino.id,
        countryCode: geoInfo.country,
        city: geoInfo.city,
        referrer: request.headers.get('referer') || null,
        landingPage: `/en/casino/${slug}`
      }).catch(() => {})
    );
  }

  // ── Related Casinos ({{{related_casinos_html}}}) ──────────
  // Kicked off here (not awaited yet) so it runs concurrently with
  // the other independent lookups below instead of after them.
  //
  // This is the single most expensive thing on this page (up to
  // ~1.5s: getRelatedCasinos() does several sequential D1 round
  // trips internally, then resolveBonusOverridesForList() adds
  // one more) — but its result only depends on WHICH casino this
  // is and the visitor's country, not on anything per-request. It
  // doesn't change meaningfully minute-to-minute, so it's cached
  // in KV (same getCached/setCached convention used for nav) —
  // this turns most requests into a single fast KV read instead
  // of ~6 D1 round trips.
  const relatedCasinosPromise = (async () => {
    const cacheKey = `related_casinos:${casino.id}:${geoInfo.country || "none"}`;
    try {
      const cached = await getCached(env, cacheKey);
      if (cached !== null) return cached;
    } catch { /* fall through to compute fresh */ }

    try {
      const relatedCasinos = await getRelatedCasinos(env.DB, casino, geoInfo.country, 6);
      if (relatedCasinos.length === 0) {
        await setCached(env, cacheKey, "", 300);
        return "";
      }
      const relatedGeoData = {
        country: geoInfo.country,
        statuses: Object.fromEntries(relatedCasinos.map(c => [c.slug, "allowed"]))
      };
      const relatedBonusOverrides = await resolveBonusOverridesForList(env, relatedCasinos, geoInfo.country);
      const html = buildCasinoCards(relatedCasinos, relatedGeoData, relatedBonusOverrides);
      await setCached(env, cacheKey, html, 300);
      return html;
    } catch (e) {
      console.error("Related casinos failed to load:", e.message);
      return "";
    }
  })();

  // These six lookups don't depend on each other's results, so run
  // them concurrently instead of one-by-one — this is the single
  // biggest win for casino-page load time.
  const __batchStart = Date.now();
  const [site, geoRule, allComponents, dynamicSeo, bonusDisplay, relatedCasinosHtml] = await Promise.all([
    timed("getSiteContext", getSiteContext(request, env)),
    timed("getGeoRule", getGeoRule(env.DB, slug, geoInfo.country)),
    timed("renderAllComponents", renderer.renderAllComponents("casino", slug, ctx)),
    timed("loadDynamicSeo", renderer.loadDynamicSeo("casino", slug)),
    timed("resolveBonusDisplay", resolveBonusDisplay(env, casino, geoInfo.country)),
    timed("relatedCasinosPromise", relatedCasinosPromise),
  ]);
  console.log(`[TIMING] whole parallel batch: ${Date.now() - __batchStart}ms (total so far: ${Date.now() - __pageStart}ms)`);
  log.push(`batchTotal=${Date.now() - __batchStart}ms`);

  const casinoSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": {
      "@type": "Casino",
      "name": casino.name,
      "image": casino.logo || site.logoUrl,
      "url": site.url(`/en/casino/${slug}`)
    },
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": rating,
      "bestRating": 5,
      "worstRating": 1
    },
    "author": {
      "@type": "Organization",
      "name": `${site.siteName} Expert Team`

    },
    "publisher": {
    "@type": "Organization",
    "name": site.siteName,
    "url": site.origin,
    "logo": {
      "@type": "ImageObject",
      "url": site.logoUrl
     }
    },
    "mainEntityOfPage": {
  "@type": "WebPage",
  "@id": site.url(`/en/casino/${slug}`)
},
  "datePublished": casino.created_at
  ? new Date(casino.created_at).toISOString()
  : undefined,

"dateModified": (casino.updated_at || casino.created_at)
  ? new Date(casino.updated_at || casino.created_at).toISOString()
  : undefined,
};

  // Analytics: OFFER_VIEW when a real offer (not just a legacy bonus
  // field / GEO override fallback) was actually resolved and shown.
  // Reuses the SAME ctx/geoInfo already in scope for the CASINO_VIEW
  // log above -- one extra conditional insert, not a new query.
  if (bonusDisplay.offer_id && ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'OFFER_VIEW',
        offerId: bonusDisplay.offer_id,
        casinoId: casino.id,
        countryCode: geoInfo.country,
        city: geoInfo.city,
        landingPage: `/en/casino/${slug}`
      }).catch(() => {})
    );
  }

  const __renderStart = Date.now();
  const html = await renderer.render("casino.html", {
    ...casino,
    // {{vars}} are not HTML-escaped by the template engine; casino.name is editable content.
    name: escapeHtml(casino.name),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || casino.seo_title || casino.name,
    seo_description: dynamicSeo.seo_description || casino.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || casino.seo_keywords || "",
    og_image: casino.logo ? site.url(casino.logo) : site.ogImageUrl,
    og_image_alt: casino.name,
    canonical: dynamicSeo.canonical || site.url(`/en/casino/${slug}`),
    rating_display: ratingDisplay,
    features_html: featuresHtml,
    bonus_title: bonusDisplay.bonus_title,
    bonus_value: bonusDisplay.bonus_value,
    website_url: casino.website_url || "",
    status: casino.status || "published",
    geo: geoInfo,
    geoRule: geoRule || { status: "allowed", bonus_override: null },
    related_casinos_html: relatedCasinosHtml
  }, casinoSchema, buildBreadcrumbs("casino", { name: casino.name }));
  console.log(`[TIMING] renderer.render() (templates/base/injection): ${Date.now() - __renderStart}ms (GRAND TOTAL: ${Date.now() - __pageStart}ms)`);
  log.push(`renderTotal=${Date.now() - __renderStart}ms`);
  log.push(`grandTotal=${Date.now() - __pageStart}ms`);

  return new Response(html, {
    headers: {
      ...cacheHeaders(),
      "X-Timing": log.join("; "),
    }
  });
}

function countryToFlag(code) {
  if (!code || code.length !== 2) return "🏳";
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
}

async function prepareGeoData(env, request, casinoList) {
  const edgeGeo = {
    country: request.cf?.country || null,
    city: request.cf?.city || "Unknown"
  };
  const geoInfo = geoEngine.process(request, edgeGeo);
  const slugs = casinoList.map(c => c.slug);
  if (slugs.length === 0) return { country: geoInfo.country, statuses: {} };

  // Batch query: get ALL geo rules for ALL these casinos (any country)
  const placeholders = slugs.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT casino_slug, country_code, status FROM geo_rules
    WHERE casino_slug IN (${placeholders})
  `).bind(...slugs).all();

  // Group rules by casino slug
  const rulesByCasino = {};
  for (const row of (result.results || [])) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  const statuses = {};
  for (const slug of slugs) {
    const rules = rulesByCasino[slug] || [];
    
    if (rules.length === 0) {
      // No rules at all → blocked everywhere
      statuses[slug] = "blocked";
    } else {
      // Check if this specific country has a rule
      const countryRule = rules.find(r => r.country_code === geoInfo.country);
      if (countryRule) {
        statuses[slug] = countryRule.status;
      } else {
        // No rule for this country — infer from other rules
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        
        if (hasAllowed && !hasBlocked) {
          // Only 'allowed' rules exist → this country is blocked (allowlist mode)
          statuses[slug] = "blocked";
        } else if (hasBlocked && !hasAllowed) {
          // Only 'blocked' rules exist → this country is allowed (blocklist mode)
          statuses[slug] = "allowed";
        } else {
          // Mixed or unclear → blocked by default
          statuses[slug] = "blocked";
        }
      }
    }
  }
  
  return { country: geoInfo.country, statuses };
}

async function evaluateCasinoGeo(env, casinoSlug, countryCode) {
  const result = await env.DB.prepare(`
    SELECT country_code, status FROM geo_rules
    WHERE casino_slug = ?
  `).bind(casinoSlug).all();

  const rules = result.results || [];

  if (rules.length === 0) return "blocked";

  const countryRule = rules.find(r => r.country_code === countryCode);
  if (countryRule) return countryRule.status;

  const hasAllowed = rules.some(r => r.status === "allowed");
  const hasBlocked = rules.some(r => r.status === "blocked");

  if (hasAllowed && !hasBlocked) return "not allowed";   // allowlist mode
  if (hasBlocked && !hasAllowed) return "allowed";    // blocklist mode
  return "blocked";                                    // mixed → safe default
}


function sortCasinosByGeo(casinoList, geoData) {
  if (!geoData) return casinoList;
  const allowed = casinoList.filter(c => geoData.statuses[c.slug] !== "blocked" && geoData.statuses[c.slug] !== "restricted");
  const blocked = casinoList.filter(c => geoData.statuses[c.slug] === "blocked" || geoData.statuses[c.slug] === "restricted");
  allowed.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  blocked.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return [...allowed, ...blocked];
}

function buildCasinoCards(casinoList, geoData = null, bonusOverrides = {}, paymentMethodsByCasino = {}) {
  return casinoList.map((casino, index) => {
    const flag = geoData ? countryToFlag(geoData.country) : "";
    const geoStatus = geoData ? (geoData.statuses[casino.slug] || "unknown") : "unknown";
    const safeCasinoName = escapeHtml(casino.name);
    const bonusDisplay = bonusOverrides[casino.id] || {
      bonus_title: casino.bonus_title || "Welcome Bonus",
      bonus_value: casino.bonus_value || "",
    };
    const bonusRows = bonusDisplay.bonus_rows && bonusDisplay.bonus_rows.length
      ? bonusDisplay.bonus_rows
      : (bonusDisplay.bonus_value ? [bonusDisplay] : []);
    const cardPaymentMethods = paymentMethodsByCasino[casino.id] || [];
 //   const geoIcon = geoStatus === "allowed" ? "✓" : "✕";
 //   const geoClass = geoStatus === "allowed" ? "geo-badge--allowed" : "geo-badge--blocked";

    // Different icons and colors for each status
    let geoIcon, geoClass, geoLabel;
    if (geoStatus === "allowed") {
      geoIcon = "✓";
      geoClass = "geo-badge--allowed";
      geoLabel = "Available";
    } else if (geoStatus === "blocked") {
      geoIcon = "✕";
      geoClass = "geo-badge--blocked";
      geoLabel = "Not Available";
    } else {
      geoIcon = "?";     // ← question mark for unknown
      geoClass = "geo-badge--unknown";
      geoLabel = "Unknown";
    }
    const geoBadge = geoData ? `
      <div class="geo-badge ${geoClass}" title="${geoLabel} in ${countryFullName(geoData.country)}">
        <span class="geo-badge__flag">${flag}</span>
        <span class="geo-badge__icon">${geoIcon}</span>
      </div>` : "";
    const geoStatusText = geoData ? `
  <div class="casino-card__geo-status geo-${geoStatus}">
    ${flag} ${geoLabel} for players from ${countryFullName(geoData.country)}
  </div>` : "";


    const complianceHtml = `
      <div class="casino-card__compliance">
        ${casino.license ? `<div class="compliance-row"><span class="compliance-label">License:</span> <span class="compliance-value">${casino.license}</span></div>` : ""}
        ${casino.owner ? `<div class="compliance-row"><span class="compliance-label">Operator:</span> <span class="compliance-value">${casino.owner}</span></div>` : ""}
        <div class="compliance-row">
      <span class="compliance-label"></span>
      <span>18+ Play responsibly, T&Cs apply</span>
    </div>
      </div>`;

    // Each row starts collapsed; clicking it (via the shared
    // js-bonusToggle delegate handler, see casino-cards.js) toggles
    // .is-open on the row, which CSS uses to reveal .bonus-row__details.
    // First row starts expanded so a single-offer card still shows its
    // value without a click, matching the old always-visible behavior.
    const bonusRowsHtml = bonusRows.length ? `
      <ul class="casino-card__bonus-list">
        ${bonusRows.map((row, i) => `
          <li class="bonus-row${i === 0 ? " is-open" : ""}">
            <button type="button" class="bonus-row__toggle js-bonusToggle" aria-expanded="${i === 0 ? "true" : "false"}">
              <span class="bonus-row__title">${row.bonus_title}</span>
              <span class="bonus-row__chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="bonus-row__details">
              <span class="bonus-value">${row.bonus_value}</span>
            </div>
          </li>`).join("")}
      </ul>` : "";

    const paymentMethodsHtml = cardPaymentMethods.length ? `
      <div class="casino-card__payment-methods" aria-label="Payment methods">
        ${cardPaymentMethods.map(pm => `
          <a href="/en/payment-methods/${pm.slug}" class="payment-method-icon" title="${escapeHtml(pm.name)}">
            ${pm.icon_url ? `<img src="${pm.icon_url}" alt="${escapeHtml(pm.name)}" loading="lazy" onerror="this.parentElement.style.display='none'">` : escapeHtml(pm.name)}
          </a>`).join("")}
      </div>` : "";

    return `
    <div class="casino-card" data-casino-slug="${casino.slug}">
      <span class="casino-card__number" aria-hidden="true">${index + 1}</span>
      ${geoBadge}
      <button
          type="button"
          class="casino-card__bookmark"
          data-bookmark-slug="${casino.slug}"
          aria-label="Save ${safeCasinoName} to bookmarks"
          aria-pressed="false"
          title="Save ${safeCasinoName}"
       >
          <span class="bookmark-icon" aria-hidden="true">♡</span>
       </button>
<div class="casino-card__header">
  <div class="casino-card__logo-wrap">
    <img src="${casino.logo || '/static/images/default.png'}" alt="${safeCasinoName}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
  </div>
  <div class="casino-card__title-group">
    <h3 class="casino-card__name">${safeCasinoName}</h3>
    <div class="casino-card__rating">${'★'.repeat(Math.round(casino.rating))}${'☆'.repeat(5 - Math.round(casino.rating))}</div>
  </div>
</div>
<div class="casino-card__body">
  ${bonusRowsHtml}
  ${paymentMethodsHtml}
  ${geoStatusText}
  ${complianceHtml}
</div>

      <div class="casino-card__actions">
        <a href="/en/casino/${casino.slug}" class="btn btn--secondary">Review</a>
        <a href="/en/go/${casino.slug}" class="btn btn--primary" rel="nofollow sponsored">Visit</a>
      </div>
    </div>`;
  }).join('');
}

function buildReviewCasinoCards(casinoList, geoData = null, bonusOverrides = {}) {
  return casinoList.map(casino => {
    const flag = geoData ? countryToFlag(geoData.country) : "";
    const geoStatus = geoData ? (geoData.statuses[casino.slug] || "unknown") : "unknown";
    const safeCasinoName = escapeHtml(casino.name);
    const bonusDisplay = bonusOverrides[casino.id] || {
      bonus_title: casino.bonus_title || "Welcome Bonus",
      bonus_value: casino.bonus_value || "",
    };
 //   const geoIcon = geoStatus === "allowed" ? "✓" : "✕";
 //   const geoClass = geoStatus === "allowed" ? "geo-badge--allowed" : "geo-badge--blocked";

    // Different icons and colors for each status
    let geoIcon, geoClass, geoLabel;
    if (geoStatus === "allowed") {
      geoIcon = "✓";
      geoClass = "geo-badge--allowed";
      geoLabel = "Available";
    } else if (geoStatus === "blocked") {
      geoIcon = "✕";
      geoClass = "geo-badge--blocked";
      geoLabel = "Not Available";
    } else {
      geoIcon = "✕";     // ← question mark for unknown
      geoClass = "geo-badge--unknown";
      geoLabel = "not Available";
    }
    const geoBadge = geoData ? `
      <div class="geo-badge ${geoClass}" title="${geoLabel} in ${countryFullName(geoData.country)}">
        <span class="geo-badge__flag">${flag}</span>
        <span class="geo-badge__icon">${geoIcon}</span>
      </div>` : "";
   // const geoBadge = geoData ? `
     // <div class="geo-badge ${geoClass}">
       // <span class="geo-badge__flag">${flag}</span>
       // <span class="geo-badge__icon">${geoIcon}</span>
     // </div>` : "";
    const geoStatusText = geoData ? `
  <div class="casino-card__geo-status geo-${geoStatus}">
    ${flag} ${geoLabel} for players from ${countryFullName(geoData.country)}
  </div>` : "";

// Then add ${geoStatusText} inside the card body, after the bonus div


    const complianceHtml = `
      <div class="casino-card__compliance">
        ${casino.license ? `<div class="compliance-row"><span class="compliance-label">License:</span> <span class="compliance-value">${casino.license}</span></div>` : ""}
        ${casino.owner ? `<div class="compliance-row"><span class="compliance-label">Operator:</span> <span class="compliance-value">${casino.owner}</span></div>` : ""}
        ${casino.website_url ? `<div class="compliance-row"><span class="compliance-label">18+ | PLAY RESPONSIBLY |</span> T&CS APPLY</div>` : ""}
      </div>`;

    return `
    <div class="casino-card" data-casino-slug="${casino.slug}">
      ${geoBadge}
      <button
        type="button"
        class="casino-card__bookmark"
        data-bookmark-slug="${casino.slug}"
        aria-label="Save ${safeCasinoName} to bookmarks"
        aria-pressed="false"
        title="Save ${safeCasinoName}"
      >
        <span class="bookmark-icon" aria-hidden="true">♡</span>
      </button>
<div class="casino-card__header">
  <div class="casino-card__logo-wrap">
    <img src="${casino.logo || '/static/images/default.png'}" alt="${safeCasinoName}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
  </div>
  <div class="casino-card__title-group">
    <h3 class="casino-card__name">${safeCasinoName} Review</h3>
    <div class="casino-card__rating">${'★'.repeat(Math.round(casino.rating))}${'☆'.repeat(5 - Math.round(casino.rating))}</div>
  </div>
</div>
<div class="casino-card__body">
  <div class="casino-card__bonus">
    <span class="bonus-title">${bonusDisplay.bonus_title}</span>
    <span class="bonus-value">${bonusDisplay.bonus_value}</span>
  </div>
  ${geoStatusText}
  ${complianceHtml}
</div>
      <div class="casino-card__actions">
        <a href="/en/go/${casino.slug}" class="btn btn--primary" rel="nofollow sponsored">Visit</a>
      </div>
    </div>`;
  }).join('');
}

export async function renderReview(request, env, slug, ctx = null) {
  const review = await reviews.getReview(env.DB, slug);
  if (!review) return render404(request, env);

  // Analytics (Phase: page-view instrumentation). Cheap edge-provided
  // country only -- no geoEngine.process() call here since reviews
  // don't evaluate a GEO access rule the way casino pages do, and
  // adding one purely for logging would be exactly the kind of
  // unnecessary per-render cost the brief warns against.
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'REVIEW_VIEW',
        reviewId: review.id,
        countryCode: request.cf?.country || null,
        city: request.cf?.city || null,
        referrer: request.headers.get('referer') || null,
        landingPage: `/en/review/${slug}`
      }).catch(() => {})
    );
  }

  const renderer = new Renderer(env, request);

  let pros = [], cons = [];

  try {
    const parsedPros = JSON.parse(review.pros || "[]");
    pros = Array.isArray(parsedPros) ? parsedPros : [];
  } catch {}

  try {
    const parsedCons = JSON.parse(review.cons || "[]");
    cons = Array.isArray(parsedCons) ? parsedCons : [];
  } catch {}

  let faqHtml = "";

  try {
    const parsedFaqs = JSON.parse(review.faq_json || "[]");
    const faqs = Array.isArray(parsedFaqs) ? parsedFaqs : [];

    faqHtml = faqs.map(faq => `
    <div class="faq-item">
      <button class="faq-question">
        ${faq.q}
      </button>

      <div class="faq-answer">
        <p>${faq.a}</p>
      </div>
    </div>
  `).join("");

} catch {
  faqHtml = "";
}
  const prosHtml = pros.length
    ? `<ul>${pros.map(p => `<li>${p}</li>`).join("")}</ul>`
    : "<p class='muted'>No pros listed.</p>";

  const consHtml = cons.length
    ? `<ul>${cons.map(c => `<li>${c}</li>`).join("")}</ul>`
    : "<p class='muted'>No cons listed.</p>";

  // Geo evaluation for the casino connected to this review (sync, no DB)
  let geoCountry = "";
  let geoFlag = "";
  if (review.casino_slug) {
    const edgeGeo = {
      country: request.cf?.country || null,
      city: request.cf?.city || "Unknown"
    };
    const geoInfo = geoEngine.process(request, edgeGeo);
    geoCountry = geoInfo.country;
    geoFlag = countryToFlag(geoCountry);
  }

  // All of these are independent of each other, so run them
  // concurrently instead of one-by-one. Also fetches the linked
  // casino exactly once (it was previously fetched twice — once
  // for the casino card, again for the schema/related-casinos).
  const [site, author, casino, geoStatus, allComponents, reviewBlocksHtml, dynamicSeo, reviewDisplayContent] = await Promise.all([
    getSiteContext(request, env),
    review.author_id ? authors.getAuthorById(env.DB, review.author_id) : Promise.resolve(null),
    review.casino_slug ? casinos.getCasino(env.DB, review.casino_slug) : Promise.resolve(null),
    review.casino_slug ? evaluateCasinoGeo(env, review.casino_slug, geoCountry) : Promise.resolve("allowed"),
    renderer.renderAllComponents("review", slug, ctx),
    renderer.renderReviewBlocks(slug),
    renderer.loadDynamicSeo("review", slug),
    injectInlineAds(review.content || "", env, request, "review").catch(e => {
      console.error("Inline ad injection error (review):", e.message);
      return review.content || "";
    }),
  ]);

  const casinoName = casino?.name || "";

  // casinoCardHtml and relatedCasinosHtml both depend on `casino`
  // above but not on each other, so they run together too.
  const [casinoCardHtml, relatedCasinosHtml] = await Promise.all([
    (async () => {
      if (!casino) return "";
      const reviewBonusOverrides = await resolveBonusOverridesForList(env, [casino], geoCountry);
      return buildReviewCasinoCards(
        [casino],
        { country: geoCountry, statuses: { [casino.slug]: geoStatus } },
        reviewBonusOverrides
      );
    })(),
    (async () => {
      if (!casino) return "";
      const cacheKey = `related_casinos:${casino.id}:${geoCountry || "none"}`;
      try {
        const cached = await getCached(env, cacheKey);
        if (cached !== null) return cached;
      } catch { /* fall through to compute fresh */ }
      try {
        const relatedCasinos = await getRelatedCasinos(env.DB, casino, geoCountry, 6);
        if (relatedCasinos.length === 0) {
          await setCached(env, cacheKey, "", 300);
          return "";
        }
        const relatedGeoData = {
          country: geoCountry,
          statuses: Object.fromEntries(relatedCasinos.map(c => [c.slug, "allowed"]))
        };
        const relatedBonusOverrides = await resolveBonusOverridesForList(env, relatedCasinos, geoCountry);
        const html = buildCasinoCards(relatedCasinos, relatedGeoData, relatedBonusOverrides);
        await setCached(env, cacheKey, html, 300);
        return html;
      } catch (e) {
        console.error("Related casinos failed to load:", e.message);
        return "";
      }
    })(),
  ]);

  const reviewSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "headline": review.title,
    "reviewBody": (review.content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim(),
   // "reviewBody": review.content || "",
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": review.rating || "5",
      "bestRating": 5
    },
    "itemReviewed": {
      "@type": "Casino",
      "name": casino?.name || casinoName || review.title,
     // "name": review.title.replace("Review", "").trim(),
      "url": site.url(`/en/review/${slug}`)
    },
    "author": {
      "@type": "Person",
      "name": author?.name || site.siteName
    },
  "publisher": {
  "@type": "Organization",
  "name": site.siteName,
  "url": site.origin,
  "logo": {
    "@type": "ImageObject",
    "url": site.logoUrl
  }
},
"datePublished": review.created_at
  ? new Date(review.created_at).toISOString()
  : undefined,

"dateModified": (review.updated_at || review.created_at)
  ? new Date(review.updated_at || review.created_at).toISOString()
  : undefined,
};

  const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

  const html = await renderer.render("review.html", {
    ...review,
    // {{vars}} are not HTML-escaped by the template engine.
    title: escapeHtml(review.title),
    content: reviewDisplayContent,
    casino_name: escapeHtml(casinoName),
    author_name: author?.name || "",
    author_bio: author?.bio || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    author_social: author?.social_links || "",
    reviewed_at: formatDate(review.created_at),
    updated_at: formatDate(review.updated_at || review.created_at),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    review_blocks_html: reviewBlocksHtml,
    seo_title: dynamicSeo.seo_title || review.seo_title || review.title,
    seo_description: dynamicSeo.seo_description || review.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || review.seo_keywords || "",
    og_image: casino?.logo ? site.url(casino.logo) : site.ogImageUrl,
    og_image_alt: casino?.name || review.title,
    canonical: dynamicSeo.canonical || site.url(`/en/review/${slug}`),
    faq_html: faqHtml,
    pros_html: prosHtml,
    cons_html: consHtml,
    casino_card_html: casinoCardHtml,
    casino_slug: review.casino_slug || "",
    geo_country: countryFullName(geoCountry),
    geo_status: geoStatus,
    geo_flag: geoFlag,
    related_casinos_html: relatedCasinosHtml
  }, reviewSchema, buildBreadcrumbs("review", { title: review.title }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

// ── Newsroom: landing pages under /en/news/... (sections, regions, countries,
//    topics, entities, series) plus slug redirects ──
// Resolution for /en/news/<slug> when no LIVE article has that slug:
//   1. 301 to the article's current slug if it was renamed (always on: only ever
//      fires for URLs that would otherwise 404),
//   2. section, region, country pages (flag news_new_taxonomy),
//   3. 404.
// A live article ALWAYS wins over any of these (its URL is already indexed).
async function renderNewsSectionOr404(request, env, slug, { allowRedirect = false } = {}) {
  try {
    if (allowRedirect) {
      const target = await newsroom.getRedirectTarget(env.DB, slug);
      if (target) return new Response(null, { status: 301, headers: { Location: `/en/news/${encodeURIComponent(target)}`, "Cache-Control": "public, max-age=3600" } });
    }
    const flags = await newsroom.getNewsFlags(env.DB);
    if (flags.news_new_taxonomy) {
      const res = await renderNewsSection(request, env, slug)
        || await renderNewsRegion(request, env, slug)
        || await renderNewsCountry(request, env, slug);
      if (res) return res;
    }
  } catch (e) {
    console.error("News landing fallback failed:", e.message);
  }
  return render404(request, env);
}

// Generic listing page. `spec.load({limit, offset})` returns { articles, total }.
async function renderNewsCollection(request, env, spec) {
  const url = new URL(request.url);
  const rawPage = url.searchParams.get("page");
  const page = rawPage === null ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1 || page > 500) return render404(request, env);
  const PAGE_SIZE = 12;

  const renderer = new Renderer(env, request);
  const [site, listing] = await Promise.all([
    getSiteContext(request, env),
    spec.load({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  ]);

  const totalPages = Math.max(1, Math.ceil(listing.total / PAGE_SIZE));
  if (page > totalPages) return render404(request, env);   // no thin/duplicate out-of-range pages

  const canonical = spec.canonicalPath ? site.url(spec.canonicalPath)
    : site.url(page === 1 ? spec.basePath : `${spec.basePath}?page=${page}`);  // query noise never changes the canonical
  const description = spec.seoDescription || spec.description || `${spec.name} news from ${site.siteName}.`;
  const offset = (page - 1) * PAGE_SIZE;
  const cards = listing.articles.map((a, i) => spec.renderCard ? spec.renderCard(a, offset + i + 1) : nrRender.renderArticleCard(a, formatDate)).join("");
  const empty = listing.articles.length ? "" :
    `<p style="padding:40px 0;color:var(--gray)">${spec.emptyMessage || "No articles here yet."} <a href="/en/news">Browse all news</a>.</p>`;

  const schema = {
    "@context": "https://schema.org",
    "@type": spec.schemaType || "CollectionPage",
    "@id": `${canonical}#webpage`,
    "url": canonical,
    "name": spec.name,
    "description": description,
    "isPartOf": { "@type": "WebSite", "@id": `${site.origin}#website`, "name": site.siteName, "url": site.origin },
    ...(spec.schemaExtra || {}),
    ...(listing.articles.length ? {
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": listing.articles.map((a, i) => ({
          "@type": "ListItem", "position": offset + i + 1,
          "url": site.url(`/en/news/${a.slug}`), "name": a.title
        }))
      }
    } : {})
  };

  const noindex = listing.total === 0 || /noindex/i.test(spec.robots || "");
  const html = await renderer.render("news-section.html", {
    canonical,
    page_title: nrRender.esc(spec.name),
    page_description: nrRender.esc(spec.description || description),
    header_extra_html: spec.headerHtml || "",
    news_cards: cards,
    empty_state_html: empty,
    pagination_html: (spec.resultCountHtml || "") + nrRender.renderPagination(spec.basePath, page, totalPages, spec.queryString || ""),
    seo_title: spec.seoTitle || `${spec.name} | ${site.siteName}`,
    seo_description: description,
    robots: noindex ? "noindex, follow" : "index, follow"
  }, schema, [
    { label: "Home", url: "/en" },
    { label: "News", url: "/en/news" },
    ...(spec.crumbs || []),
    { label: spec.crumbLabel || spec.name, url: null }
  ]);

  return new Response(html, { headers: cacheHeaders() });
}

// News search v2 (flag news_search_v2): keyword + section / author / country / entity / type / date filters.
// Returns null when it cannot answer well (index not built yet) so the caller uses the existing page.
async function renderNewsSearch(request, env, flags, sp) {
  if (sp.q && !(await env.DB.prepare(`SELECT 1 AS x FROM news_search_docs LIMIT 1`).first())) return null;
  const url = new URL(request.url);
  const facets = await nrSearch.getSearchFacets(env.DB, env, { entityPages: !!flags.news_entity_pages });
  const qsParams = new URLSearchParams();
  for (const k of ["q", "section", "author", "country", "entity", "type", "from", "to"]) if (sp[k]) qsParams.set(k, sp[k]);
  const queryString = qsParams.toString();
  let shown = 0;
  return renderNewsCollection(request, env, {
    basePath: "/en/news", canonicalPath: "/en/news", queryString,
    name: sp.q ? `Search: ${sp.q}` : "Filtered news", crumbLabel: "Search",
    description: "", seoTitle: null, seoDescription: "Search the news archive.",
    robots: "noindex, follow", schemaType: "SearchResultsPage",   // result pages are never indexed
    emptyMessage: "No articles match your search.",
    headerHtml: nrRender.renderSearchForm({ params: sp, facets }),
    load: async ({ limit, offset }) => {
      const r = await nrSearch.searchNews(env.DB, { ...sp, page: Math.floor(offset / limit) + 1 }, { mode: "public", pageSize: limit });
      shown = r.total;
      return r.ok ? { articles: r.articles, total: r.total } : { articles: [], total: 0 };
    },
    get resultCountHtml() { return `<p class="nr-search__count" role="status">${shown} ${shown === 1 ? "result" : "results"}</p>`; }
  });
}

async function renderNewsSection(request, env, slug) {
  const section = await newsroom.getSectionBySlug(env.DB, slug);
  if (!section) return null;
  const ids = await newsroom.getSectionIds(env.DB, section.id);
  return renderNewsCollection(request, env, {
    basePath: `/en/news/${section.slug}`, name: section.name, description: section.description,
    seoTitle: section.seo_title, seoDescription: section.seo_description,
    load: (p) => newsroom.getSectionArticles(env.DB, ids, p)
  });
}

async function renderNewsRegion(request, env, slug) {
  const region = await newsroom.getRegionBySlug(env.DB, slug);
  if (!region) return null;
  return renderNewsCollection(request, env, {
    basePath: `/en/news/${region.slug}`, name: region.name,
    description: `${region.name} iGaming news and regulation.`,
    load: (p) => newsroom.getRegionArticles(env.DB, region.slug, p)
  });
}

async function renderNewsCountry(request, env, slug) {
  const country = await newsroom.getCountryBySlug(env.DB, slug);
  if (!country) return null;
  if (country.isAlias) {   // one indexable URL per country
    return new Response(null, { status: 301, headers: { Location: `/en/news/${country.canonical}`, "Cache-Control": "public, max-age=3600" } });
  }
  return renderNewsCollection(request, env, {
    basePath: `/en/news/${country.canonical}`, name: country.name,
    description: `Gambling industry news from ${country.name}.`,
    seoTitle: country.seo_title || null, seoDescription: null, robots: country.robots || "",
    load: (p) => newsroom.getCountryArticles(env.DB, country.code, p)
  });
}

// Two-segment pages: /en/news/topic/<slug>, /en/news/entity/<slug>, /en/news/series/<slug>
export async function renderNewsTaxonomyPage(request, env, kind, slug) {
  try {
    const flags = await newsroom.getNewsFlags(env.DB);
    if (kind === "entity" ? !flags.news_entity_pages : !flags.news_new_taxonomy) return render404(request, env);

    if (kind === "topic") {
      const t = await newsroom.getTopicBySlug(env.DB, slug);
      if (!t) return render404(request, env);
      return renderNewsCollection(request, env, {
        basePath: `/en/news/topic/${t.slug}`, name: t.name, description: t.description,
        seoTitle: t.seo_title, seoDescription: t.seo_description,
        load: (p) => newsroom.getTopicArticles(env.DB, t.id, p)
      });
    }
    if (kind === "series") {
      const s = await newsroom.getSeriesBySlug(env.DB, slug);
      if (!s) return render404(request, env);
      return renderNewsCollection(request, env, {
        basePath: `/en/news/series/${s.slug}`, name: s.name, description: s.description,
        seoTitle: s.seo_title, seoDescription: s.seo_description,
        load: (p) => newsroom.getSeriesArticles(env.DB, s.id, p),
        renderCard: (a, n) => `<div class="nr-series-part"><p class="nr-part">Part ${n}</p>${nrRender.renderArticleCard(a, formatDate)}</div>`
      });
    }
    if (kind === "entity") {
      const e = await newsroom.getEntityBySlug(env.DB, slug);
      if (!e) return render404(request, env);
      return renderNewsCollection(request, env, {
        basePath: `/en/news/entity/${e.slug}`, name: e.name, description: e.description,
        seoTitle: e.seo_title, seoDescription: e.seo_description,
        headerHtml: nrRender.renderEntityAbout(e),
        schemaExtra: { about: nrRender.entitySchema(e) },
        load: (p) => newsroom.getEntityArticles(env.DB, e.id, p)
      });
    }
  } catch (err) {
    console.error("News taxonomy page failed:", kind, err.message);
  }
  return render404(request, env);
}

export async function renderNews(request, env, slug, ctx = null) {
  const article = await news.getNews(env.DB, slug);
  if (!article) return renderNewsSectionOr404(request, env, slug, { allowRedirect: true });

  // Security: only render published, currently-live articles publicly
  if (!article.published || Number(article.published) !== 1) {
    return renderNewsSectionOr404(request, env, slug);
  }

  // Security: respect scheduled publishing — hide articles whose published_at is in the future
  if (article.published_at) {
    const pubDate = new Date(article.published_at);
    if (!Number.isNaN(pubDate.getTime()) && pubDate > new Date()) {
      return renderNewsSectionOr404(request, env, slug);
    }
  }

  // Analytics (Phase: page-view instrumentation). Placed after the
  // published/scheduled guards above so an unpublished or not-yet-live
  // article being probed never generates a CONTENT_VIEW row -- same
  // reasoning as why those guards return 404 rather than the real
  // content. No geoEngine.process() call, same as renderReview: news
  // articles don't evaluate a GEO access rule, so this uses the free
  // edge-provided country/city directly instead of adding a computation
  // to the render path purely to feed analytics.
  if (ctx && typeof ctx.waitUntil === 'function') {
    // Optional enrichment (flag news_analytics_enrichment, off by default): bot flag,
    // device class and UTM parameters, so crawlers stop counting as readers.
    // The flag read is cached (30 s) and shared with the newsroom loaders below.
    let enrich = {};
    try {
      if ((await newsroom.getNewsFlags(env.DB)).news_analytics_enrichment) enrich = nrAnalytics.enrichNewsView(request);
    } catch { /* recording extra fields is best-effort */ }
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'CONTENT_VIEW',
        newsId: article.id,
        countryCode: request.cf?.country || null,
        city: request.cf?.city || null,
        referrer: request.headers.get('referer') || null,
        landingPage: `/en/news/${slug}`,
        ...enrich
      }).catch(() => {})
    );
  }

  const renderer = new Renderer(env, request);

  // ── Related news by shared tags ──────────────────────
  const relatedNewsPromise = (async () => {
    if (!article.tags) return "";
    try {
      const related = await news.getRelatedNews(env.DB, article.slug, article.tags, 3);
      if (related.length === 0) return "";
      return related.map(item => {
        const img = item.featured_image_url || item.featured_image_thumbnail || "";
        const imgHtml = img
          ? `<div style="aspect-ratio:16/9;overflow:hidden;border-radius:8px"><img src="${escapeHtml(img)}" alt="${escapeHtml(safeAlt(item.featured_image_alt, item.title))}" style="width:100%;height:100%;object-fit:cover" loading="lazy" decoding="async"></div>`
          : "";
        const date = item.published_at || item.created_at;
        return `
            <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:10px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s">
              <a href="/en/news/${encodeURIComponent(item.slug)}" style="display:block;color:inherit;text-decoration:none">
                ${imgHtml}
                <div style="padding:14px">
                  ${date ? `<time style="display:block;margin-bottom:6px;color:var(--gray);font-size:12px">${escapeHtml(formatDate(date))}</time>` : ""}
                  <h3 style="margin:0 0 6px;font-size:16px;line-height:1.3;color:var(--dark)">${escapeHtml(item.title)}</h3>
                  ${item.excerpt ? `<p style="margin:0;color:var(--gray);font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(item.excerpt)}</p>` : ""}
                </div>
              </a>
            </article>
          `;
      }).join("");
    } catch (e) {
      console.error("Related news error:", e.message);
      return "";
    }
  })();

  // These are all independent of each other, so run them concurrently.
  const [site, author, allComponents, dynamicSeo, relatedNewsHtml, displayContent, newsroomData] = await Promise.all([
    getSiteContext(request, env),
    article.author_id ? authors.getAuthorById(env.DB, article.author_id) : Promise.resolve(null),
    renderer.renderAllComponents("news", slug, ctx),
    renderer.loadDynamicSeo("news", slug),
    relatedNewsPromise,
    injectInlineAds(article.content || "", env, request, "news").catch(e => {
      console.error("Inline ad injection error:", e.message);
      return article.content || "";
    }),
    // Newsroom layer: null (and zero extra queries beyond a cached flag read)
    // unless a newsroom feature flag is on. Never fails the page.
    nrTrust.loadNewsroomForArticle(env.DB, article)
      .catch(e => { console.error("Newsroom load failed:", e.message); return null; }),
  ]);

  const canonical = dynamicSeo.canonical || site.url(`/en/news/${article.slug}`);

  const publishedDate = article.published_at || article.created_at;
  const modifiedDate = article.updated_at || publishedDate;
  const publishedIso = toIsoDate(publishedDate);
  const modifiedIso = toIsoDate(modifiedDate);
  const publishedDisplay = formatDate(publishedDate);
  const modifiedDisplay = formatDate(modifiedDate);

  const cleanContent = stripHtml(article.content || "");
  const description = dynamicSeo.seo_description || article.seo_description || article.excerpt || truncateText(article.content, 160);

  const articleAuthorName = author?.name || article.author || site.siteName;
  const featuredImage = article.featured_image_url || article.featured_image_thumbnail || "";
  const featuredImageAlt = safeAlt(article.featured_image_alt, article.title);

  // ── Social image: dedicated OG Image -> Featured Image -> site default ──
  // The News Dashboard lets an editor set an OG Image independently of the
  // Featured Image; when it's empty, the visible Featured Image is reused
  // for sharing instead of falling straight through to the site logo.
  const socialImageRaw = article.og_image_url || featuredImage || "";
  const socialImage = socialImageRaw ? site.url(socialImageRaw) : site.ogImageUrl;
  const socialImageAlt = article.og_image_url
    ? safeAlt(article.og_image_alt, article.title)
    : featuredImageAlt;
  // Only emit width/height when the selected social image's real
  // dimensions are known from the stored media record — never a guessed
  // 1200x675 for an image whose actual size we don't have.
  const socialImageWidth = article.og_image_url ? article.og_image_width : article.featured_image_width;
  const socialImageHeight = article.og_image_url ? article.og_image_height : article.featured_image_height;

  // Build author HTML in the controller — avoids template {{else}} issues
  let authorHtml = "";
  if (articleAuthorName) {
    const avatarHtml = (author?.avatar_url || article.author_avatar)
      ? `<img src="${escapeHtml(author?.avatar_url || article.author_avatar)}" alt="${escapeHtml(articleAuthorName)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
      : "";
    const nameHtml = (author?.slug || article.author_slug)
      ? `<a href="/en/author/${escapeHtml(author?.slug || article.author_slug)}" style="font-weight:700;text-decoration:none">${escapeHtml(articleAuthorName)}</a>`
      : `<strong>${escapeHtml(articleAuthorName)}</strong>`;
    // With the newsroom taxonomy flag on, prefer the author's job title (Senior Editor, Correspondent, ...).
    const displayRole = (newsroomData?.flags?.news_new_taxonomy && author?.job_title) || author?.role || article.author_role;
    const roleHtml = displayRole
      ? `<span style="color:var(--gray);font-size:12px;display:block">${escapeHtml(displayRole)}</span>`
      : "";
    authorHtml = `
      <div style="display:flex;align-items:center;gap:10px">
        ${avatarHtml}
        <div>
          <span style="color:var(--gray);font-size:12px">By</span><br>
          ${nameHtml}
          ${roleHtml}
        </div>
      </div>
    `;
  }


  // ── Tags as clickable links ──────────────────────────
  let tagsHtml = "";
  if (article.tags) {
    tagsHtml = String(article.tags)
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .map(tag => {
        const escaped = escapeHtml(tag);
        return `<a href="/en/news?tag=${encodeURIComponent(tag)}" class="news-tag" rel="tag" style="display:inline-block;padding:7px 14px;border-radius:999px;background:var(--bg);border:1px solid var(--light-gray);color:var(--dark);font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s">${escaped}</a>`;
      })
      .join("");
  }

  const wordCount = cleanContent ? cleanContent.split(/\s+/).filter(Boolean).length : 0;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${canonical}#newsarticle`,
    "url": canonical,
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "headline": article.title,
    "description": description,
    ...(featuredImage ? { "image": [featuredImage] } : {}),
    "datePublished": publishedIso,
    "dateModified": modifiedIso,
    "author": {
      "@type": "Person",
      "name": articleAuthorName,
      ...(author?.slug ? { "url": site.url(`/en/author/${author.slug}`) } : {}),
      ...(author?.avatar_url ? { "image": author.avatar_url } : {})
    },
    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin,
      ...(site.logoUrl ? { "logo": { "@type": "ImageObject", "url": site.logoUrl } } : {})
    },
    "articleBody": cleanContent,
    "wordCount": wordCount,
    "articleSection": "News",
    "inLanguage": "en",
    ...(article.tags ? { "keywords": article.tags } : {})
  };

  let nrBlocks = { kicker_html: "", notice_html: "", timeline_html: "", after_html: "", related_html: "", schema: {} };
  try {
    if (newsroomData?.extras) {
      nrBlocks = nrRender.buildNewsroomBlocks({
        article, extras: newsroomData.extras, flags: newsroomData.flags,
        siteName: site.siteName, formatDate, policyLinks: newsroomData.policyLinks
      });
    }
  } catch (e) {
    console.error("Newsroom blocks failed (page renders without them):", e.message);
  }
  Object.assign(articleSchema, nrBlocks.schema);

  let articleCrumbs = buildBreadcrumbs("news", { title: article.title });
  const nrSection = newsroomData?.flags?.news_new_taxonomy ? newsroomData.extras?.section : null;
  if (nrSection && articleCrumbs.length > 1) {
    articleCrumbs = [
      ...articleCrumbs.slice(0, -1),
      { label: nrSection.name, url: `/en/news/${nrSection.slug}` },
      articleCrumbs[articleCrumbs.length - 1]
    ];
  }

  const html = await renderer.render("news.html", {
    ...article,
    // The template engine does not HTML-escape {{vars}}; escape the ones the
    // article template puts in text/attribute positions.
    title: escapeHtml(article.title),
    newsroom_kicker_html: nrBlocks.kicker_html,
    newsroom_notice_html: nrBlocks.notice_html,
    newsroom_timeline_html: nrBlocks.timeline_html,
    newsroom_after_html: nrBlocks.after_html,
    newsroom_discovery_html: nrBlocks.discovery_html,
    newsroom_related_html: nrBlocks.related_html,
    canonical,
    seo_title: dynamicSeo.seo_title || article.seo_title || article.title,
    seo_description: description,
    seo_keywords: dynamicSeo.seo_keywords || article.seo_keywords || "",
    og_type: "article",
    og_image: socialImage,
    og_image_alt: socialImageAlt,
    ...(socialImageWidth ? { og_image_width: socialImageWidth } : {}),
    ...(socialImageHeight ? { og_image_height: socialImageHeight } : {}),
    author_name: author?.name || article.author || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    author_html: authorHtml,
    featured_image_url: escapeHtml(featuredImage),
    featured_image_alt: escapeHtml(featuredImageAlt),
    featured_image_caption: escapeHtml(article.featured_image_caption || ""),
    published_at: publishedDisplay,
    updated_at: modifiedDisplay,
    tags_html: tagsHtml,
    related_news_html: relatedNewsHtml,
    content: displayContent,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar
  }, articleSchema, articleCrumbs);

  return new Response(html, { headers: cacheHeaders() });
}


export async function renderNewsbackup(request, env, slug) {
  const article = await news.getNews(env.DB, slug);
  if (!article) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  let author = null;

  if (article.author_id) {
    author = await authors.getAuthorById(
      env.DB,
      article.author_id
    );
  }

  const allComponents =
    await renderer.renderAllComponents("news", slug);

  const reviewBlocksHtml =
    await renderer.renderReviewBlocks(slug);

  const dynamicSeo =
    await renderer.loadDynamicSeo("news", slug);

  const canonical =
    dynamicSeo.canonical ||
    site.url(`/en/news/${article.slug}`);

  const description =
    dynamicSeo.seo_description ||
    article.seo_description ||
    truncateText(article.content, 160);

  const published =
    toIsoDate(article.created_at);

  const modified =
    toIsoDate(
      article.updated_at ||
      article.created_at
    );

  const cleanArticleBody =
    stripHtml(article.content || "");

  const articleAuthorName =
    author?.name ||
    article.author ||
    site.siteName;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",

    "@id": `${canonical}#newsarticle`,

    "url": canonical,

    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonical
    },

    "headline": article.title,

    "description": description,

    "datePublished": published,

    "dateModified": modified,

    "author": {
      "@type": "Person",
      "name": articleAuthorName,
      ...(author?.slug
        ? {
            "url": site.url(
              `/en/author/${author.slug}`
            )
          }
        : {})
    },

    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin,

      ...(site.logoUrl
        ? {
            "logo": {
              "@type": "ImageObject",
              "url": site.logoUrl
            }
          }
        : {})
    },

    "articleBody": cleanArticleBody,

    "inLanguage": "en",

    "isPartOf": {
      "@type": "WebSite",
      "name": site.siteName,
      "url": site.origin
    },

    "articleSection": "News",

    "wordCount": cleanArticleBody
      ? cleanArticleBody.split(/\s+/).length
      : 0
  };

  const html = await renderer.render(
    "news.html",
    {
      ...article,

      canonical,

      author_name:
        author?.name ||
        article.author ||
        "",

      author_avatar:
        author?.avatar_url ||
        "",

      author_role:
        author?.role ||
        "",

      author_slug:
        author?.slug ||
        "",

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar,

      seo_title:
        dynamicSeo.seo_title ||
        article.seo_title ||
        article.title,

      seo_description:
        description,

      seo_keywords:
        dynamicSeo.seo_keywords ||
        article.seo_keywords ||
        "",

    },
    articleSchema,
    buildBreadcrumbs(
      "news",
      {
        title: article.title
      }
    )
  );

  return new Response(
    html,
    {
      headers: cacheHeaders()
    }
  );
}


// ============================================================
// AD INJECTION ENGINE — Hybrid Mode
// Pipeline: 1. Disable check → 2. Resolve manual markers
//           → 3. Apply automatic rules (respecting manual placements)
//           → 4. Device/GEO/schedule filtering
// ============================================================

async function injectInlineAds(content, env, request, pageType = 'news') {
  if (!content) return content;

  // 1. Check if ads are disabled for this article
  if (/<!--\s*ADS:DISABLE\s*-->/i.test(content)) {
    return content.replace(/<!--\s*ADS:DISABLE\s*-->/gi, "");
  }

  // 2. Load Ad Library
  const adComponents = await loadAdComponents(env);
  const adById = new Map();
  const adBySlug = new Map();

  for (const ad of adComponents) {
    adById.set(ad.id, ad);
    adBySlug.set(ad.slug, ad);
  }

  // 3. Load settings fallback ad
  let settingsAd = null;
  try {
    const adSetting = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'news_inline_ad'"
    ).first();
    const rawValue = adSetting?.value || "";
    if (rawValue) {
      if (rawValue.startsWith("component:")) {
        const slug = rawValue.slice("component:".length).trim();
        settingsAd = adBySlug.get(slug) || null;
      } else {
        settingsAd = {
          id: 0,
          slug: "settings-fallback",
          html: rawValue,
          status: "active"
        };
      }
    }
  } catch (_) {}

  // 4. Resolve explicit manual markers
  const markerRegex = /<!--\s*AD:([^>]+?)\s*-->/gi;
  const manuallyUsedComponentIds = new Set();
  let hasManualMarkers = false;

  let result = content.replace(markerRegex, (match, identifier) => {
    const id = identifier.trim();
    hasManualMarkers = true;

    // AUTO markers — resolve later
    if (id.toUpperCase() === "AUTO") return match;

    // Resolve by component:ID
    if (id.startsWith("component:")) {
      const compId = parseInt(id.slice("component:".length), 10);
      const ad = adById.get(compId);
      if (ad && ad.html) {
        manuallyUsedComponentIds.add(compId);
        return `\n${ad.html}\n`;
      }
      return `\n<!-- AD NOT FOUND: ${id} -->\n`;
    }

    // Resolve by slug
    const ad = adBySlug.get(id);
    if (ad && ad.html) {
      manuallyUsedComponentIds.add(ad.id);
      return `\n${ad.html}\n`;
    }

    // Resolve settings fallback
    if (settingsAd && settingsAd.slug === id && settingsAd.html) {
      return `\n${settingsAd.html}\n`;
    }

    return `\n<!-- AD NOT FOUND: ${id} -->\n`;
  });

  // 5. Handle AUTO markers
  let autoIndex = 0;
  const autoAds = adComponents.filter(a => !manuallyUsedComponentIds.has(a.id));
  if (settingsAd && settingsAd.html && !manuallyUsedComponentIds.has(0)) {
    autoAds.unshift(settingsAd);
  }

  result = result.replace(/<!--\s*AD:AUTO\s*-->/gi, () => {
    if (autoIndex < autoAds.length) {
      const ad = autoAds[autoIndex++];
      manuallyUsedComponentIds.add(ad.id);
      return `\n${ad.html}\n`;
    }
    return "";
  });

  // 6. Apply automatic rules (HYBRID MODE — does NOT disable when manual ads exist)
  try {
    const rules = await getEnabledAdRules(env.DB, pageType);
    const requestInfo = extractRequestInfo(request);

    result = applyAutoRules(
      result,
      rules,
      manuallyUsedComponentIds,
      requestInfo,
      pageType
    );
  } catch (e) {
    console.error("Auto ad rules error:", e.message);
  }

  return result;
}

// ── Extract device + GEO info from request ──────────────

function extractRequestInfo(request) {
  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";

  let device = "desktop";
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
    device = /ipad|tablet/i.test(ua) ? "tablet" : "mobile";
  }

  return {
    device,
    country: cf.country || null,
    hostname: new URL(request.url).hostname
  };
}

// ── Apply automatic rules with all targeting ────────────

function applyAutoRules(content, rules, usedComponentIds, requestInfo, pageType) {
  if (!rules || rules.length === 0) return content;

  const insertionCount = new Map();
  const allInsertions = []; // { index, html, order } — computed against the ORIGINAL content

  for (const rule of rules) {
    // Skip if component already used manually and max_appearances is 1
    if (usedComponentIds.has(rule.component_id) && rule.max_appearances <= 1) {
      continue;
    }

    // Check scheduling
    if (!isRuleActiveNow(rule)) continue;

    // Check device targeting
    if (!ruleMatchesDevice(rule, requestInfo.device)) continue;

    // Check GEO targeting
    if (!ruleMatchesCountry(rule, requestInfo.country)) continue;

    // Check page type targeting
    if (!ruleMatchesPageType(rule, pageType)) continue;

    // Get ad HTML
    let htmlToInject = rule.component_html || "";
    if (!htmlToInject) continue;

    // Track appearances
    const currentCount = insertionCount.get(rule.id) || 0;
    const remainingSlots = rule.max_appearances - currentCount;
    if (remainingSlots <= 0) continue;

    // Compute insertion points against the ORIGINAL, untouched content.
    // This is the key fix: every rule's paragraph/heading/image positions
    // are located against the same fixed baseline, so an earlier rule's
    // injected ad HTML (which may itself contain <p> tags) can never shift
    // where a later rule lands.
    let points = findInsertionPoints(content, rule);
    if (points.length > remainingSlots) points = points.slice(0, remainingSlots);
    if (points.length === 0) continue;

    for (const idx of points) {
      allInsertions.push({ index: idx, html: `\n${htmlToInject}\n`, order: allInsertions.length });
    }

    insertionCount.set(rule.id, currentCount + points.length);
    usedComponentIds.add(rule.component_id);
  }

  if (allInsertions.length === 0) return content;

  // Apply from the last position to the first so earlier indices stay valid.
  // For insertions that land at the exact same index, process the
  // higher-`order` (later-added) one first so the original rule/priority
  // order is preserved in the final reading order.
  allInsertions.sort((a, b) => (b.index - a.index) || (b.order - a.order));

  let modified = content;
  for (const ins of allInsertions) {
    modified = modified.slice(0, ins.index) + ins.html + modified.slice(ins.index);
  }
  return modified;
}

// ── Compute insertion points for a rule against a fixed baseline ────────

function getParagraphEndPositions(content) {
  const regex = /<\/p>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function getParagraphStartPositions(content) {
  const regex = /<p[^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

function getHeadingEndPositions(content) {
  const regex = /<\/h[1-6]>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function getHeadingStartPositions(content) {
  const regex = /<h[1-6][^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

function getImageEndPositions(content) {
  const regex = /<img\b[^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function pickPosition(positions, positionValue) {
  if (positions.length === 0) return undefined;

  const wanted = Number(positionValue) || 1;
  const clamped = Math.min(
    Math.max(wanted, 1),
    positions.length
  );

  return positions[clamped - 1];
}

function findInsertionPoints(content, rule) {
  // Repeat mode: insert after every Nth paragraph, starting at position_value
  if (rule.repeat_interval > 0 && rule.placement === 'after_paragraph') {
    const positions = getParagraphEndPositions(content);
    const points = [];
    const start = rule.position_value || 1;
    const interval = rule.repeat_interval;
    for (let p = start; p <= positions.length && points.length < rule.max_appearances; p += interval) {
      points.push(positions[p - 1]);
    }
    return points;
  }

  switch (rule.placement) {
    case 'after_paragraph': {
      const positions = getParagraphEndPositions(content);
      const idx = positions[(rule.position_value || 3) - 1];
      return idx !== undefined ? [idx] : [];
    }
    case 'before_paragraph': {
      const positions = getParagraphStartPositions(content);
      const idx = positions[(rule.position_value || 1) - 1];
      return idx !== undefined ? [idx] : [];
    }
    case 'end_of_article':
      return [content.length];
    case 'before_article':
      return [0];
    case 'after_heading': {
      const idx = pickPosition(
        getHeadingEndPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }

    case 'before_heading': {
      const idx = pickPosition(
        getHeadingStartPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }

    case 'after_first_image': {
      const idx = pickPosition(
        getImageEndPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }
    case 'middle_of_article': {
      const positions = getParagraphEndPositions(content);
      if (positions.length === 0) return [content.length];
      return [positions[Math.floor(positions.length / 2)]];
    }
    default:
      return [];
  }
}

// ── Scheduling check ────────────────────────────────────

function isRuleActiveNow(rule) {
  const now = new Date();

  if (rule.start_date) {
    const start = new Date(rule.start_date);
    if (now < start) return false;
  }

  if (rule.end_date) {
    const end = new Date(rule.end_date);
    if (now > end) return false;
  }

  return true;
}

// ── Device targeting ─────────────────────────────────────

function ruleMatchesDevice(rule, requestDevice) {
  if (!rule.devices || rule.devices === 'all') return true;
  if (rule.devices === requestDevice) return true;
  // Allow comma-separated device lists
  const devices = rule.devices.split(',').map(d => d.trim().toLowerCase());
  return devices.includes(requestDevice) || devices.includes('all');
}

// ── GEO targeting ───────────────────────────────────────

function ruleMatchesCountry(rule, requestCountry) {
  if (!rule.countries || rule.countries === 'all') return true;
  if (!requestCountry) return true; // Can't determine country — allow

  const countries = rule.countries
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);

  return countries.includes(requestCountry) || countries.includes('ALL');
}

// ── Page type targeting ─────────────────────────────────

function ruleMatchesPageType(rule, pageType) {
  if (!rule.page_type || rule.page_type === 'all') return true;
  return rule.page_type === pageType;
}

// ── Load ad components ───────────────────────────────────

async function loadAdComponents(env) {
  try {
    const components = await componentsDB.getAllComponents(env.DB, "ad");
    const ads = [];

    for (const comp of components) {
      if (comp.status !== "active") continue;

      let html = "";

      if (typeof comp.content === "string" && comp.content.trim()) {
        html = comp.content;
      }

      if (!html && comp.settings_json) {
        try {
          const settings = JSON.parse(comp.settings_json);
          if (settings.ad_html) html = settings.ad_html;
        } catch (_) {}
      }

      if (html) {
        ads.push({
          id: comp.id,
          slug: comp.slug,
          name: comp.name,
          html: html.trim(),
          status: comp.status
        });
      }
    }

    return ads;
  } catch (e) {
    console.error("loadAdComponents error:", e.message);
    return [];
  }
}




async function hashIP(ip){

  if(!ip){
    return "";
  }

  const data =
    new TextEncoder()
      .encode(ip);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(
      new Uint8Array(hash)
    )
    .map(b =>
      b.toString(16)
       .padStart(2,"0")
    )
    .join("");
}

/**
 * Deliberately minimal, honest device classification -- 'mobile' /
 * 'tablet' / 'bot' / 'desktop' via a few unambiguous substring
 * checks, nothing more. This is NOT a full user-agent parser: we do
 * not attempt to name a specific browser or OS from the UA string,
 * because a crude regex guess there is wrong often enough that it
 * would violate the "never fabricate data" rule -- an admin looking
 * at a "Safari" column should be able to trust it's actually Safari.
 * If real browser/OS analytics are wanted later, that's a deliberate
 * follow-up decision to bring in a proper UA-parsing library, not a
 * guess bolted on here.
 */
function classifyUserAgent(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return { deviceType: 'unknown', isBot: false };
  if (/bot|crawler|spider|slurp|bingpreview|facebookexternalhit/.test(ua)) {
    return { deviceType: 'bot', isBot: true };
  }
  if (/ipad|tablet/.test(ua)) return { deviceType: 'tablet', isBot: false };
  if (/mobi|iphone|android/.test(ua)) return { deviceType: 'mobile', isBot: false };
  return { deviceType: 'desktop', isBot: false };
}

/**
 * Fires both the existing click log (unchanged, still the System-3
 * source of truth for tracking-link health/redirect debugging) and
 * the new canonical analytics event, via ctx.waitUntil so NEITHER
 * delays the redirect response the visitor is waiting on. Falls back
 * to awaiting inline only if no ctx was supplied (e.g. a future
 * direct unit-test call to handleAffiliateRedirect) so logging still
 * happens rather than being silently skipped.
 */
function recordRedirectClick(env, ctx, { eventType, casinoSlug, casinoId, countryCode, city, ipHash, userAgent, trackingLinkId, offerId, partnerId, programId, clickId }) {
  const { deviceType, isBot } = classifyUserAgent(userAgent);

  const work = Promise.all([
    logClick(env.DB, casinoSlug, countryCode, city, ipHash, userAgent, { trackingLinkId, offerId }),
    logAnalyticsEvent(env.DB, {
      eventType,
      casinoId: casinoId ?? null,
      trackingLinkId: trackingLinkId ?? null,
      offerId: offerId ?? null,
      // Carried straight off the tracking link so a later conversion
      // postback (worker/database/analytics.js getClickAttribution)
      // can resolve partner/program without a second join back
      // through tracking_links -- see worker/postback/ingest.js.
      partnerId: partnerId ?? null,
      programId: programId ?? null,
      countryCode, city, deviceType, isBot,
      visitorHash: ipHash,
      clickId
    })
  ]);

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(work.catch(() => {
      // Best-effort logging -- never surface a logging failure to the visitor.
    }));
  } else {
    return work.catch(() => {});
  }
}

export async function
handleAffiliateRedirect(
  request,
  env,
  identifier,
  ctx = null
){

  const edgeGeo = {
    country: request.cf?.country || null,
    city: request.cf?.city || "Unknown"
  };
  const geoInfo = geoEngine.process(request, edgeGeo);

  const result = await resolveRedirectTarget(env.DB, {
    identifier,
    countryCode: geoInfo.country
  });

  if (result.type === "not_found") {
    return render404(request, env);
  }

  const ipHash =
  await hashIP(
    request.headers.get(
      "CF-Connecting-IP"
    )
  );
  const userAgent = request.headers.get("user-agent");
  // Generated once per redirect so a later conversion postback
  // (analytics_conversions.click_id) can attribute back to this
  // exact click without guessing -- see worker/database/analytics.js.
  const clickId = crypto.randomUUID();

  // A known link that isn't redirectable right now (health-broken or
  // GEO-ineligible for this visitor's country). Falls back to the
  // casino's own legacy URL when available -- a RELATED fallback, not
  // the "unrelated fallback casino" the brief explicitly warns
  // against. With no fallback at all, show the same not-found
  // experience rather than a raw error -- the visitor doesn't need to
  // know the technical distinction between "doesn't exist" and
  // "temporarily broken."
  if (result.type === "unavailable") {
    if (result.fallbackUrl) {
      recordRedirectClick(env, ctx, {
        eventType: "AFFILIATE_REDIRECT",
        casinoSlug: result.casino?.slug || identifier,
        casinoId: result.casino?.id ?? null,
        countryCode: geoInfo.country, city: geoInfo.city, ipHash, userAgent,
        trackingLinkId: result.trackingLink.id, offerId: result.trackingLink.offer_id,
        partnerId: result.trackingLink.partner_id, programId: result.trackingLink.program_id,
        clickId
      });
      return Response.redirect(result.fallbackUrl, 302);
    }
    return render404(request, env);
  }

  if (result.type === "tracking_link") {
    recordRedirectClick(env, ctx, {
      eventType: "TRACKING_LINK_CLICK",
      casinoSlug: result.casino?.slug || identifier,
      casinoId: result.casino?.id ?? null,
      countryCode: geoInfo.country, city: geoInfo.city, ipHash, userAgent,
      trackingLinkId: result.trackingLink.id, offerId: result.trackingLink.offer_id,
      clickId
    });
    return Response.redirect(result.destinationUrl, 302);
  }

  // result.type === "legacy_casino" -- identical behavior to before
  // this system existed, for any link not yet migrated to a tracking link.
  recordRedirectClick(env, ctx, {
    eventType: "AFFILIATE_REDIRECT",
    casinoSlug: result.casino.slug,
    casinoId: result.casino.id,
    countryCode: geoInfo.country, city: geoInfo.city, ipHash, userAgent,
    trackingLinkId: null, offerId: null,
    clickId
  });
  return Response.redirect(
    result.destinationUrl,
    302
  );
}

export async function renderDashboardPage(request, env) {
    const user = await getCurrentUser(request, env);
    if (!user) {
        return new Response(null, {
            status: 302,
            headers: { Location: "/en/login" }
        });
    }

    // Admins and editors get the shared admin nav via renderAdminPage
    if (user.role === "admin" || user.role === "editor") {
        return renderAdminPage(request, env, "admin/dashboard.html");
    }

    // Viewers get the user dashboard (no admin nav)
    const renderer = new Renderer(env, request);
    const site = await getSiteContext(request, env);
        // Add CSRF token for admin pages — used by rich-editor.js and media-library.js

    const userNav = await renderer.loadTemplate("layout/user-nav.html");

    const html = await renderer.render("users/dashboard.html", {
        seo_title: "Dashboard",
        seo_description: `${site.siteName} Dashboard`,
        email: user.email,
        role: user.role,
        user_nav: userNav
    });

    return new Response(html, {
        headers: { "Content-Type": "text/html" }
    });
}


export async function dashboardStatsAPI(request, env) {

    const user = await getCurrentUser(request, env);

    if (!user || user.role !== "admin") {
        return new Response("Forbidden", {
            status: 403
        });
    }

    const casinos = await env.DB.prepare(
        "SELECT COUNT(*) c FROM casinos"
    ).first();

    const reviews = await env.DB.prepare(
        "SELECT COUNT(*) c FROM reviews"
    ).first();

    const clicks = await env.DB.prepare(
        "SELECT COUNT(*) c FROM clicks"
    ).first();

    const pages = await env.DB.prepare(
        "SELECT COUNT(*) c FROM pages"
    ).first();

    return Response.json({
        casinos: casinos.c,
        reviews: reviews.c,
        clicks: clicks.c,
        pages: pages.c
    });
}

export async function robots(request, env) {
  const site = await getSiteContext(request, env);
  // Advertised only once the Google News sitemap is switched on.
  const googleNewsLine = (await newsroom.isNewsFlagEnabled(env.DB, "news_google_sitemap"))
    ? `\nSitemap: ${site.url("/en/news-sitemap.xml")}` : "";
  const landingLine = (await newsroom.isNewsFlagEnabled(env.DB, "news_new_taxonomy"))
    ? `\nSitemap: ${site.url("/en/sitemap-news-sections.xml")}` : "";

  return new Response(
    `User-agent: *
Allow: /

Sitemap: ${site.url("/en/sitemap-index.xml")}
Sitemap: ${site.url("/en/sitemap.xml")}
Sitemap: ${site.url("/en/sitemap-casinos.xml")}
Sitemap: ${site.url("/en/sitemap-reviews.xml")}
Sitemap: ${site.url("/en/sitemap-news.xml")}
Sitemap: ${site.url("/en/sitemap-categories.xml")}
Sitemap: ${site.url("/en/sitemap-countries.xml")}
Sitemap: ${site.url("/en/sitemap-pages.xml")}${googleNewsLine}${landingLine}`,
    {
      headers: {
        "Content-Type": "text/plain"
      }
    }
  );
}


export async function renderCountry(request, env, slug) {
  const code = slug.toUpperCase();
  const country = await countries.getCountry(env.DB, code);

  // A country with no DB row at all still renders (existing
  // behavior, unchanged) — draft gating only applies to a real,
  // explicitly-drafted row.
  if (country && country.published === 0) return render404(request, env);
  if (country && country.status === "draft") return render404(request, env);

  const countryData = country || {
    code, name: code, seo_title: null, seo_description: null
  };
  const renderer = new Renderer(env, request);

  // casinoList, site, subNavItems, components, and SEO are all
  // independent of each other — fetch them concurrently.
  const [casinoList, site, subNavItems, allComponents, dynamicSeo] = await Promise.all([
    casinos.getCasinosByCountryAllowlist(env.DB, code),
    getSiteContext(request, env),
    nav.getScopedNavItems(env.DB, "country_subnav", "country", code),
    renderer.renderAllComponents("country", code),
    renderer.loadDynamicSeo("country", code),
  ]);

  // Sort by rating descending (highest first)
  casinoList.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const geoData = await prepareGeoData(env, request, casinoList);
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);
  const hubSubNavHtml = buildHubSubNavHtml(subNavItems);
  const countrySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Best Online Casinos in ${countryData.name}`,
    "itemListElement": casinoList.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };

  let countryContent = {};
  try {
    countryContent = typeof countryData.content_json === "string"
      ? JSON.parse(countryData.content_json)
      : countryData.content_json || {};
  } catch {
    countryContent = {};
  }
  const casinoLookupById = {};
  for (const c of casinoList) casinoLookupById[c.id] = c;
  const sectionsHtml = renderSeoPageSections(countryContent, casinoLookupById, {}, geoData, bonusOverrides);
  const faqSchema = seoPageFaqSchema(countryContent);
  const html = await renderer.render("country.html", {
    ...countryData,
    name: escapeHtml(countryData.name),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || countryData.seo_title || countryData.name + " Online Casinos",
    seo_description: dynamicSeo.seo_description || countryData.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || countryData.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/country/${code}`),
    og_image: countryData.og_image_url ? site.url(countryData.og_image_url) : site.ogImageUrl,
    og_image_alt: safeAlt(countryData.og_image_alt, countryData.name),
    ...(countryData.og_image_width ? { og_image_width: countryData.og_image_width } : {}),
    ...(countryData.og_image_height ? { og_image_height: countryData.og_image_height } : {}),
    robots: countryData.robots || "index,follow",
    sections_html: sectionsHtml,
    hub_subnav_html: hubSubNavHtml,
    casino_cards: buildCasinoCards(casinoList, geoData, bonusOverrides, paymentMethodsByCasino),
  }, [countrySchema, faqSchema].filter(Boolean), buildBreadcrumbs("country", { name: countryData.name }));
  return new Response(html, {
    headers: cacheHeaders()
  });
}


export async function renderCategory(request, env, slug) {
  const category = await categories.getCategory(env.DB, slug);
  if (!category) return render404(request, env);
  if (category.published === 0) return render404(request, env);
  if (category.status === "draft") return render404(request, env);

  const renderer = new Renderer(env, request);

  // casinoList, site, subNavItems, components, and SEO are all
  // independent of each other — fetch them concurrently.
  const [casinoList, site, subNavItems, allComponents, dynamicSeo] = await Promise.all([
    categories.getCategoryCasinos(env.DB, slug),
    getSiteContext(request, env),
    nav.getScopedNavItems(env.DB, "category_subnav", "category", slug),
    renderer.renderAllComponents("category", slug),
    renderer.loadDynamicSeo("category", slug),
  ]);

  const geoData = await prepareGeoData(env, request, casinoList);
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);
  const hubSubNavHtml = buildHubSubNavHtml(subNavItems);
  const categorySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${category.name} Type Online Casinos`,
    "itemListElement": sortedCasinos.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };

  let categoryContent = {};
  try {
    categoryContent = typeof category.content_json === "string"
      ? JSON.parse(category.content_json)
      : category.content_json || {};
  } catch {
    categoryContent = {};
  }
  const casinoLookupById = {};
  for (const c of sortedCasinos) casinoLookupById[c.id] = c;
  const sectionsHtml = renderSeoPageSections(categoryContent, casinoLookupById, {}, geoData, bonusOverrides);
  const faqSchema = seoPageFaqSchema(categoryContent);
  const html = await renderer.render("category.html", {
    slug,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || category.seo_title || category.name + " Casinos",
    seo_description: dynamicSeo.seo_description || category.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || category.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/category/${slug}`),
    og_image: category.og_image_url ? site.url(category.og_image_url) : site.ogImageUrl,
    og_image_alt: safeAlt(category.og_image_alt, category.name),
    ...(category.og_image_width ? { og_image_width: category.og_image_width } : {}),
    ...(category.og_image_height ? { og_image_height: category.og_image_height } : {}),
    robots: category.robots || "index,follow",
    sections_html: sectionsHtml,
    hub_subnav_html: hubSubNavHtml,
    category: category.name,
    description: category.description,
    casino_cards: buildCasinoCards(sortedCasinos, geoData, bonusOverrides, paymentMethodsByCasino),
  }, [categorySchema, faqSchema].filter(Boolean), buildBreadcrumbs("category", { category: category.name }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}



// =====================================================
// SEO LANDING PAGES (country_custom / category_country)
// See migrations/0019_seo_landing_pages.sql and
// worker/database/seo-pages.js.
// =====================================================

// Resolves the final, live casino list for a landing page according
// to its casino_mode. Always re-joins to the current `casinos` table
// (via seoPages.getSeoPageCasinos / the eligibility queries) — never
// reads cached/duplicated casino facts, per spec section 5.
async function resolveSeoPageCasinos(env, page, eligibleCasinos) {
  const manualRows = await seoPages.getSeoPageCasinos(env.DB, page.id);
  const mainSelections = manualRows.filter((r) => !r.section_key && r.display_mode !== "editorial");
  const editorialByKey = {};
  for (const row of manualRows) {
    if (row.section_key) {
      editorialByKey[row.section_key] = row;
    }
  }

  if (page.casino_mode === "manual") {
    return { mainList: mainSelections, editorialByKey };
  }

  if (page.casino_mode === "auto") {
    return { mainList: eligibleCasinos, editorialByKey };
  }

  // auto_priority (default): eligible casinos define the pool, but
  // manually-selected ones are pulled to the front in their chosen
  // order; everything else follows in the default eligibility order.
  const manualIds = new Set(mainSelections.map((r) => r.id));
  const rest = eligibleCasinos.filter((c) => !manualIds.has(c.id));
  return { mainList: [...mainSelections, ...rest], editorialByKey };
}

// Renders content_json.sections into HTML. Supports the section
// types actually built out this pass: rich_text, casino_grid,
// casino_editorial, casino_spotlights, faq, cta. Unknown types are
// skipped rather than erroring, so older/partial content never
// breaks a page.
function renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData, bonusOverrides = {}) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];

  return sections
    .map((section) => {
      const heading = section.title
        ? `<h2 class="seo-section__title">${section.title}</h2>${section.subtitle ? `<p class="seo-section__subtitle muted">${section.subtitle}</p>` : ""}`
        : "";

      switch (section.type) {
        case "rich_text":
        case "text":
          return `<section class="seo-section seo-section--text">${heading}<div class="seo-section__body">${section.body || ""}</div></section>`;

        case "heading":
          return `<h2 class="seo-section__title">${section.title || ""}</h2>`;

        case "image":
          return section.image
            ? `<section class="seo-section seo-section--image">${heading}<img src="${section.image}" alt="${section.title || ""}" loading="lazy" /></section>`
            : "";

        case "casino_grid":
        case "casino_comparison": {
          const ids = Array.isArray(section.casino_ids) ? section.casino_ids : null;
          const list = ids
            ? ids.map((id) => casinoLookupById[id]).filter(Boolean)
            : Object.values(casinoLookupById);
          if (list.length === 0) return "";
          return `<section class="seo-section seo-section--casinos">${heading}<div class="casino-grid">${buildCasinoCards(list, geoData, bonusOverrides)}</div></section>`;
        }

        case "casino_editorial": {
          const casino = casinoLookupById[section.casino_id];
          if (!casino) return "";
          const editorial = editorialByKey[section.id];
          const body = editorial?.editorial_content || section.body || "";
          return `
            <section class="seo-section seo-section--casino-editorial">
              ${heading}
              <div class="casino-grid">${buildCasinoCards([casino], geoData, bonusOverrides)}</div>
              ${body ? `<div class="seo-section__body">${body}</div>` : ""}
            </section>`;
        }

        // casino_spotlights: like casino_editorial but for several
        // casinos at once, each with its own independent write-up —
        // {casino_id, body} pairs stored on the section itself
        // (section.spotlights), not tied to seo_page_casinos. Use
        // this instead of stacking multiple casino_editorial
        // sections when several casinos share one heading/intro.
        case "casino_spotlights": {
          const spotlights = Array.isArray(section.spotlights) ? section.spotlights : [];
          const cards = spotlights
            .map((sp) => {
              const casino = casinoLookupById[sp.casino_id];
              if (!casino) return "";
              return `
                <div class="seo-section__casino-spotlight">
                  <div class="casino-grid">${buildCasinoCards([casino], geoData, bonusOverrides)}</div>
                  ${sp.body ? `<div class="seo-section__body">${sp.body}</div>` : ""}
                </div>`;
            })
            .filter(Boolean)
            .join("");
          if (!cards) return "";
          return `<section class="seo-section seo-section--casino-spotlights">${heading}${cards}</section>`;
        }

        case "faq": {
          const items = Array.isArray(section.items) ? section.items : [];
          if (items.length === 0) return "";
          return `
            <section class="seo-section seo-section--faq">
              ${heading}
              <div class="faq-list">
                ${items.map((item) => `
                  <div class="faq-item">
                    <h3 class="faq-item__question">${item.q || ""}</h3>
                    <div class="faq-item__answer">${item.a || ""}</div>
                  </div>`).join("")}
              </div>
            </section>`;
        }

        case "cta":
          return `
            <section class="seo-section seo-section--cta" ${section.background ? `style="background:${section.background};"` : ""}>
              ${heading}
              ${section.body ? `<p>${section.body}</p>` : ""}
              ${section.url ? `<a class="btn btn--primary" href="${section.url}">${section.label || "Learn more"}</a>` : ""}
            </section>`;

        case "internal_links":
        case "custom_links": {
          const links = Array.isArray(section.links) ? section.links : [];
          if (links.length === 0) return "";
          return `
            <section class="seo-section seo-section--links">
              ${heading}
              <ul class="seo-section__links">
                ${links.map((l) => `<li><a href="${l.url}">${l.label}</a></li>`).join("")}
              </ul>
            </section>`;
        }

        default:
          return "";
      }
    })
    .join("\n");
}

function seoPageFaqSchema(content) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const faqSection = sections.find((s) => s.type === "faq" && Array.isArray(s.items) && s.items.length > 0);
  if (!faqSection) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqSection.items
      .filter((i) => i.q && i.a)
      .map((i) => ({
        "@type": "Question",
        "name": i.q,
        "acceptedAnswer": { "@type": "Answer", "text": i.a }
      }))
  };
}

// =====================================================
// RESEARCH ENGINE — content block renderer (Phase 1)
// Separate function from renderSeoPageSections (never touches
// it) but same content_json shape and same section types
// (rich_text, heading, image, faq, cta, internal_links) plus
// research-specific additions: statistic, timeline,
// source_citation, fact_card. Casino-oriented section types
// (casino_grid, casino_editorial, ...) are intentionally not
// carried over here — research pages are source/fact-oriented,
// not casino-listing pages.
// =====================================================

async function renderResearchSections(content, citations = null, db = null) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  // citations: { sourcesById: Map<id, sourceRow>, list: [] } — list is
  // mutated in place, accumulating footnotes in the order they're
  // first cited, so numbering stays stable within one render pass.
  const footnoteNumberFor = (sourceId) => {
    if (!citations) return null;
    const existingIndex = citations.list.findIndex((s) => s.id === sourceId);
    if (existingIndex !== -1) return existingIndex + 1;
    const source = citations.sourcesById.get(sourceId);
    if (!source) return null;
    citations.list.push(source);
    return citations.list.length;
  };

  const rendered = await Promise.all(sections.map(async (section) => {
      const heading = section.title
        ? `<h2 class="research-section__title">${section.title}</h2>${section.subtitle ? `<p class="research-section__subtitle muted">${section.subtitle}</p>` : ""}`
        : "";

      switch (section.type) {
        case "rich_text":
        case "text":
          return `<section class="research-section research-section--text">${heading}<div class="research-section__body">${section.body || ""}</div></section>`;

        case "heading":
          return `<h2 class="research-section__title">${section.title || ""}</h2>`;

        case "image":
          return section.image
            ? `<section class="research-section research-section--image">${heading}<img src="${section.image}" alt="${section.title || ""}" loading="lazy" /></section>`
            : "";

        // { value, unit, label, context } — a single highlighted figure.
        case "statistic":
          return `
            <section class="research-section research-section--statistic">
              ${heading}
              <div class="research-stat">
                <div class="research-stat__value">${section.value ?? ""}${section.unit ? `<span class="research-stat__unit">${section.unit}</span>` : ""}</div>
                ${section.label ? `<div class="research-stat__label">${section.label}</div>` : ""}
                ${section.context ? `<p class="research-stat__context muted">${section.context}</p>` : ""}
              </div>
            </section>`;

        // { events: [ {date, title, description} ] }
        case "timeline": {
          const events = Array.isArray(section.events) ? section.events : [];
          if (events.length === 0) return "";
          return `
            <section class="research-section research-section--timeline">
              ${heading}
              <ol class="research-timeline">
                ${events.map((ev) => `
                  <li class="research-timeline__event">
                    <span class="research-timeline__date">${ev.date || ""}</span>
                    <strong class="research-timeline__title">${ev.title || ""}</strong>
                    ${ev.description ? `<p>${ev.description}</p>` : ""}
                  </li>`).join("")}
              </ol>
            </section>`;
        }

        // { columns: [...], rows: [[...], ...], caption }
        case "table": {
          const cols = Array.isArray(section.columns) ? section.columns : [];
          const rows = Array.isArray(section.rows) ? section.rows : [];
          if (cols.length === 0 || rows.length === 0) return "";
          return `
            <section class="research-section research-section--table">
              ${heading}
              <div class="research-table-wrap">
                <table class="research-table">
                  ${section.caption ? `<caption>${section.caption}</caption>` : ""}
                  <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
                  <tbody>${rows.map((r) => `<tr>${cols.map((_, ci) => `<td>${(r[ci] ?? "") === "" ? `<span class="research-table__empty">—</span>` : r[ci]}</td>`).join("")}</tr>`).join("")}</tbody>
                </table>
              </div>
            </section>`;
        }

        // { body, source_id } preferred — resolves to a numbered
        // footnote against a real research_sources row. Falls back to
        // { source_label, source_url } (Phase 1 shape) when no
        // source_id is given or it doesn't resolve, so existing
        // content written before Phase 2 keeps rendering unchanged.
        case "source_citation": {
          const num = section.source_id ? footnoteNumberFor(Number(section.source_id)) : null;
          const footnoteLink = num
            ? `<a href="#research-source-${num}" class="research-citation__footnote">[${num}]</a>`
            : section.source_label
              ? `<cite class="research-citation__source">${section.source_url ? `<a href="${section.source_url}" rel="nofollow noopener" target="_blank">${section.source_label}</a>` : section.source_label}</cite>`
              : "";
          return `<p class="research-citation">${section.body || ""} ${footnoteLink}</p>`;
        }

        case "fact_card":
          return `
            <section class="research-section research-section--fact-card">
              ${heading}
              <div class="research-fact-card">${section.body || ""}</div>
            </section>`;

        case "faq": {
          const items = Array.isArray(section.items) ? section.items : [];
          if (items.length === 0) return "";
          return `
            <section class="research-section research-section--faq">
              ${heading}
              <div class="faq-list">
                ${items.map((item) => `
                  <div class="faq-item">
                    <h3 class="faq-item__question">${item.q || ""}</h3>
                    <div class="faq-item__answer">${item.a || ""}</div>
                  </div>`).join("")}
              </div>
            </section>`;
        }

        case "internal_links":
        case "custom_links": {
          const links = Array.isArray(section.links) ? section.links : [];
          if (links.length === 0) return "";
          return `
            <section class="research-section research-section--links">
              ${heading}
              <ul class="research-section__links">
                ${links.map((l) => `<li><a href="${l.url}">${l.label}</a></li>`).join("")}
              </ul>
            </section>`;
        }

        // { research_item_id, mode: 'live' | 'snapshot' }. Report
        // composition (spec section 17) needs no separate join table
        // — a report section referencing another research item is
        // just this block type. 'live' always reflects that item's
        // current published title/excerpt/verification date; the DB
        // is only queried here, per reference, when mode is 'live'.
        // 'snapshot' uses the frozen snapshot_* fields already stored
        // on the block itself (captured by the admin at composition
        // time) and needs no query at all.
        case "research_reference": {
          if (section.mode === "snapshot") {
            if (!section.snapshot_title) return "";
            return `
              <section class="research-section research-section--reference">
                <div class="research-reference-card">
                  <h3>${section.snapshot_title}</h3>
                  ${section.snapshot_excerpt ? `<p>${section.snapshot_excerpt}</p>` : ""}
                  <p class="muted research-reference-card__note">Snapshot${section.snapshot_at ? ` from ${section.snapshot_at}` : ""} — may differ from the current version.</p>
                </div>
              </section>`;
          }

          if (!db || !section.research_item_id) return "";
          const referenced = await db.prepare(
            `SELECT type, slug, title, excerpt, last_verified_at FROM research_items WHERE id = ? AND published = 1 AND status != 'draft' LIMIT 1`
          ).bind(Number(section.research_item_id)).first();
          if (!referenced) return "";
          return `
            <section class="research-section research-section--reference">
              <a class="research-reference-card" href="/en/research/${referenced.type}/${referenced.slug}">
                <h3>${referenced.title}</h3>
                ${referenced.excerpt ? `<p>${referenced.excerpt}</p>` : ""}
                ${referenced.last_verified_at ? `<p class="muted research-reference-card__note">Last verified: ${String(referenced.last_verified_at).split(" ")[0].split("T")[0]}</p>` : ""}
              </a>
            </section>`;
        }

        // { dataset_id, version: 'latest' | N, caption } — renders a
        // reusable dataset (spec section 27) as a table, the same
        // dataset a report section, a country page, and a comparison
        // page can all embed without copying its rows into each one.
        case "dataset_table": {
          if (!db || !section.dataset_id) return "";
          const data = await researchDatasets.resolveDatasetData(db, Number(section.dataset_id), section.version || "latest");
          if (!data || data.columns.length === 0 || data.rows.length === 0) return "";

          // Type-aware cell rendering — columns_json carries an optional
          // display-type hint (text/number/boolean/date) per the schema
          // comment in 0050; this is the first renderer to actually act
          // on it rather than printing every value as raw text.
          const renderDatasetCell = (col, value) => {
            if (value === null || value === undefined || value === "") return `<span class="research-table__empty">—</span>`;
            if (col.type === "boolean") {
              const isTrue = value === true || value === "true" || value === 1 || value === "1";
              return `<span class="research-table__bool research-table__bool--${isTrue ? "yes" : "no"}">${isTrue ? "✓" : "✗"}</span>`;
            }
            return value;
          };
          const cellClass = (col) => col.type === "number" || col.type === "boolean" ? ` class="research-table__cell--${col.type}"` : "";

          return `
            <section class="research-section research-section--table research-section--dataset">
              ${heading}
              <div class="research-table-wrap">
                <table class="research-table">
                  <caption>${section.caption || data.title}<span class="muted"> (${data.versionLabel})</span></caption>
                  <thead><tr>${data.columns.map((c) => `<th${cellClass(c)}>${c.label || c.key}</th>`).join("")}</tr></thead>
                  <tbody>${data.rows.map((row) => `<tr>${data.columns.map((c) => `<td${cellClass(c)}>${renderDatasetCell(c, row[c.key])}</td>`).join("")}</tr>`).join("")}</tbody>
                </table>
              </div>
            </section>`;
        }

        default:
          return "";
      }
    }));

  return rendered.join("\n");
}

// { organisation, title, url, source_type, is_primary } — renders the
// numbered footnote list a source_citation block's [n] links point to.
function renderResearchSourcesFootnotes(sourcesList) {
  if (!sourcesList || sourcesList.length === 0) return "";
  return `
    <section class="research-section research-section--sources" aria-label="Sources">
      <h2 class="research-section__title">Sources</h2>
      <ol class="research-footnotes">
        ${sourcesList.map((s, i) => `
          <li id="research-source-${i + 1}">
            <span class="research-footnotes__org">${s.organisation}</span>${s.is_primary ? `<span class="research-footnotes__primary-badge">Primary source</span>` : ""}
            ${s.title ? ` — ${s.title}` : ""}
            ${s.url ? ` — <a href="${s.url}" rel="nofollow noopener" target="_blank">${s.url}</a>` : ""}
          </li>
        `).join("")}
      </ol>
    </section>`;
}

// [{ claim_text, status, sources: [...] }] — renders the "Key Facts"
// block on a research item page: independently verifiable statements,
// each with its own status badge and cited sources.
function renderResearchClaims(claimsList) {
  if (!claimsList || claimsList.length === 0) return "";
  const statusLabel = {
    verified: "Verified", unverified: "Unverified",
    disputed: "Disputed", superseded: "Superseded"
  };
  return `
    <section class="research-section research-section--claims" aria-label="Key facts">
      <h2 class="research-section__title">Key facts</h2>
      <ul class="research-claims-list">
        ${claimsList.map((c) => `
          <li class="research-claim research-claim--${c.status}">
            <span class="research-claim__badge">${statusLabel[c.status] || c.status}</span>
            <p class="research-claim__text">${c.claim_text}</p>
            ${c.sources.length > 0 ? `
              <p class="research-claim__sources muted">
                ${c.sources.map((s) => s.source_url ? `<a href="${s.source_url}" rel="nofollow noopener" target="_blank">${s.organisation}</a>` : s.organisation).join(", ")}
              </p>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>`;
}

const RELATION_TYPE_LABEL = {
  covers: "Covers", located_in: "Located in", operates_in: "Operates in",
  regulated_by: "Regulated by", regulates: "Regulates", licensed_by: "Licensed by",
  requires: "Requires", uses: "Uses", related_to: "Related to", part_of: "Part of",
  contains: "Contains", updates: "Updates", supersedes: "Supersedes",
  superseded_by: "Superseded by", cites: "Cites", supports: "Supports",
  contradicts: "Contradicts", derived_from: "Derived from", mentions: "Mentions",
  affects: "Affects", affected_by: "Affected by", applies_to: "Applies to",
  available_in: "Available in", restricted_in: "Restricted in"
};

// [{ relation_type, label, target: {label, url, exists} }] — renders
// the "Related" section on a research item page, grouped by relation
// type so e.g. all "regulated_by" links sit together. Entries whose
// target no longer resolves (a linked casino/country row was deleted)
// are silently skipped rather than rendering a dead link.
function renderResearchRelated(relations) {
  const usable = (relations || []).filter((r) => r.target?.exists && r.target?.url);
  if (usable.length === 0) return "";

  const groups = new Map();
  for (const r of usable) {
    const key = r.relation_type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  return `
    <section class="research-section research-section--related" aria-label="Related">
      <h2 class="research-section__title">Related</h2>
      <div class="research-related-groups">
        ${[...groups.entries()].map(([type, items]) => `
          <div class="research-related-group">
            <h3 class="research-related-group__label">${RELATION_TYPE_LABEL[type] || type}</h3>
            <ul class="research-related-group__list">
              ${items.map((r) => `<li><a href="${r.target.url}">${r.label || r.target.label}</a></li>`).join("")}
            </ul>
          </div>
        `).join("")}
      </div>
    </section>`;
}

function researchTypeLabel(type) {
  const labels = {
    report: "Reports",
    country: "Countries",
    regulator: "Regulators",
    topic: "Topics",
    development: "Regulatory Developments",
    legislation: "Legislation",
    licence: "Licences"
  };
  return labels[type] || type;
}

// =====================================================
// RESEARCH ENGINE — public controllers (Phase 1)
// =====================================================

// Card markup shared by the hub and type-list pages. data-* attributes
// carry everything the client-side filter/search script
// (research-directory-filter.js) needs — country and related-entity
// filtering, and a searchable text blob — so filtering never has to
// re-fetch anything; it just shows/hides these already-rendered cards.
function researchItemCardHtml(item, relations, showType) {
  const relatedLabels = (relations || [])
    .filter((r) => r.target?.exists)
    .map((r) => r.target.label);
  const searchBlob = [item.title, item.excerpt, item.country_name, ...relatedLabels]
    .filter(Boolean).join(" ").toLowerCase().replace(/"/g, "&quot;");

  return `
    <a class="research-card" href="/en/research/${item.type}/${item.slug}"
       data-type="${item.type}"
       data-country="${item.country_name || ""}"
       data-related="${relatedLabels.join("|").replace(/"/g, "&quot;")}"
       data-search="${searchBlob}">
      ${showType ? `<span class="research-card__type">${researchTypeLabel(item.type)}</span>` : ""}
      <h3 class="research-card__title">${item.title}</h3>
      ${item.excerpt ? `<p class="research-card__excerpt">${item.excerpt}</p>` : ""}
      ${relatedLabels.length > 0 ? `<p class="research-card__related">${relatedLabels.slice(0, 3).map((l) => `<span>${l}</span>`).join("")}</p>` : ""}
    </a>`;
}

// Distinct country/relation values across a set of items, for
// populating the filter dropdowns — computed from data already in
// hand, no extra queries.
function researchDirectoryFilterOptions(items, relationsByItemId) {
  const countries = new Set();
  const related = new Set();
  for (const item of items) {
    if (item.country_name) countries.add(item.country_name);
    for (const r of relationsByItemId.get(String(item.id)) || []) {
      if (r.target?.exists) related.add(r.target.label);
    }
  }
  return {
    countries: [...countries].sort(),
    related: [...related].sort()
  };
}

// The components assigned to a research page, as the template variables research.html and
// research-list.html already contain.
function researchComponentVars(all) {
  return {
    components_top: all.top,
    components_content_top: all.content_top,
    components_content_bottom: all.content_bottom,
    components_bottom: all.bottom,
    components_sidebar: all.sidebar
  };
}

export async function renderResearchHub(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const featured = await research.getFeaturedResearchItems(env.DB, 6);
  const latest = await research.getPublishedResearchItems(env.DB, { limit: 12 });
  const allComponents = await renderer.renderAllComponents("research_list", "research_list");

  const allShown = [...featured, ...latest];
  const relationsByItemId = await researchRelations.getRelationsFromMany(
    env.DB, "research_item", allShown.map((i) => i.id)
  );

  const filterOptions = researchDirectoryFilterOptions(allShown, relationsByItemId);

  const itemCard = (item) => researchItemCardHtml(item, relationsByItemId.get(String(item.id)), true);

  const html = await renderer.render("research-list.html", {
    ...researchComponentVars(allComponents),
    heading: "Research",
    intro: "Independent, source-cited research on online casino regulation, licensing, and player protection.",
    seo_title: "Research | " + site.siteName,
    seo_description: "Independent research on online casino regulation, regulators, licensing, and player protection.",
    canonical: site.url("/en/research"),
    robots: "index,follow",
    featured_html: featured.map(itemCard).join(""),
    items_html: latest.map(itemCard).join(""),
    show_type_filter: true,
    type_filter_options_html: research.RESEARCH_TYPES.map((t) => `<option value="${t}">${researchTypeLabel(t)}</option>`).join(""),
    country_filter_options_html: filterOptions.countries.map((c) => `<option value="${c.replace(/"/g, "&quot;")}">${c}</option>`).join(""),
    related_filter_options_html: filterOptions.related.map((r) => `<option value="${r.replace(/"/g, "&quot;")}">${r}</option>`).join(""),
  }, [], buildBreadcrumbs("researchHub"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderResearchTypeList(request, env, researchType) {
  if (!research.isValidResearchType(researchType)) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const items = await research.getPublishedResearchItems(env.DB, { type: researchType, limit: 500 });
  const label = researchTypeLabel(researchType);
  const allComponents = await renderer.renderAllComponents("research_type_list", researchType);

  const relationsByItemId = await researchRelations.getRelationsFromMany(
    env.DB, "research_item", items.map((i) => i.id)
  );
  const filterOptions = researchDirectoryFilterOptions(items, relationsByItemId);

  const itemCard = (item) => researchItemCardHtml(item, relationsByItemId.get(String(item.id)), false);

  const html = await renderer.render("research-list.html", {
    ...researchComponentVars(allComponents),
    heading: label,
    intro: "",
    seo_title: `${label} | Research | ${site.siteName}`,
    seo_description: `Research on ${label.toLowerCase()} — online casino regulation and market intelligence.`,
    canonical: site.url(`/en/research/${researchType}`),
    robots: "index,follow",
    featured_html: "",
    items_html: items.map(itemCard).join("") || `<p class="muted">No published research yet.</p>`,
    show_type_filter: false,
    type_filter_options_html: "",
    country_filter_options_html: filterOptions.countries.map((c) => `<option value="${c.replace(/"/g, "&quot;")}">${c}</option>`).join(""),
    related_filter_options_html: filterOptions.related.map((r) => `<option value="${r.replace(/"/g, "&quot;")}">${r}</option>`).join(""),
  }, [], buildBreadcrumbs("researchTypeList", { researchType, label }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderResearchItem(request, env, researchType, slug) {
  if (!research.isValidResearchType(researchType)) return render404(request, env);

  const item = await research.getResearchItem(env.DB, researchType, slug);
  if (!item) return render404(request, env);
  if (item.published === 0 || item.status === "draft") return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  let contentData = {};
  try {
    contentData = typeof item.content_json === "string"
      ? JSON.parse(item.content_json)
      : item.content_json || {};
  } catch {
    contentData = {};
  }

  // Sources citable on this item: those linked via its claims, UNION
  // any cited directly by a { source_id } source_citation content
  // block — the two pools are independent, so both are gathered
  // before resolving footnote numbers.
  const claimLinkedSources = await researchSources.getSourcesForResearchItem(env.DB, item.id);
  const blockCitedIds = (Array.isArray(contentData?.sections) ? contentData.sections : [])
    .filter((s) => s.type === "source_citation" && s.source_id)
    .map((s) => Number(s.source_id));
  const alreadyHaveIds = new Set(claimLinkedSources.map((s) => s.id));
  const missingIds = blockCitedIds.filter((id) => !alreadyHaveIds.has(id));
  const directlyCitedSources = missingIds.length > 0
    ? await researchSources.getSourcesByIds(env.DB, missingIds)
    : [];
  const sourcesById = new Map([...claimLinkedSources, ...directlyCitedSources].map((s) => [s.id, s]));
  const citations = { sourcesById, list: [] };

  const sectionsHtml = await renderResearchSections(contentData, citations, env.DB);
  const claimsList = await researchClaims.getClaimsForResearchItem(env.DB, item.id);
  const claimsHtml = renderResearchClaims(claimsList);
  // citations.list now holds exactly the sources cited inline via
  // source_citation blocks, in first-citation order — the footnote
  // numbers already printed in sectionsHtml match this list's order.
  const sourcesHtml = renderResearchSourcesFootnotes(citations.list);

  const relations = await researchRelations.getAllRelationsForEntity(env.DB, "research_item", item.id);
  const relatedHtml = renderResearchRelated(relations);

  // Everything a client-side PDF export needs, already computed above
  // for the HTML render — embedded as JSON in the page so
  // research-pdf-export.js can build a branded PDF without a second
  // network round-trip, and so "merge related research" can fetch
  // another item's OWN page and read this same block back out of it.
  const pdfData = {
    type: item.type,
    slug: item.slug,
    title: item.title,
    subtitle: item.subtitle || "",
    excerpt: item.excerpt || "",
    country_name: item.country_name || "",
    author_name: item.author_name || "",
    last_verified_at: item.last_verified_at || "",
    canonical_url: item.canonical_url || site.url(`/en/research/${item.type}/${item.slug}`),
    sections: Array.isArray(contentData?.sections) ? contentData.sections : [],
    claims: claimsList.map((c) => ({
      claim_text: c.claim_text,
      status: c.status,
      sources: (c.sources || []).map((s) => ({ organisation: s.organisation, url: s.source_url || null }))
    })),
    sources: citations.list.map((s) => ({ organisation: s.organisation, title: s.title || null, url: s.url || null, is_primary: !!s.is_primary })),
    related: relations.filter((r) => r.target?.exists).map((r) => ({
      label: r.target.label, url: r.target.url, type: r.target.type, relation_type: r.relation_type
    }))
  };

  const faqSchema = seoPageFaqSchema(contentData);
  // components assigned in Dashboard > Components: page type "research", slug "<type>/<slug>" (or *)
  const allComponents = await renderer.renderAllComponents("research", `${item.type}/${item.slug}`);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": item.title,
    "description": item.excerpt || item.seo_description || "",
    "author": item.author_name ? { "@type": "Person", "name": item.author_name } : undefined,
    "dateModified": item.updated_at,
    "datePublished": item.published_at || item.created_at,
  };

  const html = await renderer.render("research.html", {
    ...item,
    ...researchComponentVars(allComponents),
    title: escapeHtml(item.title),
    type_label: researchTypeLabel(item.type),
    seo_title: item.seo_title || item.title,
    seo_description: item.seo_description || item.excerpt || "",
    seo_keywords: item.seo_keywords || "",
    canonical: item.canonical_url || site.url(`/en/research/${item.type}/${item.slug}`),
    og_image: item.og_image_url ? site.url(item.og_image_url) : site.ogImageUrl,
    og_image_alt: safeAlt(item.og_image_alt, item.title),
    robots: item.robots || "index,follow",
    sections_html: sectionsHtml,
    claims_html: claimsHtml,
    sources_html: sourcesHtml,
    related_html: relatedHtml,
    last_verified_display: item.last_verified_at ? item.last_verified_at.split(" ")[0].split("T")[0] : "",
    research_pdf_data_json: JSON.stringify(pdfData).replace(/</g, "\\u003c"),
  }, [articleSchema, faqSchema].filter(Boolean), buildBreadcrumbs("researchItem", {
    researchType: item.type,
    label: researchTypeLabel(item.type),
    title: item.title
  }));

  return new Response(html, { headers: cacheHeaders() });
}

// Renders the contextual, scrollable sub-page nav bar shown at
// the top of a country/category hub page's content — every
// published seo_pages sub-page under this specific hub (auto
// via 0021_hub_subpage_nav.sql), plus any manual entries an
// admin has added with the same scope. Deliberately a separate
// component from {{{pagenav}}} (the global site-wide Page
// Navigation) — this one only ever appears on its one matching
// hub page. Returns "" (renders nothing) when there are no items,
// so hubs with no sub-pages yet show no empty bar.
function escapeHubNavHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHubSubNavHtml(items) {
  if (!items || items.length === 0) return "";
  const links = items.map((item) => {
    const href = escapeHubNavHtml(item.url);
    const label = escapeHubNavHtml(item.label);
    const external = item.is_external ? ' target="_blank" rel="noopener"' : "";
    return `<a class="hubsubnav__link" href="${href}"${external}>${label}</a>`;
  }).join("");

  return `
<div class="hubsubnav">
  <div class="hubsubnav__scroll">
    ${links}
  </div>
</div>`;
}

export async function renderCountryCustomPage(request, env, countryCode, slug) {
  const code = countryCode.toUpperCase();

  // page, country, and the eligible-casino list are independent
  // lookups (none needs another's result), so fetch them concurrently.
  const [page, country, eligibleCasinos] = await Promise.all([
    seoPages.getSeoPageByUrl(env.DB, "country_custom", code, slug),
    countries.getCountry(env.DB, code),
    casinos.getCasinosByCountryAllowlist(env.DB, code),
  ]);
  if (!page || !page.published) return render404(request, env);
  if (!country) return render404(request, env);

  const { mainList, editorialByKey } = await resolveSeoPageCasinos(env, page, eligibleCasinos);

  const casinoLookupById = {};
  for (const c of mainList) casinoLookupById[c.id] = c;
  // Editorial sections can reference any eligible casino, even one
  // not in the main grid — make sure those resolve too.
  for (const c of eligibleCasinos) if (!casinoLookupById[c.id]) casinoLookupById[c.id] = c;

  let content = {};
  try {
    content = typeof page.content_json === "string" ? JSON.parse(page.content_json) : page.content_json || {};
  } catch {
    content = {};
  }

  const renderer = new Renderer(env, request);

  // geoData, site, author, and components are all independent —
  // fetch concurrently. bonusOverrides needs geoData.country, so it
  // stays as a follow-up step.
  const [geoData, site, author, allComponents] = await Promise.all([
    prepareGeoData(env, request, mainList),
    getSiteContext(request, env),
    page.author_id ? authors.getAuthorById(env.DB, page.author_id).catch(() => null) : Promise.resolve(null),
    renderer.renderAllComponents("country_custom_page", `${code}/${slug}`),
  ]);
  // One shared overrides map covers both the main grid AND any
  // casino_grid/casino_editorial sections rendered below — every
  // casino either could ever reference is already in casinoLookupById.
  const bonusOverrides = await resolveBonusOverridesForList(env, Object.values(casinoLookupById), geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, Object.values(casinoLookupById));

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title,
    "url": page.canonical_url || site.url(`/en/country/${code}/${slug}`)
  };
  const itemListSchema = mainList.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": page.title,
        "itemListElement": mainList.map((c, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "url": site.url(`/en/casino/${c.slug}`)
        }))
      }
    : pageSchema;
  const faqSchema = seoPageFaqSchema(content);

  const html = await renderer.render("seo-landing.html", {
    title: escapeHtml(page.title),
    intro: content.intro ? sanitizeHtml(String(content.intro)) : "",
    sections_html: renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData, bonusOverrides),
    casino_cards: buildCasinoCards(mainList, geoData, bonusOverrides, paymentMethodsByCasino),
    has_casinos: mainList.length > 0,
    country_name: escapeHtml(country.name),
    country_code: code,
    parent_label: escapeHtml(country.name),
    parent_url: site.url(`/en/country/${code}`),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: page.seo_title || page.title,
    seo_description: page.seo_description || "",
    seo_keywords: page.seo_keywords || "",
    canonical: page.canonical_url || site.url(`/en/country/${code}/${slug}`),
    og_image: (page.og_image || page.featured_image) ? site.url(page.og_image || page.featured_image) : site.ogImageUrl,
    og_image_alt: page.title,
    robots: page.robots || "index,follow",
    author_name: escapeHtml(author?.name || ""),
    author_id: page.author_id || null
  }, [itemListSchema, faqSchema].filter(Boolean),
    buildBreadcrumbs("countryCustomPage", { title: page.title, countryName: country.name, countryCode: code }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderCategoryCountryPage(request, env, categorySlug, countryCode) {
  const code = countryCode.toUpperCase();

  // category, country, the editorial page (if any), and the eligible
  // casino list don't depend on each other — fetch concurrently.
  // (The comment below on eligibleCasinos still applies to how the
  // result is used, just not to when it's fetched.)
  const [category, country, page, eligibleCasinos] = await Promise.all([
    categories.getCategory(env.DB, categorySlug),
    countries.getCountry(env.DB, code),
    seoPages.getSeoPageByUrl(env.DB, "category_country", code, categorySlug),
    seoPages.getEligibleCasinosForCategoryCountry(env.DB, categorySlug, code),
  ]);
  if (!category) return render404(request, env);
  if (!country) return render404(request, env);

  // No editorial page yet, or it's unpublished: fall back to a pure
  // auto-generated render IF the combination is genuinely eligible
  // (real casinos exist for it), so a legitimate category x country
  // intent still resolves even before an editor has reviewed it.
  // This never creates a DB row — it's render-only.
  if ((!page || !page.published) && eligibleCasinos.length === 0) {
    return render404(request, env);
  }

  const effectivePage = page || {
    id: null,
    title: `${category.name} Casinos in ${country.name}`,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    canonical_url: null,
    og_image: null,
    featured_image: null,
    robots: "index,follow",
    author_id: null,
    content_json: "{}",
    casino_mode: "auto"
  };

  const { mainList, editorialByKey } = page
    ? await resolveSeoPageCasinos(env, page, eligibleCasinos)
    : { mainList: eligibleCasinos, editorialByKey: {} };

  const casinoLookupById = {};
  for (const c of mainList) casinoLookupById[c.id] = c;
  for (const c of eligibleCasinos) if (!casinoLookupById[c.id]) casinoLookupById[c.id] = c;

  let content = {};
  try {
    content = typeof effectivePage.content_json === "string" ? JSON.parse(effectivePage.content_json) : effectivePage.content_json || {};
  } catch {
    content = {};
  }

  const renderer = new Renderer(env, request);

  // geoData, site, author, and components are all independent —
  // fetch concurrently. bonusOverrides needs geoData.country, so it
  // stays as a follow-up step.
  const [geoData, site, author, allComponents] = await Promise.all([
    prepareGeoData(env, request, mainList),
    getSiteContext(request, env),
    effectivePage.author_id ? authors.getAuthorById(env.DB, effectivePage.author_id).catch(() => null) : Promise.resolve(null),
    renderer.renderAllComponents("category_country_page", `${categorySlug}/${code}`),
  ]);
  const bonusOverrides = await resolveBonusOverridesForList(env, Object.values(casinoLookupById), geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, Object.values(casinoLookupById));

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": effectivePage.title,
    "itemListElement": mainList.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };
  const faqSchema = seoPageFaqSchema(content);

  const html = await renderer.render("seo-landing.html", {
    title: escapeHtml(effectivePage.title),
    intro: sanitizeHtml(String(content.intro || category.description || "")),
    sections_html: renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData, bonusOverrides),
    casino_cards: buildCasinoCards(mainList, geoData, bonusOverrides, paymentMethodsByCasino),
    has_casinos: mainList.length > 0,
    country_name: escapeHtml(country.name),
    country_code: code,
    parent_label: escapeHtml(category.name),
    parent_url: site.url(`/en/category/${categorySlug}`),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: effectivePage.seo_title || effectivePage.title,
    seo_description: effectivePage.seo_description || "",
    seo_keywords: effectivePage.seo_keywords || "",
    canonical: effectivePage.canonical_url || site.url(`/en/category/${categorySlug}/${code}`),
    og_image: (effectivePage.og_image || effectivePage.featured_image) ? site.url(effectivePage.og_image || effectivePage.featured_image) : site.ogImageUrl,
    og_image_alt: effectivePage.title,
    robots: effectivePage.robots || "index,follow",
    author_name: escapeHtml(author?.name || ""),
    author_id: effectivePage.author_id || null
  }, [itemListSchema, faqSchema].filter(Boolean),
    buildBreadcrumbs("categoryCountryPage", { categorySlug, categoryName: category.name, countryName: country.name }));

  return new Response(html, { headers: cacheHeaders() });
}

function parseContentJson(contentJson) {
  if (!contentJson) return "";
  try {
    const parsed = JSON.parse(contentJson);
    if (typeof parsed === "string") return parsed;
    if (parsed.text) return parsed.text;
    if (parsed.html) return parsed.html;
    return Object.values(parsed).join("<br><br>");
  } catch {
    return contentJson;
  }
}

export async function renderDynamicPage(request, env, slug, ctx = null) {
  const page = await pages.getPage(env.DB, slug);
  if (!page) return render404(request, env);

  // Security: only render published pages publicly -- closes a gap
  // found while instrumenting page-view analytics. getPage() itself
  // deliberately does NOT filter on `published` (both admin and public
  // callers use it), so this check belongs here, matching the exact
  // convention already used by renderReview/renderNews for their own
  // published flags, not inside the shared database helper.
  if (!page.published || Number(page.published) !== 1) {
    return render404(request, env);
  }

  // Analytics (Phase: page-view instrumentation). Same non-blocking
  // pattern as casino/review/news. No geoEngine.process() call, same
  // reasoning as those: generic pages don't evaluate a GEO access rule,
  // so this uses the free edge-provided country/city directly instead
  // of adding a computation to the render path purely to feed analytics.
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'PAGE_VIEW',
        pageId: page.id,
        countryCode: request.cf?.country || null,
        city: request.cf?.city || null,
        referrer: request.headers.get('referer') || null,
        landingPage: `/en/${slug}`
      }).catch(() => {})
    );
  }

  const renderer = new Renderer(env, request);

  // ── Inline advertisement injection (was missing for pages) ──
  const rawPageContent = parseContentJson(page.content_json);

  // All of these are independent of each other — fetch concurrently.
  const [site, author, allComponents, dynamicSeo, pageDisplayContent] = await Promise.all([
    getSiteContext(request, env),
    page.author_id ? authors.getAuthorById(env.DB, page.author_id) : Promise.resolve(null),
    renderer.renderAllComponents("page", slug, ctx),
    renderer.loadDynamicSeo("page", slug),
    injectInlineAds(rawPageContent, env, request, "page").catch(e => {
      console.error("Inline ad injection error (page):", e.message);
      return rawPageContent;
    }),
  ]);

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title,
    "description": page.seo_description || "",
    "datePublished": page.created_at,
    "dateModified": page.updated_at || page.created_at
  };

  // Editorial trust hub: append links to whichever policy pages are live.
  let hubIndex = "";
  if (slug === "editorial") {
    try {
      const live = await nrTrust.getPublishedTrustPages(env.DB);
      hubIndex = nrTrust.renderTrustIndex(live.map(p => p.slug), Object.fromEntries(live.map(p => [p.slug, p.title])));
    }
    catch (e) { console.error("Trust index failed:", e.message); }
  }

  const html = await renderer.render("page.html", {
    ...page,
    // {{vars}} are not HTML-escaped by the template engine.
    title: escapeHtml(page.title),
    canonical: dynamicSeo.canonical || site.url(`/en/${slug}`),
    author_name: escapeHtml(author?.name || ""),
    author_avatar: escapeHtml(author?.avatar_url || ""),
    author_role: escapeHtml(author?.role || ""),
    author_slug: encodeURIComponent(author?.slug || ""),
    datePublished: formatDate(page.created_at),
    dateModified: formatDate(page.updated_at || page.created_at),
    content_json: pageDisplayContent + hubIndex,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || page.title,
    seo_description: dynamicSeo.seo_description || page.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || page.seo_keywords || "",
  }, pageSchema, buildBreadcrumbs("page", { title: page.title }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderAffiliate(request, env, slug) {
  const page = await pages.getPage(env.DB, slug);
  if (!page) return render404(request, env);

  // Security: same published check as renderDynamicPage -- this
  // function has the identical gap (fetches via the same unfiltered
  // pages.getPage()), so it needs the identical fix.
  if (!page.published || Number(page.published) !== 1) {
    return render404(request, env);
  }

  const renderer = new Renderer(env, request);
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title
  };
  const html = await renderer.render("affiliate.html", {
    ...page,
    title: escapeHtml(page.title),
    content_json: parseContentJson(page.content_json)
  }, pageSchema, buildBreadcrumbs("affiliate", { title: page.title }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderLogin(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "login.html",
      {
        seo_title:
          "Login",
        seo_description: `${site.siteName} Login`,
        canonical: site.url("/en/login"),

        // Public Turnstile sitekey — per-Worker dashboard variable
        // (Settings → Variables and Secrets), never hardcoded.
        turnstile_sitekey: escapeHtml(env.TURNSTILE_SITEKEY || "")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function renderRegister(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "register.html",
      {
        seo_title:
          "Register",
        seo_description: `Create ${site.siteName} account`,
        canonical: site.url("/en/register"),

        // Public Turnstile sitekey — per-Worker dashboard variable
        // (Settings → Variables and Secrets), never hardcoded.
        turnstile_sitekey: escapeHtml(env.TURNSTILE_SITEKEY || "")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function renderForgotPassword(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "forgot-password.html",
      {
        seo_title:
          "Forgot Password",
        seo_description: `Reset your ${site.siteName} password`,
        canonical: site.url("/en/forgot-password")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function renderResetPassword(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  const html =
    await renderer.render(
      "reset-password.html",
      {
        seo_title:
          "Reset Password",
        seo_description: `Reset your ${site.siteName} password`,
        canonical: site.url("/en/reset-password"),
        token
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function render404(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const html = await renderer.render("404.html", {
    seo_title: "404 - Page Not Found",
    seo_description: `Sorry, this page does not exist on ${site.siteName}.`
  });

  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html"
    }
  });
}

export async function renderCasinoList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, casinoList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    casinos.getAllCasinos(env.DB),
    renderer.renderAllComponents("casino_list", "casino_list"),
    renderer.loadDynamicSeo("casino_list", "casino_list"),
  ]);
  const geoData = await prepareGeoData(env, request, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Complete Directory of Online Casinos",
    "itemListElement": sortedCasinos.map((c, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };
    // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical ||site.url("/en/casino"),
    category: "All Casinos",
    description: "Browse our complete directory of reviewed online casinos.",
    casino_cards: buildCasinoCards(sortedCasinos, geoData, bonusOverrides, paymentMethodsByCasino),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `All Online Casinos — ${site.siteName}.`,
    seo_description: dynamicSeo.seo_description || "Complete directory of reviewed online casinos with bonuses and ratings.",
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, listSchema, buildBreadcrumbs("casinoList"));

  return new Response(html, { headers: cacheHeaders() });
}

// =====================================================
// SPORTSBOOK (Phase 3 — generic content engine)
// Storage: content_items (content_type = 'sportsbook'), migration
// 0051/0052. Mirrors renderCasino/renderCasinoList's structure and
// conventions, reusing category.html for the listing (same pattern
// renderCasinoList itself already uses) and the new, generic
// content-item.html for the detail page. SEO and components are
// fully generic already (loadDynamicSeo/renderAllComponents are
// keyed by pageType/pageSlug against seo_meta and the component
// engine, both already type-agnostic — see the Phase 0/1 audit).
//
// Enablement (content_types_enabled) is checked by the caller in
// index.js before this function is reached, per the Phase 2 report
// §8 design — this function assumes it has already been called only
// because sportsbook is enabled for this environment.
//
/**
 * Tracked outbound link for sportsbook/affiliate_partner/custom items
 * (content_items.tracking_url, migration 0060). Deliberately NOT the
 * casino pipeline above (tracking_links/click_id/postback/commercial
 * attribution) -- this only logs a CONTENT_CLICK analytics event
 * (content_item_id, migration 0059) and redirects. Falls back to
 * item.website if tracking_url isn't set, so the "Visit Site" CTA
 * always has somewhere to go once ANY URL is configured.
 */
export async function handleContentTrackedRedirect(request, env, contentType, slug, ctx = null) {
  if (!["sportsbook", "affiliate_partner", "custom"].includes(contentType)) return render404(request, env);
  const item = await contentItems.getPublishedContentItem(env.DB, contentType, slug);
  if (!item) return render404(request, env);
  const target = item.tracking_url || item.website;
  if (!target) return render404(request, env);

  const edgeGeo = { country: request.cf?.country || null, city: request.cf?.city || "Unknown" };
  const geoInfo = geoEngine.process(request, edgeGeo);
  const ipHash = await hashIP(request.headers.get("CF-Connecting-IP"));
  const userAgent = request.headers.get("user-agent");
  const { deviceType, isBot } = classifyUserAgent(userAgent);

  const work = logAnalyticsEvent(env.DB, {
    eventType: "CONTENT_CLICK",
    contentItemId: item.id,
    countryCode: geoInfo.country, city: geoInfo.city, deviceType, isBot,
    visitorHash: ipHash,
    referrer: request.headers.get("referer") || null,
    metadata: { content_type: contentType },
  }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work);
  else await work;

  return Response.redirect(target, 302);
}

/**
 * Public renderer for content_landing_pages (migration 0061). See
 * that migration's own comment for why this is a separate, smaller
 * system from the casino seo_pages one, not an extension of it.
 */
export async function renderContentLandingPage(request, env, slug) {
  const page = await landingPagesDB.getPublishedLandingPage(env.DB, slug);
  if (!page) return render404(request, env);

  let itemList;
  if (page.item_mode === "manual") {
    const itemIds = await landingPagesDB.getLandingPageItemIds(env.DB, page.id);
    itemList = [];
    for (const id of itemIds) {
      // getContentGeoStatuses() below needs published items; a manually
      // curated id that has since been unpublished is skipped rather
      // than rendered as a broken card (same "skip, don't fail" posture
      // loadComparisonRowItems() uses for comparison rows).
      const row = await contentItems.getContentItemById(env.DB, page.content_type, id);
      if (row && row.published && row.status === "published" && (page.content_type !== "custom" || row.custom_type_slug === page.custom_type_slug)) {
        itemList.push(row);
      }
    }
  } else {
    itemList = await contentItems.getAllContentItems(env.DB, page.content_type, { status: "published" });
    if (page.content_type === "custom") itemList = itemList.filter(i => i.custom_type_slug === page.custom_type_slug);
    itemList = itemList.filter(i => i.published)
      .sort((a, b) => (b.featured - a.featured) || ((b.rating || 0) - (a.rating || 0)))
      .slice(0, page.auto_limit);
  }

  const renderer = new Renderer(env, request);
  const geoData = await prepareContentGeoData(env, request, page.content_type, itemList);
  const eligibleItems = itemList.filter(i => geoData.statuses[i.id] === "allowed");

  const [site, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents("content_landing_page", slug),
    renderer.loadDynamicSeo("content_landing_page", slug),
  ]);

  const linkPrefix = page.content_type === "custom" ? `/en/custom/${page.custom_type_slug}` : page.content_type === "sportsbook" ? "/en/sportsbook" : "/en/affiliate-partner";

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": page.title,
    "itemListElement": eligibleItems.map((item, idx) => ({ "@type": "ListItem", "position": idx + 1, "url": site.url(`${linkPrefix}/${item.slug}`) })),
  };

  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url(`/en/best/${slug}`),
    category: page.title,
    description: page.description || "",
    casino_cards: buildContentItemCards(eligibleItems, page.content_type, linkPrefix, geoData),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    seo_title: escapeHtml(dynamicSeo.title || page.seo_title || page.title),
    seo_description: escapeHtml(dynamicSeo.description || page.seo_description || page.description || ""),
  }, listSchema, buildBreadcrumbs("contentLandingPage", { title: page.title }));

  return new Response(html, { headers: cacheHeaders() });
}

// Simplified relative to renderCasino() for this first pass: no KV
// caching of related items, no per-country GEO badge on the card
// grid, no analytics event logging yet. Noted in the Phase 3 report
// as follow-up work, not silently dropped.
//
// UPDATE (this pass): all three are now implemented --
// getContentGeoStatuses()/buildContentItemGeoBadge() below (content_geo,
// migration 0051, was schema-ready but unused), getRelatedContentItems()
// + KV caching in the three detail renderers below (mirrors
// renderCasino()'s relatedCasinosPromise exactly), and a CONTENT_VIEW
// analytics event per detail-page view (migration 0059 added the
// content_item_id column analytics_events needed for this).
// =====================================================

/**
 * Generic-content counterpart to prepareGeoData() above, for
 * content_items instead of casinos -- same country-detection (request.cf,
 * geoEngine.process), same return shape ({country, statuses}), just
 * delegating the actual rule lookup/inference to
 * content-items.js's getContentGeoStatuses() (keyed by numeric id,
 * since content_items has no equivalent of casinos.slug being the geo
 * rules' join key -- content_geo uses content_type+content_id instead).
 */
async function prepareContentGeoData(env, request, contentType, itemList) {
  const edgeGeo = {
    country: request.cf?.country || null,
    city: request.cf?.city || "Unknown"
  };
  const geoInfo = geoEngine.process(request, edgeGeo);
  const ids = itemList.map(i => i.id);
  if (ids.length === 0) return { country: geoInfo.country, statuses: {} };
  const statuses = await contentItems.getContentGeoStatuses(env.DB, contentType, ids, geoInfo.country);
  return { country: geoInfo.country, statuses };
}

function buildContentItemCards(itemList, contentType, linkPrefix, geoData = null) {
  return itemList.map((item) => {
    const rating = item.rating || 0;
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const ratingDisplay =
      "★".repeat(fullStars) +
      (hasHalf ? "½" : "") +
      "☆".repeat(5 - fullStars - (hasHalf ? 1 : 0));
    // item.name/description are admin-entered content, same untrusted-
    // input posture as every other field this codebase escapes on
    // write-out (see the XSS regression suite for the detail-page
    // renderers below, which already escape item.name -- this card
    // grid builder for the LIST pages had been missed).
    const safeName = escapeHtml(item.name);
    const safeDescription = escapeHtml(item.description || item.seo_description || "");

    const geoBadge = buildContentItemGeoBadge(geoData, item.id);

    return `
      <div class="casino-card">
        ${geoBadge}
        <div class="casino-card__header">
          <img src="${item.logo || '/static/images/default.png'}" alt="${safeName}" class="casino-card__logo" onerror="this.src='/static/images/default.png'">
          <div>
            <h3 class="casino-card__name">${safeName}</h3>
            <div class="rating-stars">${ratingDisplay}</div>
          </div>
        </div>
        <div class="casino-card__body">
          <p class="casino-card__description">${safeDescription}</p>
        </div>
        <div class="casino-card__footer">
          <a href="${linkPrefix}/${item.slug}" class="btn btn--primary">View ${safeName}</a>
        </div>
      </div>`;
  }).join("");
}

/**
 * Small GEO badge for a content-item card, reusing the exact same
 * CSS classes buildCasinoCards() uses (geo-badge / geo-badge--allowed
 * / geo-badge--blocked / geo-badge--unknown) so the visual language is
 * identical across casino and generic-content cards -- no new design
 * system, per the "reuse existing CSS/design tokens" instruction.
 * geoData is { country, statuses: {itemId: status} } or null (when
 * the caller couldn't detect a country, e.g. no CF-IPCountry header);
 * null renders no badge at all, same as buildCasinoCards().
 */
function buildContentItemGeoBadge(geoData, itemId) {
  if (!geoData) return "";
  const geoStatus = geoData.statuses[itemId] || "unknown";
  const flag = countryToFlag(geoData.country);
  let geoIcon, geoClass, geoLabel;
  if (geoStatus === "allowed") { geoIcon = "✓"; geoClass = "geo-badge--allowed"; geoLabel = "Available"; }
  else if (geoStatus === "blocked") { geoIcon = "✕"; geoClass = "geo-badge--blocked"; geoLabel = "Not Available"; }
  else { geoIcon = "?"; geoClass = "geo-badge--unknown"; geoLabel = "Unknown"; }
  return `
    <div class="geo-badge ${geoClass}" title="${geoLabel} in ${countryFullName(geoData.country)}">
      <span class="geo-badge__flag">${flag}</span>
      <span class="geo-badge__icon">${geoIcon}</span>
    </div>`;
}

/** Full-sentence GEO status line for a content-item detail page sidebar, same wording convention as buildCasinoCards()'s geoStatusText. */
function buildContentItemGeoStatusHtml(geoData, itemId) {
  if (!geoData) return "";
  const geoStatus = geoData.statuses[itemId] || "unknown";
  const flag = countryToFlag(geoData.country);
  const geoLabel = geoStatus === "allowed" ? "Available" : geoStatus === "blocked" ? "Not Available" : "Unknown";
  return `<div class="casino-card__geo-status geo-${geoStatus}">${flag} ${geoLabel} for players from ${countryFullName(geoData.country)}</div>`;
}

export async function renderSportsbookList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, itemList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    contentItems.getPublishedContentItems(env.DB, "sportsbook", { limit: 200 }),
    renderer.renderAllComponents("sportsbook_list", "sportsbook_list"),
    renderer.loadDynamicSeo("sportsbook_list", "sportsbook_list"),
  ]);
  const geoData = await prepareContentGeoData(env, request, "sportsbook", itemList);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Sportsbook Directory",
    "itemListElement": itemList.map((item, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/sportsbook/${item.slug}`)
    }))
  };

  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url("/en/sportsbook"),
    category: "All Sportsbooks",
    description: "Browse our directory of reviewed sportsbooks.",
    casino_cards: buildContentItemCards(itemList, "sportsbook", "/en/sportsbook", geoData),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `All Sportsbooks — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || "Complete directory of reviewed sportsbooks with ratings and features.",
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, listSchema, buildBreadcrumbs("sportsbookList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderSportsbook(request, env, slug, ctx = null) {
  // Public-gated lookup -- a draft/unpublished sportsbook must not be
  // reachable at its direct URL just because an admin record exists
  // (see getPublishedContentItem()'s doc comment in
  // database/content-items.js; getContentItem() is the unfiltered
  // admin-only variant and must not be used on this path).
  const item = await contentItems.getPublishedContentItem(env.DB, "sportsbook", slug);
  if (!item) return render404(request, env);

  const renderer = new Renderer(env, request);

  // Same country-detection as prepareGeoData()/prepareContentGeoData()
  // above -- computed once here and reused for both the GEO status
  // sidebar and the CASINO_VIEW-equivalent analytics event below, same
  // "no extra cost beyond what's already computed" note renderCasino() makes.
  const edgeGeo = { country: request.cf?.country || null, city: request.cf?.city || "Unknown" };
  const geoInfo = geoEngine.process(request, edgeGeo);

  // Analytics (CONTENT_VIEW). Fire-and-forget via ctx.waitUntil, same
  // convention as renderCasino()'s CASINO_VIEW logging -- never delays
  // this render. metadata.content_type lets a query distinguish
  // sportsbook/affiliate_partner/custom views without a join, even
  // though content_item_id (migration 0059) already makes them joinable.
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: "CONTENT_VIEW",
        contentItemId: item.id,
        countryCode: geoInfo.country,
        city: geoInfo.city,
        referrer: request.headers.get("referer") || null,
        landingPage: `/en/sportsbook/${slug}`,
        metadata: { content_type: "sportsbook" },
      }).catch(() => {})
    );
  }

  // ── Related Sportsbooks ({{{related_items_html}}}) ──────────
  // Same KV-caching shape as renderCasino()'s relatedCasinosPromise:
  // kicked off unawaited so it runs alongside the Promise.all() below,
  // result only depends on which item this is + the visitor's country.
  const relatedItemsPromise = (async () => {
    const cacheKey = `related_content:sportsbook:${item.id}:${geoInfo.country || "none"}`;
    try {
      const cached = await getCached(env, cacheKey);
      if (cached !== null) return cached;
    } catch { /* fall through to compute fresh */ }
    try {
      const related = await contentItems.getRelatedContentItems(env.DB, item, "sportsbook", geoInfo.country, 6);
      if (related.length === 0) { await setCached(env, cacheKey, "", 300); return ""; }
      const relatedGeoData = { country: geoInfo.country, statuses: Object.fromEntries(related.map(r => [r.id, "allowed"])) };
      const html = buildContentItemCards(related, "sportsbook", "/en/sportsbook", relatedGeoData);
      await setCached(env, cacheKey, html, 300);
      return html;
    } catch (e) {
      console.error("Related sportsbooks failed to load:", e.message);
      return "";
    }
  })();

  const [site, allComponents, dynamicSeo, sports, paymentMethods, itemGeoStatuses, relatedItemsHtml] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents("sportsbook", slug, ctx),
    renderer.loadDynamicSeo("sportsbook", slug),
    contentItems.getContentItemSports(env.DB, "sportsbook", item.id),
    contentItems.getContentItemPaymentMethods(env.DB, "sportsbook", item.id),
    contentItems.getContentGeoStatuses(env.DB, "sportsbook", [item.id], geoInfo.country),
    relatedItemsPromise,
  ]);
  const itemGeoData = { country: geoInfo.country, statuses: itemGeoStatuses };

  const rating = item.rating || 0;
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const ratingDisplay =
    "★".repeat(fullStars) +
    (hasHalf ? "½" : "") +
    "☆".repeat(5 - fullStars - (hasHalf ? 1 : 0));

  const featureFlags = [
    item.live_betting ? "Live Betting" : null,
    item.pre_match ? "Pre-Match" : null,
    item.cashout ? "Cashout" : null,
    item.mobile_app ? "Mobile App" : null,
  ].filter(Boolean);
  const featuresHtml = featureFlags.map(f => `<span class="feature-tag">${f}</span>`).join("");
  const sportsHtml = sports.map(s => `<span class="feature-tag">${s.name}</span>`).join("");
  const paymentMethodsHtml = paymentMethods.map(p => `<span class="feature-tag">${p.name}</span>`).join("");

  const itemSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": {
      "@type": "Product",
      "name": item.name,
      "image": item.logo || site.logoUrl,
      "url": site.url(`/en/sportsbook/${slug}`)
    },
    "reviewRating": { "@type": "Rating", "ratingValue": rating, "bestRating": 5, "worstRating": 1 },
    "author": { "@type": "Organization", "name": `${site.siteName} Expert Team` },
    "publisher": {
      "@type": "Organization", "name": site.siteName, "url": site.origin,
      "logo": { "@type": "ImageObject", "url": site.logoUrl }
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": site.url(`/en/sportsbook/${slug}`) },
    "datePublished": item.created_at ? new Date(item.created_at).toISOString() : undefined,
    "dateModified": (item.updated_at || item.created_at) ? new Date(item.updated_at || item.created_at).toISOString() : undefined,
  };

  const html = await renderer.render("content-item.html", {
    ...item,
    name: escapeHtml(item.name),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || item.seo_title || item.name,
    seo_description: dynamicSeo.seo_description || item.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || item.seo_keywords || "",
    og_image: item.logo ? site.url(item.logo) : site.ogImageUrl,
    og_image_alt: item.name,
    canonical: dynamicSeo.canonical || site.url(`/en/sportsbook/${slug}`),
    rating_display: ratingDisplay,
    features_html: featuresHtml,
    sports_html: sportsHtml,
    payment_methods_html: paymentMethodsHtml,
    commercial_html: "", // no commercial-link concept for sportsbook yet -- template renders nothing for this key
    // License is a primary trust signal; it was collected in the admin form
    // and then dropped on the public page (content-item.html already has a
    // {{#if license}} row that never received a value). Escaped here because
    // {{...}} in this renderer does not auto-escape.
    license: item.license ? escapeHtml(item.license_country ? `${item.license} (${item.license_country})` : item.license) : "",
    custom_fields_html: "",
    highlight_label: null,   // no commercial offer system wired for sportsbook yet — see Phase 3 report
    highlight_value: null,
    website_url: item.website || "",
    status: item.status || "published",
    geo_status_html: buildContentItemGeoStatusHtml(itemGeoData, item.id),
    related_items_html: relatedItemsHtml,
    item_reviews_html: await buildItemReviewsHtml(env.DB, item),
    content_type_label: "Sportsbooks",
  }, itemSchema, buildBreadcrumbs("sportsbook", { name: item.name }));

  return new Response(html, { headers: cacheHeaders() });
}

// =====================================================
// AFFILIATE PARTNER (Phase 4 — generic content engine)
// Storage: content_items (content_type = 'affiliate_partner').
// Route namespace: /en/affiliate-partner/... -- deliberately separate
// from the existing /en/affiliate/{slug} marketing page (untouched,
// see the "affiliate" case in index.js) and from the existing
// commercial affiliate_partners table (migration 0023, untouched --
// see resolveAffiliateLink() in content-resolver.js, which is the
// ONE place this editorial page reads from that table, using a
// deliberately narrow public-safe column list, not `SELECT *`).
//
// An affiliate-partner content item may or may not have a
// linked_affiliate_partner_id set. Per Phase 28 of the original
// spec ("a review must not break if commercial configuration is
// missing"), the commercial info block below is entirely optional --
// commercialHtml is just "" when there's no link, and the template
// renders nothing for that section.
// =====================================================

function buildCommercialInfoHtml(commercial) {
  if (!commercial) return "";
  return `
    <div class="info-card">
      <h4>Program Info</h4>
      <dl>
        <dt>Partner</dt><dd>${commercial.partner_name}</dd>
        ${commercial.partner_type ? `<dt>Type</dt><dd>${commercial.partner_type}</dd>` : ""}
        ${commercial.partner_website ? `<dt>Website</dt><dd><a href="${commercial.partner_website}" target="_blank" rel="noopener">${commercial.partner_website}</a></dd>` : ""}
      </dl>
    </div>`;
}

export async function renderAffiliatePartnerList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, itemList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    contentItems.getPublishedContentItems(env.DB, "affiliate_partner", { limit: 200 }),
    renderer.renderAllComponents("affiliate_partner_list", "affiliate_partner_list"),
    renderer.loadDynamicSeo("affiliate_partner_list", "affiliate_partner_list"),
  ]);
  const geoData = await prepareContentGeoData(env, request, "affiliate_partner", itemList);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Affiliate Partner Directory",
    "itemListElement": itemList.map((item, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/affiliate-partner/${item.slug}`)
    }))
  };

  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url("/en/affiliate-partner"),
    category: "Affiliate Partners",
    description: "Browse our directory of reviewed affiliate partners and programs.",
    casino_cards: buildContentItemCards(itemList, "affiliate_partner", "/en/affiliate-partner", geoData),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Affiliate Partners — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || "Directory of reviewed affiliate partners and programs.",
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, listSchema, buildBreadcrumbs("affiliatePartnerList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderAffiliatePartner(request, env, slug, ctx = null) {
  // Public-gated lookup -- see the matching comment in renderSportsbook().
  const item = await contentItems.getPublishedContentItem(env.DB, "affiliate_partner", slug);
  if (!item) return render404(request, env);

  const renderer = new Renderer(env, request);

  const edgeGeo = { country: request.cf?.country || null, city: request.cf?.city || "Unknown" };
  const geoInfo = geoEngine.process(request, edgeGeo);

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: "CONTENT_VIEW",
        contentItemId: item.id,
        countryCode: geoInfo.country,
        city: geoInfo.city,
        referrer: request.headers.get("referer") || null,
        landingPage: `/en/affiliate-partner/${slug}`,
        metadata: { content_type: "affiliate_partner" },
      }).catch(() => {})
    );
  }

  const relatedItemsPromise = (async () => {
    const cacheKey = `related_content:affiliate_partner:${item.id}:${geoInfo.country || "none"}`;
    try {
      const cached = await getCached(env, cacheKey);
      if (cached !== null) return cached;
    } catch { /* fall through to compute fresh */ }
    try {
      const related = await contentItems.getRelatedContentItems(env.DB, item, "affiliate_partner", geoInfo.country, 6);
      if (related.length === 0) { await setCached(env, cacheKey, "", 300); return ""; }
      const relatedGeoData = { country: geoInfo.country, statuses: Object.fromEntries(related.map(r => [r.id, "allowed"])) };
      const html = buildContentItemCards(related, "affiliate_partner", "/en/affiliate-partner", relatedGeoData);
      await setCached(env, cacheKey, html, 300);
      return html;
    } catch (e) {
      console.error("Related affiliate partners failed to load:", e.message);
      return "";
    }
  })();

  const [site, allComponents, dynamicSeo, commercial, itemGeoStatuses, relatedItemsHtml] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents("affiliate_partner", slug, ctx),
    renderer.loadDynamicSeo("affiliate_partner", slug),
    resolveAffiliateLink(env.DB, {
      contentType: "affiliate_partner",
      id: item.id,
      linkedAffiliatePartnerId: item.linked_affiliate_partner_id,
    }),
    contentItems.getContentGeoStatuses(env.DB, "affiliate_partner", [item.id], geoInfo.country),
    relatedItemsPromise,
  ]);
  const itemGeoData = { country: geoInfo.country, statuses: itemGeoStatuses };

  const rating = item.rating || 0;
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const ratingDisplay =
    "★".repeat(fullStars) +
    (hasHalf ? "½" : "") +
    "☆".repeat(5 - fullStars - (hasHalf ? 1 : 0));

  const itemSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": {
      "@type": "Organization",
      "name": item.name,
      "image": item.logo || site.logoUrl,
      "url": site.url(`/en/affiliate-partner/${slug}`)
    },
    "reviewRating": { "@type": "Rating", "ratingValue": rating, "bestRating": 5, "worstRating": 1 },
    "author": { "@type": "Organization", "name": `${site.siteName} Expert Team` },
    "publisher": {
      "@type": "Organization", "name": site.siteName, "url": site.origin,
      "logo": { "@type": "ImageObject", "url": site.logoUrl }
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": site.url(`/en/affiliate-partner/${slug}`) },
    "datePublished": item.created_at ? new Date(item.created_at).toISOString() : undefined,
    "dateModified": (item.updated_at || item.created_at) ? new Date(item.updated_at || item.created_at).toISOString() : undefined,
  };

  const html = await renderer.render("content-item.html", {
    ...item,
    name: escapeHtml(item.name),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || item.seo_title || item.name,
    seo_description: dynamicSeo.seo_description || item.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || item.seo_keywords || "",
    og_image: item.logo ? site.url(item.logo) : site.ogImageUrl,
    og_image_alt: item.name,
    canonical: dynamicSeo.canonical || site.url(`/en/affiliate-partner/${slug}`),
    rating_display: ratingDisplay,
    features_html: "",
    sports_html: "",
    payment_methods_html: "",
    commercial_html: buildCommercialInfoHtml(commercial),
    custom_fields_html: "",
    highlight_label: null,
    highlight_value: null,
    website_url: item.website || "",
    status: item.status || "published",
    geo_status_html: buildContentItemGeoStatusHtml(itemGeoData, item.id),
    related_items_html: relatedItemsHtml,
    item_reviews_html: await buildItemReviewsHtml(env.DB, item),
    content_type_label: "Affiliate Partners",
  }, itemSchema, buildBreadcrumbs("affiliatePartner", { name: item.name }));

  return new Response(html, { headers: cacheHeaders() });
}

// =====================================================
// CUSTOM CONTENT TYPES (Phase 5 — generic content engine)
// Storage: content_items (content_type = 'custom', custom_type_slug
// = the admin-defined type), custom_content_types,
// custom_field_definitions, custom_field_values (migration 0051).
//
// Route shape: /en/custom/{typeSlug} (listing) and
// /en/custom/{typeSlug}/{slug} (detail). Both 404 if either the
// 'custom' content type is disabled for this environment OR the
// requested typeSlug doesn't match a defined custom_content_types
// row -- the latter check happens here (not just in routes.js/
// index.js) since typeSlug is admin-defined data, not a fixed prefix
// like "sportsbook".
//
// Field rendering goes through custom-field-render.js exclusively --
// see that file for the Phase 36 security rationale (never render a
// custom field as raw HTML).
// =====================================================

export async function renderCustomList(request, env, typeSlug) {
  const customType = await customTypes.getCustomContentType(env.DB, typeSlug);
  if (!customType) return render404(request, env);

  const renderer = new Renderer(env, request);

  const [site, itemList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    contentItems.getPublishedContentItems(env.DB, "custom", { limit: 200 })
      .then(rows => rows.filter(r => r.custom_type_slug === typeSlug)),
    renderer.renderAllComponents(`custom_${typeSlug}_list`, `custom_${typeSlug}_list`),
    renderer.loadDynamicSeo(`custom_${typeSlug}_list`, `custom_${typeSlug}_list`),
  ]);
  const geoData = await prepareContentGeoData(env, request, "custom", itemList);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": customType.plural_label,
    "itemListElement": itemList.map((item, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/custom/${typeSlug}/${item.slug}`)
    }))
  };

  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url(`/en/custom/${typeSlug}`),
    category: customType.plural_label,
    description: `Browse our directory of ${customType.plural_label.toLowerCase()}.`,
    casino_cards: buildContentItemCards(itemList, "custom", `/en/custom/${typeSlug}`, geoData),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `${customType.plural_label} — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || `Directory of ${customType.plural_label.toLowerCase()}.`,
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, listSchema, buildBreadcrumbs("customList", { typeSlug, typeLabel: customType.plural_label }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderCustom(request, env, typeSlug, slug, ctx = null) {
  const customType = await customTypes.getCustomContentType(env.DB, typeSlug);
  if (!customType) return render404(request, env);

  // Public-gated lookup -- see the matching comment in renderSportsbook().
  const item = await contentItems.getPublishedContentItem(env.DB, "custom", slug);
  if (!item || item.custom_type_slug !== typeSlug) return render404(request, env);

  const renderer = new Renderer(env, request);

  const edgeGeo = { country: request.cf?.country || null, city: request.cf?.city || "Unknown" };
  const geoInfo = geoEngine.process(request, edgeGeo);

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: "CONTENT_VIEW",
        contentItemId: item.id,
        countryCode: geoInfo.country,
        city: geoInfo.city,
        referrer: request.headers.get("referer") || null,
        landingPage: `/en/custom/${typeSlug}/${slug}`,
        metadata: { content_type: "custom", custom_type_slug: typeSlug },
      }).catch(() => {})
    );
  }

  const relatedItemsPromise = (async () => {
    const cacheKey = `related_content:custom:${item.id}:${geoInfo.country || "none"}`;
    try {
      const cached = await getCached(env, cacheKey);
      if (cached !== null) return cached;
    } catch { /* fall through to compute fresh */ }
    try {
      // Related pool is scoped to "custom" content_type overall by
      // getRelatedContentItems() (categories aren't type-specific), then
      // narrowed to the SAME custom_type_slug here -- a "Payment
      // Provider" shouldn't recommend a "Casino Software" custom item
      // just because both are content_type='custom'.
      const relatedRaw = await contentItems.getRelatedContentItems(env.DB, item, "custom", geoInfo.country, 18);
      const related = relatedRaw.filter(r => r.custom_type_slug === typeSlug).slice(0, 6);
      if (related.length === 0) { await setCached(env, cacheKey, "", 300); return ""; }
      const relatedGeoData = { country: geoInfo.country, statuses: Object.fromEntries(related.map(r => [r.id, "allowed"])) };
      const html = buildContentItemCards(related, "custom", `/en/custom/${typeSlug}`, relatedGeoData);
      await setCached(env, cacheKey, html, 300);
      return html;
    } catch (e) {
      console.error("Related custom items failed to load:", e.message);
      return "";
    }
  })();

  const [site, allComponents, dynamicSeo, fieldDefs, fieldValues, itemGeoStatuses, relatedItemsHtml] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents(`custom_${typeSlug}`, slug, ctx),
    renderer.loadDynamicSeo(`custom_${typeSlug}`, slug),
    customTypes.getCustomFieldDefinitions(env.DB, typeSlug),
    customTypes.getCustomFieldValues(env.DB, item.id),
    contentItems.getContentGeoStatuses(env.DB, "custom", [item.id], geoInfo.country),
    relatedItemsPromise,
  ]);
  const itemGeoData = { country: geoInfo.country, statuses: itemGeoStatuses };

  const customFieldsHtml = renderCustomFieldsHtml(fieldDefs, fieldValues);

  const rating = item.rating || 0;
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const ratingDisplay =
    "★".repeat(fullStars) +
    (hasHalf ? "½" : "") +
    "☆".repeat(5 - fullStars - (hasHalf ? 1 : 0));

  const itemSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": item.name,
    "image": item.logo || site.logoUrl,
    "url": site.url(`/en/custom/${typeSlug}/${slug}`),
    "aggregateRating": rating ? { "@type": "AggregateRating", "ratingValue": rating, "bestRating": 5, "worstRating": 1, "ratingCount": 1 } : undefined,
  };

  const html = await renderer.render("content-item.html", {
    ...item,
    name: escapeHtml(item.name),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || item.seo_title || item.name,
    seo_description: dynamicSeo.seo_description || item.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || item.seo_keywords || "",
    og_image: item.logo ? site.url(item.logo) : site.ogImageUrl,
    og_image_alt: item.name,
    canonical: dynamicSeo.canonical || site.url(`/en/custom/${typeSlug}/${slug}`),
    rating_display: ratingDisplay,
    features_html: "",
    sports_html: "",
    payment_methods_html: "",
    commercial_html: "",
    custom_fields_html: customFieldsHtml,
    highlight_label: null,
    highlight_value: null,
    website_url: item.website || "",
    status: item.status || "published",
    geo_status_html: buildContentItemGeoStatusHtml(itemGeoData, item.id),
    related_items_html: relatedItemsHtml,
    item_reviews_html: await buildItemReviewsHtml(env.DB, item),
    content_type_label: customType.plural_label,
  }, itemSchema, buildBreadcrumbs("custom", { typeSlug, typeLabel: customType.label, name: item.name }));

  return new Response(html, { headers: cacheHeaders() });
}

// =====================================================
// GENERIC REVIEW ENGINE (Phase 6 — generic content engine)
// Serves reviews for sportsbook, affiliate_partner, and custom
// content -- i.e. any review whose reviewed_content_type is NOT
// 'casino'. Casino reviews keep using the existing renderReview()
// and review.html completely unchanged; this is a deliberately
// separate, leaner controller and template (generic-review.html),
// same pattern as every other new content type in this project.
//
// reviews.getReview(db, slug) is already generic (keyed by the
// globally-unique reviews.slug, no casino_slug filter) -- confirmed
// in the Phase 0 audit and unchanged since. The only new logic here
// is: (1) verifying the fetched review's reviewed_content_type
// actually matches what the route expected, so
// /en/sportsbook/review/{slug} can't accidentally render a review
// that belongs to a casino or a different sportsbook-adjacent type,
// and (2) resolving the reviewed item generically via
// resolveContentItemById() instead of a type-specific join.
// =====================================================

function buildProsConsHtml(jsonText) {
  let items = [];
  try {
    const parsed = JSON.parse(jsonText || "[]");
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }
  return items.length
    ? `<ul>${items.map(i => `<li>${escapeReviewText(i)}</li>`).join("")}</ul>`
    : "<p class='muted'>None listed.</p>";
}

// Reuses the same escaping discipline as custom-field-render.js --
// pros/cons entries are plain text, never raw HTML, regardless of
// what an editor typed into the JSON array.
function escapeReviewText(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildCriteriaScoresHtml(breakdown) {
  if (!breakdown.length) return "";
  const totalWeight = breakdown.reduce((sum, r) => sum + r.weight, 0) || 1;
  return `<div class="criteria-breakdown">${breakdown.map(r => `
    <div class="criteria-row">
      <span class="criteria-label">${escapeReviewText(r.label)}</span>
      <span class="criteria-score">${r.score.toFixed(1)} / 5</span>
      <span class="criteria-weight">(${Math.round((r.weight / totalWeight) * 100)}% weight)</span>
    </div>`).join("")}</div>`;
}

function buildReviewedItemCardHtml(item, linkUrl) {
  if (!item) return "";
  return `
    <div class="casino-card" style="margin-bottom:24px">
      <div class="casino-card__header">
        <img src="${item.logo || '/static/images/default.png'}" alt="${item.name}" class="casino-card__logo" onerror="this.src='/static/images/default.png'">
        <div><h3 class="casino-card__name">${item.name}</h3></div>
      </div>
      <div class="casino-card__footer">
        <a href="${linkUrl}" class="btn btn--primary">View ${item.name}</a>
      </div>
    </div>`;
}

function reviewUrlForItem(item, reviewSlug) {
  if (item.content_type === "custom") return `/en/custom/${item.custom_type_slug}/review/${reviewSlug}`;
  if (item.content_type === "affiliate_partner") return `/en/affiliate-partner/review/${reviewSlug}`;
  return `/en/sportsbook/review/${reviewSlug}`;
}

async function buildItemReviewsHtml(db, item) {
  let rows = [];
  try {
    rows = await genericReviewsDb.getPublishedReviewsForContent(db, item.content_type, item.id);
  } catch (e) {
    console.error("Item reviews failed (page renders without them):", e.message);
  }
  if (!rows.length) return `<p class="muted">No reviews yet.</p>`;
  return rows.map(r => {
    const plain = String(r.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const excerpt = plain.length > 200 ? plain.substring(0, 200) + "..." : plain;
    return `<div class="review-item"><h4><a href="${reviewUrlForItem(item, r.slug)}">${escapeReviewText(r.title)}</a></h4><span class="review-rating">★ ${r.rating ? escapeReviewText(r.rating + "/5") : "N/A"}</span><p class="review-excerpt">${escapeReviewText(excerpt)}</p></div>`;
  }).join("");
}

const REVIEWABLE_TYPE_ROUTES = {
  sportsbook: (slug) => `/en/sportsbook/${slug}`,
  affiliate_partner: (slug) => `/en/affiliate-partner/${slug}`,
  // custom's link needs the item's own custom_type_slug, resolved per-item below
};

export async function renderGenericReview(request, env, expectedReviewedContentType, slug, ctx = null, expectedCustomTypeSlug = null) {
  const review = await reviews.getReview(env.DB, slug);
  if (!review) return render404(request, env);

  // Defense-in-depth: the review this slug resolves to must actually
  // belong to the content type (and, for custom, the specific custom
  // type) the route claims -- prevents e.g. a sportsbook review slug
  // being reachable under /en/custom/payment-provider/review/{slug}
  // if slugs were ever to collide across types (they can't today,
  // since reviews.slug is globally UNIQUE, but this check makes the
  // route's own contract explicit rather than relying solely on that).
  if (review.reviewed_content_type !== expectedReviewedContentType) return render404(request, env);

  const renderer = new Renderer(env, request);

  const reviewedItem = review.reviewed_content_id
    ? await resolveContentItemById(env.DB, expectedReviewedContentType, review.reviewed_content_id)
    : null;
  if (!reviewedItem) return render404(request, env);

  if (expectedReviewedContentType === "custom" && reviewedItem.customTypeSlug !== expectedCustomTypeSlug) {
    return render404(request, env);
  }

  const customTypeRow = expectedReviewedContentType === "custom"
    ? await customTypes.getCustomContentType(env.DB, expectedCustomTypeSlug)
    : null;

  const linkUrl = expectedReviewedContentType === "custom"
    ? `/en/custom/${expectedCustomTypeSlug}/${reviewedItem.slug}`
    : REVIEWABLE_TYPE_ROUTES[expectedReviewedContentType](reviewedItem.slug);

  const reviewUrl = expectedReviewedContentType === "custom"
    ? `/en/custom/${expectedCustomTypeSlug}/review/${slug}`
    : `/en/${expectedReviewedContentType === "affiliate_partner" ? "affiliate-partner" : "sportsbook"}/review/${slug}`;

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: "REVIEW_VIEW",
        reviewId: review.id,
        countryCode: request.cf?.country || null,
        city: request.cf?.city || null,
        referrer: request.headers.get("referer") || null,
        landingPage: reviewUrl,
      }).catch(() => {})
    );
  }

  const criteriaContentType = expectedReviewedContentType === "custom"
    ? `custom:${expectedCustomTypeSlug}`
    : expectedReviewedContentType;

  const [site, author, allComponents, dynamicSeo, templates, scores] = await Promise.all([
    getSiteContext(request, env),
    review.author_id ? authors.getAuthorById(env.DB, review.author_id) : Promise.resolve(null),
    renderer.renderAllComponents("generic_review", slug, ctx),
    renderer.loadDynamicSeo("generic_review", slug),
    reviewCriteria.getCriteriaTemplates(env.DB, criteriaContentType),
    reviewCriteria.getCriteriaScores(env.DB, review.id),
  ]);

  const breakdown = reviewCriteria.buildScoreBreakdown(templates, scores);
  const computedRating = reviewCriteria.computeWeightedRating(templates, scores);
  const displayRating = computedRating !== null ? computedRating : (review.rating || 0);

  const fullStars = Math.floor(displayRating);
  const hasHalf = displayRating % 1 >= 0.5;
  const ratingDisplay =
    "★".repeat(fullStars) +
    (hasHalf ? "½" : "") +
    "☆".repeat(5 - fullStars - (hasHalf ? 1 : 0)) +
    ` (${displayRating.toFixed(1)} / 5)`;

  const itemSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": { "@type": "Product", "name": reviewedItem.name, "url": site.url(linkUrl) },
    "reviewRating": { "@type": "Rating", "ratingValue": displayRating, "bestRating": 5, "worstRating": 1 },
    "author": author ? { "@type": "Person", "name": author.name } : { "@type": "Organization", "name": `${site.siteName} Expert Team` },
    "publisher": {
      "@type": "Organization", "name": site.siteName, "url": site.origin,
      "logo": { "@type": "ImageObject", "url": site.logoUrl }
    },
    "datePublished": review.created_at ? new Date(review.created_at).toISOString() : undefined,
    "dateModified": (review.updated_at || review.created_at) ? new Date(review.updated_at || review.created_at).toISOString() : undefined,
  };

  const breadcrumbType = expectedReviewedContentType === "sportsbook" ? "sportsbookReview"
    : expectedReviewedContentType === "affiliate_partner" ? "affiliatePartnerReview"
    : "customReview";

  const html = await renderer.render("generic-review.html", {
    title: escapeHtml(review.title),
    content: review.content || "",
    verdict: review.verdict || "",
    reviewed_at: review.created_at ? new Date(review.created_at).toLocaleDateString() : "",
    updated_at: review.updated_at ? new Date(review.updated_at).toLocaleDateString() : "",
    rating_display: ratingDisplay,
    reviewed_item_label: expectedReviewedContentType === "custom" ? "Product" : "Item",
    reviewed_item_name: reviewedItem.name,
    reviewed_item_card_html: buildReviewedItemCardHtml(reviewedItem, site.url(linkUrl)),
    pros_html: buildProsConsHtml(review.pros),
    cons_html: buildProsConsHtml(review.cons),
    criteria_scores_html: buildCriteriaScoresHtml(breakdown),
    author_name: author?.name || "",
    author_avatar: author?.avatar_url || "",
    author_slug: author?.slug || "",
    author_role: author?.role || "",
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    seo_title: dynamicSeo.seo_title || review.seo_title || review.title,
    seo_description: dynamicSeo.seo_description || review.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || review.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(reviewUrl),
  }, itemSchema, buildBreadcrumbs(breadcrumbType, {
    name: review.title,
    typeSlug: expectedCustomTypeSlug,
    typeLabel: customTypeRow?.plural_label || expectedCustomTypeSlug,
  }));

  return new Response(html, { headers: cacheHeaders() });
}

// =====================================================
// COMPARISON ENGINE (Phase 7 — generic content engine)
// Storage: comparisons / comparison_items (migration 0051). This is
// the persistent, SEO-indexable comparison-PAGE engine -- separate
// from the existing database-driven `comparison_table` COMPONENT
// (component-engine.js), which is an admin-authored embeddable
// widget with its own JSON content shape, used to drop a small
// comparison into the middle of some other page. Both can coexist;
// this project does not force them into one system, since their data
// shapes and lifecycles are genuinely different (a full page with its
// own URL/SEO/publish workflow vs. an inline widget). See the Phase
// 6 report for the fuller reasoning.
//
// Route shape: /en/compare/{type}/{slug} and /en/compare/{type}.
// {type} IS the comparison's content_type (casino included -- a
// casino comparison is exactly as valid as a sportsbook one; this
// engine was never casino-exclusive to begin with).
// =====================================================

/** Best-effort per-item field lookup for a comparison criterion: checks the item's own raw row first, then (for custom items) its typed custom-field values. Returns null, not a guess, when nothing matches -- callers render "—" rather than fabricating a value. */
function resolveCriterionValue(item, criterionKey, customFieldValuesByItemKey) {
  if (item.raw && Object.prototype.hasOwnProperty.call(item.raw, criterionKey)) {
    return item.raw[criterionKey];
  }
  if (item.contentType === "custom") {
    const values = customFieldValuesByItemKey[`${item.contentType}:${item.id}`];
    if (values && Object.prototype.hasOwnProperty.call(values, criterionKey)) {
      return values[criterionKey];
    }
  }
  return null;
}

function formatCriterionCellValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return "—";
  if (rawValue === 1 || rawValue === true || rawValue === "1" || rawValue === "true") return "✓";
  if (rawValue === 0 || rawValue === false || rawValue === "0" || rawValue === "false") return "✗";
  return escapeReviewText(rawValue);
}

async function loadComparisonRowItems(db, comparisonItemRows) {
  const items = [];
  const customFieldValuesByItemKey = {};
  for (const row of comparisonItemRows) {
    const item = await resolveContentItemById(db, row.item_content_type, row.item_id);
    if (!item) continue; // an item that's since been deleted/unpublished -- skip rather than break the whole page (Phase 66 of the original spec: optional/missing data degrades gracefully)
    items.push(item);
    if (item.contentType === "custom") {
      customFieldValuesByItemKey[`${item.contentType}:${item.id}`] = await customTypes.getCustomFieldValues(db, item.id);
    }
  }
  return { items, customFieldValuesByItemKey };
}

function buildComparisonTableHtml(items, criteria, customFieldValuesByItemKey, linkPrefixFor) {
  const headerCells = items.map(i => `<th>${escapeReviewText(i.name)}</th>`).join("");
  const logoCells = items.map(i => `<td data-label="${escapeReviewText(i.name)}"><img src="${i.logo || '/static/images/default.png'}" alt="${escapeReviewText(i.name)}" style="max-height:40px" onerror="this.src='/static/images/default.png'"></td>`).join("");
  const ratingCells = items.map(i => `<td data-label="${escapeReviewText(i.name)}">${i.rating ? i.rating.toFixed(1) + " / 5" : "—"}</td>`).join("");
  const ctaCells = items.map(i => `<td data-label="${escapeReviewText(i.name)}"><a href="${linkPrefixFor(i)}/${i.slug}" class="btn btn--primary">View</a></td>`).join("");

  const criteriaRows = criteria.map(c => {
    const valueCells = items.map(i => {
      const raw = resolveCriterionValue(i, c.key, customFieldValuesByItemKey);
      return `<td data-label="${escapeReviewText(i.name)}">${formatCriterionCellValue(raw)}</td>`;
    }).join("");
    return `<tr><td>${escapeReviewText(c.label)}</td>${valueCells}</tr>`;
  }).join("");

  return { headerCells, logoCells, ratingCells, ctaCells, criteriaRows };
}

function linkPrefixForItem(item) {
  switch (item.contentType) {
    case "casino": return "/en/casino";
    case "sportsbook": return "/en/sportsbook";
    case "affiliate_partner": return "/en/affiliate-partner";
    case "custom": return `/en/custom/${item.customTypeSlug}`;
    default: return "/en";
  }
}

export async function renderComparisonList(request, env, compareType) {
  const renderer = new Renderer(env, request);

  const [site, comparisonList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    comparisonsDb.getPublishedComparisons(env.DB, compareType, { limit: 200 }),
    renderer.renderAllComponents(`compare_${compareType}_list`, `compare_${compareType}_list`),
    renderer.loadDynamicSeo(`compare_${compareType}_list`, `compare_${compareType}_list`),
  ]);

  const cardsHtml = comparisonList.map(c => `
    <div class="casino-card">
      <div class="casino-card__body"><h3 class="casino-card__name">${escapeReviewText(c.title)}</h3><p>${escapeReviewText(c.description || "")}</p></div>
      <div class="casino-card__footer"><a href="/en/compare/${compareType}/${c.slug}" class="btn btn--primary">View Comparison</a></div>
    </div>`).join("");

  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url(`/en/compare/${compareType}`),
    category: `${compareType.charAt(0).toUpperCase() + compareType.slice(1)} Comparisons`,
    description: `Head-to-head comparisons.`,
    casino_cards: cardsHtml,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    seo_title: dynamicSeo.seo_title || `${compareType} Comparisons — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || "Head-to-head comparisons.",
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, {
    "@context": "https://schema.org", "@type": "ItemList",
    "itemListElement": comparisonList.map((c, idx) => ({ "@type": "ListItem", "position": idx + 1, "url": site.url(`/en/compare/${compareType}/${c.slug}`) }))
  }, buildBreadcrumbs("comparisonList", { compareType }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderComparison(request, env, compareType, slug, ctx = null) {
  // Public-gated lookup -- comparisons had no status check at all here
  // before (getComparison() is unfiltered), so a draft comparison was
  // fully reachable at its own public URL. See getPublishedComparison()'s
  // doc comment in database/comparisons.js.
  const comparison = await comparisonsDb.getPublishedComparison(env.DB, compareType, slug);
  if (!comparison) return render404(request, env);

  const renderer = new Renderer(env, request);
  const comparisonItemRows = await comparisonsDb.getComparisonItems(env.DB, comparison.id);
  const { items, customFieldValuesByItemKey } = await loadComparisonRowItems(env.DB, comparisonItemRows);

  let criteria = [];
  try {
    const parsed = JSON.parse(comparison.criteria_json || "[]");
    criteria = Array.isArray(parsed) ? parsed : [];
  } catch { criteria = []; }

  const [site, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents(`compare_${compareType}`, slug, ctx),
    renderer.loadDynamicSeo(`compare_${compareType}`, slug),
  ]);

  const { headerCells, logoCells, ratingCells, ctaCells, criteriaRows } =
    buildComparisonTableHtml(items, criteria, customFieldValuesByItemKey, (i) => linkPrefixForItem(i));

  let editorialPickHtml = "";
  if (comparison.editorial_selection_item_type && comparison.editorial_selection_item_id) {
    const pick = await resolveContentItemById(env.DB, comparison.editorial_selection_item_type, comparison.editorial_selection_item_id);
    if (pick) {
      editorialPickHtml = `<p><strong>${escapeReviewText(pick.name)}</strong> is our top pick. <a href="${linkPrefixForItem(pick)}/${pick.slug}">View ${escapeReviewText(pick.name)}</a></p>`;
    }
  }

  const itemSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": comparison.title,
    "itemListElement": items.map((item, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`${linkPrefixForItem(item)}/${item.slug}`)
    })),
  };

  const html = await renderer.render("comparison.html", {
    title: escapeHtml(comparison.title),
    description: comparison.description || "",
    item_header_cells_html: headerCells,
    item_logo_cells_html: logoCells,
    item_rating_cells_html: ratingCells,
    item_cta_cells_html: ctaCells,
    criteria_rows_html: criteriaRows,
    editorial_pick_html: editorialPickHtml,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    seo_title: dynamicSeo.seo_title || comparison.seo_title || comparison.title,
    seo_description: dynamicSeo.seo_description || comparison.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || comparison.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/compare/${compareType}/${slug}`),
  }, itemSchema, buildBreadcrumbs("comparison", { compareType, title: comparison.title }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderReviewList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, reviewList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    env.DB.prepare("SELECT * FROM reviews WHERE published = 1 ORDER BY created_at DESC").all(),
    renderer.renderAllComponents("review_list", "review_list"),
    renderer.loadDynamicSeo("review_list", "review_list"),
  ]);

  // Geo-aware filtering
  const reviews = reviewList.results || [];
  const casinoSlugs = [...new Set(reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];

  let geoStatuses = {};
  let casinoMeta = {};
  if (casinoSlugs.length > 0) {
    const placeholders = casinoSlugs.map(() => '?').join(',');
    // Independent of each other — fetch concurrently.
    const [rulesResult, casinoRows] = await Promise.all([
      env.DB.prepare(`
        SELECT casino_slug, country_code, status FROM geo_rules
        WHERE casino_slug IN (${placeholders})
      `).bind(...casinoSlugs).all(),
      env.DB.prepare(`
        SELECT slug, name, logo FROM casinos WHERE slug IN (${placeholders})
      `).bind(...casinoSlugs).all(),
    ]);

    const rulesByCasino = {};
    for (const row of (rulesResult.results || [])) {
      if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
      rulesByCasino[row.casino_slug].push(row);
    }

    const country = request.cf?.country || null;
    for (const slug of casinoSlugs) {
      const rules = rulesByCasino[slug] || [];
      if (rules.length === 0) { geoStatuses[slug] = "blocked"; continue; }
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) { geoStatuses[slug] = countryRule.status; continue; }
      const hasAllowed = rules.some(r => r.status === "allowed");
      const hasBlocked = rules.some(r => r.status === "blocked");
      if (hasAllowed && !hasBlocked) geoStatuses[slug] = "blocked";
      else if (hasBlocked && !hasAllowed) geoStatuses[slug] = "allowed";
      else geoStatuses[slug] = "blocked";
    }

    for (const row of (casinoRows.results || [])) {
      casinoMeta[row.slug] = row;
    }
  }

    // Geo-rank: available first (by rating desc), then unavailable (by rating desc)
  reviews.sort((a, b) => {
    const aAvail = a.casino_slug && geoStatuses[a.casino_slug] === "allowed" ? 1 : 0;
    const bAvail = b.casino_slug && geoStatuses[b.casino_slug] === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  const reviewCards = reviews.map(r => {
    const geoStatus = r.casino_slug ? (geoStatuses[r.casino_slug] || "blocked") : "unknown";
    const geoBadge = geoStatus === "allowed"
      ? '<span class="status-badge status-published">✓ Available</span>'
      : geoStatus === "blocked"
        ? '<span class="status-badge status-draft">✕ Restricted</span>'
        : '<span class="status-badge status-draft">Unknown</span>';

    const casino = r.casino_slug ? casinoMeta[r.casino_slug] : null;
    const casinoImage = casino?.logo || '/static/images/default.png';
    const casinoImageAlt = casino?.name || r.title;

    return `
    <div class="casino-card">
      <div class="casino-card__image">
        <img src="${casinoImage}" alt="${casinoImageAlt}" loading="lazy" onerror="this.src='/static/images/default.png'">
      </div>
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">${(r.content || "").substring(0, 120)}...</p>
        ${r.casino_slug ? geoBadge : ""}
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--primary">Read Review</a>
      </div>
    </div>`;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "All Casino Reviews",
    "itemListElement": reviews.map((r, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/review/${r.slug}`)
    }))
  };
      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url("/en/review"),
    category: "All Reviews",
    description: "Browse our complete collection of casino reviews.",
    casino_cards: reviewCards,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `All Casino Reviews — ${site.siteName}.`,
    seo_description: dynamicSeo.seo_description || "In-depth casino reviews with pros, cons, and ratings.",
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, listSchema, buildBreadcrumbs("reviewList"));

  return new Response(html, { headers: cacheHeaders() });
}

// News homepage v2 (flag news_v2_homepage). Only for the plain /en/news view;
// search and tag views keep the existing page. Returns null on any failure so
// the caller falls back to the existing page.
async function renderNewsHome(request, env, flags, renderer) {
  const [site, data, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    nrHome.loadHomepage(env.DB, env, flags),
    renderer.renderAllComponents("news_list", "news_list"),
    renderer.loadDynamicSeo("news_list", "news_list"),
  ]);

  const pageTitle = "News";
  const pageDescription = `Latest iGaming industry news and updates from ${site.siteName}.`;
  const canonical = dynamicSeo.canonical || site.url("/en/news");
  const items = [data.lead, ...data.latest].filter(Boolean);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonical}#webpage`,
    "url": canonical,
    "name": pageTitle,
    "description": pageDescription,
    "isPartOf": { "@type": "WebSite", "@id": `${site.origin}#website`, "name": site.siteName, "url": site.origin },
    ...(items.length ? {
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": items.map((a, i) => ({
          "@type": "ListItem", "position": i + 1, "url": site.url(`/en/news/${a.slug}`), "name": a.title
        }))
      }
    } : {})
  };

  const html = await renderer.render("news-home.html", {
    canonical,
    page_title: escapeHtml(pageTitle),
    page_description: escapeHtml(pageDescription),
    home_html: nrHome.renderHomepage(data, formatDate),
    components_top: allComponents.top,
    components_bottom: allComponents.bottom,
    seo_title: dynamicSeo.seo_title || `${pageTitle} | ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || pageDescription,
    seo_keywords: dynamicSeo.seo_keywords || "",
    robots: items.length ? "index, follow" : "noindex, follow"
  }, listSchema, buildBreadcrumbs("newsList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderNewsList(request, env) {
  const renderer = new Renderer(env, request);

  const url = new URL(request.url);
  const searchQuery = (url.searchParams.get("q") || "").trim();
  const tagFilter = (url.searchParams.get("tag") || "").trim();

  // Search v2 (flag news_search_v2): any of q / section / author / country / entity / type / from / to.
  const searchParams = nrSearch.parseSearchParams(url.searchParams);
  if (!tagFilter && nrSearch.hasSearchFilters(searchParams)) {
    try {
      const flags = await newsroom.getNewsFlags(env.DB);
      if (flags.news_search_v2) {
        const res = await renderNewsSearch(request, env, flags, searchParams);
        if (res) return res;
      }
    } catch (e) {
      console.error("News search v2 failed, using the existing search:", e.message);
    }
  }

  if (!searchQuery && !tagFilter && !nrSearch.hasSearchFilters(searchParams)) {
    try {
      const flags = await newsroom.getNewsFlags(env.DB);
      if (flags.news_v2_homepage) return await renderNewsHome(request, env, flags, renderer);
    } catch (e) {
      console.error("News homepage v2 failed, using the existing page:", e.message);
    }
  }

  const newsListPromise = searchQuery
    ? news.searchNews(env.DB, searchQuery, 50)
    : tagFilter
      ? news.getNewsByTag(env.DB, tagFilter, 50)
      : news.getAllNews(env.DB);

  // Independent of each other — fetch concurrently.
  const [site, newsList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    newsListPromise,
    renderer.renderAllComponents("news_list", "news_list"),
    renderer.loadDynamicSeo("news_list", "news_list"),
  ]);

  let pageTitle = "News";
  let pageDescription = `Latest iGaming industry news and updates from ${site.siteName}.`;
  if (searchQuery) {
    pageTitle = `Search: ${searchQuery}`;
    pageDescription = `Search results for "${searchQuery}" — ${site.siteName} News.`;
  } else if (tagFilter) {
    pageTitle = `Tag: ${tagFilter}`;
    pageDescription = `News articles tagged with "${tagFilter}" — ${site.siteName}.`;
  }

  const newsListUrl = dynamicSeo.canonical || site.url("/en/news");

  // ── Render news cards with featured images, excerpts, tags ──
  const newsCards = newsList.map(article => {
    const image = article.featured_image_url || article.featured_image_thumbnail || "";
    const excerpt = article.excerpt || truncateText(stripHtml(article.content || ""), 150);
    const date = article.published_at || article.created_at;

    const imageHtml = image
      ? `<div style="aspect-ratio:16/9;overflow:hidden"><img src="${escapeHtml(image)}" alt="${escapeHtml(safeAlt(article.featured_image_alt, article.title))}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s" loading="lazy" decoding="async"></div>`
      : `<div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gray);font-size:13px">No image</div>`;

    const authorHtml = article.author_name
      ? `<div style="display:flex;align-items:center;gap:8px;color:var(--gray);font-size:13px;margin-top:12px">${article.author_avatar ? `<img src="${escapeHtml(article.author_avatar)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover" loading="lazy">` : ""}<span>${escapeHtml(article.author_name)}</span></div>`
      : "";

    // Tags as small chips (max 3)
    const tagsHtml = article.tags
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${String(article.tags).split(",").map(t => t.trim()).filter(Boolean).slice(0, 3).map(t => `<a href="/en/news?tag=${encodeURIComponent(t)}" style="display:inline-block;padding:3px 9px;border-radius:999px;background:var(--bg);color:var(--gray);font-size:12px;text-decoration:none">${escapeHtml(t)}</a>`).join("")}</div>`
      : "";

    return `
      <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:12px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column">
        <a href="/en/news/${encodeURIComponent(article.slug)}" style="display:block;color:inherit;text-decoration:none">
          ${imageHtml}
          <div style="padding:20px;flex:1;display:flex;flex-direction:column">
            ${date ? `<time style="color:var(--gray);font-size:13px;margin-bottom:8px" datetime="${toIsoDate(date)}">${escapeHtml(formatDate(date))}</time>` : ""}
            <h3 style="margin:0 0 10px;font-size:21px;line-height:1.25;color:var(--dark)">${escapeHtml(article.title)}</h3>
            ${excerpt ? `<p style="margin:0 0 12px;color:var(--gray);font-size:15px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(excerpt)}</p>` : ""}
            ${tagsHtml}
            ${authorHtml}
          </div>
        </a>
      </article>
    `;
  }).join("");

  const hasResults = newsList.length > 0;

  const emptyStateHtml = hasResults ? "" : `
    <div style="text-align:center;padding:60px 20px;color:var(--gray)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="margin-bottom:16px;opacity:0.4">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
      <h2 style="margin:0 0 8px;font-size:22px;color:var(--dark)">No articles found</h2>
      <p style="margin:0 0 20px">Try a different search term or browse all news.</p>
      <a href="/en/news" class="btn btn--ghost">View All News</a>
    </div>
  `;

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${newsListUrl}#webpage`,
    "url": newsListUrl,
    "name": pageTitle,
    "description": pageDescription,
    "isPartOf": {
      "@type": "WebSite",
      "@id": `${site.origin}#website`,
      "name": site.siteName,
      "url": site.origin
    },
    ...(hasResults ? {
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": newsList.map((article, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": site.url(`/en/news/${article.slug}`),
          "name": article.title
        }))
      }
    } : {})
  };

  const html = await renderer.render("news-list.html", {
    canonical: newsListUrl,
    // {{vars}} are not escaped by the template engine and pageTitle/pageDescription
    // embed the ?q= / ?tag= query values (reflected XSS otherwise).
    page_title: escapeHtml(pageTitle),
    page_description: escapeHtml(pageDescription),
    news_cards: newsCards,
    empty_state_html: emptyStateHtml,
    search_query: escapeHtml(searchQuery),
    tag_filter: escapeHtml(tagFilter),
    seo_title: dynamicSeo.seo_title || `${pageTitle} | ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || pageDescription,
    seo_keywords: dynamicSeo.seo_keywords || "",
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar
  }, listSchema, buildBreadcrumbs("newsList"));

  return new Response(html, { headers: cacheHeaders() });
}


export async function renderNewsListbackup(request, env) {
  const renderer =
    new Renderer(env, request);

  const site =
    await getSiteContext(request, env);

  const newsList =
    await news.getAllNews(env.DB);

  const allComponents =
    await renderer.renderAllComponents(
      "news_list",
      "news_list"
    );

  const dynamicSeo =
    await renderer.loadDynamicSeo(
      "news_list",
      "news_list"
    );

  const newsListUrl =
    dynamicSeo.canonical ||
    site.url("/en/news");

  const newsCards =
    newsList.map(article => {

      const description =
        truncateText(
          article.content,
          120
        );

      return `
        <a
          href="${site.url(`/en/news/${article.slug}`)}"
          class="news-card"
        >
          <h3>${article.title}</h3>

          <p>${description}...</p>

          ${
            article.created_at
              ? `
                <time
                  class="news-date"
                  datetime="${toIsoDate(article.created_at)}"
                >
                  ${new Date(
                    article.created_at
                  ).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}
                </time>
              `
              : ""
          }
        </a>
      `;
    }).join("");

  const listSchema = {
    "@context": "https://schema.org",

    "@type": "CollectionPage",

    "@id": `${newsListUrl}#webpage`,

    "url": newsListUrl,

    "name":
      dynamicSeo.seo_title ||
      `${site.siteName} News`,

    "description":
      dynamicSeo.seo_description ||
      `Latest news and updates from ${site.siteName}.`,

    "isPartOf": {
      "@type": "WebSite",

      "@id":
        `${site.origin}#website`,

      "name":
        site.siteName,

      "url":
        site.origin
    },

    "mainEntity": {
      "@type": "ItemList",

      "@id":
        `${newsListUrl}#itemlist`,

      "name":
        `${site.siteName} News`,

      "numberOfItems":
        newsList.length,

      "itemListOrder":
        "https://schema.org/ItemListOrderDescending",

      "itemListElement":
        newsList.map(
          (article, index) => {

            const articleUrl =
              site.url(
                `/en/news/${article.slug}`
              );

            const published =
              toIsoDate(
                article.created_at
              );

            const modified =
              toIsoDate(
                article.updated_at ||
                article.created_at
              );

            return {
              "@type":
                "ListItem",

              "position":
                index + 1,

              "url":
                articleUrl,

              "item": {
                "@type":
                  "NewsArticle",

                "@id":
                  `${articleUrl}#newsarticle`,

                "url":
                  articleUrl,

                "headline":
                  article.title,

                "description":
                  article.seo_description ||
                  truncateText(
                    article.content,
                    160
                  ),

                ...(published
                  ? {
                      "datePublished":
                        published
                    }
                  : {}),

                ...(modified
                  ? {
                      "dateModified":
                        modified
                    }
                  : {}),

                "author": {
                  "@type":
                    "Person",

                  "name":
                    article.author ||
                    site.siteName
                },

                "publisher": {
                  "@type":
                    "Organization",

                  "name":
                    site.siteName,

                  "url":
                    site.origin,

                  ...(site.logoUrl
                    ? {
                        "logo": {
                          "@type":
                            "ImageObject",

                          "url":
                            site.logoUrl
                        }
                      }
                    : {})
                }
              }
            };
          }
        )
    }
  };

  const html =
    await renderer.render(
      "category.html",
      {
        canonical:
          newsListUrl,

        category:
          dynamicSeo.seo_title ||
          `${site.siteName} News`,

        description:
          dynamicSeo.seo_description ||
          `Latest news and updates from ${site.siteName}.`,

        casino_cards:
          `<div class="news-grid">${newsCards}</div>`,

        components_top:
          allComponents.top,

        components_content_top:
          allComponents.content_top,

        components_content_bottom:
          allComponents.content_bottom,

        components_bottom:
          allComponents.bottom,

        components_sidebar:
          allComponents.sidebar,

        seo_title:
          dynamicSeo.seo_title ||
          `${site.siteName} News`,

        seo_description:
          dynamicSeo.seo_description ||
          `Latest news and updates from ${site.siteName}.`,

        seo_keywords:
          dynamicSeo.seo_keywords || ""
      },

      listSchema,

      buildBreadcrumbs(
        "newsList"
      )
    );

  return new Response(
    html,
    {
      headers: cacheHeaders()
    }
  );
}

export async function renderUpdatesList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, updates, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    platformUpdates.getAllPlatformUpdates(env.DB),
    renderer.renderAllComponents("updates_list", "updates_list"),
    renderer.loadDynamicSeo("updates_list", "updates_list"),
  ]);

  const updateCards = updates.map(update => {

    const imageSrc = update.featured_image_url || update.featured_image_thumbnail || "";
    const image = imageSrc
      ? `
        <img
          src="${escapeHtml(imageSrc)}"
          alt="${escapeHtml(safeAlt(update.featured_image_alt, update.title))}"
          class="update-card-image"
          loading="lazy"
        >
      `
      : "";

    const date = formatDate(
      update.published_at || update.created_at
    );

    return `
      <article class="update-card">

        ${image}

        <div class="update-card-body">

          <div class="update-card-label">
            Platform Update
          </div>

          <h2>
            <a href="/en/updates/${update.slug}">
              ${update.title}
            </a>
          </h2>

          ${
            update.excerpt
              ? `<p>${update.excerpt}</p>`
              : ""
          }

          <div class="update-card-meta">
            ${date}
          </div>

        </div>

      </article>
    `;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
      "name": `${site.siteName} Platform Updates`,
    "description": dynamicSeo.seo_description || `${site.siteName} latest updates, improvements, features and announcements`,
    "url": site.url("/en/updates"),
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": updates.map((update, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "url": site.url(`/en/updates/${update.slug}`),
        "name": update.title
      }))
    }
  };

  const html = await renderer.render(
    "updates.html",
    {
      canonical:
        dynamicSeo.canonical || site.url(`/en/updates`),

      category: "Platform Updates",

      description:
        dynamicSeo.seo_description || `Latest ${site.siteName} platform updates, improvements, features and announcements.`,

      update_cards:
        updateCards,

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar,
      seo_title: dynamicSeo.seo_title || `Platform Updates — ${site.siteName}`,
      seo_description: dynamicSeo.seo_description || `Latest ${site.siteName} platform updates, new features, improvements and announcements.`,
      seo_keywords: dynamicSeo.seo_keywords || ""
    },
    listSchema,
    buildBreadcrumbs("updatesList")
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderUpdate(request, env, slug) {
  const update =
    await platformUpdates.getPlatformUpdateBySlug(
      env.DB,
      slug
    );

  if (!update) {
    return render404(request, env);
  }

  const renderer = new Renderer(env, request);

  const [site, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents("update", slug),
    renderer.loadDynamicSeo("update", slug),
  ]);

  const publishedDate =
    formatDate(
      update.published_at ||
      update.created_at
    );

  const updatedDate =
    formatDate(
      update.updated_at ||
      update.created_at
    );

  const updateSchema = {
    "@context": "https://schema.org",
    "@type": "Article",

    "headline": update.title,

    "description":
      update.seo_description ||
      update.excerpt ||
      "",

    "datePublished":
      update.published_at ||
      update.created_at,

    "dateModified":
      update.updated_at ||
      update.created_at,

    "author": {
      "@type": "Person",
      "name": update.author_name || site.siteName
    },

    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin
    },

    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": site.url(`/en/updates/${slug}`)
    }
  };

  const html = await renderer.render(
    "update.html",
    {
      ...update,
      title: escapeHtml(update.title),

      canonical:
        dynamicSeo.canonical ||
        site.url(`/en/updates/${slug}`),

      author_name:
        update.author_name || "",

      author_avatar:
        update.author_avatar || "",

      author_role:
        update.author_role || "",

      author_slug:
        update.author_slug || "",

      published_date:
        publishedDate,

      updated_date:
        updatedDate,

      seo_title:
        dynamicSeo.seo_title ||
        update.seo_title ||
        update.title,

      seo_description:
        dynamicSeo.seo_description ||
        update.seo_description ||
        update.excerpt ||
        "",

      seo_keywords:
        dynamicSeo.seo_keywords ||
        update.seo_keywords ||
        "",

      og_type: "article",

      og_image:
        update.featured_image_url
          ? site.url(update.featured_image_url)
          : site.ogImageUrl,

      og_image_alt:
        safeAlt(update.featured_image_alt, update.title),

      ...(update.featured_image_width
        ? { og_image_width: update.featured_image_width }
        : {}),

      ...(update.featured_image_height
        ? { og_image_height: update.featured_image_height }
        : {}),

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar
    },
    updateSchema,
    buildBreadcrumbs(
      "update",
      { title: update.title }
    )
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}

async function renderAdminPage(request, env, template, extraData = {}) {
  const user = await getCurrentUser(request, env);
  const allowedRoles = ["admin", "editor"];

  if (!user || !allowedRoles.includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  // Load shared admin navigation
  const adminNav = await renderer.loadTemplate("layout/admin-nav.html");
  const html = await renderer.render(template, {
      seo_title: `Admin — ${site.siteName}`,
      seo_description: `${site.siteName} CMS Admin`,

      email: user.email,
      role: user.role,
      admin_nav: adminNav,

      ...extraData
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}



export async function renderDashboardCasinos(request, env) {
  return renderAdminPage(request, env, "admin/casinos.html");
}
export async function renderDashboardCasinoCreate(request, env) {
  return renderAdminPage(request, env, "admin/casino-create.html");
}
export async function renderDashboardContentItems(request, env) {
  return renderAdminPage(request, env, "admin/content-items.html");
}
export async function renderDashboardContentItemCreate(request, env) {
  return renderAdminPage(request, env, "admin/content-item-create.html");
}
export async function renderDashboardCustomTypes(request, env) {
  return renderAdminPage(request, env, "admin/custom-types.html");
}
export async function renderDashboardCustomTypeCreate(request, env) {
  return renderAdminPage(request, env, "admin/custom-type-create.html");
}
export async function renderDashboardComparisons(request, env) {
  return renderAdminPage(request, env, "admin/comparisons.html");
}
export async function renderDashboardComparisonCreate(request, env) {
  return renderAdminPage(request, env, "admin/comparison-create.html");
}
export async function renderDashboardContentItemEdit(request, env, contentType, slug) {
  return renderAdminPage(request, env, "admin/content-item-edit.html", { content_type: contentType, slug });
}
export async function renderDashboardCustomTypeEdit(request, env, typeSlug) {
  return renderAdminPage(request, env, "admin/custom-type-edit.html", { type_slug: typeSlug });
}
export async function renderDashboardComparisonEdit(request, env, compareType, slug) {
  return renderAdminPage(request, env, "admin/comparison-edit.html", { compare_type: compareType, slug });
}
export async function renderDashboardGenericReviewEdit(request, env, id) {
  return renderAdminPage(request, env, "admin/generic-review-edit.html", { id });
}
export async function renderDashboardContentLandingPages(request, env) {
  return renderAdminPage(request, env, "admin/content-landing-pages.html");
}
export async function renderDashboardContentLandingPageCreate(request, env) {
  return renderAdminPage(request, env, "admin/content-landing-page-create.html");
}
export async function renderDashboardContentLandingPageEdit(request, env, slug) {
  return renderAdminPage(request, env, "admin/content-landing-page-edit.html", { slug });
}
export async function renderDashboardContentTypeSettings(request, env) {
  // This page's own copy says "Admin-only: not visible to editors", and
  // its write endpoint (/api/v1/content-types-enabled/update) really is
  // admin-only -- but renderAdminPage()'s default allowedRoles is
  // ["admin", "editor"], so an editor could actually open this page
  // before this check was added (they just couldn't save from it).
  // Enforced here rather than changing renderAdminPage()'s default,
  // which every other admin page in this file also relies on.
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/content-type-settings.html");
}
export async function renderDashboardGenericReviews(request, env) {
  return renderAdminPage(request, env, "admin/generic-reviews.html");
}
export async function renderDashboardGenericReviewCreate(request, env) {
  return renderAdminPage(request, env, "admin/generic-review-create.html");
}
export async function renderDashboardReviews(request, env) {
  return renderAdminPage(request, env, "admin/reviews.html");
}
export async function renderDashboardNews(request, env) {
  return renderAdminPage(request, env, "admin/news.html");
}
export async function renderDashboardNewsroom(request, env) {
  return renderAdminPage(request, env, "admin/newsroom.html");
}
export async function renderDashboardUpdates(request, env) {
  return renderAdminPage(request, env, "admin/updates.html");
}
export async function renderDashboardCountryPages(request, env) {
  return renderAdminPage(request, env, "admin/country-pages.html");
}
export async function renderDashboardCategoryCountries(request, env) {
  return renderAdminPage(request, env, "admin/category-countries.html");
}
export async function renderDashboardPages(request, env) {
  return renderAdminPage(request, env, "admin/pages.html");
}
export async function renderDashboardSettings(request, env) {
  return renderAdminPage(request, env, "admin/settings.html");
}
export async function renderDashboardHeaderHero(request, env) {
  return renderAdminPage(request, env, "admin/header-hero.html", {
    hh_defaults_json: jsonForScript(headerHeroDefaultsForAdmin())
  });
}
export async function renderDashboardAI(request, env) {
  return renderAdminPage(request, env, "admin/ai.html");
}

async function renderUserPage(request, env, template) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/en/login"
      }
    });
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const userNav = await renderer.loadTemplate("layout/user-nav.html");

  const html = await renderer.render(template, {
    seo_title: `${site.siteName} — Dashboard`,
    seo_description: `Manage your ${site.siteName} account`,
    email: user.email,
    role: user.role,
    user_nav: userNav
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html"
    }
  });
}

export async function renderUserDashboard(request, env) {
  return renderUserPage(request, env, "users/dashboard.html");
}
export async function renderUserSubmitCasino(request, env) {
  return renderUserPage(request, env, "users/submit-casino.html");
}
export async function renderUserInquiries(request, env) {
  return renderUserPage(request, env, "users/inquiries.html");
}
export async function renderUserProfile(request, env) {
  return renderUserPage(request, env, "users/profile.html");
}
export async function renderUserNotifications(request, env) {
  return renderUserPage(request, env, "users/notifications.html");
}


export async function renderCategoryList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, cats, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    categories.getAllCategories(env.DB),
    renderer.renderAllComponents("category_list", "category_list"),
    renderer.loadDynamicSeo("category_list", "category_list"),
  ]);

  const categoryCards = cats.map(c => `
    <div class="feature-card">
      <h3><a href="/en/category/${c.slug}">${c.name}</a></h3>
      <p>${c.description || ""}</p>
    </div>
  `).join("");
      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    category: "All Categories",
    description: "Browse casinos by category.",
    casino_cards: `<div class="features-grid">${categoryCards}</div>`,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Casino Categories — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description ||  `Browse online casinos by category on ${site.siteName}.`,
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, {}, buildBreadcrumbs("categoryList"));

  return new Response(html, { headers: cacheHeaders() });
}

// =====================================================
// PAYMENT METHODS
// /en/payment-methods            (list)
// /en/payment-methods/:slug      (detail)
// Reuses category.html's slug+description+casino_cards shape --
// same technique renderCategoryList() above already uses for a
// listing page that isn't really "a category" either.
// =====================================================

export async function renderPaymentMethodList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, methods, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    paymentMethods.getPublishedPaymentMethods(env.DB),
    renderer.renderAllComponents("payment_method_list", "payment_method_list"),
    renderer.loadDynamicSeo("payment_method_list", "payment_method_list"),
  ]);

  const methodCards = methods.map(m => `
    <a href="/en/payment-methods/${m.slug}" class="feature-card feature-card--payment-method">
      ${m.icon_url ? `<img src="${m.icon_url}" alt="${escapeHtml(m.name)}" class="payment-method-card__icon" loading="lazy" onerror="this.style.display='none'">` : ""}
      <h3>${escapeHtml(m.name)}</h3>
    </a>
  `).join("");

  const html = await renderer.render("category.html", {
    category: "Payment Methods",
    description: "Browse casinos by the deposit and withdrawal methods they support.",
    casino_cards: `<div class="features-grid">${methodCards}</div>`,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Payment Methods — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || `Browse online casinos by supported payment method on ${site.siteName}.`,
    seo_keywords: dynamicSeo.seo_keywords || "",
  }, {}, buildBreadcrumbs("paymentMethodList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderPaymentMethod(request, env, slug) {
  const method = await paymentMethods.getPaymentMethod(env.DB, slug);
  if (!method) return render404(request, env);
  if (method.published === 0) return render404(request, env);
  if (method.status === "draft") return render404(request, env);

  const renderer = new Renderer(env, request);

  const [casinoList, site, allComponents, dynamicSeo] = await Promise.all([
    paymentMethods.getCasinosForPaymentMethod(env.DB, slug),
    getSiteContext(request, env),
    renderer.renderAllComponents("payment_method", slug),
    renderer.loadDynamicSeo("payment_method", slug),
  ]);

  const geoData = await prepareGeoData(env, request, casinoList);
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);

  const paymentMethodSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Casinos That Accept ${method.name}`,
    "itemListElement": sortedCasinos.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`),
    })),
  };

  let methodContent = {};
  try {
    methodContent = typeof method.content_json === "string"
      ? JSON.parse(method.content_json)
      : method.content_json || {};
  } catch {
    methodContent = {};
  }
  const casinoLookupById = {};
  for (const c of sortedCasinos) casinoLookupById[c.id] = c;
  const sectionsHtml = renderSeoPageSections(methodContent, casinoLookupById, {}, geoData, bonusOverrides);
  const faqSchema = seoPageFaqSchema(methodContent);

  const html = await renderer.render("category.html", {
    slug,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || method.seo_title || `${method.name} Casinos`,
    seo_description: dynamicSeo.seo_description || method.seo_description || method.description || "",
    seo_keywords: dynamicSeo.seo_keywords || method.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/payment-methods/${slug}`),
    robots: "index,follow",
    sections_html: sectionsHtml,
    category: method.name,
    description: method.description || `Online casinos that accept ${method.name} for deposits and withdrawals.`,
    casino_cards: buildCasinoCards(sortedCasinos, geoData, bonusOverrides, paymentMethodsByCasino),
  }, [paymentMethodSchema, faqSchema].filter(Boolean), buildBreadcrumbs("paymentMethod", { name: method.name }));

  return new Response(html, { headers: cacheHeaders() });
}

// -----------------------------------------------------
// /en/country directory helpers — a dedicated page, not a
// reskin of category.html. See migrations/0022_country_directory_tiers.sql.
// -----------------------------------------------------

function renderFeaturedCountryCards(list) {
  return list
    .map(
      (c) => `
    <a href="/en/country/${escapeHtml(c.code)}" class="feature-card feature-card--country">
      <h3>${escapeHtml(c.name)}</h3>
    </a>`
    )
    .join("");
}

function groupCountriesByFirstLetter(list) {
  const groups = {};
  for (const c of list) {
    const letter = (c.name || "?").trim().charAt(0).toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : "#";
    groups[key] ??= [];
    groups[key].push(c);
  }
  return Object.keys(groups)
    .sort()
    .map((letter) => ({ letter, items: groups[letter] }));
}

function renderAlphabeticalCountryGroups(groups) {
  return groups
    .map(
      (group) => `
    <div class="country-directory__group" data-country-letter-group>
      <h3 class="country-directory__letter">${escapeHtml(group.letter)}</h3>
      <div class="country-chips">
        ${group.items
          .map((c) => `<a href="/en/country/${escapeHtml(c.code)}" class="chip" data-country-name="${escapeHtml(c.name.toLowerCase())}">${escapeHtml(c.name)}</a>`)
          .join("")}
      </div>
    </div>`
    )
    .join("");
}

export async function renderCountryList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, featured, allCountries, featuredLabel, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    countries.getFeaturedCountries(env.DB),
    countries.getPublishedCountries(env.DB),
    getSetting(env.DB, "country_directory_featured_label"),
    renderer.renderAllComponents("country_list", "country_list"),
    renderer.loadDynamicSeo("country_list", "country_list"),
  ]);

  const alphaGroups = groupCountriesByFirstLetter(allCountries);

  const html = await renderer.render("country-list.html", {
    featured_section_label: featuredLabel || "Featured Gambling Markets",
    featured_countries_html: renderFeaturedCountryCards(featured),
    alphabetical_countries_html: renderAlphabeticalCountryGroups(alphaGroups),
    total_country_count: String(allCountries.length),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Online Casinos by Country — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || `Find online casinos available in your country on ${site.siteName}.`,
    seo_keywords: dynamicSeo.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url("/en/country"),
    robots: dynamicSeo.seo_robots || "index,follow",
    og_image: dynamicSeo.og_image || ""
  }, {}, buildBreadcrumbs("countryList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderDashboardCategories(request, env) {
  return renderAdminPage(request, env, "admin/categories.html");
}

export async function renderDashboardPaymentMethods(request, env) {
  return renderAdminPage(request, env, "admin/payment-methods.html");
}

export async function renderDashboardCountries(request, env) {
  return renderAdminPage(request, env, "admin/countries.html");
}

export async function renderDashboardResearch(request, env) {
  return renderAdminPage(request, env, "admin/research.html");
}

export async function renderDashboardResearchReviewQueue(request, env) {
  return renderAdminPage(request, env, "admin/research-review-queue.html");
}

export async function renderDashboardResearchDatasets(request, env) {
  return renderAdminPage(request, env, "admin/research-datasets.html");
}

export async function renderDashboardCasinoEdit(request, env, slug) {
  return renderAdminPage(request, env, "admin/casino-edit.html", { slug });
}


export async function renderDashboardComponents(request, env) {
  return renderAdminPage(request, env, "admin/components.html");
}

export async function renderDashboardSeo(request, env) {
  return renderAdminPage(request, env, "admin/seo.html");
}






// ==================================
// AUTHOR PROFILE PAGE
// ==================================


export async function renderAuthor(request, env, slug) {
  const author = await authors.getAuthor(env.DB, slug);
  if (!author) return render404(request, env);
  // The author list hides unpublished authors; their direct URL must not expose the profile either.
  if (Number(author.published) === 0) return render404(request, env);

  const renderer = new Renderer(env, request);

  // Independent of each other — fetch concurrently.
  const [site, content, stats, allComponents, dynamicSeo, nrFlags] = await Promise.all([
    getSiteContext(request, env),
    authors.getAuthorContent(env.DB, author.id),
    authors.getAuthorStats(env.DB, author.id),
    renderer.renderAllComponents("author", slug),
    renderer.loadDynamicSeo("author", slug),
    newsroom.getNewsFlags(env.DB).catch(() => ({})),
  ]);

  // Build review cards
  // NEW: fetch casino logo/name for review cards
  const authorCasinoSlugs = [...new Set(content.reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];
  let authorCasinoMeta = {};
  if (authorCasinoSlugs.length > 0) {
    const metaPlaceholders = authorCasinoSlugs.map(() => '?').join(',');
    const casinoRows = await env.DB.prepare(`
      SELECT slug, name, logo FROM casinos WHERE slug IN (${metaPlaceholders})
    `).bind(...authorCasinoSlugs).all();
    for (const row of (casinoRows.results || [])) {
      authorCasinoMeta[row.slug] = row;
    }
  }

  // Build review cards
  const reviewCards = content.reviews.map(r => {
    const casino = r.casino_slug ? authorCasinoMeta[r.casino_slug] : null;
    const casinoImage = escapeHtml(casino?.logo || '/static/images/default.png');
    const casinoImageAlt = escapeHtml(casino?.name || r.title);

    return `
    <div class="casino-card">
      <div class="casino-card__image">
        <img src="${casinoImage}" alt="${casinoImageAlt}" loading="lazy" onerror="this.src='/static/images/default.png'">
      </div>
      <div class="casino-card__body">
        <h3><a href="/en/review/${encodeURIComponent(r.slug)}">${escapeHtml(r.title)}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">Updated: ${new Date(r.updated_at).toLocaleDateString()}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${encodeURIComponent(r.slug)}" class="btn btn--primary">Read Review</a>
      </div>
    </div>
  `;
  }).join("");

  // Build news cards
  const newsCards = content.news.map(n => {
    const image = n.featured_image_url || n.featured_image_thumbnail || "";
    const imageHtml = image
      ? `<div style="aspect-ratio:16/9;overflow:hidden"><img src="${escapeHtml(image)}" alt="${escapeHtml(safeAlt(n.featured_image_alt, n.title))}" style="width:100%;height:100%;object-fit:cover" loading="lazy" decoding="async"></div>`
      : `<div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gray);font-size:13px">No image</div>`;

    return `
    <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:12px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s">
      <a href="/en/news/${encodeURIComponent(n.slug)}" style="display:block;color:inherit;text-decoration:none">
        ${imageHtml}
        <div style="padding:20px">
          <h3 style="margin:0 0 8px;font-size:18px;line-height:1.3;color:var(--dark)">${escapeHtml(n.title)}</h3>
          ${n.excerpt ? `<p style="margin:0 0 10px;color:var(--gray);font-size:14px;line-height:1.6">${escapeHtml(n.excerpt)}</p>` : ""}
          <p class="muted" style="margin:0">${new Date(n.created_at).toLocaleDateString()}</p>
        </div>
      </a>
    </article>
  `;
  }).join("");


  // Build page list
  const pageList = content.pages.map(p => `
    <li><a href="/en/${p.slug}">${escapeHtml(p.title)}</a> <span class="muted">— ${new Date(p.created_at).toLocaleDateString()}</span></li>
  `).join("");

  const nrTax = !!nrFlags.news_new_taxonomy;
  const authorCanonical = dynamicSeo.canonical || site.url(`/en/author/${slug}`);
  const authorSchema = nrTax
    ? nrRender.authorPersonSchema({ author, canonical: authorCanonical, siteName: site.siteName || site.hostname, origin: site.origin, articleCount: stats.news })
    : {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": author.name,
        "description": author.bio || "",
        "image": author.avatar_url || "",
        "jobTitle": author.role || "Editor"
      };

  const html = await renderer.render("author.html", {
    ...author,
    // {{vars}} are not escaped by the template engine; these come from an editable profile.
    author_name: escapeHtml(author.name),
    author_bio: escapeHtml(author.bio || ""),
    author_avatar: escapeHtml(author.avatar_url || site.logoUrl),
    author_role: escapeHtml((nrTax && author.job_title) || author.role || "Editor"),
    author_social: sanitizeHtml(author.social_links || ""),
    author_facts_html: nrTax
      ? `<link rel="stylesheet" href="/static/css/newsroom.css">${nrRender.renderAuthorFacts(author, stats.news)}`
      : "",
    review_cards: reviewCards,
    news_cards: newsCards || '<p class="muted">No articles yet.</p>',
    page_list: pageList || '<li class="muted">No pages yet.</li>',
    review_count: stats.reviews,
    news_count: stats.news,
    page_count: stats.pages,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,                                                                                                              components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || author.name + " — " + site.siteName,
    seo_description: dynamicSeo.seo_description || author.bio || author.name + " is a " + (author.role || "editor") + " at " + site.siteName ,
    og_image: author.avatar_url ? site.url(author.avatar_url) : site.ogImageUrl,
    og_image_alt: author.name,
    canonical: authorCanonical
  }, authorSchema, buildBreadcrumbs("author", {author_name: author.name }));
  return new Response(html, { headers: cacheHeaders() });
}

export async function renderAuthorbackup(request, env, slug) {
  const author = await authors.getAuthor(env.DB, slug);
  if (!author) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const content = await authors.getAuthorContent(env.DB, author.id);
  const stats = await authors.getAuthorStats(env.DB, author.id);
  const allComponents = await renderer.renderAllComponents("author", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("author", slug);

  // Build review cards
  const reviewCards = content.reviews.map(r => `
    <div class="casino-card">
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">Updated: ${new Date(r.updated_at).toLocaleDateString()}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--primary">Read Review</a>
      </div>
    </div>
  `).join("");

  // Build news cards
  const newsCards = content.news.map(n => `
    <a href="/en/news/${n.slug}" class="news-card">
      <h3>${n.title}</h3>
      <p class="muted">${new Date(n.created_at).toLocaleDateString()}</p>
    </a>
  `).join("");

  // Build page list
  const pageList = content.pages.map(p => `
    <li><a href="/en/${p.slug}">${p.title}</a> <span class="muted">— ${new Date(p.created_at).toLocaleDateString()}</span></li>
  `).join("");

  const authorSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": author.name,
    "description": author.bio || "",
    "image": author.avatar_url || "",
    "jobTitle": author.role || "Editor"
  };

  const html = await renderer.render("author.html", {
    ...author,
    author_name: author.name,
    author_bio: author.bio || "",
    author_avatar: author.avatar_url || site.logoUrl,
    author_role: author.role || "Editor",
    author_social: author.social_links || "",
    review_cards: reviewCards,
    news_cards: newsCards || '<p class="muted">No articles yet.</p>',
    page_list: pageList || '<li class="muted">No pages yet.</li>',
    review_count: stats.reviews,
    news_count: stats.news,
    page_count: stats.pages,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || author.name + " — " + site.siteName,
    seo_description: dynamicSeo.seo_description || author.bio || author.name + " is a " + (author.role || "editor") + " at " + site.siteName ,
    canonical: dynamicSeo.canonical || site.url(`/en/author/${slug}`)
  }, authorSchema, buildBreadcrumbs("author", {author_name: author.name }));
  return new Response(html, { headers: cacheHeaders() });
}


// =====================================================
// AUTHORS LIST
// /en/author
// =====================================================

export async function renderAuthorList(request, env) {
  const renderer = new Renderer(env, request);

  const [authorsList, allComponents, dynamicSeo] = await Promise.all([
    authors.getAllAuthors(env.DB),
    renderer.renderAllComponents("author_list", "author_list"),
    renderer.loadDynamicSeo("author_list", "author_list"),
  ]);

  const authorCards = (authorsList || []).map((author) => {
    const avatar = author.avatar_url
      ? `
        <img
          src="${author.avatar_url}"
          alt="${author.name}"
          class="author-card__avatar"
          loading="lazy"
        >
      `
      : "";

    const bio = author.bio
      ? author.bio.substring(0, 180)
      : "";

    return `
      <article class="author-card">

        <div class="author-card__media">
          ${avatar}
        </div>

        <div class="author-card__body">

          <h2>
            <a href="/en/author/${author.slug}">
              ${author.name}
            </a>
          </h2>

          ${
            author.role
              ? `<div class="author-card__role">${author.role}</div>`
              : ""
          }

          ${
            bio
              ? `
                <p>
                  ${bio}${author.bio.length > 180 ? "..." : ""}
                </p>
              `
              : ""
          }

          <a
            href="/en/author/${author.slug}"
            class="btn btn--primary"
          >
            View Profile
          </a>

        </div>

      </article>
    `;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name":
      dynamicSeo?.seo_title ||
      "Authors",
    "description":
      dynamicSeo?.seo_description ||
      "Meet the authors and editorial team behind our content.",
    "url": new URL(request.url).origin + "/en/author",
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": (authorsList || []).map(
        (author, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "name": author.name,
          "url":
            new URL(request.url).origin +
            `/en/author/${author.slug}`
        })
      )
    }
  };

  const html = await renderer.render(
    "author_list.html",
    {
      canonical:
        dynamicSeo?.canonical ||
        "/en/author",

      category: "Authors",

      description:
        dynamicSeo?.seo_description ||
        "Meet the authors and editorial team behind our content.",

      author_cards:
        authorCards ||
        '<p class="muted">No authors available.</p>',

      author_count:
        authorsList?.length || 0,

      components_top:
        allComponents?.top || "",

      components_content_top:
        allComponents?.content_top || "",

      components_content_bottom:
        allComponents?.content_bottom || "",

      components_bottom:
        allComponents?.bottom || "",

      components_sidebar:
        allComponents?.sidebar || "",

      seo_title:
        dynamicSeo?.seo_title ||
        "Authors",

      seo_description:
        dynamicSeo?.seo_description ||
        "Meet the authors and editorial team behind our content."
    },
    listSchema,
    buildBreadcrumbs("authorList")
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}

// ==================================
// ADMIN: AUTHORS
// ==================================

export async function renderDashboardAuthors(request, env) {
  return renderAdminPage(request, env, "admin/authors.html");
}


export async function renderDashboardMedia(request, env) {
  return renderAdminPage(request, env, "admin/media.html");
}

export async function renderDashboardNav(request, env) {
  return renderAdminPage(request, env, "admin/nav.html");
}

export async function renderDashboardPermissions(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/permissions.html");
}

export async function renderDashboardItemAccess(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/item-access.html");
}

//export async function renderDashboardPermissions(request, env) {
//  return renderAdminPage(request, env, "admin/permissions.html");
//}
//export async function renderDashboardItemAccess(request, env) {
//  return renderAdminPage(request, env, "admin/item-access.html");
//}
export async function renderUserBookmarks(request, env) {
  return renderUserPage(request, env, "users/bookmarks.html");
}


export async function renderDashboardUsers(request, env) {
  return renderAdminPage(request, env, "admin/users.html");
}

export async function renderDashboardSubscriptions(request, env) {
  return renderAdminPage(request, env, "admin/subscriptions.html");
}

export async function renderDashboardEmails(request, env) {
  return renderAdminPage(request, env, "admin/emails.html");
}

export async function renderDashboardInquiries(request, env) {
  return renderAdminPage(request, env, "admin/inquiries.html");
}

export async function renderDashboardSubmissions(request, env) {
  return renderAdminPage(request, env, "admin/submissions.html");
}

export async function renderDashboardNotifications(request, env) {
  return renderAdminPage(request, env, "admin/notifications.html");
}

export async function renderDashboardBanners(request, env) {
  return renderAdminPage(request, env, "admin/banners.html");
}

export async function renderDashboardAffiliatePartners(request, env) {
  return renderAdminPage(request, env, "admin/affiliate-partners.html");
}

export async function renderDashboardAffiliatePrograms(request, env) {
  return renderAdminPage(request, env, "admin/affiliate-programs.html");
}

export async function renderDashboardAffiliateAccounts(request, env) {
  return renderAdminPage(request, env, "admin/affiliate-accounts.html");
}

export async function renderDashboardCommercialTerms(request, env) {
  return renderAdminPage(request, env, "admin/commercial-terms.html");
}

export async function renderDashboardPostbackConfigs(request, env) {
  return renderAdminPage(request, env, "admin/postback-configs.html");
}

export async function renderDashboardImportHistory(request, env) {
  return renderAdminPage(request, env, "admin/import-history.html");
}

export async function renderDashboardProviderAdapters(request, env) {
  return renderAdminPage(request, env, "admin/provider-adapters.html");
}

export async function renderDashboardOffers(request, env) {
  return renderAdminPage(request, env, "admin/offers.html");
}

export async function renderDashboardTrackingLinks(request, env) {
  return renderAdminPage(request, env, "admin/tracking-links.html");
}

export async function renderDashboardAnalytics(request, env) {
  return renderAdminPage(request, env, "admin/analytics.html");
}

export async function renderDashboardCampaigns(request, env) {
  return renderAdminPage(request, env, "admin/campaigns.html");
}

export async function renderDashboardReports(request, env) {
  return renderAdminPage(request, env, "admin/reports.html");
}

export async function renderSitemapPage(request, env) {
  const renderer = new Renderer(env, request);

  const site = await getSiteContext(
    request,
    env
  );

  const sitemapSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${site.siteName} Sitemap`,
    "description":
      "Explore casino reviews, rankings, guides and industry news."
  };

  const html = await renderer.render(
    "sitemap.html",
    {
      seo_title: `${site.siteName} Sitemap`,
      seo_description:
        "Explore casino reviews, rankings, guides and industry news.",
      title: `${site.siteName} Sitemap`
    },
    sitemapSchema,
    buildBreadcrumbs("page", {
      title: "Sitemap"
    })
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}
