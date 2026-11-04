// =====================================================
// TENANT ROUTES: dashboard
// The admin dashboard pages.
// Part of getRoute (worker/routes.js): the statements below are the
// original ones in the original order. Returns the route object, or null
// when none of them matches so the next group is tried.
// =====================================================

export function routeDashboard(path) {

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
  if (path === "/en/dashboard/ai-studio") return { type: "dashboardAiStudio" };
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
  if (path === "/en/dashboard/speed") return { type: "dashboardSpeed" };
  if (path === "/en/dashboard/provider-adapters") return { type: "dashboardProviderAdapters" };
  if (path === "/en/dashboard/offers") return { type: "dashboardOffers" };
  if (path === "/en/dashboard/tracking-links") return { type: "dashboardTrackingLinks" };
  if (path === "/en/dashboard/analytics") return { type: "dashboardAnalytics" };
  if (path === "/en/dashboard/campaigns") return { type: "dashboardCampaigns" };
  if (path === "/en/dashboard/reports") return { type: "dashboardReports" };
  if (path === "/en/dashboard/geo-rules") return { type: "dashboardGeoRules", section: "rules" };
  { const gm = path.match(/^\/en\/dashboard\/geo-rules\/(defaults|bulk|import-export|presets|lookup)$/); if (gm) return { type: "dashboardGeoRules", section: gm[1] }; }

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

  return null;
}
