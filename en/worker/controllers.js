// =====================================================
// PAGE CONTROLLERS
//
// The page and dashboard controllers live in worker/controllers/, one file per area.
// This file only re-exports them, so every import of "./controllers.js" keeps working.
// To change a page, open the file for its area (see docs/ARCHITECTURE_CONTROLLERS.md).
// =====================================================
export {
  renderAffiliate,
  renderAffiliatePartnerList,
  renderAffiliatePartner
} from "./controllers/affiliates.js";

export {
  renderLogin,
  renderRegister,
  renderForgotPassword,
  renderResetPassword
} from "./controllers/auth-pages.js";

export {
  renderAuthor,
  renderAuthorList
} from "./controllers/authors.js";

export {
  renderCasino,
  renderCasinoList
} from "./controllers/casinos.js";

export {
  renderCategory,
  renderCategoryList
} from "./controllers/categories.js";

export {
  renderComparisonList,
  renderComparison
} from "./controllers/comparisons.js";

export {
  renderSportsbookList,
  renderSportsbook,
  renderCustomList,
  renderCustom
} from "./controllers/content-items.js";

export {
  renderCountry,
  renderCountryList
} from "./controllers/countries.js";

export {
  renderDashboardPage,
  dashboardStatsAPI,
  renderDashboardCasinos,
  renderDashboardCasinoCreate,
  renderDashboardContentItems,
  renderDashboardContentItemCreate,
  renderDashboardCustomTypes,
  renderDashboardCustomTypeCreate,
  renderDashboardComparisons,
  renderDashboardComparisonCreate,
  renderDashboardContentItemEdit,
  renderDashboardCustomTypeEdit,
  renderDashboardComparisonEdit,
  renderDashboardGenericReviewEdit,
  renderDashboardContentLandingPages,
  renderDashboardContentLandingPageCreate,
  renderDashboardContentLandingPageEdit,
  renderDashboardContentTypeSettings,
  renderDashboardGenericReviews,
  renderDashboardGenericReviewCreate,
  renderDashboardReviews,
  renderDashboardNews,
  renderDashboardNewsroom,
  renderDashboardUpdates,
  renderDashboardCountryPages,
  renderDashboardCategoryCountries,
  renderDashboardPages,
  renderDashboardSettings,
  renderDashboardHeaderHero,
  renderDashboardAI,
  renderDashboardAiStudio,
  renderDashboardCategories,
  renderDashboardPaymentMethods,
  renderDashboardCountries,
  renderDashboardResearch,
  renderDashboardResearchReviewQueue,
  renderDashboardResearchDatasets,
  renderDashboardCasinoEdit,
  renderDashboardComponents,
  renderDashboardSeo,
  renderDashboardAuthors,
  renderDashboardMedia,
  renderDashboardNav,
  renderDashboardPermissions,
  renderDashboardItemAccess,
  renderDashboardUsers,
  renderDashboardSubscriptions,
  renderDashboardEmails,
  renderDashboardInquiries,
  renderDashboardSubmissions,
  renderDashboardNotifications,
  renderDashboardBanners,
  renderDashboardAffiliatePartners,
  renderDashboardAffiliatePrograms,
  renderDashboardAffiliateAccounts,
  renderDashboardCommercialTerms,
  renderDashboardPostbackConfigs,
  renderDashboardImportHistory,
  renderDashboardSpeed,
  renderDashboardProviderAdapters,
  renderDashboardOffers,
  renderDashboardTrackingLinks,
  renderDashboardAnalytics,
  renderDashboardCampaigns,
  renderDashboardReports,
  renderDashboardGeoRules
} from "./controllers/dashboard.js";

export {
  renderDynamicPage
} from "./controllers/dynamic-pages.js";

export {
  renderGenericReview
} from "./controllers/generic-reviews.js";

export {
  renderHome
} from "./controllers/home.js";

export {
  renderContentLandingPage
} from "./controllers/landing-pages.js";

export {
  renderNewsTaxonomyPage,
  renderNews,
  renderNewsList
} from "./controllers/news.js";

export {
  renderPaymentMethodList,
  renderPaymentMethod
} from "./controllers/payment-methods.js";

export {
  renderUpdatesList,
  renderUpdate
} from "./controllers/platform-updates.js";

export {
  handleAffiliateRedirect,
  handleContentTrackedRedirect
} from "./controllers/redirects.js";

export {
  renderSiteSearch,
  renderResearchHub,
  renderResearchTypeList,
  renderResearchItem
} from "./controllers/research.js";

export {
  renderReview,
  renderReviewList
} from "./controllers/reviews.js";

export {
  renderCountryCustomPage,
  renderCategoryCountryPage
} from "./controllers/seo-pages.js";

export {
  robots,
  render404,
  renderSitemapPage
} from "./controllers/system-pages.js";

export {
  renderUserDashboard,
  renderUserSubmitCasino,
  renderUserInquiries,
  renderUserProfile,
  renderUserNotifications,
  renderUserBookmarks
} from "./controllers/user-pages.js";
