// =====================================================
// TENANT ROUTES: public
// Home, listing pages, casino, sportsbook, affiliate partner, content landing pages, tracked content links, custom types, generic reviews and comparisons.
// Part of getRoute (worker/routes.js): the statements below are the
// original ones in the original order. Returns the route object, or null
// when none of them matches so the next group is tried.
// =====================================================

export function routePublic(path) {

  // =====================================================
  // HOME
  // =====================================================

  if (path === "/en" || path === "/en/home") {
    return {
      type: "home"
    };
  }

    // LISTING PAGES
  if (path === "/en/search") return { type: "siteSearch" };
  if (path === "/en/casino") return { type: "casinoList" };
  if (path === "/en/sportsbook") return { type: "sportsbookList" };
  if (path === "/en/affiliate-partner") return { type: "affiliatePartnerList" };
  if (path === "/en/review") return { type: "reviewList" };
  if (path === "/en/news") return { type: "newsList" };
  if (path === "/en/updates") return { type: "updatesList" };
  if (path === "/en/author") return { type: "authorList" };

  // =====================================================
  // CASINO
  // /en/casino/bcgame
  // =====================================================

  const casinoMatch =
    path.match(/^\/en\/casino\/([^/]+)$/);

  if (casinoMatch) {
    return {
      type: "casino",
      slug: casinoMatch[1]
    };
  }

  // =====================================================
  // SPORTSBOOK (Phase 3 — generic content engine)
  // /en/sportsbook/bet365
  // Registered here, well before the FALLBACK DYNAMIC PAGE ENGINE
  // catch-all further down, per the Phase 1/2 routing design — a
  // new top-level prefix placed after the catch-all would be
  // silently swallowed by the dynamic `pages` route instead of
  // reaching this match.
  // =====================================================

  const sportsbookMatch =
    path.match(/^\/en\/sportsbook\/([^/]+)$/);

  if (sportsbookMatch) {
    return {
      type: "sportsbook",
      slug: sportsbookMatch[1]
    };
  }

  // =====================================================
  // AFFILIATE PARTNER (Phase 4 — generic content engine)
  // /en/affiliate-partner/network-x
  //
  // Deliberately NOT /en/affiliate/{slug} -- that prefix already
  // belongs to the existing affiliate marketing landing page (see
  // the CASINO/marketing "affiliate" case in index.js, backed by the
  // `pages` table). This is a separate namespace by design, per the
  // explicit correction earlier in this project: preserve
  // /en/affiliate/{slug} exactly, new editorial affiliate-partner
  // content lives under /en/affiliate-partner/... instead.
  // =====================================================

  // =====================================================
  // CONTENT LANDING PAGES ("SEO landing pages for generic types")
  // /en/best/top-sportsbooks-2026 -- slug is globally unique
  // (content_landing_pages.slug UNIQUE, migration 0061), so no
  // content_type segment is needed in the URL, unlike
  // /en/sportsbook|affiliate-partner|custom above.
  // =====================================================

  const contentLandingPageMatch =
    path.match(/^\/en\/best\/([^/]+)$/);

  if (contentLandingPageMatch) {
    return {
      type: "contentLandingPage",
      slug: contentLandingPageMatch[1]
    };
  }

  // =====================================================
  // TRACKED CONTENT LINK ("sportsbook tracking/affiliate URL")
  // /en/go-content/sportsbook/bet365 -- logs a CONTENT_CLICK event
  // (content_item_id, migration 0059) then 302s to content_items.tracking_url.
  // Deliberately separate from casino's /en/go/{slug} + tracking_links/
  // click_id/postback pipeline (worker/index.js's "go" case) -- that
  // pipeline is the protected commercial-affiliate attribution system;
  // this is a lighter-weight tracked outbound link for editorial
  // sportsbook/affiliate-partner/custom content, not a new entry point
  // into commercial-partner revenue attribution.
  // =====================================================

  const goContentMatch =
    path.match(/^\/en\/go-content\/([^/]+)\/([^/]+)$/);

  if (goContentMatch) {
    return {
      type: "goContent",
      contentType: goContentMatch[1],
      slug: goContentMatch[2]
    };
  }

  const affiliatePartnerMatch =
    path.match(/^\/en\/affiliate-partner\/([^/]+)$/);

  if (affiliatePartnerMatch) {
    return {
      type: "affiliatePartner",
      slug: affiliatePartnerMatch[1]
    };
  }

  // =====================================================
  // CUSTOM CONTENT TYPES (Phase 5 — generic content engine)
  // /en/custom/payment-provider           (listing for that type)
  // /en/custom/payment-provider/stripe    (detail)
  //
  // typeSlug is admin-defined data (custom_content_types.slug), not a
  // fixed prefix -- validity (does this type actually exist, is it
  // enabled) is checked in the controller (renderCustom/
  // renderCustomList), not here. This match only needs to claim the
  // /en/custom/... path space before the catch-all does, which
  // otherwise matches /en/(.+) -- i.e. it WOULD swallow
  // /en/custom/anything/anything today if this weren't registered
  // first.
  // =====================================================

  const customDetailMatch =
    path.match(/^\/en\/custom\/([^/]+)\/([^/]+)$/);

  if (customDetailMatch) {
    return {
      type: "custom",
      typeSlug: customDetailMatch[1],
      slug: customDetailMatch[2]
    };
  }

  const customListMatch =
    path.match(/^\/en\/custom\/([^/]+)$/);

  if (customListMatch) {
    return {
      type: "customList",
      typeSlug: customListMatch[1]
    };
  }

  // =====================================================
  // GENERIC REVIEWS (Phase 6 — generic content engine)
  // /en/sportsbook/review/bet365-sport
  // /en/affiliate-partner/review/networkx
  // /en/custom/payment-provider/review/stripe
  //
  // The existing /en/review/{slug} (casino reviews) is untouched --
  // see the REVIEW block further down. These are separate, new
  // prefixes, registered before the catch-all like everything else
  // in this project.
  // =====================================================

  const sportsbookReviewMatch =
    path.match(/^\/en\/sportsbook\/review\/([^/]+)$/);
  if (sportsbookReviewMatch) {
    return { type: "sportsbookReview", slug: sportsbookReviewMatch[1] };
  }

  const affiliatePartnerReviewMatch =
    path.match(/^\/en\/affiliate-partner\/review\/([^/]+)$/);
  if (affiliatePartnerReviewMatch) {
    return { type: "affiliatePartnerReview", slug: affiliatePartnerReviewMatch[1] };
  }

  const customReviewMatch =
    path.match(/^\/en\/custom\/([^/]+)\/review\/([^/]+)$/);
  if (customReviewMatch) {
    return { type: "customReview", typeSlug: customReviewMatch[1], slug: customReviewMatch[2] };
  }

  // =====================================================
  // COMPARISON ENGINE (Phase 7 — generic content engine)
  // /en/compare/casino/bet365-vs-casino-x
  // /en/compare/sportsbook
  // "compare" is in RESERVED_SLUGS, and {type} here is a fixed,
  // known set of content types (casino/sportsbook/affiliate_partner/
  // custom), not admin-defined data -- so, unlike /en/custom/{typeSlug},
  // there's no need to validate {type} against a DB table here; the
  // controller 404s for an unrecognized/disabled type.
  // =====================================================

  const comparisonDetailMatch =
    path.match(/^\/en\/compare\/([^/]+)\/([^/]+)$/);
  if (comparisonDetailMatch) {
    return { type: "comparison", compareType: comparisonDetailMatch[1], slug: comparisonDetailMatch[2] };
  }

  const comparisonListMatch =
    path.match(/^\/en\/compare\/([^/]+)$/);
  if (comparisonListMatch) {
    return { type: "comparisonList", compareType: comparisonListMatch[1] };
  }

  return null;
}
