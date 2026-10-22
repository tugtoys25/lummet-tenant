// Super API routes: Content, users, settings, permissions, item access and SEO pages.
// Each entry: [METHOD, path-pattern, handler, resource-name]. Order matters (first match wins);
// router.js joins the groups in the order the table always had.
import * as h from "../handlers.js";

export const CORE_ROUTES = [
  ["GET", "/en/api/super/handshake", h.handleHandshake, null],
  ["GET", "/en/api/super/health", h.handleHealth, null],
  ["GET", "/en/api/super/capabilities", h.handleCapabilities, null],

  ["GET", "/en/api/super/casinos", h.handleListCasinos, "casinos"],
  ["GET", "/en/api/super/casinos/:id", h.handleGetCasino, "casinos"],
  ["POST", "/en/api/super/casinos", h.handleCreateCasino, "casinos"],
  ["PUT", "/en/api/super/casinos/:id", h.handleUpdateCasino, "casinos"],
  ["DELETE", "/en/api/super/casinos/:id", h.handleDeleteCasino, "casinos"],

  ["GET", "/en/api/super/reviews", h.handleListReviews, "reviews"],
  ["GET", "/en/api/super/reviews/:id", h.handleGetReview, "reviews"],
  ["POST", "/en/api/super/reviews", h.handleCreateReview, "reviews"],
  ["PUT", "/en/api/super/reviews/:id", h.handleUpdateReview, "reviews"],
  ["DELETE", "/en/api/super/reviews/:id", h.handleDeleteReview, "reviews"],

  ["GET", "/en/api/super/news", h.handleListNews, "news"],
  ["GET", "/en/api/super/news/:id", h.handleGetNews, "news"],
  ["POST", "/en/api/super/news", h.handleCreateNews, "news"],
  ["PUT", "/en/api/super/news/:id", h.handleUpdateNews, "news"],
  ["DELETE", "/en/api/super/news/:id", h.handleDeleteNews, "news"],

  ["GET", "/en/api/super/pages", h.handleListPages, "pages"],
  ["GET", "/en/api/super/pages/:id", h.handleGetPage, "pages"],
  ["POST", "/en/api/super/pages", h.handleCreatePage, "pages"],
  ["PUT", "/en/api/super/pages/:id", h.handleUpdatePage, "pages"],
  ["DELETE", "/en/api/super/pages/:id", h.handleDeletePage, "pages"],

  ["GET", "/en/api/super/categories", h.handleListCategories, "categories"],
  ["GET", "/en/api/super/categories/:id", h.handleGetCategory, "categories"],
  ["POST", "/en/api/super/categories", h.handleCreateCategory, "categories"],
  ["PUT", "/en/api/super/categories/:id", h.handleUpdateCategory, "categories"],
  ["DELETE", "/en/api/super/categories/:id", h.handleDeleteCategory, "categories"],

  // Research Zone (research_items) -- see handlers.js section header
  // for why this is id-keyed and not registered in item-access.js.
  ["GET", "/en/api/super/research", h.handleListResearch, "research"],
  ["GET", "/en/api/super/research/:id", h.handleGetResearch, "research"],
  ["POST", "/en/api/super/research", h.handleCreateResearch, "research"],
  ["PUT", "/en/api/super/research/:id", h.handleUpdateResearch, "research"],
  ["DELETE", "/en/api/super/research/:id", h.handleDeleteResearch, "research"],

  ["GET", "/en/api/super/payment-methods", h.handleListPaymentMethods, "payment_methods"],
  ["GET", "/en/api/super/payment-methods/:id", h.handleGetPaymentMethod, "payment_methods"],
  ["POST", "/en/api/super/payment-methods", h.handleCreatePaymentMethod, "payment_methods"],
  ["PUT", "/en/api/super/payment-methods/:id", h.handleUpdatePaymentMethod, "payment_methods"],
  ["DELETE", "/en/api/super/payment-methods/:id", h.handleDeletePaymentMethod, "payment_methods"],

  // User Inquiries / Casino Submissions / Notifications -- see
  // handlers.js section header: no tenant-side RBAC exists for these
  // yet, this Super API layer is the first place they're gated at all.
  ["GET", "/en/api/super/inquiries", h.handleListInquiries, "inquiries"],
  ["POST", "/en/api/super/inquiries/:id/reply", h.handleReplyInquiry, "inquiries"],
  ["GET", "/en/api/super/submissions", h.handleListSubmissions, "submissions"],
  ["PUT", "/en/api/super/submissions/:id", h.handleUpdateSubmissionStatus, "submissions"],
  ["POST", "/en/api/super/notifications", h.handleSendNotification, "notifications"],

  // Newsletter Subscribers -- list/add only, see handlers.js section
  // header for why sending an actual campaign is deliberately not here.
  ["GET", "/en/api/super/newsletter-subscribers", h.handleListSubscribers, "newsletter"],
  ["POST", "/en/api/super/newsletter-subscribers", h.handleAddSubscriber, "newsletter"],
  ["DELETE", "/en/api/super/newsletter-subscribers/:id", h.handleUnsubscribeSubscriber, "newsletter"],

  ["GET", "/en/api/super/seo", h.handleListSeoMeta, "seo"],
  ["GET", "/en/api/super/seo/lookup", h.handleGetSeoMeta, "seo"],
  ["POST", "/en/api/super/seo", h.handleSaveSeoMeta, "seo"],
  ["DELETE", "/en/api/super/seo", h.handleDeleteSeoMeta, "seo"],

  ["GET", "/en/api/super/countries", h.handleListCountries, "countries"],
  ["GET", "/en/api/super/countries/:id", h.handleGetCountry, "countries"],
  ["POST", "/en/api/super/countries", h.handleCreateCountry, "countries"],
  ["PUT", "/en/api/super/countries/:id", h.handleUpdateCountry, "countries"],
  ["DELETE", "/en/api/super/countries/:id", h.handleDeleteCountry, "countries"],

  ["GET", "/en/api/super/authors", h.handleListAuthors, "authors"],
  ["GET", "/en/api/super/authors/:id", h.handleGetAuthor, "authors"],
  ["POST", "/en/api/super/authors", h.handleCreateAuthor, "authors"],
  ["PUT", "/en/api/super/authors/:id", h.handleUpdateAuthor, "authors"],
  ["DELETE", "/en/api/super/authors/:id", h.handleDeleteAuthor, "authors"],

  ["GET", "/en/api/super/media", h.handleListMedia, "media"],
  ["GET", "/en/api/super/media/folders", h.handleListMediaFolders, "media"],
  ["GET", "/en/api/super/media/:id", h.handleGetMedia, "media"],
  ["POST", "/en/api/super/media/upload", h.handleUploadMedia, "media"],
  ["POST", "/en/api/super/media/from-url", h.handleCreateMediaFromUrl, "media"],
  ["PUT", "/en/api/super/media/:id", h.handleUpdateMedia, "media"],
  ["DELETE", "/en/api/super/media/:id", h.handleDeleteMedia, "media"],

  ["GET", "/en/api/super/settings", h.handleListSettings, "settings"],
  ["PUT", "/en/api/super/settings", h.handleUpdateSettings, "settings"],

  ["GET", "/en/api/super/users", h.handleListUsers, "users"],
  ["GET", "/en/api/super/users/:id", h.handleGetUser, "users"],
  ["PUT", "/en/api/super/users/:id/role", h.handleUpdateUserRole, "users"],
  ["DELETE", "/en/api/super/users/:id", h.handleDeleteUser, "users"],

  ["GET", "/en/api/super/components", h.handleListComponents, "components"],
  ["GET", "/en/api/super/components/:id", h.handleGetComponent, "components"],
  ["POST", "/en/api/super/components", h.handleCreateComponent, "components"],
  ["PUT", "/en/api/super/components/:id", h.handleUpdateComponent, "components"],
  ["DELETE", "/en/api/super/components/:id", h.handleDeleteComponent, "components"],

  ["GET", "/en/api/super/blocks", h.handleListBlocks, "page_components"],
  ["GET", "/en/api/super/blocks/:id", h.handleGetBlock, "page_components"],
  ["POST", "/en/api/super/blocks", h.handleCreateBlock, "page_components"],
  ["PUT", "/en/api/super/blocks/:id", h.handleUpdateBlock, "page_components"],
  ["DELETE", "/en/api/super/blocks/:id", h.handleDeleteBlock, "page_components"],

  // Permissions is a role/resource/action matrix, not an id-keyed
  // list of records — GET returns the whole matrix, PUT sets one
  // cell (body: {role, resource, action, allowed}), DELETE removes
  // one row by its numeric id.
  ["GET", "/en/api/super/permissions", h.handleListPermissions, "permissions"],
  ["PUT", "/en/api/super/permissions", h.handleSetPermission, "permissions"],
  ["DELETE", "/en/api/super/permissions/:id", h.handleDeletePermission, "permissions"],

  // Item-level access — per-user scope (none/own/all/assigned) on
  // top of the role permissions above. "defaults" is a literal
  // segment checked before the dynamic :id routes below, so a
  // numeric user id never collides with it.
  ["GET", "/en/api/super/item-access/defaults", h.handleGetItemAccessDefaults, "item_access"],
  ["PUT", "/en/api/super/item-access/defaults", h.handleSetItemAccessDefaultScope, "item_access"],
  ["GET", "/en/api/super/item-access/:id", h.handleGetUserItemAccess, "item_access"],
  ["PUT", "/en/api/super/item-access/:id", h.handleSetUserItemAccess, "item_access"],
  ["PUT", "/en/api/super/item-access/:id/assignment", h.handleSetItemAssignment, "item_access"],

  ["GET", "/en/api/super/review-blocks", h.handleListReviewBlocks, "review_blocks"],
  ["POST", "/en/api/super/review-blocks", h.handleCreateReviewBlock, "review_blocks"],
  ["PUT", "/en/api/super/review-blocks/:id", h.handleUpdateReviewBlock, "review_blocks"],
  ["DELETE", "/en/api/super/review-blocks/:id", h.handleDeleteReviewBlock, "review_blocks"],

  ["GET", "/en/api/super/ad-rules", h.handleListAdRules, "ad_rules"],
  ["POST", "/en/api/super/ad-rules", h.handleCreateAdRule, "ad_rules"],
  ["PUT", "/en/api/super/ad-rules/:id", h.handleUpdateAdRule, "ad_rules"],
  ["DELETE", "/en/api/super/ad-rules/:id", h.handleDeleteAdRule, "ad_rules"],

  ["GET", "/en/api/super/nav-items", h.handleListNavItems, "nav_items"],
  ["GET", "/en/api/super/nav-items/:id", h.handleGetNavItem, "nav_items"],
  ["POST", "/en/api/super/nav-items", h.handleCreateNavItem, "nav_items"],
  ["PUT", "/en/api/super/nav-items/:id", h.handleUpdateNavItem, "nav_items"],
  ["DELETE", "/en/api/super/nav-items/:id", h.handleDeleteNavItem, "nav_items"],

  ["GET", "/en/api/super/banners", h.handleListBanners, "banners"],
  ["GET", "/en/api/super/banners/:id", h.handleGetBanner, "banners"],
  ["POST", "/en/api/super/banners", h.handleCreateBanner, "banners"],
  ["PUT", "/en/api/super/banners/:id", h.handleUpdateBanner, "banners"],
  ["DELETE", "/en/api/super/banners/:id", h.handleDeleteBanner, "banners"],

  ["GET", "/en/api/super/updates", h.handleListPlatformUpdates, "updates"],
  ["GET", "/en/api/super/updates/:id", h.handleGetPlatformUpdate, "updates"],
  ["POST", "/en/api/super/updates", h.handleCreatePlatformUpdate, "updates"],
  ["PUT", "/en/api/super/updates/:id", h.handleUpdatePlatformUpdate, "updates"],
  ["DELETE", "/en/api/super/updates/:id", h.handleDeletePlatformUpdate, "updates"],

  // SEO landing pages (country_custom / category_country). Literal
  // segments ("discover", "countries-search", "eligible-casinos")
  // are listed before the dynamic :id route so a numeric id never
  // collides with them.
  ["GET", "/en/api/super/seo-pages-discover", h.handleDiscoverCategoryCountryCombos, "seo_pages"],
  ["GET", "/en/api/super/seo-pages-countries-search", h.handleSearchCountriesForSeoPages, "seo_pages"],
  ["GET", "/en/api/super/seo-pages-eligible-casinos", h.handleGetEligibleCasinosForSeoPage, "seo_pages"],
  // Base category hub pages have no country context (unlike
  // seo-pages' category_country combo pages) — this returns every
  // casino already in the category, matching what the category
  // page's own automatic grid shows.
  ["GET", "/en/api/super/category-eligible-casinos", h.handleGetEligibleCasinosForCategory, "categories"],
  ["GET", "/en/api/super/seo-pages", h.handleListSeoPages, "seo_pages"],
  ["GET", "/en/api/super/seo-pages/:id", h.handleGetSeoPage, "seo_pages"],
  ["POST", "/en/api/super/seo-pages", h.handleCreateSeoPage, "seo_pages"],
  ["PUT", "/en/api/super/seo-pages/:id", h.handleUpdateSeoPage, "seo_pages"],
  ["DELETE", "/en/api/super/seo-pages/:id", h.handleDeleteSeoPage, "seo_pages"],
];
