// Public pages: home, sign-in and newsletter links, casinos, content types (sportsbook, affiliate partner, custom), comparisons, reviews, news, countries, research, categories, affiliate and go links.
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { confirmNewsletter, unsubscribeNewsletter } from "../../newsletter.js";
import { handleAffiliateRedirect, handleContentTrackedRedirect, render404, renderAffiliate, renderAffiliatePartner, renderAffiliatePartnerList, renderCasino, renderCategory, renderCategoryCountryPage, renderComparison, renderComparisonList, renderContentLandingPage, renderCountry, renderCountryCustomPage, renderCustom, renderCustomList, renderForgotPassword, renderGenericReview, renderHome, renderLogin, renderNews, renderRegister, renderResearchHub, renderResearchItem, renderResearchTypeList, renderResetPassword, renderReview, renderSiteSearch, renderSportsbook, renderSportsbookList } from "../../controllers.js";
import { isContentTypeEnabled } from "../../content-types.js";

export async function handlePublicPages(route, request, env, ctx, url) {
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

      case "siteSearch":
        return renderSiteSearch(request, env);

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

      default:
        return NOT_HANDLED;
  }
}
