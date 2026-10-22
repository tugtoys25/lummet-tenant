// =====================================================
// TENANT ROUTES: content
// Casino reviews, news, updates, countries, categories, payment methods, research, category x country, authors, affiliate landing pages and /go tracking.
// Part of getRoute (worker/routes.js): the statements below are the
// original ones in the original order. Returns the route object, or null
// when none of them matches so the next group is tried.
// =====================================================

export function routeContent(path) {

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

  return null;
}
