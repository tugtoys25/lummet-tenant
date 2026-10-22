import { Renderer } from "../../render.js";
import { getSiteContext } from "../../site-context.js";
import * as news from "../../database/news.js";
import * as newsroom from "../../database/newsroom.js";
import * as nrHome from "../../newsroom-home.js";
import * as nrSearch from "../../newsroom-search.js";
import { buildBreadcrumbs } from "../../breadcrumbs.js";
import { cacheHeaders, escapeHtml, formatDate, safeAlt, stripHtml, toIsoDate, truncateText } from "../shared.js";
import { renderNewsSearch } from "./landing.js";

// News homepage v2 (flag news_v2_homepage). Only for the plain /en/news view;
// search and tag views keep the existing page. Returns null on any failure so
// the caller falls back to the existing page.
async function renderNewsHome(request, env, flags, renderer) {
  const [site, data, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    nrHome.loadHomepage(env.DB, env, flags),
    renderer.renderAllComponents("news_list", "news_list"),
    renderer.loadDynamicSeo("news_list", "news_list"),
  ]);

  const pageTitle = "News";
  const pageDescription = `Latest iGaming industry news and updates from ${site.siteName}.`;
  const canonical = dynamicSeo.canonical || site.url("/en/news");
  const items = [data.lead, ...data.latest].filter(Boolean);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonical}#webpage`,
    "url": canonical,
    "name": pageTitle,
    "description": pageDescription,
    "isPartOf": { "@type": "WebSite", "@id": `${site.origin}#website`, "name": site.siteName, "url": site.origin },
    ...(items.length ? {
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": items.map((a, i) => ({
          "@type": "ListItem", "position": i + 1, "url": site.url(`/en/news/${a.slug}`), "name": a.title
        }))
      }
    } : {})
  };

  const html = await renderer.render("news-home.html", {
    canonical,
    page_title: escapeHtml(pageTitle),
    page_description: escapeHtml(pageDescription),
    home_html: nrHome.renderHomepage(data, formatDate),
    components_top: allComponents.top,
    components_bottom: allComponents.bottom,
    seo_title: dynamicSeo.seo_title || `${pageTitle} | ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || pageDescription,
    seo_keywords: dynamicSeo.seo_keywords || "",
    robots: items.length ? "index, follow" : "noindex, follow"
  }, listSchema, buildBreadcrumbs("newsList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderNewsList(request, env) {
  const renderer = new Renderer(env, request);

  const url = new URL(request.url);
  const searchQuery = (url.searchParams.get("q") || "").trim();
  const tagFilter = (url.searchParams.get("tag") || "").trim();

  // Search v2 (flag news_search_v2): any of q / section / author / country / entity / type / from / to.
  const searchParams = nrSearch.parseSearchParams(url.searchParams);
  if (!tagFilter && nrSearch.hasSearchFilters(searchParams)) {
    try {
      const flags = await newsroom.getNewsFlags(env.DB);
      if (flags.news_search_v2) {
        const res = await renderNewsSearch(request, env, flags, searchParams);
        if (res) return res;
      }
    } catch (e) {
      console.error("News search v2 failed, using the existing search:", e.message);
    }
  }

  if (!searchQuery && !tagFilter && !nrSearch.hasSearchFilters(searchParams)) {
    try {
      const flags = await newsroom.getNewsFlags(env.DB);
      if (flags.news_v2_homepage) return await renderNewsHome(request, env, flags, renderer);
    } catch (e) {
      console.error("News homepage v2 failed, using the existing page:", e.message);
    }
  }

  const newsListPromise = searchQuery
    ? news.searchNews(env.DB, searchQuery, 50)
    : tagFilter
      ? news.getNewsByTag(env.DB, tagFilter, 50)
      : news.getAllNews(env.DB);

  // Independent of each other — fetch concurrently.
  const [site, newsList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    newsListPromise,
    renderer.renderAllComponents("news_list", "news_list"),
    renderer.loadDynamicSeo("news_list", "news_list"),
  ]);

  let pageTitle = "News";
  let pageDescription = `Latest iGaming industry news and updates from ${site.siteName}.`;
  if (searchQuery) {
    pageTitle = `Search: ${searchQuery}`;
    pageDescription = `Search results for "${searchQuery}" — ${site.siteName} News.`;
  } else if (tagFilter) {
    pageTitle = `Tag: ${tagFilter}`;
    pageDescription = `News articles tagged with "${tagFilter}" — ${site.siteName}.`;
  }

  const newsListUrl = dynamicSeo.canonical || site.url("/en/news");

  // ── Render news cards with featured images, excerpts, tags ──
  const newsCards = newsList.map(article => {
    const image = article.featured_image_url || article.featured_image_thumbnail || "";
    const excerpt = article.excerpt || truncateText(stripHtml(article.content || ""), 150);
    const date = article.published_at || article.created_at;

    const imageHtml = image
      ? `<div style="aspect-ratio:16/9;overflow:hidden"><img src="${escapeHtml(image)}" alt="${escapeHtml(safeAlt(article.featured_image_alt, article.title))}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s" loading="lazy" decoding="async"></div>`
      : `<div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gray);font-size:13px">No image</div>`;

    const authorHtml = article.author_name
      ? `<div style="display:flex;align-items:center;gap:8px;color:var(--gray);font-size:13px;margin-top:12px">${article.author_avatar ? `<img src="${escapeHtml(article.author_avatar)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover" loading="lazy">` : ""}<span>${escapeHtml(article.author_name)}</span></div>`
      : "";

    // Tags as small chips (max 3)
    const tagsHtml = article.tags
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${String(article.tags).split(",").map(t => t.trim()).filter(Boolean).slice(0, 3).map(t => `<a href="/en/news?tag=${encodeURIComponent(t)}" style="display:inline-block;padding:3px 9px;border-radius:999px;background:var(--bg);color:var(--gray);font-size:12px;text-decoration:none">${escapeHtml(t)}</a>`).join("")}</div>`
      : "";

    return `
      <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:12px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column">
        <a href="/en/news/${encodeURIComponent(article.slug)}" style="display:block;color:inherit;text-decoration:none">
          ${imageHtml}
          <div style="padding:20px;flex:1;display:flex;flex-direction:column">
            ${date ? `<time style="color:var(--gray);font-size:13px;margin-bottom:8px" datetime="${toIsoDate(date)}">${escapeHtml(formatDate(date))}</time>` : ""}
            <h3 style="margin:0 0 10px;font-size:21px;line-height:1.25;color:var(--dark)">${escapeHtml(article.title)}</h3>
            ${excerpt ? `<p style="margin:0 0 12px;color:var(--gray);font-size:15px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(excerpt)}</p>` : ""}
            ${tagsHtml}
            ${authorHtml}
          </div>
        </a>
      </article>
    `;
  }).join("");

  const hasResults = newsList.length > 0;

  const emptyStateHtml = hasResults ? "" : `
    <div style="text-align:center;padding:60px 20px;color:var(--gray)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="margin-bottom:16px;opacity:0.4">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
      <h2 style="margin:0 0 8px;font-size:22px;color:var(--dark)">No articles found</h2>
      <p style="margin:0 0 20px">Try a different search term or browse all news.</p>
      <a href="/en/news" class="btn btn--ghost">View All News</a>
    </div>
  `;

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${newsListUrl}#webpage`,
    "url": newsListUrl,
    "name": pageTitle,
    "description": pageDescription,
    "isPartOf": {
      "@type": "WebSite",
      "@id": `${site.origin}#website`,
      "name": site.siteName,
      "url": site.origin
    },
    ...(hasResults ? {
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": newsList.map((article, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": site.url(`/en/news/${article.slug}`),
          "name": article.title
        }))
      }
    } : {})
  };

  const html = await renderer.render("news-list.html", {
    canonical: newsListUrl,
    // {{vars}} are not escaped by the template engine and pageTitle/pageDescription
    // embed the ?q= / ?tag= query values (reflected XSS otherwise).
    page_title: escapeHtml(pageTitle),
    page_description: escapeHtml(pageDescription),
    news_cards: newsCards,
    empty_state_html: emptyStateHtml,
    search_query: escapeHtml(searchQuery),
    tag_filter: escapeHtml(tagFilter),
    seo_title: dynamicSeo.seo_title || `${pageTitle} | ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || pageDescription,
    seo_keywords: dynamicSeo.seo_keywords || "",
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar
  }, listSchema, buildBreadcrumbs("newsList"));

  return new Response(html, { headers: cacheHeaders() });
}
