// The dashboard home and the public list pages (casinos, reviews, news, updates, categories, countries, payment methods).
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { handleNewsFeed, withFeedLink } from "../../news-feed.js";
import { getSiteContext } from "../../site-context.js";
import { renderCopyrightReport } from "../../news-report-page.js";
import { renderCasinoList, renderCategoryList, renderCountryList, renderDashboardPage, renderNewsList, renderPaymentMethod, renderPaymentMethodList, renderReviewList, renderUpdate, renderUpdatesList } from "../../controllers.js";

export async function handleListings(route, request, env, ctx, url) {
  switch (route.type) {

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
        return withFeedLink(await renderNewsList(request, env), request, env);

      case "copyrightReport":
        return renderCopyrightReport(request, env);

      case "newsFeed":
        return handleNewsFeed(request, env, route, { getSite: getSiteContext });

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

      default:
        return NOT_HANDLED;
  }
}
