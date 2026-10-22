// Payment method list and page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as paymentMethods from "../database/payment-methods.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildCasinoCards, prepareGeoData, resolveBonusOverridesForList, resolvePaymentMethodsForList, sortCasinosByGeo } from "./casino-cards.js";
import { renderSeoPageSections, seoPageFaqSchema } from "./seo-pages.js";
import { cacheHeaders, escapeHtml } from "./shared.js";
import { render404 } from "./system-pages.js";

// =====================================================
// PAYMENT METHODS
// /en/payment-methods            (list)
// /en/payment-methods/:slug      (detail)
// Reuses category.html's slug+description+casino_cards shape --
// same technique renderCategoryList() above already uses for a
// listing page that isn't really "a category" either.
// =====================================================

export async function renderPaymentMethodList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, methods, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    paymentMethods.getPublishedPaymentMethods(env.DB),
    renderer.renderAllComponents("payment_method_list", "payment_method_list"),
    renderer.loadDynamicSeo("payment_method_list", "payment_method_list"),
  ]);

  const methodCards = methods.map(m => `
    <a href="/en/payment-methods/${m.slug}" class="feature-card feature-card--payment-method">
      ${m.icon_url ? `<img src="${m.icon_url}" alt="${escapeHtml(m.name)}" class="payment-method-card__icon" loading="lazy" onerror="this.style.display='none'">` : ""}
      <h3>${escapeHtml(m.name)}</h3>
    </a>
  `).join("");

  const html = await renderer.render("category.html", {
    category: "Payment Methods",
    description: "Browse casinos by the deposit and withdrawal methods they support.",
    casino_cards: `<div class="features-grid">${methodCards}</div>`,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Payment Methods — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || `Browse online casinos by supported payment method on ${site.siteName}.`,
    seo_keywords: dynamicSeo.seo_keywords || "",
  }, {}, buildBreadcrumbs("paymentMethodList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderPaymentMethod(request, env, slug) {
  const method = await paymentMethods.getPaymentMethod(env.DB, slug);
  if (!method) return render404(request, env);
  if (method.published === 0) return render404(request, env);
  if (method.status === "draft") return render404(request, env);

  const renderer = new Renderer(env, request);

  const [casinoList, site, allComponents, dynamicSeo] = await Promise.all([
    paymentMethods.getCasinosForPaymentMethod(env.DB, slug),
    getSiteContext(request, env),
    renderer.renderAllComponents("payment_method", slug),
    renderer.loadDynamicSeo("payment_method", slug),
  ]);

  const geoData = await prepareGeoData(env, request, casinoList);
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);

  const paymentMethodSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Casinos That Accept ${method.name}`,
    "itemListElement": sortedCasinos.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`),
    })),
  };

  let methodContent = {};
  try {
    methodContent = typeof method.content_json === "string"
      ? JSON.parse(method.content_json)
      : method.content_json || {};
  } catch {
    methodContent = {};
  }
  const casinoLookupById = {};
  for (const c of sortedCasinos) casinoLookupById[c.id] = c;
  const sectionsHtml = renderSeoPageSections(methodContent, casinoLookupById, {}, geoData, bonusOverrides);
  const faqSchema = seoPageFaqSchema(methodContent);

  const html = await renderer.render("category.html", {
    slug,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || method.seo_title || `${method.name} Casinos`,
    seo_description: dynamicSeo.seo_description || method.seo_description || method.description || "",
    seo_keywords: dynamicSeo.seo_keywords || method.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/payment-methods/${slug}`),
    robots: "index,follow",
    sections_html: sectionsHtml,
    category: method.name,
    description: method.description || `Online casinos that accept ${method.name} for deposits and withdrawals.`,
    casino_cards: buildCasinoCards(sortedCasinos, geoData, bonusOverrides, paymentMethodsByCasino),
  }, [paymentMethodSchema, faqSchema].filter(Boolean), buildBreadcrumbs("paymentMethod", { name: method.name }));

  return new Response(html, { headers: cacheHeaders() });
}
