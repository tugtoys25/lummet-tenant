// Every sitemap.
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { renderSitemapPage } from "../../controllers.js";
import { sitemapEngine } from "../../sitemap.js";

export async function handleSitemaps(route, request, env, ctx, url) {
  switch (route.type) {

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

      default:
        return NOT_HANDLED;
  }
}
