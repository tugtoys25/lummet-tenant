// Super API routes: Affiliate partners, programs, accounts, terms, offers, tracking links, postbacks, adapters, import batches.
// Each entry: [METHOD, path-pattern, handler, resource-name]. Order matters (first match wins);
// router.js joins the groups in the order the table always had.
import * as ah from "../handlers-affiliate.js";

export const AFFILIATE_ROUTES = [
  // Affiliate Partner & Program Management (System 1)
  ["GET", "/en/api/super/affiliate-partners", ah.handleListPartners, "affiliate_partners"],
  ["GET", "/en/api/super/affiliate-partners/:id", ah.handleGetPartner, "affiliate_partners"],
  ["POST", "/en/api/super/affiliate-partners", ah.handleCreatePartner, "affiliate_partners"],
  ["PUT", "/en/api/super/affiliate-partners/:id", ah.handleUpdatePartner, "affiliate_partners"],
  ["DELETE", "/en/api/super/affiliate-partners/:id", ah.handleDeletePartner, "affiliate_partners"],

  ["GET", "/en/api/super/affiliate-programs", ah.handleListPrograms, "affiliate_programs"],
  ["GET", "/en/api/super/affiliate-programs/:id", ah.handleGetProgram, "affiliate_programs"],
  ["POST", "/en/api/super/affiliate-programs", ah.handleCreateProgram, "affiliate_programs"],
  ["PUT", "/en/api/super/affiliate-programs/:id", ah.handleUpdateProgram, "affiliate_programs"],
  ["DELETE", "/en/api/super/affiliate-programs/:id", ah.handleDeleteProgram, "affiliate_programs"],

  ["GET", "/en/api/super/affiliate-accounts", ah.handleListAccounts, "affiliate_accounts"],
  ["GET", "/en/api/super/affiliate-accounts/:id", ah.handleGetAccount, "affiliate_accounts"],
  ["POST", "/en/api/super/affiliate-accounts", ah.handleCreateAccount, "affiliate_accounts"],
  ["PUT", "/en/api/super/affiliate-accounts/:id", ah.handleUpdateAccount, "affiliate_accounts"],
  ["DELETE", "/en/api/super/affiliate-accounts/:id", ah.handleDeleteAccount, "affiliate_accounts"],

  // Commercial Terms -- read + create only; see handlers-affiliate.js
  // header comment for why PUT deliberately rejects rather than
  // silently no-op'ing or corrupting the versioned history.
  ["GET", "/en/api/super/commercial-terms", ah.handleListTerms, "commercial_terms"],
  ["GET", "/en/api/super/commercial-terms/:id", ah.handleGetTerm, "commercial_terms"],
  ["POST", "/en/api/super/commercial-terms", ah.handleCreateTerm, "commercial_terms"],
  ["PUT", "/en/api/super/commercial-terms/:id", ah.handleUpdateTerm, "commercial_terms"],

  // Offers (System 2) -- no DELETE by design, see migration 0024.
  ["GET", "/en/api/super/offers", ah.handleListOffers, "offers"],
  ["GET", "/en/api/super/offers/:id", ah.handleGetOffer, "offers"],
  ["POST", "/en/api/super/offers", ah.handleCreateOffer, "offers"],
  ["PUT", "/en/api/super/offers/:id", ah.handleUpdateOffer, "offers"],

  // Tracking Links (System 3) -- no DELETE by design, see migration 0025.
  ["GET", "/en/api/super/tracking-links", ah.handleListTrackingLinks, "tracking_links"],
  ["GET", "/en/api/super/tracking-links/:id", ah.handleGetTrackingLink, "tracking_links"],
  ["POST", "/en/api/super/tracking-links", ah.handleCreateTrackingLink, "tracking_links"],
  ["PUT", "/en/api/super/tracking-links/:id", ah.handleUpdateTrackingLink, "tracking_links"],

  // Postback Configs -- deliberately admin-only, no editor permission
  // rows on the tenant itself (migration 0033). See handlers-affiliate.js
  // section header for why this stays on the same trusted-credential
  // Super API model anyway, gated super-admin-only on the control
  // plane's own side instead.
  ["GET", "/en/api/super/postback-configs", ah.handleListPostbackConfigs, "postback_configs"],
  ["GET", "/en/api/super/postback-configs/:id", ah.handleGetPostbackConfig, "postback_configs"],
  ["POST", "/en/api/super/postback-configs", ah.handleCreatePostbackConfig, "postback_configs"],
  ["PUT", "/en/api/super/postback-configs/:id", ah.handleUpdatePostbackConfig, "postback_configs"],
  ["POST", "/en/api/super/postback-configs/:id/rotate-token", ah.handleRotatePostbackToken, "postback_configs"],
  ["DELETE", "/en/api/super/postback-configs/:id", ah.handleArchivePostbackConfig, "postback_configs"],

  // Provider Adapter Configs -- same no-editor-rows treatment, see
  // migration 0035.
  ["GET", "/en/api/super/provider-adapters", ah.handleListProviderAdapters, "provider_adapter_configs"],
  ["GET", "/en/api/super/provider-adapters/:id", ah.handleGetProviderAdapter, "provider_adapter_configs"],
  ["POST", "/en/api/super/provider-adapters", ah.handleCreateProviderAdapter, "provider_adapter_configs"],
  ["PUT", "/en/api/super/provider-adapters/:id", ah.handleUpdateProviderAdapter, "provider_adapter_configs"],
  ["DELETE", "/en/api/super/provider-adapters/:id", ah.handleArchiveProviderAdapter, "provider_adapter_configs"],

  // Import Batches -- read-only history, see handlers-affiliate.js
  // section header for why there's no create route.
  ["GET", "/en/api/super/import-batches", ah.handleListImportBatches, "import_batches"],
  ["GET", "/en/api/super/import-batches/:id", ah.handleGetImportBatch, "import_batches"],
];
