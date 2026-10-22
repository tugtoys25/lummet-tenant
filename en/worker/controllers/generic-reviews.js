// Generic review page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as authors from "../database/authors.js";
import * as customTypes from "../database/custom-types.js";
import * as reviewCriteria from "../database/review-criteria.js";
import { getReviewBlocks as getReviewBlocksForSlug } from "../database/review_blocks.js";
import { resolveContentItemById } from "../content-resolver.js";
import * as reviews from "../database/reviews.js";
import { toRichHtml, renderSections, faqSchemaScript, buildReviewNav, renderSectionNav } from "../generic-review-sections.js";
import { loadReviewStyleSettings, buildReviewStyle } from "../review-style.js";
import { logEvent as logAnalyticsEvent } from "../database/analytics.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { cacheHeaders, escapeHtml, escapeReviewText } from "./shared.js";
import { render404 } from "./system-pages.js";

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

  let sectionsOut = { html: "", nav: [], faq: [] };
  try { sectionsOut = await renderSections(env.DB, await getReviewBlocksForSlug(env.DB, review.slug)); } catch (err) { console.error("review sections failed:", err); }

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

  // Summary card (same look as casino reviews): rating, then the facts that exist.
  const gsRating = Math.max(0, Math.min(5, Number(displayRating) || 0));
  const gsUpdated = (review.updated_at || review.created_at) ? new Date(review.updated_at || review.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
  const gsFacts = [
    reviewedItem?.name ? [expectedReviewedContentType === "custom" ? "Product" : "Item", escapeHtml(reviewedItem.name)] : null,
    author?.name ? ["Reviewed by", escapeHtml(author.name)] : null,
    gsUpdated ? ["Updated", escapeHtml(gsUpdated)] : null,
  ].filter(Boolean).map((f) => `<div class="rs-fact"><dt>${f[0]}</dt><dd>${f[1]}</dd></div>`).join("");
  const gsRatingBlock = gsRating > 0 ? `<div class="rs-rating" aria-label="Rating ${gsRating.toFixed(1)} out of 5"><span class="rs-stars" style="--r:${gsRating}" aria-hidden="true">★★★★★</span><strong>${gsRating.toFixed(1)}</strong><span>/ 5</span></div>` : "";
  const summaryCardHtml = (gsFacts || gsRatingBlock) ? `<div class="rs-top">${gsRatingBlock}${gsFacts ? `<dl class="rs-facts">${gsFacts}</dl>` : ""}</div>` : "";

  const reviewStyleHtml = buildReviewStyle(await loadReviewStyleSettings(env.DB));
  const html = await renderer.render("generic-review.html", {
    review_style_html: reviewStyleHtml,
    title: escapeHtml(review.title),
    content: toRichHtml(review.content || ""),
    sections_html: sectionsOut.html,
    faq_schema_html: faqSchemaScript(sectionsOut.faq),
    review_nav_html: renderSectionNav(buildReviewNav({
      hasScoring: !!buildCriteriaScoresHtml(breakdown), sections: sectionsOut.nav,
      hasVerdict: !!review.verdict, hasProsCons: true
    }), "Sections of this review"),
    verdict: review.verdict || "",
    reviewed_at: review.created_at ? new Date(review.created_at).toLocaleDateString() : "",
    updated_at: review.updated_at ? new Date(review.updated_at).toLocaleDateString() : "",
    rating_display: ratingDisplay,
    summary_card_html: summaryCardHtml,
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
