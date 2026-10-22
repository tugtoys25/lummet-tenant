// Country page and country list.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as casinos from "../database/casinos.js";
import * as countries from "../database/countries.js";
import * as nav from "../database/nav.js";
import { getSetting } from "../database/settings.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildCasinoCards, prepareGeoData, resolveBonusOverridesForList, resolvePaymentMethodsForList } from "./casino-cards.js";
import { buildHubSubNavHtml, renderSeoPageSections, seoPageFaqSchema } from "./seo-pages.js";
import { cacheHeaders, escapeHtml, safeAlt } from "./shared.js";
import { render404 } from "./system-pages.js";

export async function renderCountry(request, env, slug) {
  const code = slug.toUpperCase();
  const country = await countries.getCountry(env.DB, code);

  // A country with no DB row at all still renders (existing
  // behavior, unchanged) — draft gating only applies to a real,
  // explicitly-drafted row.
  if (country && country.published === 0) return render404(request, env);
  if (country && country.status === "draft") return render404(request, env);

  const countryData = country || {
    code, name: code, seo_title: null, seo_description: null
  };
  const renderer = new Renderer(env, request);

  // casinoList, site, subNavItems, components, and SEO are all
  // independent of each other — fetch them concurrently.
  const [casinoList, site, subNavItems, allComponents, dynamicSeo] = await Promise.all([
    casinos.getCasinosByCountryAllowlist(env.DB, code),
    getSiteContext(request, env),
    nav.getScopedNavItems(env.DB, "country_subnav", "country", code),
    renderer.renderAllComponents("country", code),
    renderer.loadDynamicSeo("country", code),
  ]);

  // Sort by rating descending (highest first)
  casinoList.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const geoData = await prepareGeoData(env, request, casinoList);
  const bonusOverrides = await resolveBonusOverridesForList(env, casinoList, geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, casinoList);
  const hubSubNavHtml = buildHubSubNavHtml(subNavItems);
  const countrySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Best Online Casinos in ${countryData.name}`,
    "itemListElement": casinoList.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };

  let countryContent = {};
  try {
    countryContent = typeof countryData.content_json === "string"
      ? JSON.parse(countryData.content_json)
      : countryData.content_json || {};
  } catch {
    countryContent = {};
  }
  const casinoLookupById = {};
  for (const c of casinoList) casinoLookupById[c.id] = c;
  const sectionsHtml = renderSeoPageSections(countryContent, casinoLookupById, {}, geoData, bonusOverrides);
  const faqSchema = seoPageFaqSchema(countryContent);
  const html = await renderer.render("country.html", {
    ...countryData,
    name: escapeHtml(countryData.name),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || countryData.seo_title || countryData.name + " Online Casinos",
    seo_description: dynamicSeo.seo_description || countryData.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || countryData.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/country/${code}`),
    og_image: countryData.og_image_url ? site.url(countryData.og_image_url) : site.ogImageUrl,
    og_image_alt: safeAlt(countryData.og_image_alt, countryData.name),
    ...(countryData.og_image_width ? { og_image_width: countryData.og_image_width } : {}),
    ...(countryData.og_image_height ? { og_image_height: countryData.og_image_height } : {}),
    robots: countryData.robots || "index,follow",
    sections_html: sectionsHtml,
    hub_subnav_html: hubSubNavHtml,
    casino_cards: buildCasinoCards(casinoList, geoData, bonusOverrides, paymentMethodsByCasino),
  }, [countrySchema, faqSchema].filter(Boolean), buildBreadcrumbs("country", { name: countryData.name }));
  return new Response(html, {
    headers: cacheHeaders()
  });
}

// -----------------------------------------------------
// /en/country directory helpers — a dedicated page, not a
// reskin of category.html. See migrations/0022_country_directory_tiers.sql.
// -----------------------------------------------------

function renderFeaturedCountryCards(list) {
  return list
    .map(
      (c) => `
    <a href="/en/country/${escapeHtml(c.code)}" class="feature-card feature-card--country">
      <h3>${escapeHtml(c.name)}</h3>
    </a>`
    )
    .join("");
}

function groupCountriesByFirstLetter(list) {
  const groups = {};
  for (const c of list) {
    const letter = (c.name || "?").trim().charAt(0).toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : "#";
    groups[key] ??= [];
    groups[key].push(c);
  }
  return Object.keys(groups)
    .sort()
    .map((letter) => ({ letter, items: groups[letter] }));
}

function renderAlphabeticalCountryGroups(groups) {
  return groups
    .map(
      (group) => `
    <div class="country-directory__group" data-country-letter-group>
      <h3 class="country-directory__letter">${escapeHtml(group.letter)}</h3>
      <div class="country-chips">
        ${group.items
          .map((c) => `<a href="/en/country/${escapeHtml(c.code)}" class="chip" data-country-name="${escapeHtml(c.name.toLowerCase())}">${escapeHtml(c.name)}</a>`)
          .join("")}
      </div>
    </div>`
    )
    .join("");
}

export async function renderCountryList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, featured, allCountries, featuredLabel, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    countries.getFeaturedCountries(env.DB),
    countries.getPublishedCountries(env.DB),
    getSetting(env.DB, "country_directory_featured_label"),
    renderer.renderAllComponents("country_list", "country_list"),
    renderer.loadDynamicSeo("country_list", "country_list"),
  ]);

  const alphaGroups = groupCountriesByFirstLetter(allCountries);

  const html = await renderer.render("country-list.html", {
    featured_section_label: featuredLabel || "Featured Gambling Markets",
    featured_countries_html: renderFeaturedCountryCards(featured),
    alphabetical_countries_html: renderAlphabeticalCountryGroups(alphaGroups),
    total_country_count: String(allCountries.length),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Online Casinos by Country — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || `Find online casinos available in your country on ${site.siteName}.`,
    seo_keywords: dynamicSeo.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url("/en/country"),
    robots: dynamicSeo.seo_robots || "index,follow",
    og_image: dynamicSeo.og_image || ""
  }, {}, buildBreadcrumbs("countryList"));

  return new Response(html, { headers: cacheHeaders() });
}
