// Content landing pages.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as authors from "../database/authors.js";
import * as contentItems from "../database/content-items.js";
import { getReviewBlocks as getReviewBlocksForSlug } from "../database/review_blocks.js";
import * as landingPagesDB from "../database/content-landing-pages.js";
import { renderSections, faqSchemaScript, renderSectionNav } from "../generic-review-sections.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildContentItemCards, cacheHeaders, escapeHtml, prepareContentGeoData } from "./shared.js";
import { render404 } from "./system-pages.js";

/**
 * Public renderer for content_landing_pages (migration 0061). See
 * that migration's own comment for why this is a separate, smaller
 * system from the casino seo_pages one, not an extension of it.
 */
export async function renderContentLandingPage(request, env, slug) {
  const page = await landingPagesDB.getPublishedLandingPage(env.DB, slug);
  if (!page) return render404(request, env);

  let itemList;
  if (page.item_mode === "manual") {
    const itemIds = await landingPagesDB.getLandingPageItemIds(env.DB, page.id);
    itemList = [];
    for (const id of itemIds) {
      // getContentGeoStatuses() below needs published items; a manually
      // curated id that has since been unpublished is skipped rather
      // than rendered as a broken card (same "skip, don't fail" posture
      // loadComparisonRowItems() uses for comparison rows).
      const row = await contentItems.getContentItemById(env.DB, page.content_type, id);
      if (row && row.published && row.status === "published" && (page.content_type !== "custom" || row.custom_type_slug === page.custom_type_slug)) {
        itemList.push(row);
      }
    }
  } else {
    itemList = await contentItems.getAllContentItems(env.DB, page.content_type, { status: "published" });
    if (page.content_type === "custom") itemList = itemList.filter(i => i.custom_type_slug === page.custom_type_slug);
    itemList = itemList.filter(i => i.published)
      .sort((a, b) => (b.featured - a.featured) || ((b.rating || 0) - (a.rating || 0)))
      .slice(0, page.auto_limit);
  }

  const renderer = new Renderer(env, request);
  const geoData = await prepareContentGeoData(env, request, page.content_type, itemList);
  // An item with no country rules at all used to count as "blocked", so a page with picked or automatic items showed none.
  // Now only an item that HAS rules and is blocked for this visitor's country is left out; items without rules show.
  let withRules = new Set();
  try {
    if (itemList.length) {
      const ids = itemList.map((i) => i.id);
      const rows = (await env.DB.prepare(`SELECT DISTINCT content_id FROM content_geo WHERE content_type = ? AND content_id IN (${ids.map(() => "?").join(",")})`).bind(page.content_type, ...ids).all()).results || [];
      withRules = new Set(rows.map((r) => r.content_id));
    }
  } catch { /* no rules data: show everything */ }
  const eligibleItems = itemList.filter((i) => !(withRules.has(i.id) && geoData.statuses[i.id] === "blocked"));
  // items without any country rule get no availability badge (their computed status is not meaningful)
  geoData.statuses = Object.fromEntries(Object.entries(geoData.statuses || {}).filter(([id]) => withRules.has(Number(id))));

  const [site, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents("content_landing_page", slug),
    renderer.loadDynamicSeo("content_landing_page", slug),
  ]);

  let lpSections = { html: "", nav: [], faq: [] };
  try { lpSections = await renderSections(env.DB, await getReviewBlocksForSlug(env.DB, landingPagesDB.landingBlocksKey(page.slug))); } catch (err) { console.error("landing sections failed:", err); }
  let lpAuthor = null;
  try { lpAuthor = page.author_id ? await authors.getAuthorById(env.DB, page.author_id) : null; } catch { /* byline is optional */ }
  const lpNav = renderSectionNav(eligibleItems.length ? [{ id: "landing-items", title: page.title.length > 28 ? "Top picks" : page.title }, ...lpSections.nav] : lpSections.nav);
  const lpByline = lpAuthor ? `<p class="lp-byline">By <a href="/en/author/${encodeURIComponent(lpAuthor.slug)}">${escapeHtml(lpAuthor.name)}</a>${page.updated_at ? ` &middot; Updated <time datetime="${escapeHtml(String(page.updated_at).slice(0, 10))}">${escapeHtml(String(page.updated_at).slice(0, 10))}</time>` : ""}</p>` : "";

  const linkPrefix = page.content_type === "custom" ? `/en/custom/${page.custom_type_slug}` : page.content_type === "sportsbook" ? "/en/sportsbook" : "/en/affiliate-partner";

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": page.title,
    "itemListElement": eligibleItems.map((item, idx) => ({ "@type": "ListItem", "position": idx + 1, "url": site.url(`${linkPrefix}/${item.slug}`) })),
  };

  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url(`/en/best/${slug}`),
    category: page.title,
    description: page.description || "",
    casino_cards: buildContentItemCards(eligibleItems, page.content_type, linkPrefix, geoData),
    landing_nav_html: lpNav,
    landing_byline_html: lpByline,
    landing_sections_html: lpSections.html,
    landing_faq_schema_html: faqSchemaScript(lpSections.faq),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    seo_title: escapeHtml(dynamicSeo.title || page.seo_title || page.title),
    seo_description: escapeHtml(dynamicSeo.description || page.seo_description || page.description || ""),
  }, listSchema, buildBreadcrumbs("contentLandingPage", { title: page.title }));

  return new Response(html, { headers: cacheHeaders() });
}
