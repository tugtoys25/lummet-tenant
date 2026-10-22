// Casino cards, geo status and bonus display used by casino, review, country and category pages.
// Part of worker/controllers.js, which re-exports everything from here.
import * as paymentMethods from "../database/payment-methods.js";
import { geoEngine } from "../geo.js";
import { resolveOfferForCasino, resolveOffersForCasinos } from "../offers/selection.js";
import { countryFullName, countryToFlag, escapeHtml } from "./shared.js";

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
export async function resolveBonusDisplay(env, casino, countryCode) {
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
export async function resolveBonusOverridesForList(env, casinoList, countryCode) {
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
export async function resolvePaymentMethodsForList(env, casinoList) {
  try {
    const ids = casinoList.map((c) => c.id).filter((id) => id != null);
    return await paymentMethods.getPaymentMethodsForCasinos(env.DB, ids);
  } catch (err) {
    console.error("Payment method lookup failed, cards will render without payment icons:", err.message);
    return {};
  }
}

export async function prepareGeoData(env, request, casinoList) {
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

export async function evaluateCasinoGeo(env, casinoSlug, countryCode) {
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

export function sortCasinosByGeo(casinoList, geoData) {
  if (!geoData) return casinoList;
  const allowed = casinoList.filter(c => geoData.statuses[c.slug] !== "blocked" && geoData.statuses[c.slug] !== "restricted");
  const blocked = casinoList.filter(c => geoData.statuses[c.slug] === "blocked" || geoData.statuses[c.slug] === "restricted");
  allowed.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  blocked.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return [...allowed, ...blocked];
}

export function buildCasinoCards(casinoList, geoData = null, bonusOverrides = {}, paymentMethodsByCasino = {}) {
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

export function buildReviewCasinoCards(casinoList, geoData = null, bonusOverrides = {}) {
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
