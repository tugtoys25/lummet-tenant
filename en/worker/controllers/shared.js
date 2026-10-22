// Small helpers shared by the page controllers (escaping, dates, country names, timing).
// Part of worker/controllers.js, which re-exports everything from here.
import * as contentItems from "../database/content-items.js";
import * as genericReviewsDb from "../database/generic-reviews.js";
import { geoEngine } from "../geo.js";

export function cacheHeaders() {
  return {
    "Content-Type": "text/html",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
  };
}

export function formatDate(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function stripHtml(text = "") {
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(text = "", max = 160) {
  const clean = stripHtml(text);

  if (clean.length <= max) {
    return clean;
  }

  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// Guards against meaningless ALT text (empty, or a bare database/media
// ID such as "5782" or "1000044672") slipping into rendered <img alt>
// attributes. Falls back to the given title/description instead.
export function safeAlt(altText, fallback = "") {
  const trimmed = String(altText || "").trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return fallback;
  return trimmed;
}

export function toIsoDate(value) {
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

export function countryFullName(code) {
  return COUNTRY_NAMES[code] || code;
}

// ── TEMPORARY DIAGNOSTIC — remove once the slow-page investigation
// is done. createTimer() returns a per-request `timed()` wrapper
// that both console.logs AND collects entries into `log`, so the
// breakdown can be returned as response headers (visible directly
// in `curl -D -`, no dashboard or CLI needed) as well as showing up
// in any log stream that happens to be open.
export function createTimer() {
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

export function countryToFlag(code) {
  if (!code || code.length !== 2) return "🏳";
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
}

export function parseContentJson(contentJson) {
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
export async function prepareContentGeoData(env, request, contentType, itemList) {
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

export function buildContentItemCards(itemList, contentType, linkPrefix, geoData = null) {
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
  if (!geoData.statuses || geoData.statuses[itemId] === undefined) return ""; // no country rules: nothing to say
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
export function buildContentItemGeoStatusHtml(geoData, itemId) {
  if (!geoData) return "";
  const geoStatus = geoData.statuses[itemId] || "unknown";
  const flag = countryToFlag(geoData.country);
  const geoLabel = geoStatus === "allowed" ? "Available" : geoStatus === "blocked" ? "Not Available" : "Unknown";
  return `<div class="casino-card__geo-status geo-${geoStatus}">${flag} ${geoLabel} for players from ${countryFullName(geoData.country)}</div>`;
}

// Reuses the same escaping discipline as custom-field-render.js --
// pros/cons entries are plain text, never raw HTML, regardless of
// what an editor typed into the JSON array.
export function escapeReviewText(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function reviewUrlForItem(item, reviewSlug) {
  if (item.content_type === "custom") return `/en/custom/${item.custom_type_slug}/review/${reviewSlug}`;
  if (item.content_type === "affiliate_partner") return `/en/affiliate-partner/review/${reviewSlug}`;
  return `/en/sportsbook/review/${reviewSlug}`;
}

export async function buildItemReviewsHtml(db, item) {
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
