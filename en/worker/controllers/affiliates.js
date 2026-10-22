// Affiliate partner pages and affiliate redirect page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as contentItems from "../database/content-items.js";
import { resolveAffiliateLink } from "../content-resolver.js";
import * as pages from "../database/pages.js";
import { geoEngine } from "../geo.js";
import { logEvent as logAnalyticsEvent } from "../database/analytics.js";
import { getCached, setCached } from "../cache.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildContentItemCards, buildContentItemGeoStatusHtml, buildItemReviewsHtml, cacheHeaders, escapeHtml, parseContentJson, prepareContentGeoData } from "./shared.js";
import { render404 } from "./system-pages.js";

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
