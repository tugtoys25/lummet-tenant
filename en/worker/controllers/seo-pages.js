// SEO landing pages: country custom pages and category + country pages.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as authors from "../database/authors.js";
import * as categories from "../database/categories.js";
import * as casinos from "../database/casinos.js";
import * as countries from "../database/countries.js";
import { sanitizeHtml } from "../sanitize.js";
import * as seoPages from "../database/seo-pages.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { buildCasinoCards, prepareGeoData, resolveBonusOverridesForList, resolvePaymentMethodsForList } from "./casino-cards.js";
import { cacheHeaders, escapeHtml } from "./shared.js";
import { render404 } from "./system-pages.js";

// =====================================================
// SEO LANDING PAGES (country_custom / category_country)
// See migrations/0019_seo_landing_pages.sql and
// worker/database/seo-pages.js.
// =====================================================

// Resolves the final, live casino list for a landing page according
// to its casino_mode. Always re-joins to the current `casinos` table
// (via seoPages.getSeoPageCasinos / the eligibility queries) — never
// reads cached/duplicated casino facts, per spec section 5.
async function resolveSeoPageCasinos(env, page, eligibleCasinos) {
  const manualRows = await seoPages.getSeoPageCasinos(env.DB, page.id);
  const mainSelections = manualRows.filter((r) => !r.section_key && r.display_mode !== "editorial");
  const editorialByKey = {};
  for (const row of manualRows) {
    if (row.section_key) {
      editorialByKey[row.section_key] = row;
    }
  }

  if (page.casino_mode === "manual") {
    return { mainList: mainSelections, editorialByKey };
  }

  if (page.casino_mode === "auto") {
    return { mainList: eligibleCasinos, editorialByKey };
  }

  // auto_priority (default): eligible casinos define the pool, but
  // manually-selected ones are pulled to the front in their chosen
  // order; everything else follows in the default eligibility order.
  const manualIds = new Set(mainSelections.map((r) => r.id));
  const rest = eligibleCasinos.filter((c) => !manualIds.has(c.id));
  return { mainList: [...mainSelections, ...rest], editorialByKey };
}

// Renders content_json.sections into HTML. Supports the section
// types actually built out this pass: rich_text, casino_grid,
// casino_editorial, casino_spotlights, faq, cta. Unknown types are
// skipped rather than erroring, so older/partial content never
// breaks a page.
export function renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData, bonusOverrides = {}) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];

  return sections
    .map((section) => {
      const heading = section.title
        ? `<h2 class="seo-section__title">${section.title}</h2>${section.subtitle ? `<p class="seo-section__subtitle muted">${section.subtitle}</p>` : ""}`
        : "";

      switch (section.type) {
        case "rich_text":
        case "text":
          return `<section class="seo-section seo-section--text">${heading}<div class="seo-section__body">${section.body || ""}</div></section>`;

        case "heading":
          return `<h2 class="seo-section__title">${section.title || ""}</h2>`;

        case "image":
          return section.image
            ? `<section class="seo-section seo-section--image">${heading}<img src="${section.image}" alt="${section.title || ""}" loading="lazy" /></section>`
            : "";

        case "casino_grid":
        case "casino_comparison": {
          const ids = Array.isArray(section.casino_ids) ? section.casino_ids : null;
          const list = ids
            ? ids.map((id) => casinoLookupById[id]).filter(Boolean)
            : Object.values(casinoLookupById);
          if (list.length === 0) return "";
          return `<section class="seo-section seo-section--casinos">${heading}<div class="casino-grid">${buildCasinoCards(list, geoData, bonusOverrides)}</div></section>`;
        }

        case "casino_editorial": {
          const casino = casinoLookupById[section.casino_id];
          if (!casino) return "";
          const editorial = editorialByKey[section.id];
          const body = editorial?.editorial_content || section.body || "";
          return `
            <section class="seo-section seo-section--casino-editorial">
              ${heading}
              <div class="casino-grid">${buildCasinoCards([casino], geoData, bonusOverrides)}</div>
              ${body ? `<div class="seo-section__body">${body}</div>` : ""}
            </section>`;
        }

        // casino_spotlights: like casino_editorial but for several
        // casinos at once, each with its own independent write-up —
        // {casino_id, body} pairs stored on the section itself
        // (section.spotlights), not tied to seo_page_casinos. Use
        // this instead of stacking multiple casino_editorial
        // sections when several casinos share one heading/intro.
        case "casino_spotlights": {
          const spotlights = Array.isArray(section.spotlights) ? section.spotlights : [];
          const cards = spotlights
            .map((sp) => {
              const casino = casinoLookupById[sp.casino_id];
              if (!casino) return "";
              return `
                <div class="seo-section__casino-spotlight">
                  <div class="casino-grid">${buildCasinoCards([casino], geoData, bonusOverrides)}</div>
                  ${sp.body ? `<div class="seo-section__body">${sp.body}</div>` : ""}
                </div>`;
            })
            .filter(Boolean)
            .join("");
          if (!cards) return "";
          return `<section class="seo-section seo-section--casino-spotlights">${heading}${cards}</section>`;
        }

        case "faq": {
          const items = Array.isArray(section.items) ? section.items : [];
          if (items.length === 0) return "";
          return `
            <section class="seo-section seo-section--faq">
              ${heading}
              <div class="faq-list">
                ${items.map((item) => `
                  <div class="faq-item">
                    <h3 class="faq-item__question">${item.q || ""}</h3>
                    <div class="faq-item__answer">${item.a || ""}</div>
                  </div>`).join("")}
              </div>
            </section>`;
        }

        case "cta":
          return `
            <section class="seo-section seo-section--cta" ${section.background ? `style="background:${section.background};"` : ""}>
              ${heading}
              ${section.body ? `<p>${section.body}</p>` : ""}
              ${section.url ? `<a class="btn btn--primary" href="${section.url}">${section.label || "Learn more"}</a>` : ""}
            </section>`;

        case "internal_links":
        case "custom_links": {
          const links = Array.isArray(section.links) ? section.links : [];
          if (links.length === 0) return "";
          return `
            <section class="seo-section seo-section--links">
              ${heading}
              <ul class="seo-section__links">
                ${links.map((l) => `<li><a href="${l.url}">${l.label}</a></li>`).join("")}
              </ul>
            </section>`;
        }

        default:
          return "";
      }
    })
    .join("\n");
}

export function seoPageFaqSchema(content) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const faqSection = sections.find((s) => s.type === "faq" && Array.isArray(s.items) && s.items.length > 0);
  if (!faqSection) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqSection.items
      .filter((i) => i.q && i.a)
      .map((i) => ({
        "@type": "Question",
        "name": i.q,
        "acceptedAnswer": { "@type": "Answer", "text": i.a }
      }))
  };
}

// Renders the contextual, scrollable sub-page nav bar shown at
// the top of a country/category hub page's content — every
// published seo_pages sub-page under this specific hub (auto
// via 0021_hub_subpage_nav.sql), plus any manual entries an
// admin has added with the same scope. Deliberately a separate
// component from {{{pagenav}}} (the global site-wide Page
// Navigation) — this one only ever appears on its one matching
// hub page. Returns "" (renders nothing) when there are no items,
// so hubs with no sub-pages yet show no empty bar.
function escapeHubNavHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildHubSubNavHtml(items) {
  if (!items || items.length === 0) return "";
  const links = items.map((item) => {
    const href = escapeHubNavHtml(item.url);
    const label = escapeHubNavHtml(item.label);
    const external = item.is_external ? ' target="_blank" rel="noopener"' : "";
    return `<a class="hubsubnav__link" href="${href}"${external}>${label}</a>`;
  }).join("");

  return `
<div class="hubsubnav">
  <div class="hubsubnav__scroll">
    ${links}
  </div>
</div>`;
}

export async function renderCountryCustomPage(request, env, countryCode, slug) {
  const code = countryCode.toUpperCase();

  // page, country, and the eligible-casino list are independent
  // lookups (none needs another's result), so fetch them concurrently.
  const [page, country, eligibleCasinos] = await Promise.all([
    seoPages.getSeoPageByUrl(env.DB, "country_custom", code, slug),
    countries.getCountry(env.DB, code),
    casinos.getCasinosByCountryAllowlist(env.DB, code),
  ]);
  if (!page || !page.published) return render404(request, env);
  if (!country) return render404(request, env);

  const { mainList, editorialByKey } = await resolveSeoPageCasinos(env, page, eligibleCasinos);

  const casinoLookupById = {};
  for (const c of mainList) casinoLookupById[c.id] = c;
  // Editorial sections can reference any eligible casino, even one
  // not in the main grid — make sure those resolve too.
  for (const c of eligibleCasinos) if (!casinoLookupById[c.id]) casinoLookupById[c.id] = c;

  let content = {};
  try {
    content = typeof page.content_json === "string" ? JSON.parse(page.content_json) : page.content_json || {};
  } catch {
    content = {};
  }

  const renderer = new Renderer(env, request);

  // geoData, site, author, and components are all independent —
  // fetch concurrently. bonusOverrides needs geoData.country, so it
  // stays as a follow-up step.
  const [geoData, site, author, allComponents] = await Promise.all([
    prepareGeoData(env, request, mainList),
    getSiteContext(request, env),
    page.author_id ? authors.getAuthorById(env.DB, page.author_id).catch(() => null) : Promise.resolve(null),
    renderer.renderAllComponents("country_custom_page", `${code}/${slug}`),
  ]);
  // One shared overrides map covers both the main grid AND any
  // casino_grid/casino_editorial sections rendered below — every
  // casino either could ever reference is already in casinoLookupById.
  const bonusOverrides = await resolveBonusOverridesForList(env, Object.values(casinoLookupById), geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, Object.values(casinoLookupById));

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title,
    "url": page.canonical_url || site.url(`/en/country/${code}/${slug}`)
  };
  const itemListSchema = mainList.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": page.title,
        "itemListElement": mainList.map((c, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "url": site.url(`/en/casino/${c.slug}`)
        }))
      }
    : pageSchema;
  const faqSchema = seoPageFaqSchema(content);

  const html = await renderer.render("seo-landing.html", {
    title: escapeHtml(page.title),
    intro: content.intro ? sanitizeHtml(String(content.intro)) : "",
    sections_html: renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData, bonusOverrides),
    casino_cards: buildCasinoCards(mainList, geoData, bonusOverrides, paymentMethodsByCasino),
    has_casinos: mainList.length > 0,
    country_name: escapeHtml(country.name),
    country_code: code,
    parent_label: escapeHtml(country.name),
    parent_url: site.url(`/en/country/${code}`),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: page.seo_title || page.title,
    seo_description: page.seo_description || "",
    seo_keywords: page.seo_keywords || "",
    canonical: page.canonical_url || site.url(`/en/country/${code}/${slug}`),
    og_image: (page.og_image || page.featured_image) ? site.url(page.og_image || page.featured_image) : site.ogImageUrl,
    og_image_alt: page.title,
    robots: page.robots || "index,follow",
    author_name: escapeHtml(author?.name || ""),
    author_id: page.author_id || null
  }, [itemListSchema, faqSchema].filter(Boolean),
    buildBreadcrumbs("countryCustomPage", { title: page.title, countryName: country.name, countryCode: code }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderCategoryCountryPage(request, env, categorySlug, countryCode) {
  const code = countryCode.toUpperCase();

  // category, country, the editorial page (if any), and the eligible
  // casino list don't depend on each other — fetch concurrently.
  // (The comment below on eligibleCasinos still applies to how the
  // result is used, just not to when it's fetched.)
  const [category, country, page, eligibleCasinos] = await Promise.all([
    categories.getCategory(env.DB, categorySlug),
    countries.getCountry(env.DB, code),
    seoPages.getSeoPageByUrl(env.DB, "category_country", code, categorySlug),
    seoPages.getEligibleCasinosForCategoryCountry(env.DB, categorySlug, code),
  ]);
  if (!category) return render404(request, env);
  if (!country) return render404(request, env);

  // No editorial page yet, or it's unpublished: fall back to a pure
  // auto-generated render IF the combination is genuinely eligible
  // (real casinos exist for it), so a legitimate category x country
  // intent still resolves even before an editor has reviewed it.
  // This never creates a DB row — it's render-only.
  if ((!page || !page.published) && eligibleCasinos.length === 0) {
    return render404(request, env);
  }

  const effectivePage = page || {
    id: null,
    title: `${category.name} Casinos in ${country.name}`,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    canonical_url: null,
    og_image: null,
    featured_image: null,
    robots: "index,follow",
    author_id: null,
    content_json: "{}",
    casino_mode: "auto"
  };

  const { mainList, editorialByKey } = page
    ? await resolveSeoPageCasinos(env, page, eligibleCasinos)
    : { mainList: eligibleCasinos, editorialByKey: {} };

  const casinoLookupById = {};
  for (const c of mainList) casinoLookupById[c.id] = c;
  for (const c of eligibleCasinos) if (!casinoLookupById[c.id]) casinoLookupById[c.id] = c;

  let content = {};
  try {
    content = typeof effectivePage.content_json === "string" ? JSON.parse(effectivePage.content_json) : effectivePage.content_json || {};
  } catch {
    content = {};
  }

  const renderer = new Renderer(env, request);

  // geoData, site, author, and components are all independent —
  // fetch concurrently. bonusOverrides needs geoData.country, so it
  // stays as a follow-up step.
  const [geoData, site, author, allComponents] = await Promise.all([
    prepareGeoData(env, request, mainList),
    getSiteContext(request, env),
    effectivePage.author_id ? authors.getAuthorById(env.DB, effectivePage.author_id).catch(() => null) : Promise.resolve(null),
    renderer.renderAllComponents("category_country_page", `${categorySlug}/${code}`),
  ]);
  const bonusOverrides = await resolveBonusOverridesForList(env, Object.values(casinoLookupById), geoData.country);
  const paymentMethodsByCasino = await resolvePaymentMethodsForList(env, Object.values(casinoLookupById));

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": effectivePage.title,
    "itemListElement": mainList.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };
  const faqSchema = seoPageFaqSchema(content);

  const html = await renderer.render("seo-landing.html", {
    title: escapeHtml(effectivePage.title),
    intro: sanitizeHtml(String(content.intro || category.description || "")),
    sections_html: renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData, bonusOverrides),
    casino_cards: buildCasinoCards(mainList, geoData, bonusOverrides, paymentMethodsByCasino),
    has_casinos: mainList.length > 0,
    country_name: escapeHtml(country.name),
    country_code: code,
    parent_label: escapeHtml(category.name),
    parent_url: site.url(`/en/category/${categorySlug}`),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: effectivePage.seo_title || effectivePage.title,
    seo_description: effectivePage.seo_description || "",
    seo_keywords: effectivePage.seo_keywords || "",
    canonical: effectivePage.canonical_url || site.url(`/en/category/${categorySlug}/${code}`),
    og_image: (effectivePage.og_image || effectivePage.featured_image) ? site.url(effectivePage.og_image || effectivePage.featured_image) : site.ogImageUrl,
    og_image_alt: effectivePage.title,
    robots: effectivePage.robots || "index,follow",
    author_name: escapeHtml(author?.name || ""),
    author_id: effectivePage.author_id || null
  }, [itemListSchema, faqSchema].filter(Boolean),
    buildBreadcrumbs("categoryCountryPage", { categorySlug, categoryName: category.name, countryName: country.name }));

  return new Response(html, { headers: cacheHeaders() });
}
