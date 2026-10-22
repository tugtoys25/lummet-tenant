import { Renderer } from "../../render.js";
import { getSiteContext } from "../../site-context.js";
import * as newsroom from "../../database/newsroom.js";
import * as nrRender from "../../newsroom-render.js";
import * as nrSearch from "../../newsroom-search.js";
import { cacheHeaders, formatDate } from "../shared.js";
import { render404 } from "../system-pages.js";

// ── Newsroom: landing pages under /en/news/... (sections, regions, countries,
//    topics, entities, series) plus slug redirects ──
// Resolution for /en/news/<slug> when no LIVE article has that slug:
//   1. 301 to the article's current slug if it was renamed (always on: only ever
//      fires for URLs that would otherwise 404),
//   2. section, region, country pages (flag news_new_taxonomy),
//   3. 404.
// A live article ALWAYS wins over any of these (its URL is already indexed).
export async function renderNewsSectionOr404(request, env, slug, { allowRedirect = false } = {}) {
  try {
    if (allowRedirect) {
      const target = await newsroom.getRedirectTarget(env.DB, slug);
      if (target) return new Response(null, { status: 301, headers: { Location: `/en/news/${encodeURIComponent(target)}`, "Cache-Control": "public, max-age=3600" } });
    }
    const flags = await newsroom.getNewsFlags(env.DB);
    if (flags.news_new_taxonomy) {
      const res = await renderNewsSection(request, env, slug)
        || await renderNewsRegion(request, env, slug)
        || await renderNewsCountry(request, env, slug);
      if (res) return res;
    }
  } catch (e) {
    console.error("News landing fallback failed:", e.message);
  }
  return render404(request, env);
}

// Generic listing page. `spec.load({limit, offset})` returns { articles, total }.
async function renderNewsCollection(request, env, spec) {
  const url = new URL(request.url);
  const rawPage = url.searchParams.get("page");
  const page = rawPage === null ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1 || page > 500) return render404(request, env);
  const PAGE_SIZE = 12;

  const renderer = new Renderer(env, request);
  const [site, listing] = await Promise.all([
    getSiteContext(request, env),
    spec.load({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  ]);

  const totalPages = Math.max(1, Math.ceil(listing.total / PAGE_SIZE));
  if (page > totalPages) return render404(request, env);   // no thin/duplicate out-of-range pages

  const canonical = spec.canonicalPath ? site.url(spec.canonicalPath)
    : site.url(page === 1 ? spec.basePath : `${spec.basePath}?page=${page}`);  // query noise never changes the canonical
  const description = spec.seoDescription || spec.description || `${spec.name} news from ${site.siteName}.`;
  const offset = (page - 1) * PAGE_SIZE;
  const cards = listing.articles.map((a, i) => spec.renderCard ? spec.renderCard(a, offset + i + 1) : nrRender.renderArticleCard(a, formatDate)).join("");
  const empty = listing.articles.length ? "" :
    `<p style="padding:40px 0;color:var(--gray)">${spec.emptyMessage || "No articles here yet."} <a href="/en/news">Browse all news</a>.</p>`;

  const schema = {
    "@context": "https://schema.org",
    "@type": spec.schemaType || "CollectionPage",
    "@id": `${canonical}#webpage`,
    "url": canonical,
    "name": spec.name,
    "description": description,
    "isPartOf": { "@type": "WebSite", "@id": `${site.origin}#website`, "name": site.siteName, "url": site.origin },
    ...(spec.schemaExtra || {}),
    ...(listing.articles.length ? {
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": listing.articles.map((a, i) => ({
          "@type": "ListItem", "position": offset + i + 1,
          "url": site.url(`/en/news/${a.slug}`), "name": a.title
        }))
      }
    } : {})
  };

  const noindex = listing.total === 0 || /noindex/i.test(spec.robots || "");
  const html = await renderer.render("news-section.html", {
    canonical,
    page_title: nrRender.esc(spec.name),
    page_description: nrRender.esc(spec.description || description),
    header_extra_html: spec.headerHtml || "",
    news_cards: cards,
    empty_state_html: empty,
    pagination_html: (spec.resultCountHtml || "") + nrRender.renderPagination(spec.basePath, page, totalPages, spec.queryString || ""),
    seo_title: spec.seoTitle || `${spec.name} | ${site.siteName}`,
    seo_description: description,
    robots: noindex ? "noindex, follow" : "index, follow"
  }, schema, [
    { label: "Home", url: "/en" },
    { label: "News", url: "/en/news" },
    ...(spec.crumbs || []),
    { label: spec.crumbLabel || spec.name, url: null }
  ]);

  return new Response(html, { headers: cacheHeaders() });
}

// News search v2 (flag news_search_v2): keyword + section / author / country / entity / type / date filters.
// Returns null when it cannot answer well (index not built yet) so the caller uses the existing page.
export async function renderNewsSearch(request, env, flags, sp) {
  if (sp.q && !(await env.DB.prepare(`SELECT 1 AS x FROM news_search_docs LIMIT 1`).first())) return null;
  const url = new URL(request.url);
  const facets = await nrSearch.getSearchFacets(env.DB, env, { entityPages: !!flags.news_entity_pages });
  const qsParams = new URLSearchParams();
  for (const k of ["q", "section", "author", "country", "entity", "type", "from", "to"]) if (sp[k]) qsParams.set(k, sp[k]);
  const queryString = qsParams.toString();
  let shown = 0;
  return renderNewsCollection(request, env, {
    basePath: "/en/news", canonicalPath: "/en/news", queryString,
    name: sp.q ? `Search: ${sp.q}` : "Filtered news", crumbLabel: "Search",
    description: "", seoTitle: null, seoDescription: "Search the news archive.",
    robots: "noindex, follow", schemaType: "SearchResultsPage",   // result pages are never indexed
    emptyMessage: "No articles match your search.",
    headerHtml: nrRender.renderSearchForm({ params: sp, facets }),
    load: async ({ limit, offset }) => {
      const r = await nrSearch.searchNews(env.DB, { ...sp, page: Math.floor(offset / limit) + 1 }, { mode: "public", pageSize: limit });
      shown = r.total;
      return r.ok ? { articles: r.articles, total: r.total } : { articles: [], total: 0 };
    },
    get resultCountHtml() { return `<p class="nr-search__count" role="status">${shown} ${shown === 1 ? "result" : "results"}</p>`; }
  });
}

async function renderNewsSection(request, env, slug) {
  const section = await newsroom.getSectionBySlug(env.DB, slug);
  if (!section) return null;
  const ids = await newsroom.getSectionIds(env.DB, section.id);
  return renderNewsCollection(request, env, {
    basePath: `/en/news/${section.slug}`, name: section.name, description: section.description,
    seoTitle: section.seo_title, seoDescription: section.seo_description,
    load: (p) => newsroom.getSectionArticles(env.DB, ids, p)
  });
}

async function renderNewsRegion(request, env, slug) {
  const region = await newsroom.getRegionBySlug(env.DB, slug);
  if (!region) return null;
  return renderNewsCollection(request, env, {
    basePath: `/en/news/${region.slug}`, name: region.name,
    description: `${region.name} iGaming news and regulation.`,
    load: (p) => newsroom.getRegionArticles(env.DB, region.slug, p)
  });
}

async function renderNewsCountry(request, env, slug) {
  const country = await newsroom.getCountryBySlug(env.DB, slug);
  if (!country) return null;
  if (country.isAlias) {   // one indexable URL per country
    return new Response(null, { status: 301, headers: { Location: `/en/news/${country.canonical}`, "Cache-Control": "public, max-age=3600" } });
  }
  return renderNewsCollection(request, env, {
    basePath: `/en/news/${country.canonical}`, name: country.name,
    description: `Gambling industry news from ${country.name}.`,
    seoTitle: country.seo_title || null, seoDescription: null, robots: country.robots || "",
    load: (p) => newsroom.getCountryArticles(env.DB, country.code, p)
  });
}

// Two-segment pages: /en/news/topic/<slug>, /en/news/entity/<slug>, /en/news/series/<slug>
export async function renderNewsTaxonomyPage(request, env, kind, slug) {
  try {
    const flags = await newsroom.getNewsFlags(env.DB);
    if (kind === "entity" ? !flags.news_entity_pages : !flags.news_new_taxonomy) return render404(request, env);

    if (kind === "topic") {
      const t = await newsroom.getTopicBySlug(env.DB, slug);
      if (!t) return render404(request, env);
      return renderNewsCollection(request, env, {
        basePath: `/en/news/topic/${t.slug}`, name: t.name, description: t.description,
        seoTitle: t.seo_title, seoDescription: t.seo_description,
        load: (p) => newsroom.getTopicArticles(env.DB, t.id, p)
      });
    }
    if (kind === "series") {
      const s = await newsroom.getSeriesBySlug(env.DB, slug);
      if (!s) return render404(request, env);
      return renderNewsCollection(request, env, {
        basePath: `/en/news/series/${s.slug}`, name: s.name, description: s.description,
        seoTitle: s.seo_title, seoDescription: s.seo_description,
        load: (p) => newsroom.getSeriesArticles(env.DB, s.id, p),
        renderCard: (a, n) => `<div class="nr-series-part"><p class="nr-part">Part ${n}</p>${nrRender.renderArticleCard(a, formatDate)}</div>`
      });
    }
    if (kind === "entity") {
      const e = await newsroom.getEntityBySlug(env.DB, slug);
      if (!e) return render404(request, env);
      return renderNewsCollection(request, env, {
        basePath: `/en/news/entity/${e.slug}`, name: e.name, description: e.description,
        seoTitle: e.seo_title, seoDescription: e.seo_description,
        headerHtml: nrRender.renderEntityAbout(e),
        schemaExtra: { about: nrRender.entitySchema(e) },
        load: (p) => newsroom.getEntityArticles(env.DB, e.id, p)
      });
    }
  } catch (err) {
    console.error("News taxonomy page failed:", kind, err.message);
  }
  return render404(request, env);
}
