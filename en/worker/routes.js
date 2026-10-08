// =====================================================
// TENANT ROUTER
// Equivalent to Django urls.py
// =====================================================

export function getRoute(request) {

  const url = new URL(request.url);

  let path = url.pathname;

  // remove trailing slash except root
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  // Add right after: if (path.length > 1 && path.endsWith("/")) { path = path.slice(0, -1); }
  if (path === "/" || path === "") {
      return { type: "redirect", target: "/en" };
  }

  // =====================================================
  // HOME
  // =====================================================

  if (path === "/en" || path === "/en/home") {
    return {
      type: "home"
    };
  }

    // LISTING PAGES
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

  // =====================================================
  // REVIEW
  // /en/review/bcgame
  // =====================================================

  const reviewMatch =
    path.match(/^\/en\/review\/([^/]+)$/);

  if (reviewMatch) {
    return {
      type: "review",
      slug: reviewMatch[1]
    };
  }

  // =====================================================
  // NEWS
  // /en/news/new-license
  // =====================================================

  // Newsroom landing pages: /en/news/{topic|entity|series}/<slug>
  const newsTaxMatch = path.match(/^\/en\/news\/(topic|entity|series)\/([^/]+)$/);
  if (newsTaxMatch) {
    return { type: "newsTaxonomy", kind: newsTaxMatch[1], slug: newsTaxMatch[2] };
  }

  const newsMatch =
    path.match(/^\/en\/news\/([^/]+)$/);

  if (newsMatch) {
    return {
      type: "news",
      slug: newsMatch[1]
    };
  }

  // =====================================================
// PLATFORM UPDATE
// /en/updates/new-lummet-ai-feature
// =====================================================

  const updateMatch =
    path.match(/^\/en\/updates\/([^/]+)$/);

  if (updateMatch) {
    return {
      type: "update",
      slug: updateMatch[1]
    };
  }

  // =====================================================
  // COUNTRY
  // /en/country/rwanda
  // =====================================================

  const countryMatch =
    path.match(/^\/en\/country\/([^\/]+)$/);

  if (countryMatch) {
    return {
      type: "country",
      slug: countryMatch[1]
    };
  }

  // =====================================================
  // COUNTRY CUSTOM SEO LANDING PAGE
  // /en/country/ca/best-easy-to-use-casinos
  // Custom editor-typed slug under a country hub — NOT required to
  // be an existing category. Backed by seo_pages (page_type =
  // 'country_custom'). Must be checked before falling through to
  // the generic dynamic-page route.
  // =====================================================

  const countryCustomMatch =
    path.match(/^\/en\/country\/([^\/]+)\/([^\/]+)$/);

  if (countryCustomMatch) {
    return {
      type: "countryCustomPage",
      countryCode: countryCustomMatch[1],
      slug: countryCustomMatch[2]
    };
  }

  // =====================================================
  // CATEGORY
  // /en/category/crypto
  // =====================================================

  const categoryMatch =
    path.match(/^\/en\/category\/([^\/]+)$/);

  if (categoryMatch) {
    return {
      type: "category",
      slug: categoryMatch[1]
    };
  }

  // =====================================================
  // PAYMENT METHODS
  // /en/payment-methods            (list)
  // /en/payment-methods/visa       (detail)
  // =====================================================

  if (path === "/en/payment-methods") {
    return { type: "paymentMethodList" };
  }

  // =====================================================
  // RESEARCH ENGINE (Phase 1)
  // /en/research                        (hub)
  // /en/research/country                (type list)
  // /en/research/country/netherlands    (item)
  // Data-first: type + slug determine the route, never an
  // admin-typed URL. Must be matched before the generic dynamic
  // page catch-all.
  // =====================================================

  if (path === "/en/research") {
    return { type: "researchHub" };
  }

  const researchTypeListMatch =
    path.match(/^\/en\/research\/([^\/]+)$/);

  if (researchTypeListMatch) {
    return {
      type: "researchTypeList",
      researchType: researchTypeListMatch[1]
    };
  }

  const researchItemMatch =
    path.match(/^\/en\/research\/([^\/]+)\/([^\/]+)$/);

  if (researchItemMatch) {
    return {
      type: "researchItem",
      researchType: researchItemMatch[1],
      slug: researchItemMatch[2]
    };
  }

  const paymentMethodMatch =
    path.match(/^\/en\/payment-methods\/([^\/]+)$/);

  if (paymentMethodMatch) {
    return {
      type: "paymentMethod",
      slug: paymentMethodMatch[1]
    };
  }

  // =====================================================
  // CATEGORY x COUNTRY SEO LANDING PAGE
  // /en/category/crypto-casinos/ca
  // Category MUST come from the existing category database (unlike
  // country_custom above, this is never an arbitrary slug) — the
  // controller validates the category exists and is eligible before
  // rendering. Backed by seo_pages (page_type = 'category_country').
  // =====================================================

  const categoryCountryMatch =
    path.match(/^\/en\/category\/([^\/]+)\/([^\/]+)$/);

  if (categoryCountryMatch) {
    return {
      type: "categoryCountryPage",
      categorySlug: categoryCountryMatch[1],
      countryCode: categoryCountryMatch[2]
    };
  }

    // =====================================================
  // AUTHOR PROFILE
  // /en/author/elie-bizimana
  // =====================================================

  const authorMatch = path.match(/^\/en\/author\/([^\/]+)$/);
  if (authorMatch) {
    return { type: "author", slug: authorMatch[1] };
  }

  // =====================================================
  // AFFILIATE LANDING PAGE
  // /en/affiliate/become-affiliate
  // =====================================================

  const affiliateMatch =
    path.match(/^\/en\/affiliate\/([^\/]+)$/);

  if (affiliateMatch) {
    return {
      type: "affiliate",
      slug: affiliateMatch[1]
    };
  }

  // =====================================================
  // GO TRACKING
  // /en/go/bcgame
  // =====================================================

  const goMatch =
    path.match(/^\/en\/go\/([^\/]+)$/);

  if (goMatch) {
    return {
      type: "go",
      slug: goMatch[1]
    };
  }

  // =====================================================
  // DASHBOARD
  // =====================================================
  if (path === "/en/dashboard") return { type: "dashboard" };
  if (path === "/en/dashboard/casinos") return { type: "dashboardCasinos" };
  if (path === "/en/dashboard/casino/create") return { type: "dashboardCasinoCreate" };
  if (path === "/en/dashboard/content-items") return { type: "dashboardContentItems" };
  if (path === "/en/dashboard/content-item/create") return { type: "dashboardContentItemCreate" };
  if (path === "/en/dashboard/custom-types") return { type: "dashboardCustomTypes" };
  if (path === "/en/dashboard/custom-type/create") return { type: "dashboardCustomTypeCreate" };
  if (path === "/en/dashboard/comparisons") return { type: "dashboardComparisons" };
  if (path === "/en/dashboard/comparison/create") return { type: "dashboardComparisonCreate" };
  if (path === "/en/dashboard/settings/content-types") return { type: "dashboardContentTypeSettings" };
  if (path === "/en/dashboard/reviews/generic") return { type: "dashboardGenericReviews" };
  if (path === "/en/dashboard/review/generic/create") return { type: "dashboardGenericReviewCreate" };
  if (path === "/en/dashboard/reviews") return { type: "dashboardReviews" };
  if (path === "/en/dashboard/news") return { type: "dashboardNews" };
  if (path === "/en/dashboard/newsroom") return { type: "dashboardNewsroom" };
  if (path === "/en/dashboard/updates")  return { type: "dashboardUpdates" };
  if (path === "/en/dashboard/country-pages") return { type: "dashboardCountryPages" };
  if (path === "/en/dashboard/category-countries") return { type: "dashboardCategoryCountries" };
  if (path === "/en/dashboard/pages") return { type: "dashboardPages" };
  if (path === "/en/dashboard/settings") return { type: "dashboardSettings" };
  if (path === "/en/dashboard/header-hero") return { type: "dashboardHeaderHero" };
  if (path === "/en/dashboard/ai") return { type: "dashboardAI" };
  if (path === "/en/category") return { type: "categoryList" };
  if (path === "/en/country") return { type: "countryList" };
  if (path === "/en/dashboard/categories") return { type: "dashboardCategories" };
  if (path === "/en/dashboard/payment-methods") return { type: "dashboardPaymentMethods" };
  if (path === "/en/dashboard/countries") return { type: "dashboardCountries" };
  if (path === "/en/dashboard/research") return { type: "dashboardResearch" };
  if (path === "/en/dashboard/research/review-queue") return { type: "dashboardResearchReviewQueue" };
  if (path === "/en/dashboard/research/datasets") return { type: "dashboardResearchDatasets" };
  if (path === "/en/dashboard/authors") return { type: "dashboardAuthors" };
  if (path === "/en/dashboard/media") return { type: "dashboardMedia" };
  if (path === "/en/dashboard/nav") return { type: "dashboardNav" };
  if (path === "/en/dashboard/permissions") return { type: "dashboardPermissions" };
  if (path === "/en/dashboard/item-access") return { type: "dashboardItemAccess" };
  if (path === "/en/dashboard/users") return { type: "dashboardUsers" };
  if (path === "/en/dashboard/subscriptions") return { type: "dashboardSubscriptions" };
  if (path === "/en/dashboard/emails") return { type: "dashboardEmails" };
  if (path === "/en/dashboard/inquiries") return { type: "dashboardInquiries" };
  if (path === "/en/dashboard/submissions") return { type: "dashboardSubmissions" };
  if (path === "/en/dashboard/notifications") return { type: "dashboardNotifications" };
  if (path === "/en/dashboard/banners") return { type: "dashboardBanners" };
  if (path === "/en/dashboard/affiliate-partners") return { type: "dashboardAffiliatePartners" };
  if (path === "/en/dashboard/affiliate-programs") return { type: "dashboardAffiliatePrograms" };
  if (path === "/en/dashboard/affiliate-accounts") return { type: "dashboardAffiliateAccounts" };
  if (path === "/en/dashboard/commercial-terms") return { type: "dashboardCommercialTerms" };
  if (path === "/en/dashboard/postback-configs") return { type: "dashboardPostbackConfigs" };
  if (path === "/en/dashboard/import-history") return { type: "dashboardImportHistory" };
  if (path === "/en/dashboard/provider-adapters") return { type: "dashboardProviderAdapters" };
  if (path === "/en/dashboard/offers") return { type: "dashboardOffers" };
  if (path === "/en/dashboard/tracking-links") return { type: "dashboardTrackingLinks" };
  if (path === "/en/dashboard/analytics") return { type: "dashboardAnalytics" };
  if (path === "/en/dashboard/campaigns") return { type: "dashboardCampaigns" };
  if (path === "/en/dashboard/reports") return { type: "dashboardReports" };

  const casinoEditMatch = path.match(/^\/en\/dashboard\/casino\/edit\/([^/]+)$/);
  if (casinoEditMatch) return { type: "dashboardCasinoEdit", slug: casinoEditMatch[1] };

  const contentItemEditMatch = path.match(/^\/en\/dashboard\/content-item\/edit\/([^/]+)\/([^/]+)$/);
  if (contentItemEditMatch) return { type: "dashboardContentItemEdit", contentType: contentItemEditMatch[1], slug: contentItemEditMatch[2] };

  const customTypeEditMatch = path.match(/^\/en\/dashboard\/custom-type\/edit\/([^/]+)$/);
  if (customTypeEditMatch) return { type: "dashboardCustomTypeEdit", typeSlug: customTypeEditMatch[1] };

  const comparisonEditMatch = path.match(/^\/en\/dashboard\/comparison\/edit\/([^/]+)\/([^/]+)$/);
  if (comparisonEditMatch) return { type: "dashboardComparisonEdit", compareType: comparisonEditMatch[1], slug: comparisonEditMatch[2] };

  const genericReviewEditMatch = path.match(/^\/en\/dashboard\/generic-review\/edit\/(\d+)$/);
  if (genericReviewEditMatch) return { type: "dashboardGenericReviewEdit", id: parseInt(genericReviewEditMatch[1]) };

  const contentLandingPageEditMatch = path.match(/^\/en\/dashboard\/content-landing-page\/edit\/([^/]+)$/);
  if (contentLandingPageEditMatch) return { type: "dashboardContentLandingPageEdit", slug: contentLandingPageEditMatch[1] };
  if (path === "/en/dashboard/content-landing-pages") return { type: "dashboardContentLandingPages" };
  if (path === "/en/dashboard/content-landing-page/create") return { type: "dashboardContentLandingPageCreate" };

  if (path === "/en/dashboard/components") return { type: "dashboardComponents" };
  if (path === "/en/dashboard/seo") return { type: "dashboardSeo" };


  // =====================================================
  // AUTH
  // =====================================================

  if (path === "/en/login") {
    return {
      type: "login"
    };
  }

  if (path === "/en/register") {
    return {
      type: "register"
    };
  }

  if (path === "/en/forgot-password") {
    return {
      type: "forgotPassword"
    };
  }

  if (path === "/en/reset-password") {
    return {
      type: "resetPassword"
    };
  }

  if (path === "/en/newsletter/confirm") {
    return {
      type: "newsletterConfirm"
    };
  }

  if (path === "/en/newsletter/unsubscribe") {
    return {
      type: "newsletterUnsubscribe"
    };
  }



  if (path === "/en/user/dashboard") return { type: "userDashboard" };
  if (path === "/en/user/submit-casino") return { type: "userSubmitCasino" };
  if (path === "/en/user/inquiries") return { type: "userInquiries" };
  if (path === "/en/user/profile") return { type: "userProfile" };
  if (path === "/en/user/notifications") return { type: "userNotifications" };
  if (path === "/en/user/bookmarks") return { type: "userBookmarks" };
 
  // =====================================================
// MEDIA FILES
// =====================================================

  if (path.startsWith("/media/") && request.method === "GET") {
    return {
      type: "media",
      key: path.substring(1)
    };
  }
  // =====================================================
// FAVICON
// =====================================================

if (path === "/favicon.ico") {
  return {
    type: "favicon"
  };
}

  // =====================================================
  // SUPER API (Lummet control-plane channel)
  // Must be matched before the generic API catch-all below.
  // =====================================================
  if (path.startsWith("/en/api/super/")) {
    return {
      type: "superApi",
      path
    };
  }

  // =====================================================
  // API 
  // =====================================================
  if (path.startsWith("/api/") || path.startsWith("/en/api/")) {
    return {
      type: "api",
      path: path.replace(/^\/en/, "")
    };
  }

  // Sitemap routes — accessible at both root and /en/
  if (path === "/sitemap.xml" || path === "/en/sitemap.xml") {
      return { type: "sitemap" };
  }
  if (path === "/en/sitemap" || path === "/sitemap") {
      return { type: "sitemap-page" };
  }
  if (path === "/sitemap-index.xml" || path === "/en/sitemap-index.xml") {
      return { type: "sitemap-index" };
  }
  if (path === "/sitemap-casinos.xml" || path === "/en/sitemap-casinos.xml") {
      return { type: "sitemap-casinos" };
  }
  if (path === "/sitemap-sportsbook.xml" || path === "/en/sitemap-sportsbook.xml") {
      return { type: "sitemap-sportsbook" };
  }
  if (path === "/sitemap-affiliate-partner.xml" || path === "/en/sitemap-affiliate-partner.xml") {
      return { type: "sitemap-affiliate-partner" };
  }
  if (path === "/sitemap-custom.xml" || path === "/en/sitemap-custom.xml") {
      return { type: "sitemap-custom" };
  }
  if (path === "/sitemap-comparisons.xml" || path === "/en/sitemap-comparisons.xml") {
      return { type: "sitemap-comparisons" };
  }
  if (path === "/sitemap-reviews.xml" || path === "/en/sitemap-reviews.xml") {
      return { type: "sitemap-reviews" };
  }
  if (path === "/sitemap-news.xml" || path === "/en/sitemap-news.xml") {
      return { type: "sitemap-news" };
  }
  if (path === "/sitemap-news-sections.xml" || path === "/en/sitemap-news-sections.xml") {
      return { type: "sitemap-news-landing" };
  }
  if (path === "/news-sitemap.xml" || path === "/en/news-sitemap.xml") {
      return { type: "sitemap-google-news" };
  }
  if (path === "/sitemap-updates.xml" || path === "/en/sitemap-updates.xml") {
      return { type: "sitemap-updates" };
  }

  if (path === "/sitemap-authors.xml" || path === "/en/sitemap-authors.xml") {
      return { type: "sitemap-authors" };
  }

  if (path === "/sitemap-categories.xml" || path === "/en/sitemap-categories.xml") {
      return { type: "sitemap-categories" };
  }
  if (path === "/sitemap-countries.xml" || path === "/en/sitemap-countries.xml") {
      return { type: "sitemap-countries" };
  }
  if (path === "/sitemap-pages.xml" || path === "/en/sitemap-pages.xml") {
      return { type: "sitemap-pages" };
  }
  if (path === "/sitemap-seo-pages.xml" || path === "/en/sitemap-seo-pages.xml") {
      return { type: "sitemap-seo-pages" };
  }
  if (path === "/sitemap-research.xml" || path === "/en/sitemap-research.xml") {
      return { type: "sitemap-research" };
  }
  if (path === "/robots.txt") {
      return { type: "robots" };
  }

  // =====================================================
  // FALLBACK DYNAMIC PAGE ENGINE
  // =====================================================
  // /en/about
  // /en/contact
  // /en/privacy
  // /en/terms
  // =====================================================

  const dynamicPage =
    path.match(/^\/en\/(.+)$/);

  if (dynamicPage) {

    return {
      type: "page",
      slug: dynamicPage[1]
    };

  }

  // =====================================================
  // 404
  // =====================================================

  return {
    type: "not_found"
  };

}
