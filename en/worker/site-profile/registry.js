// ============================================================
// SITE PROFILE: capability manifest (single source of truth)
// ============================================================
// Two levels of choice:
//   MODULE  = a business area the owner switches on/off (casino, news, ...).
//   PAGE    = a page family inside a module (casino detail pages, news topics, ...).
// Capability ids: "casino" (module) and "casino.detail" (page).
// A page capability is live only when its module is live AND the page is not switched off.
//
// Every route type produced by routing/*.js must be claimed exactly once, either by a
// module/page below, by CORE_PUBLIC / CORE_DASHBOARD (always on), by SITEMAP_CAP, or by
// PENDING_FEATURES (always on until Phase 2 gives it a switch). test/site-profile-manifest.test.js
// fails when a new route type is added without a claim.

export const MODULES = {
  casino: {
    label: "Casino listings", desc: "Casino list, casino pages, /go links, payment methods",
    help: "Choose this to list casinos with offers, countries, payments and affiliate links.",
    dashboard: ["dashboardCasinos", "dashboardCasinoCreate", "dashboardCasinoEdit"],
    pages: {
      list:     { label: "Casino list",          desc: "/en/casino", public: ["casinoList"] },
      detail:   { label: "Casino detail pages",  desc: "/en/casino/<name>", public: ["casino"] },
      go:       { label: "Casino /go links",     desc: "Affiliate redirect links", public: ["go"], api: ["/api/v1/stats/top-casinos"] },
      payments: { label: "Payment methods",      desc: "/en/payment-methods", public: ["paymentMethodList", "paymentMethod"], dashboard: ["dashboardPaymentMethods"], api: ["/api/v1/payment-method"] },
      offers:   { label: "Offers & bonuses",     desc: "Offer editor in the dashboard", public: [], dashboard: ["dashboardOffers"], api: ["/api/v1/offer"] },
    },
  },
  reviews: {
    label: "Reviews & comparisons", desc: "Review pages and comparisons",
    help: "Written reviews of casinos or other items, with side-by-side comparisons.",
    dashboard: ["dashboardReviews"],
    pages: {
      list:        { label: "Review list",    desc: "/en/review", public: ["reviewList"] },
      detail:      { label: "Review pages",   desc: "/en/review/<name>", public: ["review"] },
      comparisons: { label: "Comparisons",    desc: "Comparison pages", public: ["comparison", "comparisonList"],
                     dashboard: ["dashboardComparisons", "dashboardComparisonCreate", "dashboardComparisonEdit"] },
    },
  },
  news: {
    label: "News", desc: "News list, articles, topics, entities, series",
    help: "A newsroom: articles, topic and entity pages, Google News sitemap.",
    dashboard: ["dashboardNews", "dashboardNewsroom"],
    pages: {
      list:     { label: "News list",                 desc: "/en/news", public: ["newsList"] },
      article:  { label: "News articles",             desc: "/en/news/<story>", public: ["news"] },
      taxonomy: { label: "Topic, entity & series pages", desc: "News landing pages", public: ["newsTaxonomy"] },
    },
  },
  updates: {
    label: "Platform updates", desc: "/en/updates", help: "A changelog or announcements feed.",
    dashboard: ["dashboardUpdates"],
    pages: { list: { label: "Updates list", desc: "/en/updates", public: ["updatesList"] }, item: { label: "Update pages", desc: "/en/updates/<item>", public: ["update"] } },
  },
  authors: {
    label: "Authors", desc: "/en/author", help: "Public author list and profile pages.",
    dashboard: ["dashboardAuthors"],
    pages: { list: { label: "Author list", desc: "/en/author", public: ["authorList"] }, profile: { label: "Author profiles", desc: "/en/author/<name>", public: ["author"] } },
  },
  taxonomy: {
    label: "Categories & countries", desc: "Category and country landing pages",
    help: "SEO landing pages grouped by category, by country and by both.",
    dashboard: ["dashboardCategories", "dashboardCountries", "dashboardCountryPages", "dashboardCategoryCountries"],
    pages: {
      categories: { label: "Category pages",       desc: "/en/category", public: ["categoryList", "category"] },
      countries:  { label: "Country pages",        desc: "/en/country", public: ["countryList", "country", "countryCustomPage"] },
      combos:     { label: "Category + country pages", desc: "SEO combinations", public: ["categoryCountryPage"] },
    },
  },
  research: {
    label: "Research", desc: "Research hub, datasets, review queue",
    help: "A research publication with datasets and an editorial review queue.",
    dashboard: ["dashboardResearch", "dashboardResearchReviewQueue", "dashboardResearchDatasets"],
    pages: {
      hub:   { label: "Research hub",  desc: "/en/research", public: ["researchHub"] },
      lists: { label: "Research lists", desc: "Per research type", public: ["researchTypeList"] },
      items: { label: "Research items", desc: "Individual studies", public: ["researchItem"] },
    },
  },
  content: {
    label: "Sportsbook, partners & custom content", desc: "Sportsbook, affiliate partners, custom types, /en/best pages",
    help: "Generic content engine. Pick only the types you run (for example sportsbook only).",
    dashboard: ["dashboardContentItems", "dashboardContentItemCreate", "dashboardContentItemEdit", "dashboardContentTypeSettings",
                "dashboardGenericReviews", "dashboardGenericReviewCreate", "dashboardGenericReviewEdit"],
    pages: {
      sportsbook: { label: "Sportsbook",          desc: "List, detail and review pages", public: ["sportsbookList", "sportsbook", "sportsbookReview"] },
      partners:   { label: "Affiliate partners",  desc: "List, detail and review pages", public: ["affiliatePartnerList", "affiliatePartner", "affiliatePartnerReview"] },
      custom:     { label: "Custom content types", desc: "Your own types", public: ["custom", "customList", "customReview"],
                    dashboard: ["dashboardCustomTypes", "dashboardCustomTypeCreate", "dashboardCustomTypeEdit"] },
      landing:    { label: "Best-of landing pages", desc: "/en/best", public: ["contentLandingPage"],
                    dashboard: ["dashboardContentLandingPages", "dashboardContentLandingPageCreate", "dashboardContentLandingPageEdit"] },
      go:         { label: "Content /go links",   desc: "Affiliate redirects for content items", public: ["goContent"] },
    },
  },
  search: { label: "Site search", desc: "/en/search", help: "Visitor search box and results page.", dashboard: [], pages: { results: { label: "Search results", desc: "/en/search", public: ["siteSearch"] } } },
  accounts: {
    label: "Visitor accounts", desc: "Registration and /en/user/*", help: "Visitors register, bookmark and submit casinos.",
    dashboard: ["dashboardUsers"],
    pages: {
      register: { label: "Registration", desc: "/en/register", public: ["register"] },
      area:     { label: "User area",    desc: "/en/user/*", public: ["userDashboard", "userProfile", "userNotifications"] },
    },
  },
  partners: {
    label: "Affiliate & tracking", desc: "Partners, programs, tracking links, postbacks", help: "Back-office affiliate tooling. No public pages.",
    dashboard: ["dashboardAffiliatePartners", "dashboardAffiliatePrograms", "dashboardAffiliateAccounts", "dashboardCommercialTerms",
                "dashboardTrackingLinks", "dashboardPostbackConfigs", "dashboardProviderAdapters"],
    pages: {},
  },
};

// ---- Always on (bypass list). Never gated, so the owner can never be locked out. ----
export const CORE_PUBLIC = new Set([
  "redirect", "login", "forgotPassword", "resetPassword", "newsletterConfirm", "newsletterUnsubscribe",
  "media", "favicon", "superApi", "api", "robots", "page", "affiliate", "not_found", "home",
  "sitemap", "sitemap-index", "sitemap-page", "sitemap-pages", "sitemap-seo-pages",
]);
export const CORE_DASHBOARD = new Set([
  "dashboard", "dashboardConfiguration", "dashboardSettings", "dashboardPages", "dashboardNav", "dashboardPermissions",
  "dashboardMedia", "dashboardHeaderHero", "dashboardDesignStudio", "dashboardStudioPro", "dashboardSeo",
]);


// ---- Feature switches (Phase 2). Cross-cutting tools that are not tied to one business area. ----
// Each lists the dashboard route types and admin API prefixes it owns. Turning one off hides its dashboard
// screens, refuses its admin API (data is kept) and skips its scheduled jobs. Turning it on restores everything.
export const FEATURES = {
  geo:           { label: "Geo rules",            desc: "Country rules, defaults, bulk edit, import/export", help: "Show different casinos and offers per visitor country.",
                   dashboard: ["dashboardGeoRules"], api: ["/api/v1/geo/", "/api/v1/geo-manager/", "/api/v1/old/geo/"] },
  ai:            { label: "AI assistant & studio", desc: "Lummet AI chat, AI Studio", help: "AI chat and the AI Studio for drafting and review.",
                   dashboard: ["dashboardAI", "dashboardAiStudio"], api: ["/api/v1/ai/", "/api/v1/ai-studio/"], cron: ["chatQuality"] },
  analytics:     { label: "Analytics",            desc: "Traffic, conversions, alerts", help: "Dashboards for traffic, conversions and alert rules.",
                   dashboard: ["dashboardAnalytics"], api: ["/api/v1/analytics/"], cron: ["aggregation", "alerts"] },
  reports:       { label: "Reports",              desc: "Saved and scheduled reports", help: "Build, save and schedule reports.",
                   dashboard: ["dashboardReports"], api: ["/api/v1/report"], cron: ["scheduledReports"] },
  speed:         { label: "Speed monitor",        desc: "Performance dashboard", help: "Page speed and cache health.", dashboard: ["dashboardSpeed"], api: [] },
  campaigns:     { label: "Campaigns",            desc: "Marketing campaigns", help: "Group links and offers into campaigns.", dashboard: ["dashboardCampaigns"], api: ["/api/v1/campaign"] },
  banners:       { label: "Banners",              desc: "Banner placements", help: "Banner creatives and placements.", dashboard: ["dashboardBanners"], api: ["/api/v1/banner", "/api/v1/live-banner"] },
  ads:           { label: "Ad rules",             desc: "Where and when ads show", help: "Rules that decide ad placement.", dashboard: [], api: ["/api/v1/ad-rules/"] },
  emails:        { label: "Email campaigns",      desc: "Compose and send emails", help: "Send emails to your subscribers.", dashboard: ["dashboardEmails"], api: ["/api/v1/admin/email-campaigns"] },
  subscriptions: { label: "Newsletter subscribers", desc: "Subscriber list and digest", help: "Collect and manage subscribers.", dashboard: ["dashboardSubscriptions"], api: ["/api/v1/admin/subscribers"], cron: ["weeklyDigest"] },
  notifications: { label: "Notifications",        desc: "Send notifications to users", help: "Notify registered visitors.", dashboard: ["dashboardNotifications"], api: ["/api/v1/admin/notification"] },
  itemAccess:    { label: "Per-item access",      desc: "Grant users access to items", help: "Restrict items to chosen users.", dashboard: ["dashboardItemAccess"], api: ["/api/v1/admin/item-access/"] },
  // ---- Phase 11 / T3. Optional fields: public = public route types, requires = "a|b" capability ids of which ANY must be on. ----
  ratings:       { label: "Ratings",              desc: "Scores and stars shown to visitors", help: "Shows the rating on casino pages, item pages and comparison tables. Off hides them (stored ratings are kept). Cards built by script on list pages are not covered.",
                   dashboard: [], api: [] },
  faqs:          { label: "FAQ blocks",           desc: "Questions and answers on pages", help: "Shows FAQ sections, FAQ components and their search-engine markup. Off hides them; the questions are kept.",
                   dashboard: [], api: [] },
  reviewSections: { label: "Review sections",     desc: "Extra titled sections under reviews and pages", help: "The extra sections you add under reviews, comparisons and landing pages (FAQ sections follow the FAQ switch). Off hides them and their editor; nothing is deleted.",
                   dashboard: [], api: ["/api/v1/review-blocks"], requires: "reviews|content" },
  bookmarks:     { label: "Bookmarks",            desc: "Visitors save casinos", help: "Lets signed-in visitors save casinos. Needs Visitor accounts.",
                   dashboard: [], public: ["userBookmarks"], api: ["/api/v1/user/bookmark"], requires: "accounts" },
  inquiries:     { label: "Inquiries",            desc: "Visitor inquiries and the inbox", help: "Visitors send inquiries; you answer them in Dashboard > Inquiries. Needs Visitor accounts.",
                   dashboard: ["dashboardInquiries"], public: ["userInquiries"], api: ["/api/v1/user/inquir", "/api/v1/admin/inquir"], requires: "accounts" },
  submissions:   { label: "Casino submissions",   desc: "Visitors submit casinos", help: "Visitors suggest casinos; you review them in Dashboard > Submissions. Needs Visitor accounts.",
                   dashboard: ["dashboardSubmissions"], public: ["userSubmitCasino"], api: ["/api/v1/user/submi", "/api/v1/admin/submission"], requires: "accounts" },
  components:    { label: "Components",           desc: "Reusable blocks placed on pages", help: "The Components screen and the blocks placed on pages. The hero banner keeps working (it is set under Header & Hero). Off hides the screen, refuses its edits and hides placed blocks; nothing is deleted.",
                   dashboard: ["dashboardComponents"], api: [
                     "/api/v1/component/create", "/api/v1/component/update", "/api/v1/component/delete", "/api/v1/component/get",
                     "/api/v1/components/assign", "/api/v1/components/bulk-assign", "/api/v1/components/unassign", "/api/v1/components/update-assignment",
                     "/api/v1/components/toggle", "/api/v1/components/page", "/api/v1/components/reorder"] },
  homepageBuilder: { label: "Homepage builder",   desc: "Homepage sections and cards", help: "The Homepage Content builder in Settings and the sections it puts on the homepage. Off hides both; the saved sections are kept.",
                   dashboard: [], api: [] },
  importTools:   { label: "Import tools",         desc: "Import history and imports", help: "Conversion imports and their history. Needs Affiliate & tracking.",
                   dashboard: ["dashboardImportHistory"], api: ["/api/v1/import"], requires: "partners" },
};
export const FEATURE_IDS = new Set(Object.keys(FEATURES));

// ---- (Phase 1 placeholder; now empty because every feature has a switch above.) Always on for now; each gets its own switch in Phase 2 (feature-level capabilities). ----
export const PENDING_FEATURES = new Set([]);

// Analytics dimensions and report types that only make sense for one capability (Phase 11C).
// Dashboard tags (data-cap) and the admin API both read these. Anything unlisted is always available.
export const ANALYTICS_DIMENSION_CAP = {
  casino: "casino", offer: "casino.offers", tracking_link: "partners", partner: "partners", program: "partners",
  account: "partners", campaign: "features.campaigns", review: "reviews", news: "news",
};
export const REPORT_TYPE_CAP = {
  casino_performance: "casino", offer_performance: "casino.offers", affiliate_performance: "partners",
  partner_performance: "partners", program_performance: "partners", account_performance: "partners",
  tracking_link_performance: "partners",
};

// Sitemap sub-files follow the capability whose URLs they list. Anything unlisted stays on.
export const SITEMAP_CAP = {
  "sitemap-casinos": "casino.detail", "sitemap-sportsbook": "content.sportsbook", "sitemap-affiliate-partner": "content.partners",
  "sitemap-custom": "content.custom", "sitemap-comparisons": "reviews.comparisons", "sitemap-reviews": "reviews.detail",
  "sitemap-news": "news.article", "sitemap-news-landing": "news.taxonomy", "sitemap-google-news": "news.article",
  "sitemap-updates": "updates", "sitemap-authors": "authors", "sitemap-categories": "taxonomy.categories",
  "sitemap-countries": "taxonomy.countries", "sitemap-research": "research",
};
export const SITEMAP_MODULE = Object.fromEntries(Object.entries(SITEMAP_CAP).map(([t, c]) => [t, c.split(".")[0]]));

// ---- Indexes ----
const PUBLIC_INDEX = new Map();    // route type -> { module, capability }
const DASH_INDEX = new Map();      // route type -> { module, capability }
export const PAGE_IDS = new Set();
const claims = new Map();
const claim = (t, who) => { if (!claims.has(t)) claims.set(t, []); claims.get(t).push(who); };

for (const [id, m] of Object.entries(MODULES)) {
  m.public = []; m.allDashboard = [...m.dashboard];
  for (const t of m.dashboard) { DASH_INDEX.set(t, { module: id, capability: id }); claim(t, id); }
  for (const [pid, pg] of Object.entries(m.pages)) {
    const cap = `${id}.${pid}`; PAGE_IDS.add(cap);
    for (const t of pg.public || []) { PUBLIC_INDEX.set(t, { module: id, capability: cap }); m.public.push(t); claim(t, cap); }
    for (const t of pg.dashboard || []) { DASH_INDEX.set(t, { module: id, capability: cap }); m.allDashboard.push(t); claim(t, cap); }
  }
}
const API_INDEX = [];   // [{ prefix, capability }] longest prefix first
for (const [id, f] of Object.entries(FEATURES)) {
  const cap = `features.${id}`;
  for (const t of f.dashboard) { DASH_INDEX.set(t, { module: "features", capability: cap }); claim(t, cap); }
  for (const t of f.public || []) { PUBLIC_INDEX.set(t, { module: "features", capability: cap }); claim(t, cap); }
  for (const pre of f.api) API_INDEX.push({ prefix: pre, capability: cap });
}
for (const [id, m] of Object.entries(MODULES)) for (const [pid, pg] of Object.entries(m.pages)) for (const pre of pg.api || []) API_INDEX.push({ prefix: pre, capability: `${id}.${pid}` });
API_INDEX.sort((a, b) => b.prefix.length - a.prefix.length);
export const API_PREFIXES = API_INDEX;
export const capabilityForApiPath = (path) => { for (const e of API_INDEX) if (path.startsWith(e.prefix)) return e.capability; return null; };
for (const t of CORE_PUBLIC) claim(t, "core");
for (const t of CORE_DASHBOARD) claim(t, "core");
for (const t of PENDING_FEATURES) claim(t, "pending");
for (const t of Object.keys(SITEMAP_CAP)) claim(t, "sitemap");

export const claimsFor = (t) => claims.get(t) || [];
export const allClaims = () => new Map(claims);
export const capabilityForPublicType = (t) => PUBLIC_INDEX.get(t) || null;
export const capabilityForDashboardType = (t) => DASH_INDEX.get(t) || null;
export const moduleForPublicType = (t) => PUBLIC_INDEX.get(t)?.module || null;
export const moduleForDashboardType = (t) => DASH_INDEX.get(t)?.module || null;

// Presets. "landing" is the path "/" and "/en" resolve to. "off" lists page capabilities switched off inside enabled modules.
export const PRESETS = {
  full:           { label: "Full platform",               help: "Everything, exactly as the platform ships.", modules: Object.keys(MODULES), landing: "/en" },
  news:           { label: "News site only",              help: "A newsroom with authors and search.", modules: ["news", "authors", "search"], offFeatures: ["bookmarks", "inquiries", "submissions", "importTools", "reviewSections", "ratings"], landing: "/en/news" },
  "casino-list":  { label: "Casino listing only",         help: "Casino list and casino pages, with a homepage.", modules: ["casino"], offFeatures: ["bookmarks", "inquiries", "submissions", "importTools", "reviewSections"], landing: "/en" },
  "casino-only":  { label: "Casino listing, no homepage", help: "Visitors land straight on the casino list.", modules: ["casino"], offFeatures: ["bookmarks", "inquiries", "submissions", "importTools", "reviewSections"], landing: "/en/casino" },
  "list-reviews": { label: "Listing + reviews",           help: "Casinos and their reviews, nothing else.", modules: ["casino", "reviews"], offFeatures: ["bookmarks", "inquiries", "submissions", "importTools"], landing: "/en" },
  sportsbook:     { label: "Sportsbook listing",          help: "Sportsbook list, detail and review pages only.", modules: ["content", "search"], off: ["content.partners", "content.custom", "content.landing"], offFeatures: ["bookmarks", "inquiries", "submissions", "importTools"], landing: "/en/sportsbook" },
  research:       { label: "Research publication",        help: "Research hub, items and authors.", modules: ["research", "authors", "search"], offFeatures: ["bookmarks", "inquiries", "submissions", "importTools", "reviewSections", "ratings"], landing: "/en/research" },
  static:         { label: "Static website",              help: "Only ordinary pages (about, legal, custom pages).", modules: [], offFeatures: ["geo", "campaigns", "banners", "ads", "itemAccess", "emails", "subscriptions", "notifications", "bookmarks", "inquiries", "submissions", "importTools", "reviewSections", "ratings"], landing: "/en" },
};
