// Category page and category list.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as categories from "../database/categories.js";
import * as nav from "../database/nav.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildCasinoCards, prepareGeoData, resolveBonusOverridesForList, resolvePaymentMethodsForList, sortCasinosByGeo } from "./casino-cards.js";
import { buildHubSubNavHtml, renderSeoPageSections, seoPageFaqSchema } from "./seo-pages.js";
import { cacheHeaders, safeAlt } from "./shared.js";
import { render404 } from "./system-pages.js";

export async function renderCategory(request, env, slug) {
  const category = await categories.getCategory(env.DB, slug);
  if (!category) return render404(request, env);
  if (category.published === 0) return render404(request, env);
  if (category.status === "draft") return render404(request, env);

  const renderer = new Renderer(env, request);

  // casinoList, site, subNavItems, components, and SEO are all
  // independent of each other — fetch them concurrently.
  const [casinoList, site, subNavItems, allComponents, dynamicSeo] = await Promise.all([
    categories.getCategoryCasinos(env.DB, slug),
    getSiteContext(request, env),
    nav.getScopedNavItems(env.DB, "category_subnav", "category", slug),
    renderer.renderAllComponents("category", slug),
    renderer.loadDynamicSeo("category", slug),
  ]);

  const geoData = await prepareGeoData(env, request, casinoList);
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);
  const hubSubNavHtml = buildHubSubNavHtml(subNavItems);
  const categorySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${category.name} Type Online Casinos`,
    "itemListElement": sortedCasinos.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };

  let categoryContent = {};
  try {
    categoryContent = typeof category.content_json === "string"
      ? JSON.parse(category.content_json)
      : category.content_json || {};
  } catch {
    categoryContent = {};
  }
  const casinoLookupById = {};
  for (const c of sortedCasinos) casinoLookupById[c.id] = c;
  const sectionsHtml = renderSeoPageSections(categoryContent, casinoLookupById, {}, geoData, bonusOverrides);
  const faqSchema = seoPageFaqSchema(categoryContent);
  const html = await renderer.render("category.html", {
    slug,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || category.seo_title || category.name + " Casinos",
    seo_description: dynamicSeo.seo_description || category.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || category.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/category/${slug}`),
    og_image: category.og_image_url ? site.url(category.og_image_url) : site.ogImageUrl,
    og_image_alt: safeAlt(category.og_image_alt, category.name),
    ...(category.og_image_width ? { og_image_width: category.og_image_width } : {}),
    ...(category.og_image_height ? { og_image_height: category.og_image_height } : {}),
    robots: category.robots || "index,follow",
    sections_html: sectionsHtml,
    hub_subnav_html: hubSubNavHtml,
    category: category.name,
    description: category.description,
    casino_cards: buildCasinoCards(sortedCasinos, geoData, bonusOverrides, paymentMethodsByCasino),
  }, [categorySchema, faqSchema].filter(Boolean), buildBreadcrumbs("category", { category: category.name }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderCategoryList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, cats, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    categories.getAllCategories(env.DB),
    renderer.renderAllComponents("category_list", "category_list"),
    renderer.loadDynamicSeo("category_list", "category_list"),
  ]);

  const categoryCards = cats.map(c => `
    <div class="feature-card">
      <h3><a href="/en/category/${c.slug}">${c.name}</a></h3>
      <p>${c.description || ""}</p>
    </div>
  `).join("");
      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    category: "All Categories",
    description: "Browse casinos by category.",
    casino_cards: `<div class="features-grid">${categoryCards}</div>`,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Casino Categories — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description ||  `Browse online casinos by category on ${site.siteName}.`,
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, {}, buildBreadcrumbs("categoryList"));

  return new Response(html, { headers: cacheHeaders() });
}
