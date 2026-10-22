// =====================================================
// SUPER API — HANDLERS (Systems 1-3: Affiliate Partner/Program
// Management, Offer & Bonus Management, Tracking Link Management)
//
// Same convention as handlers.js: thin wrappers around the tenant's
// existing worker/database/*.js modules. No business logic is
// duplicated here — every mutation calls the same function the
// normal dashboard/API (worker/api.js) already uses. Kept in a
// separate file from handlers.js purely for size; router.js imports
// both under separate namespaces.
// =====================================================

// The code lives in handlers-affiliate/*.js (see docs/ARCHITECTURE_HANDLERS_AFFILIATE.md); this file keeps the public import path.
export { handleListPartners, handleGetPartner, handleCreatePartner, handleUpdatePartner, handleDeletePartner, handleListPrograms, handleGetProgram, handleCreateProgram, handleUpdateProgram, handleDeleteProgram, handleListAccounts, handleGetAccount, handleCreateAccount, handleUpdateAccount, handleDeleteAccount } from "./handlers-affiliate/partners.js";
export { handleListTerms, handleGetTerm, handleCreateTerm, handleUpdateTerm, handleListOffers, handleGetOffer, handleCreateOffer, handleUpdateOffer, handleListTrackingLinks, handleGetTrackingLink, handleCreateTrackingLink, handleUpdateTrackingLink } from "./handlers-affiliate/commercial.js";
export { handleListPostbackConfigs, handleGetPostbackConfig, handleCreatePostbackConfig, handleUpdatePostbackConfig, handleRotatePostbackToken, handleArchivePostbackConfig, handleListProviderAdapters, handleGetProviderAdapter, handleCreateProviderAdapter, handleUpdateProviderAdapter, handleArchiveProviderAdapter, handleListImportBatches, handleGetImportBatch } from "./handlers-affiliate/integrations.js";
