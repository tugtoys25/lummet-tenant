// robots.txt, 404 page and the HTML sitemap page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { escapeText, landingText, siteTextValue } from "../site-text/resolve.js";
import { getSiteContext } from "../site-context.js";
import * as newsroom from "../database/newsroom.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { cacheHeaders } from "./shared.js";
import { loadProfile } from "../site-profile/store.js";
import { sitemapAllowed } from "../site-profile/profile.js";

export async function robots(request, env) {
  const site = await getSiteContext(request, env);
  // Advertised only once the Google News sitemap is switched on.
  const googleNewsLine = (await newsroom.isNewsFlagEnabled(env.DB, "news_google_sitemap"))
    ? `\nSitemap: ${site.url("/en/news-sitemap.xml")}` : "";
  const landingLine = (await newsroom.isNewsFlagEnabled(env.DB, "news_new_taxonomy"))
    ? `\nSitemap: ${site.url("/en/sitemap-news-sections.xml")}` : "";

  const profile = await loadProfile(env, new URL(request.url).hostname);
  const sitemapLines = ["sitemap-index", "sitemap", "sitemap-casinos", "sitemap-reviews", "sitemap-news", "sitemap-categories", "sitemap-countries", "sitemap-pages"]
    .filter((t) => sitemapAllowed(t, profile))
    .map((t) => `Sitemap: ${site.url(`/en/${t}.xml`)}`).join("\n");
  const newsOn = sitemapAllowed("sitemap-news", profile);

  return new Response(
    `User-agent: *
Allow: /

${sitemapLines}${newsOn ? googleNewsLine + landingLine : ""}`,
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
    seo_title: siteTextValue(site, "system_404_title"),
    seo_description: siteTextValue(site, "system_404_description")
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
    "name": landingText(site, "sitemap").title,
    "description": landingText(site, "sitemap").seoDescription
  };

  const html = await renderer.render(
    "sitemap.html",
    {
      seo_title: landingText(site, "sitemap").seoTitle,
      seo_description: landingText(site, "sitemap").seoDescription,
      title: landingText(site, "sitemap").title,
      sm_title: landingText(site, "sitemap").titleHtml,
      sm_intro: landingText(site, "sitemap").introHtml,
      ...Object.fromEntries(["casinos", "reviews", "news", "pages"].flatMap((k) => [[`sm_${k}_title`, escapeText(siteTextValue(site, `landing_sitemap_${k}_title`))], [`sm_${k}_text`, escapeText(siteTextValue(site, `landing_sitemap_${k}_text`))]]))
    },
    sitemapSchema,
    buildBreadcrumbs("page", {
      title: landingText(site, "sitemap").title
    })
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}
