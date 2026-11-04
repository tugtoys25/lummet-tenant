// Admin dashboard pages (one small function per admin page) and the dashboard stats API.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import { getCurrentUser } from "../auth.js";
import { headerHeroDefaultsForAdmin, jsonForScript } from "../header-hero.js";

export async function renderDashboardPage(request, env) {
    const user = await getCurrentUser(request, env);
    if (!user) {
        return new Response(null, {
            status: 302,
            headers: { Location: "/en/login" }
        });
    }

    // Admins and editors get the shared admin nav via renderAdminPage
    if (user.role === "admin" || user.role === "editor") {
        return renderAdminPage(request, env, "admin/dashboard.html");
    }

    // Viewers get the user dashboard (no admin nav)
    const renderer = new Renderer(env, request);
    const site = await getSiteContext(request, env);
        // Add CSRF token for admin pages — used by rich-editor.js and media-library.js

    const userNav = await renderer.loadTemplate("layout/user-nav.html");

    const html = await renderer.render("users/dashboard.html", {
        seo_title: "Dashboard",
        seo_description: `${site.siteName} Dashboard`,
        email: renderer.escapeHtml(String(user.email || "")),
        role: renderer.escapeHtml(String(user.role || "")),
        user_nav: userNav
    });

    return new Response(html, {
        headers: { "Content-Type": "text/html" }
    });
}

export async function dashboardStatsAPI(request, env) {

    const user = await getCurrentUser(request, env);

    if (!user || user.role !== "admin") {
        return new Response("Forbidden", {
            status: 403
        });
    }

    const casinos = await env.DB.prepare(
        "SELECT COUNT(*) c FROM casinos"
    ).first();

    const reviews = await env.DB.prepare(
        "SELECT COUNT(*) c FROM reviews"
    ).first();

    const clicks = await env.DB.prepare(
        "SELECT COUNT(*) c FROM clicks"
    ).first();

    const pages = await env.DB.prepare(
        "SELECT COUNT(*) c FROM pages"
    ).first();

    return Response.json({
        casinos: casinos.c,
        reviews: reviews.c,
        clicks: clicks.c,
        pages: pages.c
    });
}

async function renderAdminPage(request, env, template, extraData = {}) {
  const user = await getCurrentUser(request, env);
  const allowedRoles = ["admin", "editor"];

  if (!user || !allowedRoles.includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  // Load shared admin navigation
  const adminNav = await renderer.loadTemplate("layout/admin-nav.html");
  const html = await renderer.render(template, {
      seo_title: `Admin — ${site.siteName}`,
      seo_description: `${site.siteName} CMS Admin`,

      email: user.email,
      role: user.role,
      admin_nav: adminNav,

      ...extraData
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}

export async function renderDashboardCasinos(request, env) {
  return renderAdminPage(request, env, "admin/casinos.html");
}

export async function renderDashboardCasinoCreate(request, env) {
  return renderAdminPage(request, env, "admin/casino-create.html");
}

export async function renderDashboardContentItems(request, env) {
  return renderAdminPage(request, env, "admin/content-items.html");
}

export async function renderDashboardContentItemCreate(request, env) {
  return renderAdminPage(request, env, "admin/content-item-create.html");
}

export async function renderDashboardCustomTypes(request, env) {
  return renderAdminPage(request, env, "admin/custom-types.html");
}

export async function renderDashboardCustomTypeCreate(request, env) {
  return renderAdminPage(request, env, "admin/custom-type-create.html");
}

export async function renderDashboardComparisons(request, env) {
  return renderAdminPage(request, env, "admin/comparisons.html");
}

export async function renderDashboardComparisonCreate(request, env) {
  return renderAdminPage(request, env, "admin/comparison-create.html");
}

export async function renderDashboardContentItemEdit(request, env, contentType, slug) {
  return renderAdminPage(request, env, "admin/content-item-edit.html", { content_type: contentType, slug });
}

export async function renderDashboardCustomTypeEdit(request, env, typeSlug) {
  return renderAdminPage(request, env, "admin/custom-type-edit.html", { type_slug: typeSlug });
}

export async function renderDashboardComparisonEdit(request, env, compareType, slug) {
  return renderAdminPage(request, env, "admin/comparison-edit.html", { compare_type: compareType, slug });
}

// The generic review list, add and edit screens live on ONE route now
// (/en/dashboard/reviews/generic). The old add and edit addresses stay valid
// -- bookmarks, history -- and send people to the same screen.
const GENERIC_REVIEWS_ROUTE = "/en/dashboard/reviews/generic";

function genericReviewRedirect(request, params) {
  const from = new URL(request.url);
  const to = new URL(GENERIC_REVIEWS_ROUTE, from.origin);
  for (const [k, v] of from.searchParams) to.searchParams.set(k, v);
  for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: to.pathname + to.search } });
}

export async function renderDashboardGenericReviewEdit(request, env, id) {
  return genericReviewRedirect(request, { edit: String(id) });
}

export async function renderDashboardContentLandingPages(request, env) {
  return renderAdminPage(request, env, "admin/content-landing-pages.html");
}

export async function renderDashboardContentLandingPageCreate(request, env) {
  return renderAdminPage(request, env, "admin/content-landing-page-create.html");
}

export async function renderDashboardContentLandingPageEdit(request, env, slug) {
  return renderAdminPage(request, env, "admin/content-landing-page-edit.html", { slug });
}

export async function renderDashboardContentTypeSettings(request, env) {
  // This page's own copy says "Admin-only: not visible to editors", and
  // its write endpoint (/api/v1/content-types-enabled/update) really is
  // admin-only -- but renderAdminPage()'s default allowedRoles is
  // ["admin", "editor"], so an editor could actually open this page
  // before this check was added (they just couldn't save from it).
  // Enforced here rather than changing renderAdminPage()'s default,
  // which every other admin page in this file also relies on.
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/content-type-settings.html");
}

export async function renderDashboardGenericReviews(request, env) {
  return renderAdminPage(request, env, "admin/generic-reviews.html");
}

export async function renderDashboardGenericReviewCreate(request, env) {
  return genericReviewRedirect(request, { new: "1" });
}

export async function renderDashboardReviews(request, env) {
  return renderAdminPage(request, env, "admin/reviews.html");
}

export async function renderDashboardNews(request, env) {
  return renderAdminPage(request, env, "admin/news.html");
}

export async function renderDashboardNewsroom(request, env) {
  return renderAdminPage(request, env, "admin/newsroom.html");
}

export async function renderDashboardUpdates(request, env) {
  return renderAdminPage(request, env, "admin/updates.html");
}

export async function renderDashboardCountryPages(request, env) {
  return renderAdminPage(request, env, "admin/country-pages.html");
}

export async function renderDashboardCategoryCountries(request, env) {
  return renderAdminPage(request, env, "admin/category-countries.html");
}

export async function renderDashboardPages(request, env) {
  return renderAdminPage(request, env, "admin/pages.html");
}

export async function renderDashboardSettings(request, env) {
  return renderAdminPage(request, env, "admin/settings.html");
}

export async function renderDashboardHeaderHero(request, env) {
  return renderAdminPage(request, env, "admin/header-hero.html", {
    hh_defaults_json: jsonForScript(headerHeroDefaultsForAdmin())
  });
}

export async function renderDashboardAI(request, env) {
  return renderAdminPage(request, env, "admin/ai.html");
}

export async function renderDashboardAiStudio(request, env) {
  return renderAdminPage(request, env, "admin/ai-studio.html");
}

export async function renderDashboardCategories(request, env) {
  return renderAdminPage(request, env, "admin/categories.html");
}

export async function renderDashboardPaymentMethods(request, env) {
  return renderAdminPage(request, env, "admin/payment-methods.html");
}

export async function renderDashboardCountries(request, env) {
  return renderAdminPage(request, env, "admin/countries.html");
}

export async function renderDashboardResearch(request, env) {
  return renderAdminPage(request, env, "admin/research.html");
}

export async function renderDashboardResearchReviewQueue(request, env) {
  return renderAdminPage(request, env, "admin/research-review-queue.html");
}

export async function renderDashboardResearchDatasets(request, env) {
  return renderAdminPage(request, env, "admin/research-datasets.html");
}

export async function renderDashboardCasinoEdit(request, env, slug) {
  return renderAdminPage(request, env, "admin/casino-edit.html", { slug });
}

export async function renderDashboardComponents(request, env) {
  return renderAdminPage(request, env, "admin/components.html");
}

export async function renderDashboardSeo(request, env) {
  return renderAdminPage(request, env, "admin/seo.html");
}

// ==================================
// ADMIN: AUTHORS
// ==================================

export async function renderDashboardAuthors(request, env) {
  return renderAdminPage(request, env, "admin/authors.html");
}

export async function renderDashboardMedia(request, env) {
  return renderAdminPage(request, env, "admin/media.html");
}

export async function renderDashboardNav(request, env) {
  return renderAdminPage(request, env, "admin/nav.html");
}

export async function renderDashboardPermissions(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/permissions.html");
}

export async function renderDashboardItemAccess(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/item-access.html");
}

export async function renderDashboardUsers(request, env) {
  return renderAdminPage(request, env, "admin/users.html");
}

export async function renderDashboardSubscriptions(request, env) {
  return renderAdminPage(request, env, "admin/subscriptions.html");
}

export async function renderDashboardEmails(request, env) {
  return renderAdminPage(request, env, "admin/emails.html");
}

export async function renderDashboardInquiries(request, env) {
  return renderAdminPage(request, env, "admin/inquiries.html");
}

export async function renderDashboardSubmissions(request, env) {
  return renderAdminPage(request, env, "admin/submissions.html");
}

export async function renderDashboardNotifications(request, env) {
  return renderAdminPage(request, env, "admin/notifications.html");
}

export async function renderDashboardBanners(request, env) {
  return renderAdminPage(request, env, "admin/banners.html");
}

export async function renderDashboardAffiliatePartners(request, env) {
  return renderAdminPage(request, env, "admin/affiliate-partners.html");
}

export async function renderDashboardAffiliatePrograms(request, env) {
  return renderAdminPage(request, env, "admin/affiliate-programs.html");
}

export async function renderDashboardAffiliateAccounts(request, env) {
  return renderAdminPage(request, env, "admin/affiliate-accounts.html");
}

export async function renderDashboardCommercialTerms(request, env) {
  return renderAdminPage(request, env, "admin/commercial-terms.html");
}

export async function renderDashboardPostbackConfigs(request, env) {
  return renderAdminPage(request, env, "admin/postback-configs.html");
}

export async function renderDashboardImportHistory(request, env) {
  return renderAdminPage(request, env, "admin/import-history.html");
}

export async function renderDashboardSpeed(request, env) {
  return renderAdminPage(request, env, "admin/speed.html");
}

export async function renderDashboardProviderAdapters(request, env) {
  return renderAdminPage(request, env, "admin/provider-adapters.html");
}

export async function renderDashboardOffers(request, env) {
  return renderAdminPage(request, env, "admin/offers.html");
}

export async function renderDashboardTrackingLinks(request, env) {
  return renderAdminPage(request, env, "admin/tracking-links.html");
}

export async function renderDashboardAnalytics(request, env) {
  return renderAdminPage(request, env, "admin/analytics.html");
}

export async function renderDashboardCampaigns(request, env) {
  return renderAdminPage(request, env, "admin/campaigns.html");
}

export async function renderDashboardReports(request, env) {
  return renderAdminPage(request, env, "admin/reports.html");
}

const GEO_RULE_SECTIONS = {
  rules: ["Rules", "See and edit the countries each item is available in."],
  defaults: ["Default rules", "Choose what happens to items that are registered with no country rules."],
  bulk: ["Bulk changes", "Change many items at once, with country codes typed or picked."],
  "import-export": ["Import & export", "Move country rules in and out as a CSV file."],
  presets: ["Presets", "One-click groups of countries used across the editors."],
  lookup: ["Country lookup", "Pick a country and see which items its visitors can reach."],
};

export async function renderDashboardGeoRules(request, env, section = "rules") {
  const sec = GEO_RULE_SECTIONS[section] ? section : "rules";
  return renderAdminPage(request, env, "admin/geo-rules.html", { geo_section: sec, geo_section_title: GEO_RULE_SECTIONS[sec][0], geo_section_intro: GEO_RULE_SECTIONS[sec][1] });
}
