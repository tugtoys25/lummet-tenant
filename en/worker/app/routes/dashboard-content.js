// Dashboard pages for content: casinos, content items, custom types, comparisons, landing pages, reviews, news, updates, settings, AI, research.
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { renderDashboardAI, renderDashboardAiStudio, renderDashboardCasinoCreate, renderDashboardCasinos, renderDashboardCategories, renderDashboardCategoryCountries, renderDashboardComparisonCreate, renderDashboardComparisonEdit, renderDashboardComparisons, renderDashboardContentItemCreate, renderDashboardContentItemEdit, renderDashboardContentItems, renderDashboardContentLandingPageCreate, renderDashboardContentLandingPageEdit, renderDashboardContentLandingPages, renderDashboardContentTypeSettings, renderDashboardCountries, renderDashboardCountryPages, renderDashboardCustomTypeCreate, renderDashboardCustomTypeEdit, renderDashboardCustomTypes, renderDashboardGenericReviewCreate, renderDashboardGenericReviewEdit, renderDashboardGenericReviews, renderDashboardHeaderHero, renderDashboardNews, renderDashboardNewsroom, renderDashboardPages, renderDashboardPaymentMethods, renderDashboardResearch, renderDashboardResearchDatasets, renderDashboardResearchReviewQueue, renderDashboardReviews, renderDashboardSettings, renderDashboardUpdates, renderNewsTaxonomyPage } from "../../controllers.js";

export async function handleDashboardContent(route, request, env, ctx, url) {
  switch (route.type) {

      case "dashboardCasinos":
        return renderDashboardCasinos(request, env);

      case "dashboardCasinoCreate":
        return renderDashboardCasinoCreate(request, env);

      case "dashboardContentItems":
        return renderDashboardContentItems(request, env);

      case "dashboardContentItemCreate":
        return renderDashboardContentItemCreate(request, env);

      case "dashboardCustomTypes":
        return renderDashboardCustomTypes(request, env);

      case "dashboardCustomTypeCreate":
        return renderDashboardCustomTypeCreate(request, env);

      case "dashboardComparisons":
        return renderDashboardComparisons(request, env);

      case "dashboardComparisonCreate":
        return renderDashboardComparisonCreate(request, env);

      case "dashboardContentItemEdit":
        return renderDashboardContentItemEdit(request, env, route.contentType, route.slug);

      case "dashboardCustomTypeEdit":
        return renderDashboardCustomTypeEdit(request, env, route.typeSlug);

      case "dashboardComparisonEdit":
        return renderDashboardComparisonEdit(request, env, route.compareType, route.slug);

      case "dashboardGenericReviewEdit":
        return renderDashboardGenericReviewEdit(request, env, route.id);

      case "dashboardContentLandingPages":
        return renderDashboardContentLandingPages(request, env);

      case "dashboardContentLandingPageCreate":
        return renderDashboardContentLandingPageCreate(request, env);

      case "dashboardContentLandingPageEdit":
        return renderDashboardContentLandingPageEdit(request, env, route.slug);

      case "dashboardContentTypeSettings":
        return renderDashboardContentTypeSettings(request, env);

      case "dashboardGenericReviews":
        return renderDashboardGenericReviews(request, env);

      case "dashboardGenericReviewCreate":
        return renderDashboardGenericReviewCreate(request, env);

      case "dashboardReviews":
        return renderDashboardReviews(request, env);

      case "dashboardNews":
        return renderDashboardNews(request, env);

      case "dashboardNewsroom":
        return renderDashboardNewsroom(request, env);

      case "newsTaxonomy":
        {
        let taxSlug = route.slug;
        try { taxSlug = decodeURIComponent(route.slug); } catch { /* malformed escape: use the raw slug (will simply not match) */ }
        return renderNewsTaxonomyPage(request, env, route.kind, taxSlug);
      }

      case "dashboardUpdates":
        return renderDashboardUpdates(request, env);

      case "dashboardCountryPages":
        return renderDashboardCountryPages(request, env);

      case "dashboardCategoryCountries":
        return renderDashboardCategoryCountries(request, env);

      case "dashboardPages":
        return renderDashboardPages(request, env);

      case "dashboardSettings":
        return renderDashboardSettings(request, env);

      case "dashboardHeaderHero":
        return renderDashboardHeaderHero(request, env);

      case "dashboardAI":
        return renderDashboardAI(request, env);

      case "dashboardAiStudio":
        return renderDashboardAiStudio(request, env);

      case "dashboardCategories":
        return renderDashboardCategories(request, env);

      case "dashboardPaymentMethods":
        return renderDashboardPaymentMethods(request, env);

      case "dashboardCountries":
        return renderDashboardCountries(request, env);

      case "dashboardResearch":
        return renderDashboardResearch(request, env);

      case "dashboardResearchReviewQueue":
        return renderDashboardResearchReviewQueue(request, env);

      case "dashboardResearchDatasets":
        return renderDashboardResearchDatasets(request, env);

      default:
        return NOT_HANDLED;
  }
}
