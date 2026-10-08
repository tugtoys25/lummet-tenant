import { getRoute }
from "./routes.js";
import { serveMedia } from './media-upload.js';
import { isContentTypeEnabled } from './content-types.js';
import { handleSuperApi } from "./super/router.js";
import {
  renderHome,
  renderAuthor,
  renderAuthorList,
  renderDashboardAuthors,
  renderNews,
  renderCasino,
  renderSportsbook,
  renderSportsbookList,
  renderAffiliatePartner,
  renderAffiliatePartnerList,
  renderCustom,
  renderCustomList,
  renderGenericReview,
  renderComparison,
  renderComparisonList,
  renderReview,
  renderCountry,
  renderCountryCustomPage,
  renderResearchHub,
  renderResearchTypeList,
  renderResearchItem,
  renderDashboardResearch,
  renderDashboardResearchReviewQueue,
  renderDashboardResearchDatasets,
  renderCategory,
  renderCategoryCountryPage,
  renderAffiliate,
  renderDashboardPage,
  renderCasinoList,
  renderReviewList,
  renderNewsList,
  renderUpdatesList,
  renderUpdate,
  renderDashboardComponents,
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
  renderDashboardProviderAdapters,
  renderDashboardOffers,
  renderDashboardTrackingLinks,
  renderDashboardAnalytics,
  renderDashboardCampaigns,
  renderDashboardReports,
  renderDashboardSeo,
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
  renderNewsTaxonomyPage,
  renderDashboardUpdates,
  renderDashboardCountryPages,
  renderDashboardCategoryCountries,
  renderDashboardPages,
  renderDashboardSettings,
  renderDashboardHeaderHero,
  renderDashboardAI,
  renderCategoryList,
  renderPaymentMethodList,
  renderPaymentMethod,
  renderCountryList,
  renderDashboardCategories,
  renderDashboardPaymentMethods,
  renderDashboardCountries,
  renderDashboardCasinoEdit,
  dashboardStatsAPI,

  renderUserDashboard,
  renderUserSubmitCasino,
  renderUserInquiries,
  renderUserProfile,
  renderUserNotifications,
  renderUserBookmarks,
  renderDynamicPage,
  handleAffiliateRedirect,
  renderContentLandingPage,
  handleContentTrackedRedirect,
  renderLogin,
  renderRegister,
  renderForgotPassword,
  renderResetPassword,
  robots,
  render404,
  renderSitemapPage
}
from "./controllers.js";

import {
  handleAPI
}
from "./api.js";

import {
  sitemapEngine
}
from "./sitemap.js";
import {
  getCurrentUser
}
from "./auth.js";
import { cleanupExpiredSessions, runAnalyticsAggregation, runScheduledReports, runAlertEvaluation, runProviderSync, runWeeklyDigest } from "./cron.js";
import { runScheduledHealthChecks } from "./tracking/health-check.js";
import { runScheduledResearchSourceHealthChecks } from "./research/source-health.js";

import { cleanupExpiredConversations } from "./ai/memory.js";

import { handleLummetRequest } from "./lummet/router.js";
import { getSiteContext } from "./site-context.js";
import { confirmNewsletter, unsubscribeNewsletter } from "./newsletter.js";

const appWorker = {

  async fetch(request, env, ctx) {

    const url = new URL(request.url);

    // ── Check if this is the Lummet subdomain ──
    // ── Check if this is the tenant's Lummet subdomain ──
    if (url.hostname.startsWith("lummet.")) {
      const lummetResponse = await handleLummetRequest(request, env, ctx);

      if (lummetResponse) {
        return lummetResponse;
      }
    }


    // ==========================================================
// HOST-AWARE PWA MANIFEST
// ==========================================================

if (
  request.method === "GET" &&
  url.pathname === "/site.webmanifest"
) {
  const site = await getSiteContext(
    request,
    env
  );

  const { buildSiteManifest } =
    await import("./site-settings.js");

  const manifest =
    buildSiteManifest(
      site,
      site.origin
    );

  return new Response(
    JSON.stringify(
      manifest,
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "content-type":
          "application/manifest+json; charset=utf-8",

        "cache-control":
          "public, max-age=300"
      }
    }
  );
}


    // Serve static assets
    if (
      url.pathname.startsWith("/static/")
    ) {
      return env.ASSETS.fetch(request);
    }

    const route = getRoute(request);

    switch (route.type) {

      case "home":
        return renderHome(request, env, ctx);
      case "login":
  return renderLogin(
    request,
    env
  );
      case "register":
  return renderRegister(
    request,
    env
  );
      case "forgotPassword":
  return renderForgotPassword(
    request,
    env
  );
      case "resetPassword":
  return renderResetPassword(
    request,
    env
  );
      case "newsletterConfirm":
  return confirmNewsletter(
    request,
    env
  );
      case "newsletterUnsubscribe":
  return unsubscribeNewsletter(
    request,
    env
  );



      case "casino":
        return renderCasino(
          request,
          env,
          route.slug,
          ctx
        );

      case "sportsbook":
        // Content-type enablement check (Phase 2 report §8) — a
        // single gate here, before the controller is ever reached,
        // rather than duplicated inside renderSportsbook itself.
        if (!(await isContentTypeEnabled(env, "sportsbook"))) {
          return render404(request, env);
        }
        return renderSportsbook(
          request,
          env,
          route.slug,
          ctx
        );

      case "sportsbookList":
        if (!(await isContentTypeEnabled(env, "sportsbook"))) {
          return render404(request, env);
        }
        return renderSportsbookList(request, env);

      case "affiliatePartner":
        if (!(await isContentTypeEnabled(env, "affiliate_partner"))) {
          return render404(request, env);
        }
        return renderAffiliatePartner(
          request,
          env,
          route.slug,
          ctx
        );

      case "affiliatePartnerList":
        if (!(await isContentTypeEnabled(env, "affiliate_partner"))) {
          return render404(request, env);
        }
        return renderAffiliatePartnerList(request, env);

      case "custom":
        // Two-level gate: the 'custom' content type must be enabled
        // for this environment AND the requested typeSlug must
        // resolve to a real custom_content_types row -- the second
        // check happens inside renderCustom() itself since typeSlug
        // is admin-defined data, not something this switch can
        // validate cheaply.
        if (!(await isContentTypeEnabled(env, "custom"))) {
          return render404(request, env);
        }
        return renderCustom(
          request,
          env,
          route.typeSlug,
          route.slug,
          ctx
        );

      case "customList":
        if (!(await isContentTypeEnabled(env, "custom"))) {
          return render404(request, env);
        }
        return renderCustomList(request, env, route.typeSlug);

      case "sportsbookReview":
        if (!(await isContentTypeEnabled(env, "sportsbook"))) {
          return render404(request, env);
        }
        return renderGenericReview(request, env, "sportsbook", route.slug, ctx);

      case "affiliatePartnerReview":
        if (!(await isContentTypeEnabled(env, "affiliate_partner"))) {
          return render404(request, env);
        }
        return renderGenericReview(request, env, "affiliate_partner", route.slug, ctx);

      case "customReview":
        if (!(await isContentTypeEnabled(env, "custom"))) {
          return render404(request, env);
        }
        return renderGenericReview(request, env, "custom", route.slug, ctx, route.typeSlug);

      case "comparison": {
        const knownCompareTypes = new Set(["casino", "sportsbook", "affiliate_partner", "custom"]);
        if (!knownCompareTypes.has(route.compareType) || !(await isContentTypeEnabled(env, route.compareType))) {
          return render404(request, env);
        }
        return renderComparison(request, env, route.compareType, route.slug, ctx);
      }

      case "comparisonList": {
        const knownCompareTypes = new Set(["casino", "sportsbook", "affiliate_partner", "custom"]);
        if (!knownCompareTypes.has(route.compareType) || !(await isContentTypeEnabled(env, route.compareType))) {
          return render404(request, env);
        }
        return renderComparisonList(request, env, route.compareType);
      }

      case "review":
        return renderReview(
          request,
          env,
          route.slug,
          ctx
        );
      case "news":
        return renderNews(
          request,
          env,
          route.slug,
          ctx
        );

      case "country":
        return renderCountry(
          request,
          env,
          route.slug
        );

      case "countryCustomPage":
        return renderCountryCustomPage(
          request,
          env,
          route.countryCode,
          route.slug
        );

      case "researchHub":
        return renderResearchHub(request, env);

      case "researchTypeList":
        return renderResearchTypeList(request, env, route.researchType);

      case "researchItem":
        return renderResearchItem(
          request,
          env,
          route.researchType,
          route.slug
        );

      case "category":
        return renderCategory(
          request,
          env,
          route.slug
        );

      case "categoryCountryPage":
        return renderCategoryCountryPage(
          request,
          env,
          route.categorySlug,
          route.countryCode
        );

      case "affiliate":
        return renderAffiliate(
          request,
          env,
          route.slug
        );

      case "go":
        return handleAffiliateRedirect(
          request,
          env,
          route.slug,
          ctx
        );

      case "contentLandingPage":
        return renderContentLandingPage(request, env, route.slug);

      case "goContent":
        return handleContentTrackedRedirect(request, env, route.contentType, route.slug, ctx);

      case "dashboard":
        return renderDashboardPage(
          request,
          env
        );

      case "casinoList":
        return renderCasinoList(request, env);
      case "reviewList":
        return renderReviewList(request, env);
      case "newsList":
        return renderNewsList(request, env);


      case "updatesList":
        return renderUpdatesList(request, env);

      case "update":
        return renderUpdate(
          request,
          env,
          route.slug
        );

      case "categoryList":
        return renderCategoryList(request, env);
      case "countryList":
        return renderCountryList(request, env);
      case "paymentMethodList":
        return renderPaymentMethodList(request, env);
      case "paymentMethod":
        return renderPaymentMethod(request, env, route.slug);
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

      case "media":
        return serveMedia(request, env, route.key);
      case "favicon":
        return env.ASSETS.fetch(request);
      case "superApi":
        return handleSuperApi(request, env, ctx, route.path);
      case "api":

  const user =
    await getCurrentUser(
      request,
      env
    );

  return handleAPI(
    request,
    env,
    route.path,
    user
  );

      // REPLACE WITH:
      case "redirect":
        return new Response(null, { status: 302, headers: { Location: route.target } });
      case "sitemap":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "all"
  );

case "sitemap-page":
  return renderSitemapPage(request, env);

case "sitemap-index":
  return sitemapEngine.generateIndex(
    request,
    env,
    env.DB
  );

case "sitemap-casinos":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "casinos"
  );

case "sitemap-sportsbook":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "sportsbook"
  );

case "sitemap-affiliate-partner":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "affiliate-partner"
  );

case "sitemap-custom":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "custom"
  );

case "sitemap-comparisons":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "comparisons"
  );

case "sitemap-reviews":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "reviews"
  );

case "sitemap-news":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "news"
  );

case "sitemap-news-landing":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "news-landing"
  );

case "sitemap-google-news":
  return sitemapEngine.generateGoogleNews(request, env, env.DB);

case "sitemap-updates":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "updates"
  );

case "sitemap-authors":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "authors"
  );

case "sitemap-categories":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "categories"
  );

case "sitemap-countries":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "countries"
  );

case "sitemap-pages":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "pages"
  );

case "sitemap-seo-pages":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "seo-pages"
  );

case "sitemap-research":
  return sitemapEngine.generate(
    request,
    env,
    env.DB,
    "research"
  );

      case "robots":
        return robots(request, env);

      case "page":
        return renderDynamicPage(
          request,
          env,
          route.slug,
          ctx
        );
      case "not_found":
        return render404(request, env);

      default:
        return render404(request, env);

    }
  },
  async scheduled(event, env, ctx) {
        ctx.waitUntil(cleanupExpiredConversations(env.DB));

        ctx.waitUntil(
            cleanupExpiredSessions(env)
        );

        // Link health monitoring (System 3) -- runScheduledHealthChecks()
        // checks the system_settings feature flag itself and no-ops when
        // it's off (the default), so this call is always safe to leave
        // in place even before the flag is deliberately enabled for a
        // given deployment. See migrations/0025_tracking_links.sql and
        // worker/tracking/health-check.js for the full reasoning --
        // this does NOT get activated just by this wiring existing; it
        // also requires both this wrangler.jsonc's cron trigger to be
        // uncommented AND the system_settings row to be set to 'true'.
        ctx.waitUntil(
            runScheduledHealthChecks(env.DB).catch(() => {
                // Never let a health-check failure affect other scheduled tasks.
            })
        );

        // Research source URL health monitoring (Research Engine Phase 5)
        // -- same feature-flag convention as the tracking-link checks
        // above ('research_source_health_cron_enabled' in
        // system_settings, default off — see
        // migrations/0049_research_review_queue.sql). Reuses the same
        // generic checkTrackingLinkHealth() classifier from
        // worker/tracking/health-check.js rather than a second
        // implementation — see worker/research/source-health.js.
        ctx.waitUntil(
            runScheduledResearchSourceHealthChecks(env.DB).catch(() => {
                // Never let a source health-check failure affect other scheduled tasks.
            })
        );

        // Analytics daily aggregation (Phase 4) -- same feature-flag
        // convention as the health checks above ('analytics_aggregation_
        // cron_enabled' in system_settings, default off). Also always
        // safe to leave wired in: a disabled flag makes this a no-op.
        ctx.waitUntil(
            runAnalyticsAggregation(env).catch(() => {
                // Never let an aggregation failure affect other scheduled tasks.
            })
        );

        // Scheduled report execution (Phase 9) -- same feature-flag
        // convention ('report_schedules_cron_enabled', default off).
        ctx.waitUntil(
            runScheduledReports(env).catch(() => {
                // Never let a report-scheduling failure affect other scheduled tasks.
            })
        );

        // Alert-rule evaluation (Phase 13) -- same feature-flag
        // convention ('alert_rules_cron_enabled', default off).
        ctx.waitUntil(
            runAlertEvaluation(env).catch(() => {
                // Never let alert evaluation affect other scheduled tasks.
            })
        );

        // Outbound provider/API adapter sync (brief §10) -- same
        // feature-flag convention ('provider_sync_cron_enabled',
        // default off -- see migration 0035). Off until an operator
        // has actually configured a real provider_adapter_configs row
        // with real credentials.
        ctx.waitUntil(
            runProviderSync(env).catch(() => {
                // Never let a provider sync failure affect other scheduled tasks.
            })
        );

        // Weekly subscriber digest (this feature) -- same feature-flag
        // convention ('weekly_digest_cron_enabled', default off). Its
        // own internal 7-day cadence check means this is a safe no-op
        // to leave wired in even while the underlying trigger fires
        // every 6 hours -- see worker/cron.js runWeeklyDigest().
        ctx.waitUntil(
            runWeeklyDigest(env).catch(() => {
                // Never let a digest failure affect other scheduled tasks.
            })
        );

    }
};

// ==========================================================
// MAINTENANCE FALLBACK WRAPPER
// ==========================================================
// Any uncaught error from appWorker.fetch (D1 quota exhaustion,
// KV quota exhaustion, etc.) is caught here and turned into a
// static, inlined maintenance page instead of a raw 500. This
// page makes ZERO calls to D1/KV/R2/templates, so it renders
// correctly even while those services are rate-limited or down.
// Remove this wrapper (or just revert to exporting appWorker
// directly) once the underlying quota/outage issue is resolved.
// ==========================================================

const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>We'll be right back</title>
<style>
  html,body{height:100%;margin:0}
  body{
    display:flex;align-items:center;justify-content:center;
    background:#0f1115;color:#f2f2f2;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    text-align:center;padding:24px;box-sizing:border-box;
  }
  .card{max-width:480px}
  h1{font-size:1.5rem;margin:0 0 12px}
  p{font-size:1rem;line-height:1.5;color:#c7c9d1;margin:0 0 8px}
  .badge{
    display:inline-block;margin-bottom:20px;padding:6px 14px;
    border-radius:999px;background:#1f232c;color:#9ea3af;
    font-size:.8rem;letter-spacing:.03em;text-transform:uppercase;
  }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">Scheduled Maintenance</span>
    <h1>We're upgrading our system</h1>
    <p>We're making some improvements behind the scenes.</p>
    <p>Please check back in a few hours — thanks for your patience.</p>
  </div>
</body>
</html>`;

function maintenanceResponse() {
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "7200",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await appWorker.fetch(request, env, ctx);
    } catch (err) {
      console.error("Maintenance fallback triggered:", err && err.message ? err.message : err);
      return maintenanceResponse();
    }
  },

  async scheduled(event, env, ctx) {
    try {
      return await appWorker.scheduled(event, env, ctx);
    } catch (err) {
      console.error("Scheduled handler failed, skipping this run:", err && err.message ? err.message : err);
    }
  },
};
