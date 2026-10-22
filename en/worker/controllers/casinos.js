// Casino page and casino list.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as casinos from "../database/casinos.js";
import { getGeoRule } from "../database/geo.js";
import { geoEngine } from "../geo.js";
import { logEvent as logAnalyticsEvent } from "../database/analytics.js";
import { getRelatedCasinos } from "../database/related-casinos.js";
import { getCached, setCached } from "../cache.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildCasinoCards, prepareGeoData, resolveBonusDisplay, resolveBonusOverridesForList, resolvePaymentMethodsForList, sortCasinosByGeo } from "./casino-cards.js";
import { cacheHeaders, createTimer, escapeHtml } from "./shared.js";
import { render404 } from "./system-pages.js";

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
