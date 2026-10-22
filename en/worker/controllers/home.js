// Home page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as casinos from "../database/casinos.js";
import * as reviews from "../database/reviews.js";
import * as news from "../database/news.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildCasinoCards, prepareGeoData, resolveBonusOverridesForList, resolvePaymentMethodsForList, sortCasinosByGeo } from "./casino-cards.js";
import { cacheHeaders } from "./shared.js";

// The actual cold render -- everything renderHome used to do. This
// still hits D1/casinos/reviews/news/components on every call; it's
// only ever invoked directly on a cache miss, and otherwise runs in
// the background to refresh a stale cached copy (see renderHome()
// below, which is the exported/routed entry point now).
async function renderHomeHtml(request, env) {
  const renderer = new Renderer(env, request);

  // site, casinoList, components/SEO, and the latest-reviews/news
  // lists are all independent of each other — fetch them concurrently.
  const [site, casinoList, allComponents, dynamicSeo, latestReviews, allNews] = await Promise.all([
    getSiteContext(request, env),
    casinos.getAllCasinos(env.DB),
    renderer.renderAllComponents("homepage", "homepage"),
    renderer.loadDynamicSeo("homepage", "homepage"),
    reviews.getLatestReviews(env.DB, 6),
    news.getLatestNews(env.DB, 4),
  ]);
  const latestNews = allNews;

  const geoData = await prepareGeoData(env, request, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);

  const available = sortedCasinos.filter(c =>
    geoData.statuses[c.slug] !== "blocked" && geoData.statuses[c.slug] !== "restricted"
  );
  const others = sortedCasinos.filter(c =>
    geoData.statuses[c.slug] === "blocked" || geoData.statuses[c.slug] === "restricted"
  );
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);

  const reviewCardsHtml = latestReviews.map(r => `
    <div class="casino-card">
      <div class="casino-card__header">
        <div class="casino-card__logo-wrap">
          <img src="${r.casino_logo || '/static/images/default.png'}" alt="${r.casino_name}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
        </div>
        <div class="casino-card__title-group">
          <h3 class="casino-card__name"><a href="/en/review/${r.slug}">${r.title}</a></h3>
          <div class="casino-card__rating">${'★'.repeat(Math.round(r.rating || 0))}${'☆'.repeat(5 - Math.round(r.rating || 0))}</div>
        </div>
      </div>
      <div class="casino-card__body">
        <p class="muted">${r.casino_name}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--secondary">Read Review</a>
      </div>
    </div>`).join("");

  const newsCardsHtml = latestNews.map(n => `
    <a href="/en/news/${n.slug}" class="news-card">
      ${n.featured_image_thumbnail || n.featured_image_url ? `<img src="${n.featured_image_thumbnail || n.featured_image_url}" alt="${n.title}" loading="lazy">` : ""}
      <h3>${n.title}</h3>
      ${n.excerpt ? `<p class="muted">${n.excerpt}</p>` : ""}
      <p class="muted">${new Date(n.published_at || n.created_at).toLocaleDateString()}</p>
    </a>`).join("");

  const homeSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": site.origin,
    "name": site.siteName,
    "description":site.description || "Expert casino reviews, exclusive bonuses, and real player data.",
    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "logo": {
        "@type": "ImageObject",
        "url": site.logoUrl
      }
    }
  };

      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("home.html", {
    seo_title: dynamicSeo.seo_title || site.title || `${site.siteName} — Expert Casino Reviews & Bonuses`,
    seo_description: dynamicSeo.seo_description || site.description || "Expert casino reviews, exclusive bonuses, and real player data for casinos worldwide.",
    seo_keywords: dynamicSeo.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url("/en"),
    og_image: dynamicSeo.og_image || "",
    casino_cards: buildCasinoCards(available, geoData, bonusOverrides, paymentMethodsByCasino),
    casino_count: casinoList.length,
    hidden_casino_cards: buildCasinoCards(others, geoData, bonusOverrides, paymentMethodsByCasino),
    has_hidden: others.length > 0,
    hidden_count: others.length,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    review_cards: reviewCardsHtml,
    has_reviews: latestReviews.length > 0,
    no_reviews: latestReviews.length === 0,
    news_cards: newsCardsHtml,
    has_news: latestNews.length > 0,
    no_news: latestNews.length === 0
  }, homeSchema, buildBreadcrumbs("home"));

  return html;
}

// =====================================================
// HOMEPAGE -- full-page cache wrapper (stale-while-revalidate)
// =====================================================
// This is the routed entry point (see index.js). It caches the
// ENTIRE rendered HTML per (hostname, visitor country) in KV, so a
// cache hit costs zero D1 reads. See cache.js's PAGE_CACHE /
// getCachedPage / setCachedPage / tryAcquireRegenLock for the
// mechanics. `ctx` is optional -- if it's not passed (or has no
// waitUntil), a stale hit is still served immediately, it just
// won't trigger a background refresh; the next miss/expiry will
// re-render synchronously instead.
export async function renderHome(request, env, ctx) {
  // Caching (per country, stale-while-revalidate, retired by admin saves, view
  // events replayed) is done for every public page by worker/page-cache.js, which
  // wraps this route in index.js. Rendering here is just rendering.
  const html = await renderHomeHtml(request, env);
  return new Response(html, { headers: cacheHeaders() });
}
