// The dashboard home and the public list pages (casinos, reviews, news, updates, categories, countries, payment methods).
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { handleNewsFeed, withFeedLink } from "../../news-feed.js";
import { getSiteContext } from "../../site-context.js";
import { renderCopyrightReport, renderDigestPrefs } from "../../news-report-page.js";
import { vitalsScript, getOpsFlags } from "../../newsroom-ops.js";
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
        return withVitals(withFeedLink(await renderNewsList(request, env), request, env), env);

      case "digestPrefs":
        return renderDigestPrefs(request, env);

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

// Adds the Core Web Vitals collector to the news list page. No-op unless the news_web_vitals switch is on.
async function withVitals(response, env) {
  try {
    if (!response || response.status !== 200 || !(await getOpsFlags(env.DB)).news_web_vitals) return response;
    if (!(response.headers.get("Content-Type") || "").includes("text/html")) return response;
    const html = await response.text();
    return new Response(html.includes("</body>") ? html.replace("</body>", vitalsScript("list") + "</body>") : html, { status: response.status, headers: response.headers });
  } catch (e) { console.error("vitals script skipped:", e && e.message); return response; }
}
