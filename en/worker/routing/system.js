// =====================================================
// TENANT ROUTES: system
// Login and user pages, media, favicon, the super API, the API, sitemaps and the dynamic page catch-all.
// Part of getRoute (worker/routes.js): the statements below are the
// original ones in the original order. Returns the route object, or null
// when none of them matches so the next group is tried.
// =====================================================

export function routeSystem(path, request) {

  // =====================================================
  // AUTH
  // =====================================================

  if (path === "/en/login") {
    return {
      type: "login"
    };
  }

  if (path === "/en/register") {
    return {
      type: "register"
    };
  }

  if (path === "/en/forgot-password") {
    return {
      type: "forgotPassword"
    };
  }

  if (path === "/en/reset-password") {
    return {
      type: "resetPassword"
    };
  }

  if (path === "/en/newsletter/confirm") {
    return {
      type: "newsletterConfirm"
    };
  }

  if (path === "/en/newsletter/unsubscribe") {
    return {
      type: "newsletterUnsubscribe"
    };
  }



  if (path === "/en/user/dashboard") return { type: "userDashboard" };
  if (path === "/en/user/submit-casino") return { type: "userSubmitCasino" };
  if (path === "/en/user/inquiries") return { type: "userInquiries" };
  if (path === "/en/user/profile") return { type: "userProfile" };
  if (path === "/en/user/notifications") return { type: "userNotifications" };
  if (path === "/en/user/bookmarks") return { type: "userBookmarks" };
 
  // =====================================================
// MEDIA FILES
// =====================================================

  if (path.startsWith("/media/") && request.method === "GET") {
    return {
      type: "media",
      key: path.substring(1)
    };
  }
  // =====================================================
// FAVICON
// =====================================================

if (path === "/favicon.ico") {
  return {
    type: "favicon"
  };
}

  // =====================================================
  // SUPER API (Lummet control-plane channel)
  // Must be matched before the generic API catch-all below.
  // =====================================================
  if (path.startsWith("/en/api/super/")) {
    return {
      type: "superApi",
      path
    };
  }

  // =====================================================
  // API 
  // =====================================================
  if (path.startsWith("/api/") || path.startsWith("/en/api/")) {
    return {
      type: "api",
      path: path.replace(/^\/en/, "")
    };
  }

  // Sitemap routes — accessible at both root and /en/
  if (path === "/sitemap.xml" || path === "/en/sitemap.xml") {
      return { type: "sitemap" };
  }
  if (path === "/en/sitemap" || path === "/sitemap") {
      return { type: "sitemap-page" };
  }
  if (path === "/sitemap-index.xml" || path === "/en/sitemap-index.xml") {
      return { type: "sitemap-index" };
  }
  if (path === "/sitemap-casinos.xml" || path === "/en/sitemap-casinos.xml") {
      return { type: "sitemap-casinos" };
  }
  if (path === "/sitemap-sportsbook.xml" || path === "/en/sitemap-sportsbook.xml") {
      return { type: "sitemap-sportsbook" };
  }
  if (path === "/sitemap-affiliate-partner.xml" || path === "/en/sitemap-affiliate-partner.xml") {
      return { type: "sitemap-affiliate-partner" };
  }
  if (path === "/sitemap-custom.xml" || path === "/en/sitemap-custom.xml") {
      return { type: "sitemap-custom" };
  }
  if (path === "/sitemap-comparisons.xml" || path === "/en/sitemap-comparisons.xml") {
      return { type: "sitemap-comparisons" };
  }
  if (path === "/sitemap-reviews.xml" || path === "/en/sitemap-reviews.xml") {
      return { type: "sitemap-reviews" };
  }
  if (path === "/sitemap-news.xml" || path === "/en/sitemap-news.xml") {
      return { type: "sitemap-news" };
  }
  if (path === "/sitemap-news-sections.xml" || path === "/en/sitemap-news-sections.xml") {
      return { type: "sitemap-news-landing" };
  }
  if (path === "/news-sitemap.xml" || path === "/en/news-sitemap.xml") {
      return { type: "sitemap-google-news" };
  }
  if (path === "/sitemap-updates.xml" || path === "/en/sitemap-updates.xml") {
      return { type: "sitemap-updates" };
  }

  if (path === "/sitemap-authors.xml" || path === "/en/sitemap-authors.xml") {
      return { type: "sitemap-authors" };
  }

  if (path === "/sitemap-categories.xml" || path === "/en/sitemap-categories.xml") {
      return { type: "sitemap-categories" };
  }
  if (path === "/sitemap-countries.xml" || path === "/en/sitemap-countries.xml") {
      return { type: "sitemap-countries" };
  }
  if (path === "/sitemap-pages.xml" || path === "/en/sitemap-pages.xml") {
      return { type: "sitemap-pages" };
  }
  if (path === "/sitemap-seo-pages.xml" || path === "/en/sitemap-seo-pages.xml") {
      return { type: "sitemap-seo-pages" };
  }
  if (path === "/sitemap-research.xml" || path === "/en/sitemap-research.xml") {
      return { type: "sitemap-research" };
  }
  if (path === "/robots.txt") {
      return { type: "robots" };
  }

  // =====================================================
  // FALLBACK DYNAMIC PAGE ENGINE
  // =====================================================
  // /en/about
  // /en/contact
  // /en/privacy
  // /en/terms
  // =====================================================

  const dynamicPage =
    path.match(/^\/en\/(.+)$/);

  if (dynamicPage) {

    return {
      type: "page",
      slug: dynamicPage[1]
    };

  }

  return null;
}
