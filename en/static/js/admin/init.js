// =====================================================
// ADMIN: REVIEWS, NEWS, PAGES, SETTINGS, AI
// Handles all admin sub-pages beyond dashboard + casinos
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadReviewsTable();
  loadNewsTable();
  loadPagesTable();
  loadSettingsForm();
  initReviewForm();
  initNewsForm();
  initPageForm();
  initSettingsForm();
  initAIGenerator();
  loadCategoriesTable();
  initCategoryForm();
  loadCountriesTable();
  initCountryForm();
  loadPaymentMethodsTable();
  initPaymentMethodForm();
  loadResearchTable();
  initResearchForm();
  loadSourcesTable();
  initSourceForm();
  initResearchClaimForm();
  initResearchRelationForm();
  loadReviewQueueSummary();
  loadDatasetsTable();
  initDatasetForm();
});

