import { Renderer } from "../../render.js";
import { getSiteContext } from "../../site-context.js";
import * as authors from "../../database/authors.js";
import * as news from "../../database/news.js";
import * as newsroom from "../../database/newsroom.js";
import * as nrRender from "../../newsroom-render.js";
import * as nrTrust from "../../newsroom-trust.js";
import * as nrAnalytics from "../../newsroom-analytics.js";
import { logEvent as logAnalyticsEvent } from "../../database/analytics.js";
import { buildBreadcrumbs } from "../../breadcrumbs.js";
import { injectInlineAds } from "../ads.js";
import { cacheHeaders, escapeHtml, formatDate, safeAlt, stripHtml, toIsoDate, truncateText } from "../shared.js";
import { renderNewsSectionOr404 } from "./landing.js";

export async function renderNews(request, env, slug, ctx = null) {
  const article = await news.getNews(env.DB, slug);
  if (!article) return renderNewsSectionOr404(request, env, slug, { allowRedirect: true });

  // Security: only render published, currently-live articles publicly
  if (!article.published || Number(article.published) !== 1) {
    return renderNewsSectionOr404(request, env, slug);
  }

  // Security: respect scheduled publishing — hide articles whose published_at is in the future
  if (article.published_at) {
    const pubDate = new Date(article.published_at);
    if (!Number.isNaN(pubDate.getTime()) && pubDate > new Date()) {
      return renderNewsSectionOr404(request, env, slug);
    }
  }

  // Analytics (Phase: page-view instrumentation). Placed after the
  // published/scheduled guards above so an unpublished or not-yet-live
  // article being probed never generates a CONTENT_VIEW row -- same
  // reasoning as why those guards return 404 rather than the real
  // content. No geoEngine.process() call, same as renderReview: news
  // articles don't evaluate a GEO access rule, so this uses the free
  // edge-provided country/city directly instead of adding a computation
  // to the render path purely to feed analytics.
  if (ctx && typeof ctx.waitUntil === 'function') {
    // Optional enrichment (flag news_analytics_enrichment, off by default): bot flag,
    // device class and UTM parameters, so crawlers stop counting as readers.
    // The flag read is cached (30 s) and shared with the newsroom loaders below.
    let enrich = {};
    try {
      if ((await newsroom.getNewsFlags(env.DB)).news_analytics_enrichment) enrich = nrAnalytics.enrichNewsView(request);
    } catch { /* recording extra fields is best-effort */ }
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'CONTENT_VIEW',
        newsId: article.id,
        countryCode: request.cf?.country || null,
        city: request.cf?.city || null,
        referrer: request.headers.get('referer') || null,
        landingPage: `/en/news/${slug}`,
        ...enrich
      }).catch(() => {})
    );
  }

  const renderer = new Renderer(env, request);

  // ── Related news by shared tags ──────────────────────
  const relatedNewsPromise = (async () => {
    if (!article.tags) return "";
    try {
      const related = await news.getRelatedNews(env.DB, article.slug, article.tags, 3);
      if (related.length === 0) return "";
      return related.map(item => {
        const img = item.featured_image_url || item.featured_image_thumbnail || "";
        const imgHtml = img
          ? `<div style="aspect-ratio:16/9;overflow:hidden;border-radius:8px"><img src="${escapeHtml(img)}" alt="${escapeHtml(safeAlt(item.featured_image_alt, item.title))}" style="width:100%;height:100%;object-fit:cover" loading="lazy" decoding="async"></div>`
          : "";
        const date = item.published_at || item.created_at;
        return `
            <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:10px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s">
              <a href="/en/news/${encodeURIComponent(item.slug)}" style="display:block;color:inherit;text-decoration:none">
                ${imgHtml}
                <div style="padding:14px">
                  ${date ? `<time style="display:block;margin-bottom:6px;color:var(--gray);font-size:12px">${escapeHtml(formatDate(date))}</time>` : ""}
                  <h3 style="margin:0 0 6px;font-size:16px;line-height:1.3;color:var(--dark)">${escapeHtml(item.title)}</h3>
                  ${item.excerpt ? `<p style="margin:0;color:var(--gray);font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(item.excerpt)}</p>` : ""}
                </div>
              </a>
            </article>
          `;
      }).join("");
    } catch (e) {
      console.error("Related news error:", e.message);
      return "";
    }
  })();

  // These are all independent of each other, so run them concurrently.
  const [site, author, allComponents, dynamicSeo, relatedNewsHtml, displayContent, newsroomData] = await Promise.all([
    getSiteContext(request, env),
    article.author_id ? authors.getAuthorById(env.DB, article.author_id) : Promise.resolve(null),
    renderer.renderAllComponents("news", slug, ctx),
    renderer.loadDynamicSeo("news", slug),
    relatedNewsPromise,
    injectInlineAds(article.content || "", env, request, "news").catch(e => {
      console.error("Inline ad injection error:", e.message);
      return article.content || "";
    }),
    // Newsroom layer: null (and zero extra queries beyond a cached flag read)
    // unless a newsroom feature flag is on. Never fails the page.
    nrTrust.loadNewsroomForArticle(env.DB, article)
      .catch(e => { console.error("Newsroom load failed:", e.message); return null; }),
  ]);

  const canonical = dynamicSeo.canonical || site.url(`/en/news/${article.slug}`);

  const publishedDate = article.published_at || article.created_at;
  const modifiedDate = article.updated_at || publishedDate;
  const publishedIso = toIsoDate(publishedDate);
  const modifiedIso = toIsoDate(modifiedDate);
  const publishedDisplay = formatDate(publishedDate);
  const modifiedDisplay = formatDate(modifiedDate);

  const cleanContent = stripHtml(article.content || "");
  const description = dynamicSeo.seo_description || article.seo_description || article.excerpt || truncateText(article.content, 160);

  const articleAuthorName = author?.name || article.author || site.siteName;
  const featuredImage = article.featured_image_url || article.featured_image_thumbnail || "";
  const featuredImageAlt = safeAlt(article.featured_image_alt, article.title);

  // ── Social image: dedicated OG Image -> Featured Image -> site default ──
  // The News Dashboard lets an editor set an OG Image independently of the
  // Featured Image; when it's empty, the visible Featured Image is reused
  // for sharing instead of falling straight through to the site logo.
  const socialImageRaw = article.og_image_url || featuredImage || "";
  const socialImage = socialImageRaw ? site.url(socialImageRaw) : site.ogImageUrl;
  const socialImageAlt = article.og_image_url
    ? safeAlt(article.og_image_alt, article.title)
    : featuredImageAlt;
  // Only emit width/height when the selected social image's real
  // dimensions are known from the stored media record — never a guessed
  // 1200x675 for an image whose actual size we don't have.
  const socialImageWidth = article.og_image_url ? article.og_image_width : article.featured_image_width;
  const socialImageHeight = article.og_image_url ? article.og_image_height : article.featured_image_height;

  // Build author HTML in the controller — avoids template {{else}} issues
  let authorHtml = "";
  if (articleAuthorName) {
    const avatarHtml = (author?.avatar_url || article.author_avatar)
      ? `<img src="${escapeHtml(author?.avatar_url || article.author_avatar)}" alt="${escapeHtml(articleAuthorName)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
      : "";
    const nameHtml = (author?.slug || article.author_slug)
      ? `<a href="/en/author/${escapeHtml(author?.slug || article.author_slug)}" style="font-weight:700;text-decoration:none">${escapeHtml(articleAuthorName)}</a>`
      : `<strong>${escapeHtml(articleAuthorName)}</strong>`;
    // With the newsroom taxonomy flag on, prefer the author's job title (Senior Editor, Correspondent, ...).
    const displayRole = (newsroomData?.flags?.news_new_taxonomy && author?.job_title) || author?.role || article.author_role;
    const roleHtml = displayRole
      ? `<span style="color:var(--gray);font-size:12px;display:block">${escapeHtml(displayRole)}</span>`
      : "";
    authorHtml = `
      <div style="display:flex;align-items:center;gap:10px">
        ${avatarHtml}
        <div>
          <span style="color:var(--gray);font-size:12px">By</span><br>
          ${nameHtml}
          ${roleHtml}
        </div>
      </div>
    `;
  }


  // ── Tags as clickable links ──────────────────────────
  let tagsHtml = "";
  if (article.tags) {
    tagsHtml = String(article.tags)
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .map(tag => {
        const escaped = escapeHtml(tag);
        return `<a href="/en/news?tag=${encodeURIComponent(tag)}" class="news-tag" rel="tag" style="display:inline-block;padding:7px 14px;border-radius:999px;background:var(--bg);border:1px solid var(--light-gray);color:var(--dark);font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s">${escaped}</a>`;
      })
      .join("");
  }

  const wordCount = cleanContent ? cleanContent.split(/\s+/).filter(Boolean).length : 0;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${canonical}#newsarticle`,
    "url": canonical,
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "headline": article.title,
    "description": description,
    ...(featuredImage ? { "image": [featuredImage] } : {}),
    "datePublished": publishedIso,
    "dateModified": modifiedIso,
    "author": {
      "@type": "Person",
      "name": articleAuthorName,
      ...(author?.slug ? { "url": site.url(`/en/author/${author.slug}`) } : {}),
      ...(author?.avatar_url ? { "image": author.avatar_url } : {})
    },
    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin,
      ...(site.logoUrl ? { "logo": { "@type": "ImageObject", "url": site.logoUrl } } : {})
    },
    "articleBody": cleanContent,
    "wordCount": wordCount,
    "articleSection": "News",
    "inLanguage": "en",
    ...(article.tags ? { "keywords": article.tags } : {})
  };

  let nrBlocks = { kicker_html: "", notice_html: "", timeline_html: "", after_html: "", related_html: "", schema: {} };
  try {
    if (newsroomData?.extras) {
      nrBlocks = nrRender.buildNewsroomBlocks({
        article, extras: newsroomData.extras, flags: newsroomData.flags,
        siteName: site.siteName, formatDate, policyLinks: newsroomData.policyLinks
      });
    }
  } catch (e) {
    console.error("Newsroom blocks failed (page renders without them):", e.message);
  }
  Object.assign(articleSchema, nrBlocks.schema);

  let articleCrumbs = buildBreadcrumbs("news", { title: article.title });
  const nrSection = newsroomData?.flags?.news_new_taxonomy ? newsroomData.extras?.section : null;
  if (nrSection && articleCrumbs.length > 1) {
    articleCrumbs = [
      ...articleCrumbs.slice(0, -1),
      { label: nrSection.name, url: `/en/news/${nrSection.slug}` },
      articleCrumbs[articleCrumbs.length - 1]
    ];
  }

  const html = await renderer.render("news.html", {
    ...article,
    // The template engine does not HTML-escape {{vars}}; escape the ones the
    // article template puts in text/attribute positions.
    title: escapeHtml(article.title),
    newsroom_kicker_html: nrBlocks.kicker_html,
    newsroom_notice_html: nrBlocks.notice_html,
    newsroom_timeline_html: nrBlocks.timeline_html,
    newsroom_after_html: nrBlocks.after_html,
    newsroom_discovery_html: nrBlocks.discovery_html,
    newsroom_related_html: nrBlocks.related_html,
    canonical,
    seo_title: dynamicSeo.seo_title || article.seo_title || article.title,
    seo_description: description,
    seo_keywords: dynamicSeo.seo_keywords || article.seo_keywords || "",
    og_type: "article",
    og_image: socialImage,
    og_image_alt: socialImageAlt,
    ...(socialImageWidth ? { og_image_width: socialImageWidth } : {}),
    ...(socialImageHeight ? { og_image_height: socialImageHeight } : {}),
    author_name: author?.name || article.author || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    author_html: authorHtml,
    featured_image_url: escapeHtml(featuredImage),
    featured_image_alt: escapeHtml(featuredImageAlt),
    featured_image_caption: escapeHtml(article.featured_image_caption || ""),
    published_at: publishedDisplay,
    updated_at: modifiedDisplay,
    tags_html: tagsHtml,
    related_news_html: relatedNewsHtml,
    content: displayContent,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar
  }, articleSchema, articleCrumbs);

  return new Response(html, { headers: cacheHeaders() });
}
