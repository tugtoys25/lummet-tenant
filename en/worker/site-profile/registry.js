// ============================================================
// SITE PROFILE: module registry (single source of truth)
// ============================================================
// A "module" is a switchable feature area. Each lists the public
// route types (from routing/*.js) and dashboard route types it owns.
// Everything else (nav, sitemap, dashboard menu, gating) derives from
// this table by classifying a path with getRoute(), so there are no
// duplicated URL prefixes to keep in sync.

export const MODULES = {
  casino:   { label: "Casino listings",    desc: "/en/casino list + casino detail pages, /go links, payment methods",
              public: ["casinoList", "casino", "go", "paymentMethodList", "paymentMethod"],
              dashboard: ["dashboardCasinos", "dashboardCasinoCreate", "dashboardCasinoEdit", "dashboardOffers", "dashboardPaymentMethods"] },
  reviews:  { label: "Reviews & comparisons", desc: "/en/review, comparisons",
              public: ["reviewList", "review", "comparison", "comparisonList"],
              dashboard: ["dashboardReviews", "dashboardComparisons", "dashboardComparisonCreate", "dashboardComparisonEdit"] },
  news:     { label: "News",               desc: "/en/news, topics, entities, series",
              public: ["newsList", "news", "newsTaxonomy"],
              dashboard: ["dashboardNews", "dashboardNewsroom"] },
  updates:  { label: "Platform updates",   desc: "/en/updates",
              public: ["updatesList", "update"],
              dashboard: ["dashboardUpdates"] },
  authors:  { label: "Authors",            desc: "/en/author",
              public: ["authorList", "author"],
              dashboard: ["dashboardAuthors"] },
  taxonomy: { label: "Categories & countries", desc: "/en/category, /en/country and SEO combinations",
              public: ["categoryList", "category", "countryList", "country", "countryCustomPage", "categoryCountryPage"],
              dashboard: ["dashboardCategories", "dashboardCountries", "dashboardCountryPages", "dashboardCategoryCountries"] },
  research: { label: "Research",           desc: "/en/research hub, datasets, review queue",
              public: ["researchHub", "researchTypeList", "researchItem"],
              dashboard: ["dashboardResearch", "dashboardResearchReviewQueue", "dashboardResearchDatasets"] },
  content:  { label: "Content engine",     desc: "Sportsbook, affiliate-partner, custom types, /en/best landing pages",
              public: ["sportsbookList", "sportsbook", "sportsbookReview", "affiliatePartnerList", "affiliatePartner", "affiliatePartnerReview",
                       "custom", "customList", "customReview", "contentLandingPage", "goContent"],
              dashboard: ["dashboardContentItems", "dashboardContentItemCreate", "dashboardContentItemEdit", "dashboardCustomTypes",
                          "dashboardCustomTypeCreate", "dashboardCustomTypeEdit", "dashboardContentTypeSettings", "dashboardGenericReviews",
                          "dashboardGenericReviewCreate", "dashboardGenericReviewEdit", "dashboardContentLandingPages",
                          "dashboardContentLandingPageCreate", "dashboardContentLandingPageEdit"] },
  search:   { label: "Site search",        desc: "/en/search",
              public: ["siteSearch"], dashboard: [] },
  accounts: { label: "Visitor accounts",   desc: "Registration and /en/user/* area",
              public: ["register", "userDashboard", "userSubmitCasino", "userInquiries", "userProfile", "userNotifications", "userBookmarks"],
              dashboard: ["dashboardUsers", "dashboardSubmissions", "dashboardInquiries"] },
  partners: { label: "Affiliate & tracking", desc: "Partners, programs, tracking links, postbacks",
              public: [],
              dashboard: ["dashboardAffiliatePartners", "dashboardAffiliatePrograms", "dashboardAffiliateAccounts", "dashboardCommercialTerms",
                          "dashboardTrackingLinks", "dashboardPostbackConfigs", "dashboardProviderAdapters", "dashboardImportHistory"] },
};

// Public route types that are NEVER gated (login must stay reachable or the owner is locked out).
export const CORE_PUBLIC = new Set([
  "redirect", "login", "forgotPassword", "resetPassword", "newsletterConfirm", "newsletterUnsubscribe",
  "media", "favicon", "superApi", "api", "robots", "page", "affiliate", "not_found",
  "sitemap", "sitemap-index", "sitemap-page",
]);

// Sitemap sub-files follow their module. Anything unlisted stays on.
export const SITEMAP_MODULE = {
  "sitemap-casinos": "casino", "sitemap-sportsbook": "content", "sitemap-affiliate-partner": "content", "sitemap-custom": "content",
  "sitemap-comparisons": "reviews", "sitemap-reviews": "reviews", "sitemap-news": "news", "sitemap-news-landing": "news",
  "sitemap-google-news": "news", "sitemap-updates": "updates", "sitemap-authors": "authors", "sitemap-categories": "taxonomy",
  "sitemap-countries": "taxonomy", "sitemap-research": "research",
};

const PUBLIC_INDEX = new Map();
const DASH_INDEX = new Map();
for (const [id, m] of Object.entries(MODULES)) {
  for (const t of m.public) PUBLIC_INDEX.set(t, id);
  for (const t of m.dashboard) DASH_INDEX.set(t, id);
}
export const moduleForPublicType = (t) => PUBLIC_INDEX.get(t) || null;
export const moduleForDashboardType = (t) => DASH_INDEX.get(t) || null;

// Presets. "landing" is the path "/" and "/en" resolve to.
export const PRESETS = {
  full:           { label: "Full platform",              modules: Object.keys(MODULES), landing: "/en" },
  news:           { label: "News site only",             modules: ["news", "authors", "search"], landing: "/en/news" },
  "casino-list":  { label: "Casino listing only",        modules: ["casino"], landing: "/en" },
  "casino-only":  { label: "Casino listing, no homepage", modules: ["casino"], landing: "/en/casino" },
  "list-reviews": { label: "Listing + reviews",          modules: ["casino", "reviews"], landing: "/en" },
};
