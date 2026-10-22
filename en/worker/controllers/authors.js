// Author page and author list.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as authors from "../database/authors.js";
import * as newsroom from "../database/newsroom.js";
import * as nrRender from "../newsroom-render.js";
import { sanitizeHtml } from "../sanitize.js";
import { renderSectionNav } from "../generic-review-sections.js";
import { loadAuthorStyleSettings, buildAuthorStyle } from "../author-style.js";
import { getAuthorHub, renderAuthorHub } from "../author-hub.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { cacheHeaders, escapeHtml, safeAlt } from "./shared.js";
import { render404 } from "./system-pages.js";

// ==================================
// AUTHOR PROFILE PAGE
// ==================================


export async function renderAuthor(request, env, slug) {
  const author = await authors.getAuthor(env.DB, slug);
  if (!author) return render404(request, env);
  // The author list hides unpublished authors; their direct URL must not expose the profile either.
  if (Number(author.published) === 0) return render404(request, env);

  const renderer = new Renderer(env, request);

  // Independent of each other — fetch concurrently.
  const ahStyle = buildAuthorStyle(await loadAuthorStyleSettings(env.DB));
  const [site, content, stats, allComponents, dynamicSeo, nrFlags, hubGroups] = await Promise.all([
    getSiteContext(request, env),
    authors.getAuthorContent(env.DB, author.id),
    authors.getAuthorStats(env.DB, author.id),
    renderer.renderAllComponents("author", slug),
    renderer.loadDynamicSeo("author", slug),
    newsroom.getNewsFlags(env.DB).catch(() => ({})),
    getAuthorHub(env.DB, author.id).catch(() => []),
  ]);
  const hub = renderAuthorHub(hubGroups, author.name);

  // Build review cards
  // NEW: fetch casino logo/name for review cards
  const authorCasinoSlugs = [...new Set(content.reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];
  let authorCasinoMeta = {};
  if (authorCasinoSlugs.length > 0) {
    const metaPlaceholders = authorCasinoSlugs.map(() => '?').join(',');
    const casinoRows = await env.DB.prepare(`
      SELECT slug, name, logo FROM casinos WHERE slug IN (${metaPlaceholders})
    `).bind(...authorCasinoSlugs).all();
    for (const row of (casinoRows.results || [])) {
      authorCasinoMeta[row.slug] = row;
    }
  }

  // Build review cards
  const reviewCards = content.reviews.map(r => {
    const casino = r.casino_slug ? authorCasinoMeta[r.casino_slug] : null;
    const casinoImage = escapeHtml(casino?.logo || '/static/images/default.png');
    const casinoImageAlt = escapeHtml(casino?.name || r.title);

    return `
    <div class="casino-card">
      <div class="casino-card__image">
        <img src="${casinoImage}" alt="${casinoImageAlt}" loading="lazy" onerror="this.src='/static/images/default.png'">
      </div>
      <div class="casino-card__body">
        <h3><a href="/en/review/${encodeURIComponent(r.slug)}">${escapeHtml(r.title)}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">Updated: ${new Date(r.updated_at).toLocaleDateString()}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${encodeURIComponent(r.slug)}" class="btn btn--primary">Read Review</a>
      </div>
    </div>
  `;
  }).join("");

  // Build news cards
  const newsCards = content.news.map(n => {
    const image = n.featured_image_url || n.featured_image_thumbnail || "";
    const imageHtml = image
      ? `<div style="aspect-ratio:16/9;overflow:hidden"><img src="${escapeHtml(image)}" alt="${escapeHtml(safeAlt(n.featured_image_alt, n.title))}" style="width:100%;height:100%;object-fit:cover" loading="lazy" decoding="async"></div>`
      : `<div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gray);font-size:13px">No image</div>`;

    return `
    <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:12px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s">
      <a href="/en/news/${encodeURIComponent(n.slug)}" style="display:block;color:inherit;text-decoration:none">
        ${imageHtml}
        <div style="padding:20px">
          <h3 style="margin:0 0 8px;font-size:18px;line-height:1.3;color:var(--dark)">${escapeHtml(n.title)}</h3>
          ${n.excerpt ? `<p style="margin:0 0 10px;color:var(--gray);font-size:14px;line-height:1.6">${escapeHtml(n.excerpt)}</p>` : ""}
          <p class="muted" style="margin:0">${new Date(n.created_at).toLocaleDateString()}</p>
        </div>
      </a>
    </article>
  `;
  }).join("");


  // Build page list
  const pageList = content.pages.map(p => `
    <li><a href="/en/${p.slug}">${escapeHtml(p.title)}</a> <span class="muted">— ${new Date(p.created_at).toLocaleDateString()}</span></li>
  `).join("");

  const nrTax = !!nrFlags.news_new_taxonomy;
  const authorCanonical = dynamicSeo.canonical || site.url(`/en/author/${slug}`);
  const authorSchema = nrTax
    ? nrRender.authorPersonSchema({ author, canonical: authorCanonical, siteName: site.siteName || site.hostname, origin: site.origin, articleCount: stats.news })
    : {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": author.name,
        "description": author.bio || "",
        "image": author.avatar_url || "",
        "jobTitle": author.role || "Editor"
      };

  const html = await renderer.render("author.html", {
    ...author,
    // {{vars}} are not escaped by the template engine; these come from an editable profile.
    author_name: escapeHtml(author.name),
    author_bio: escapeHtml(author.bio || ""),
    author_avatar: escapeHtml(author.avatar_url || site.logoUrl),
    author_role: escapeHtml((nrTax && author.job_title) || author.role || "Editor"),
    author_social: sanitizeHtml(author.social_links || ""),
    author_facts_html: nrTax
      ? `<link rel="stylesheet" href="/static/css/newsroom.css">${nrRender.renderAuthorFacts(author, stats.news)}`
      : "",
    author_style_html: ahStyle,
    author_stats_html: hub.stats_html,
    author_nav_html: renderSectionNav(hub.nav, "Everything published by " + author.name),
    author_sections_html: hub.sections_html || '<p class="muted ah-empty">Nothing published yet.</p>',
    author_total: hub.total,
    review_cards: reviewCards,
    news_cards: newsCards || '<p class="muted">No articles yet.</p>',
    page_list: pageList || '<li class="muted">No pages yet.</li>',
    review_count: stats.reviews,
    news_count: stats.news,
    page_count: stats.pages,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,                                                                                                              components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || author.name + " — " + site.siteName,
    seo_description: dynamicSeo.seo_description || author.bio || author.name + " is a " + (author.role || "editor") + " at " + site.siteName ,
    og_image: author.avatar_url ? site.url(author.avatar_url) : site.ogImageUrl,
    og_image_alt: author.name,
    canonical: authorCanonical
  }, authorSchema, buildBreadcrumbs("author", {author_name: author.name }));
  return new Response(html, { headers: cacheHeaders() });
}

// =====================================================
// AUTHORS LIST
// /en/author
// =====================================================

export async function renderAuthorList(request, env) {
  const renderer = new Renderer(env, request);

  const [authorsList, allComponents, dynamicSeo] = await Promise.all([
    authors.getAllAuthors(env.DB),
    renderer.renderAllComponents("author_list", "author_list"),
    renderer.loadDynamicSeo("author_list", "author_list"),
  ]);

  const authorCards = (authorsList || []).map((author) => {
    const avatar = author.avatar_url
      ? `
        <img
          src="${author.avatar_url}"
          alt="${author.name}"
          class="author-card__avatar"
          loading="lazy"
        >
      `
      : "";

    const bio = author.bio
      ? author.bio.substring(0, 180)
      : "";

    return `
      <article class="author-card">

        <div class="author-card__media">
          ${avatar}
        </div>

        <div class="author-card__body">

          <h2>
            <a href="/en/author/${author.slug}">
              ${author.name}
            </a>
          </h2>

          ${
            author.role
              ? `<div class="author-card__role">${author.role}</div>`
              : ""
          }

          ${
            bio
              ? `
                <p>
                  ${bio}${author.bio.length > 180 ? "..." : ""}
                </p>
              `
              : ""
          }

          <a
            href="/en/author/${author.slug}"
            class="btn btn--primary"
          >
            View Profile
          </a>

        </div>

      </article>
    `;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name":
      dynamicSeo?.seo_title ||
      "Authors",
    "description":
      dynamicSeo?.seo_description ||
      "Meet the authors and editorial team behind our content.",
    "url": new URL(request.url).origin + "/en/author",
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": (authorsList || []).map(
        (author, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "name": author.name,
          "url":
            new URL(request.url).origin +
            `/en/author/${author.slug}`
        })
      )
    }
  };

  const html = await renderer.render(
    "author_list.html",
    {
      canonical:
        dynamicSeo?.canonical ||
        "/en/author",

      category: "Authors",

      description:
        dynamicSeo?.seo_description ||
        "Meet the authors and editorial team behind our content.",

      author_cards:
        authorCards ||
        '<p class="muted">No authors available.</p>',

      author_count:
        authorsList?.length || 0,

      components_top:
        allComponents?.top || "",

      components_content_top:
        allComponents?.content_top || "",

      components_content_bottom:
        allComponents?.content_bottom || "",

      components_bottom:
        allComponents?.bottom || "",

      components_sidebar:
        allComponents?.sidebar || "",

      seo_title:
        dynamicSeo?.seo_title ||
        "Authors",

      seo_description:
        dynamicSeo?.seo_description ||
        "Meet the authors and editorial team behind our content."
    },
    listSchema,
    buildBreadcrumbs("authorList")
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}
