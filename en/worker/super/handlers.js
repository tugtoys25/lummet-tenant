// =====================================================
// SUPER API — HANDLERS
// Thin wrappers around the tenant's existing
// worker/database/*.js modules. No business logic is
// duplicated here — every mutation calls the same
// function the normal dashboard/API already uses.
// =====================================================

// The code lives in handlers/*.js (see docs/ARCHITECTURE_SUPER_HANDLERS.md); this file keeps the public import path.
export { handleHandshake, handleHealth, handleCapabilities } from "./handlers/system.js";
export { handleListCasinos, handleGetCasino, handleCreateCasino, handleUpdateCasino, handleDeleteCasino } from "./handlers/casinos.js";
export { handleListReviews, handleGetReview, handleCreateReview, handleUpdateReview, handleDeleteReview, handleListNews, handleGetNews, handleCreateNews, handleUpdateNews, handleDeleteNews } from "./handlers/reviews-news.js";
export { handleListPages, handleGetPage, handleCreatePage, handleUpdatePage, handleDeletePage, handleListCategories, handleGetCategory, handleCreateCategory, handleUpdateCategory, handleDeleteCategory } from "./handlers/pages-categories.js";
export { handleListResearch, handleGetResearch, handleCreateResearch, handleUpdateResearch, handleDeleteResearch } from "./handlers/research.js";
export { handleListPaymentMethods, handleGetPaymentMethod, handleCreatePaymentMethod, handleUpdatePaymentMethod, handleDeletePaymentMethod, handleListSeoMeta, handleGetSeoMeta, handleSaveSeoMeta, handleDeleteSeoMeta } from "./handlers/payments-seo-meta.js";
export { handleListCountries, handleGetCountry, handleCreateCountry, handleUpdateCountry, handleDeleteCountry, handleListAuthors, handleGetAuthor, handleCreateAuthor, handleUpdateAuthor, handleDeleteAuthor } from "./handlers/countries-authors.js";
export { handleListMedia, handleListMediaFolders, handleCreateMediaFromUrl, handleGetMedia, handleUpdateMedia, handleDeleteMedia, handleUploadMedia } from "./handlers/media.js";
export { handleListSettings, handleUpdateSettings, handleListUsers, handleGetUser, handleUpdateUserRole, handleDeleteUser } from "./handlers/settings-users.js";
export { handleListComponents, handleGetComponent, handleCreateComponent, handleUpdateComponent, handleDeleteComponent, handleListBlocks, handleGetBlock, handleCreateBlock, handleUpdateBlock, handleDeleteBlock } from "./handlers/components-blocks.js";
export { handleListPermissions, handleSetPermission, handleDeletePermission, handleGetUserItemAccess, handleSetUserItemAccess, handleSetItemAssignment, handleGetItemAccessDefaults, handleSetItemAccessDefaultScope } from "./handlers/permissions-access.js";
export { handleListReviewBlocks, handleCreateReviewBlock, handleUpdateReviewBlock, handleDeleteReviewBlock, handleListAdRules, handleCreateAdRule, handleUpdateAdRule, handleDeleteAdRule } from "./handlers/review-blocks-ad-rules.js";
export { handleListNavItems, handleGetNavItem, handleCreateNavItem, handleUpdateNavItem, handleDeleteNavItem, handleListBanners, handleGetBanner, handleCreateBanner, handleUpdateBanner, handleDeleteBanner } from "./handlers/nav-banners.js";
export { handleListPlatformUpdates, handleGetPlatformUpdate, handleCreatePlatformUpdate, handleUpdatePlatformUpdate, handleDeletePlatformUpdate } from "./handlers/platform-updates.js";
export { handleListSeoPages, handleGetSeoPage, handleCreateSeoPage, handleUpdateSeoPage, handleDeleteSeoPage, handleSearchCountriesForSeoPages, handleGetEligibleCasinosForSeoPage, handleGetEligibleCasinosForCategory, handleDiscoverCategoryCountryCombos } from "./handlers/seo-pages.js";
export { handleListInquiries, handleReplyInquiry, handleListSubmissions, handleUpdateSubmissionStatus, handleSendNotification, handleListSubscribers, handleAddSubscriber, handleUnsubscribeSubscriber } from "./handlers/inbox-subscribers.js";
