// Sportsbook and custom content type list and item pages.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as contentItems from "../database/content-items.js";
import * as customTypes from "../database/custom-types.js";
import { renderCustomFieldsHtml } from "../custom-field-render.js";
import { geoEngine } from "../geo.js";
import { logEvent as logAnalyticsEvent } from "../database/analytics.js";
import { getCached, setCached } from "../cache.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildContentItemCards, buildContentItemGeoStatusHtml, buildItemReviewsHtml, cacheHeaders, escapeHtml, prepareContentGeoData } from "./shared.js";
import { render404 } from "./system-pages.js";

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
