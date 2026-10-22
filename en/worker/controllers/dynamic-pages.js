// Pages built from the Pages table (dynamic pages).
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as authors from "../database/authors.js";
import * as pages from "../database/pages.js";
import * as nrTrust from "../newsroom-trust.js";
import { logEvent as logAnalyticsEvent } from "../database/analytics.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { injectInlineAds } from "./ads.js";
import { cacheHeaders, escapeHtml, formatDate, parseContentJson } from "./shared.js";
import { render404 } from "./system-pages.js";

export async function renderDynamicPage(request, env, slug, ctx = null) {
  const page = await pages.getPage(env.DB, slug);
  if (!page) return render404(request, env);

  // Security: only render published pages publicly -- closes a gap
  // found while instrumenting page-view analytics. getPage() itself
  // deliberately does NOT filter on `published` (both admin and public
  // callers use it), so this check belongs here, matching the exact
  // convention already used by renderReview/renderNews for their own
  // published flags, not inside the shared database helper.
  if (!page.published || Number(page.published) !== 1) {
    return render404(request, env);
  }

  // Analytics (Phase: page-view instrumentation). Same non-blocking
  // pattern as casino/review/news. No geoEngine.process() call, same
  // reasoning as those: generic pages don't evaluate a GEO access rule,
  // so this uses the free edge-provided country/city directly instead
  // of adding a computation to the render path purely to feed analytics.
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'PAGE_VIEW',
        pageId: page.id,
        countryCode: request.cf?.country || null,
        city: request.cf?.city || null,
        referrer: request.headers.get('referer') || null,
        landingPage: `/en/${slug}`
      }).catch(() => {})
    );
  }

  const renderer = new Renderer(env, request);

  // ── Inline advertisement injection (was missing for pages) ──
  const rawPageContent = parseContentJson(page.content_json);

  // All of these are independent of each other — fetch concurrently.
  const [site, author, allComponents, dynamicSeo, pageDisplayContent] = await Promise.all([
    getSiteContext(request, env),
    page.author_id ? authors.getAuthorById(env.DB, page.author_id) : Promise.resolve(null),
    renderer.renderAllComponents("page", slug, ctx),
    renderer.loadDynamicSeo("page", slug),
    injectInlineAds(rawPageContent, env, request, "page").catch(e => {
      console.error("Inline ad injection error (page):", e.message);
      return rawPageContent;
    }),
  ]);

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title,
    "description": page.seo_description || "",
    "datePublished": page.created_at,
    "dateModified": page.updated_at || page.created_at
  };

  // Editorial trust hub: append links to whichever policy pages are live.
  let hubIndex = "";
  if (slug === "editorial") {
    try {
      const live = await nrTrust.getPublishedTrustPages(env.DB);
      hubIndex = nrTrust.renderTrustIndex(live.map(p => p.slug), Object.fromEntries(live.map(p => [p.slug, p.title])));
    }
    catch (e) { console.error("Trust index failed:", e.message); }
  }

  const html = await renderer.render("page.html", {
    ...page,
    // {{vars}} are not HTML-escaped by the template engine.
    title: escapeHtml(page.title),
    canonical: dynamicSeo.canonical || site.url(`/en/${slug}`),
    author_name: escapeHtml(author?.name || ""),
    author_avatar: escapeHtml(author?.avatar_url || ""),
    author_role: escapeHtml(author?.role || ""),
    author_slug: encodeURIComponent(author?.slug || ""),
    datePublished: formatDate(page.created_at),
    dateModified: formatDate(page.updated_at || page.created_at),
    content_json: pageDisplayContent + hubIndex,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || page.title,
    seo_description: dynamicSeo.seo_description || page.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || page.seo_keywords || "",
  }, pageSchema, buildBreadcrumbs("page", { title: page.title }));

  return new Response(html, { headers: cacheHeaders() });
}
