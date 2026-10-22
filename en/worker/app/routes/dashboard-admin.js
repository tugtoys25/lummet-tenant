// Authors, the rest of the dashboard (media, navigation, users, tracking, affiliate, analytics, SEO) and the signed-in user area.
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { renderAuthor, renderAuthorList, renderDashboardAffiliateAccounts, renderDashboardAffiliatePartners, renderDashboardAffiliatePrograms, renderDashboardAnalytics, renderDashboardAuthors, renderDashboardBanners, renderDashboardCampaigns, renderDashboardCasinoEdit, renderDashboardCommercialTerms, renderDashboardComponents, renderDashboardEmails, renderDashboardGeoRules, renderDashboardImportHistory, renderDashboardInquiries, renderDashboardItemAccess, renderDashboardMedia, renderDashboardNav, renderDashboardNotifications, renderDashboardOffers, renderDashboardPermissions, renderDashboardPostbackConfigs, renderDashboardProviderAdapters, renderDashboardReports, renderDashboardSeo, renderDashboardSpeed, renderDashboardSubmissions, renderDashboardSubscriptions, renderDashboardTrackingLinks, renderDashboardUsers, renderUserBookmarks, renderUserDashboard, renderUserInquiries, renderUserNotifications, renderUserProfile, renderUserSubmitCasino } from "../../controllers.js";

export async function handleDashboardAdmin(route, request, env, ctx, url) {
  switch (route.type) {

      case "authorList":
        return renderAuthorList(request, env);

      case "author":
        return renderAuthor(request, env, route.slug);

      case "dashboardAuthors":
        return renderDashboardAuthors(request, env);

      case "dashboardMedia":
        return renderDashboardMedia(request, env);

      case "dashboardNav":
        return renderDashboardNav(request, env);

      case "dashboardPermissions":
        return renderDashboardPermissions(request, env);

      case "dashboardItemAccess":
        return renderDashboardItemAccess(request, env);

      case "dashboardUsers":
        return renderDashboardUsers(request, env);

      case "dashboardSubscriptions":
        return renderDashboardSubscriptions(request, env);

      case "dashboardEmails":
        return renderDashboardEmails(request, env);

      case "dashboardInquiries":
        return renderDashboardInquiries(request, env);

      case "dashboardSubmissions":
        return renderDashboardSubmissions(request, env);

      case "dashboardNotifications":
        return renderDashboardNotifications(request, env);

      case "dashboardBanners":
        return renderDashboardBanners(request, env);

      case "dashboardAffiliatePartners":
        return renderDashboardAffiliatePartners(request, env);

      case "dashboardAffiliatePrograms":
        return renderDashboardAffiliatePrograms(request, env);

      case "dashboardAffiliateAccounts":
        return renderDashboardAffiliateAccounts(request, env);

      case "dashboardCommercialTerms":
        return renderDashboardCommercialTerms(request, env);

      case "dashboardPostbackConfigs":
        return renderDashboardPostbackConfigs(request, env);

      case "dashboardSpeed":
        return renderDashboardSpeed(request, env);

      case "dashboardImportHistory":
        return renderDashboardImportHistory(request, env);

      case "dashboardProviderAdapters":
        return renderDashboardProviderAdapters(request, env);

      case "dashboardOffers":
        return renderDashboardOffers(request, env);

      case "dashboardTrackingLinks":
        return renderDashboardTrackingLinks(request, env);

      case "dashboardAnalytics":
        return renderDashboardAnalytics(request, env);

      case "dashboardCampaigns":
        return renderDashboardCampaigns(request, env);

      case "dashboardReports":
        return renderDashboardReports(request, env);

      case "dashboardGeoRules":
        return renderDashboardGeoRules(request, env, route.section);

      case "dashboardCasinoEdit":
        return renderDashboardCasinoEdit(request, env, route.slug);

      case "dashboardComponents":
        return renderDashboardComponents(request, env);

      case "dashboardSeo":
        return renderDashboardSeo(request, env);

      case "userDashboard":
        return renderUserDashboard(request, env);

      case "userSubmitCasino":
        return renderUserSubmitCasino(request, env);

      case "userInquiries":
        return renderUserInquiries(request, env);

      case "userProfile":
        return renderUserProfile(request, env);

      case "userNotifications":
        return renderUserNotifications(request, env);

      case "userBookmarks":
        return renderUserBookmarks(request, env);

      default:
        return NOT_HANDLED;
  }
}
