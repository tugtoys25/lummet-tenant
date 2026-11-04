// robots.txt, 404 page and the HTML sitemap page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as newsroom from "../database/newsroom.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { cacheHeaders } from "./shared.js";

export async function robots(request, env) {
  const site = await getSiteContext(request, env);
  // Advertised only once the Google News sitemap is switched on.
  const googleNewsLine = (await newsroom.isNewsFlagEnabled(env.DB, "news_google_sitemap"))
    ? `\nSitemap: ${site.url("/en/news-sitemap.xml")}` : "";
  const landingLine = (await newsroom.isNewsFlagEnabled(env.DB, "news_new_taxonomy"))
    ? `\nSitemap: ${site.url("/en/sitemap-news-sections.xml")}` : "";

  return new Response(
    `User-agent: *
Allow: /

Sitemap: ${site.url("/en/sitemap-index.xml")}
Sitemap: ${site.url("/en/sitemap.xml")}
Sitemap: ${site.url("/en/sitemap-casinos.xml")}
Sitemap: ${site.url("/en/sitemap-reviews.xml")}
Sitemap: ${site.url("/en/sitemap-news.xml")}
Sitemap: ${site.url("/en/sitemap-categories.xml")}
Sitemap: ${site.url("/en/sitemap-countries.xml")}
Sitemap: ${site.url("/en/sitemap-pages.xml")}${googleNewsLine}${landingLine}`,
    {
      headers: {
        "Content-Type": "text/plain"
      }
    }
  );
}

export async function render404(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const html = await renderer.render("404.html", {
    seo_title: "404 - Page Not Found",
    seo_description: `Sorry, this page does not exist on ${site.siteName}.`
  });

  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html"
    }
  });
}

export async function renderSitemapPage(request, env) {
  const renderer = new Renderer(env, request);

  const site = await getSiteContext(
    request,
    env
  );

  const sitemapSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${site.siteName} Sitemap`,
    "description":
      "Explore casino reviews, rankings, guides and industry news."
  };

  const html = await renderer.render(
    "sitemap.html",
    {
      seo_title: `${site.siteName} Sitemap`,
      seo_description:
        "Explore casino reviews, rankings, guides and industry news.",
      title: `${site.siteName} Sitemap`
    },
    sitemapSchema,
    buildBreadcrumbs("page", {
      title: "Sitemap"
    })
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}
