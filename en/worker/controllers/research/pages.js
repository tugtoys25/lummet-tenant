import { Renderer } from "../../render.js";
import { getSiteContext } from "../../site-context.js";
import * as research from "../../database/research.js";
import * as researchSources from "../../database/research-sources.js";
import * as researchClaims from "../../database/research-claims.js";
import * as researchRelations from "../../database/research-relations.js";
import { searchSite } from "../../site-search.js";
import { buildBreadcrumbs } from "../../breadcrumbs.js";
import { seoPageFaqSchema } from "../seo-pages.js";
import { cacheHeaders, escapeHtml, safeAlt } from "../shared.js";
import { render404 } from "../system-pages.js";
import { renderResearchClaims, renderResearchRelated, renderResearchSections, renderResearchSourcesFootnotes, researchTypeLabel } from "./sections.js";
import { RESEARCH_SORTS, researchComponentVars, researchDirectoryFilterOptions, researchItemCardHtml, researchSortOptionsHtml, sortResearchItems } from "./directory.js";

export async function renderSiteSearch(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  const found = await searchSite(env.DB, q, { perGroup: 20 });
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let body = "";
  if (q.length < 2) {
    body = `<p class="muted">Type at least two letters to search casinos, reviews, research, news and pages.</p>`;
  } else if (!found.groups.length) {
    body = `<p class="muted">Nothing matched \u201c${esc(q)}\u201d. Try a shorter word or a different spelling.</p>`;
  } else {
    body = `<nav class="ss-jump" aria-label="Result types">${found.groups.map((g) =>
      `<a href="#ss-${g.key}">${esc(g.label)} <span>${g.items.length}</span></a>`).join("")}</nav>` +
      found.groups.map((g) => `
      <section class="ss-group" id="ss-${g.key}">
        <h2>${esc(g.label)} <span class="ss-count">${g.items.length}</span></h2>
        <ul class="ss-list">${g.items.map((i) => `
          <li><a href="${esc(i.url)}">
            ${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
            <span class="ss-title">${esc(i.title)}</span>
            ${i.meta ? `<span class="ss-meta">${esc(i.meta)}</span>` : ""}
          </a></li>`).join("")}</ul>
      </section>`).join("");
  }

  const html = await renderer.render("search.html", {
    heading: q.length >= 2 ? `Search results for \u201c${q}\u201d` : "Search",
    query: q,
    summary: q.length >= 2 ? `${found.total} result${found.total === 1 ? "" : "s"}` : "",
    results_html: body,
    seo_title: "Search | " + site.siteName,
    seo_description: "Search everything published on " + site.siteName + ".",
    canonical: site.url("/en/search"),
    robots: "noindex,follow"
  }, [], buildBreadcrumbs("siteSearch"));

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function renderResearchHub(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const featured = await research.getFeaturedResearchItems(env.DB, 6);
  // Every published item is listed (the old list stopped at 12). Featured items
  // are highlighted above and also stay in the full list, so nothing disappears.
  const sortKey = RESEARCH_SORTS[new URL(request.url).searchParams.get("sort")] ? new URL(request.url).searchParams.get("sort") : "newest";
  const latest = sortResearchItems(await research.getPublishedResearchItems(env.DB, { limit: 5000 }), sortKey);
  const allComponents = await renderer.renderAllComponents("research_list", "research_list");

  const allShown = [...featured, ...latest];
  const relationsByItemId = await researchRelations.getRelationsFromMany(
    env.DB, "research_item", allShown.map((i) => i.id)
  );

  const filterOptions = researchDirectoryFilterOptions(allShown, relationsByItemId);

  const itemCard = (item) => researchItemCardHtml(item, relationsByItemId.get(String(item.id)), true);

  const html = await renderer.render("research-list.html", {
    ...researchComponentVars(allComponents),
    heading: "Research",
    intro: "Independent, source-cited research on online casino regulation, licensing, and player protection.",
    seo_title: "Research | " + site.siteName,
    seo_description: "Independent research on online casino regulation, regulators, licensing, and player protection.",
    canonical: site.url("/en/research"),
    robots: "index,follow",
    featured_html: featured.map(itemCard).join(""),
    items_html: latest.map(itemCard).join(""),
    show_sort: true,
    all_head_html: featured.length
      ? `<div class="research-directory__head"><h2>All research</h2><span class="research-directory__badge research-directory__badge--plain">${latest.length} published</span></div>`
      : "",
    total_count: latest.length,
    sort_options_html: researchSortOptionsHtml(sortKey),
    show_type_filter: true,
    type_filter_options_html: research.RESEARCH_TYPES.map((t) => `<option value="${t}">${researchTypeLabel(t)}</option>`).join(""),
    country_filter_options_html: filterOptions.countries.map((c) => `<option value="${c.replace(/"/g, "&quot;")}">${c}</option>`).join(""),
    related_filter_options_html: filterOptions.related.map((r) => `<option value="${r.replace(/"/g, "&quot;")}">${r}</option>`).join(""),
  }, [], buildBreadcrumbs("researchHub"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderResearchTypeList(request, env, researchType) {
  if (!research.isValidResearchType(researchType)) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const items = await research.getPublishedResearchItems(env.DB, { type: researchType, limit: 500 });
  const label = researchTypeLabel(researchType);
  const allComponents = await renderer.renderAllComponents("research_type_list", researchType);

  const relationsByItemId = await researchRelations.getRelationsFromMany(
    env.DB, "research_item", items.map((i) => i.id)
  );
  const filterOptions = researchDirectoryFilterOptions(items, relationsByItemId);

  const itemCard = (item) => researchItemCardHtml(item, relationsByItemId.get(String(item.id)), false);

  const html = await renderer.render("research-list.html", {
    ...researchComponentVars(allComponents),
    heading: label,
    intro: "",
    seo_title: `${label} | Research | ${site.siteName}`,
    seo_description: `Research on ${label.toLowerCase()} — online casino regulation and market intelligence.`,
    canonical: site.url(`/en/research/${researchType}`),
    robots: "index,follow",
    featured_html: "",
    items_html: items.map(itemCard).join("") || `<p class="muted">No published research yet.</p>`,
    show_sort: true,
    total_count: items.length,
    sort_options_html: researchSortOptionsHtml("newest"),
    show_type_filter: false,
    type_filter_options_html: "",
    country_filter_options_html: filterOptions.countries.map((c) => `<option value="${c.replace(/"/g, "&quot;")}">${c}</option>`).join(""),
    related_filter_options_html: filterOptions.related.map((r) => `<option value="${r.replace(/"/g, "&quot;")}">${r}</option>`).join(""),
  }, [], buildBreadcrumbs("researchTypeList", { researchType, label }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderResearchItem(request, env, researchType, slug) {
  if (!research.isValidResearchType(researchType)) return render404(request, env);

  const item = await research.getResearchItem(env.DB, researchType, slug);
  if (!item) return render404(request, env);
  if (item.published === 0 || item.status === "draft") return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  let contentData = {};
  try {
    contentData = typeof item.content_json === "string"
      ? JSON.parse(item.content_json)
      : item.content_json || {};
  } catch {
    contentData = {};
  }

  // Sources citable on this item: those linked via its claims, UNION
  // any cited directly by a { source_id } source_citation content
  // block — the two pools are independent, so both are gathered
  // before resolving footnote numbers.
  const claimLinkedSources = await researchSources.getSourcesForResearchItem(env.DB, item.id);
  const blockCitedIds = (Array.isArray(contentData?.sections) ? contentData.sections : [])
    .filter((s) => s.type === "source_citation" && s.source_id)
    .map((s) => Number(s.source_id));
  const alreadyHaveIds = new Set(claimLinkedSources.map((s) => s.id));
  const missingIds = blockCitedIds.filter((id) => !alreadyHaveIds.has(id));
  const directlyCitedSources = missingIds.length > 0
    ? await researchSources.getSourcesByIds(env.DB, missingIds)
    : [];
  const sourcesById = new Map([...claimLinkedSources, ...directlyCitedSources].map((s) => [s.id, s]));
  const citations = { sourcesById, list: [] };

  const sectionsHtml = await renderResearchSections(contentData, citations, env.DB);
  const claimsList = await researchClaims.getClaimsForResearchItem(env.DB, item.id);
  const claimsHtml = renderResearchClaims(claimsList);
  // citations.list now holds exactly the sources cited inline via
  // source_citation blocks, in first-citation order — the footnote
  // numbers already printed in sectionsHtml match this list's order.
  const sourcesHtml = renderResearchSourcesFootnotes(citations.list);

  const relations = await researchRelations.getAllRelationsForEntity(env.DB, "research_item", item.id);
  const relatedHtml = renderResearchRelated(relations);

  // Everything a client-side PDF export needs, already computed above
  // for the HTML render — embedded as JSON in the page so
  // research-pdf-export.js can build a branded PDF without a second
  // network round-trip, and so "merge related research" can fetch
  // another item's OWN page and read this same block back out of it.
  const pdfData = {
    type: item.type,
    slug: item.slug,
    title: item.title,
    subtitle: item.subtitle || "",
    excerpt: item.excerpt || "",
    country_name: item.country_name || "",
    author_name: item.author_name || "",
    last_verified_at: item.last_verified_at || "",
    canonical_url: item.canonical_url || site.url(`/en/research/${item.type}/${item.slug}`),
    sections: Array.isArray(contentData?.sections) ? contentData.sections : [],
    claims: claimsList.map((c) => ({
      claim_text: c.claim_text,
      status: c.status,
      sources: (c.sources || []).map((s) => ({ organisation: s.organisation, url: s.source_url || null }))
    })),
    sources: citations.list.map((s) => ({ organisation: s.organisation, title: s.title || null, url: s.url || null, is_primary: !!s.is_primary })),
    related: relations.filter((r) => r.target?.exists).map((r) => ({
      label: r.target.label, url: r.target.url, type: r.target.type, relation_type: r.relation_type
    }))
  };

  const faqSchema = seoPageFaqSchema(contentData);
  // components assigned in Dashboard > Components: page type "research", slug "<type>/<slug>" (or *)
  const allComponents = await renderer.renderAllComponents("research", `${item.type}/${item.slug}`);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": item.title,
    "description": item.excerpt || item.seo_description || "",
    "author": item.author_name ? { "@type": "Person", "name": item.author_name } : undefined,
    "dateModified": item.updated_at,
    "datePublished": item.published_at || item.created_at,
  };

  const html = await renderer.render("research.html", {
    ...item,
    ...researchComponentVars(allComponents),
    title: escapeHtml(item.title),
    type_label: researchTypeLabel(item.type),
    seo_title: item.seo_title || item.title,
    seo_description: item.seo_description || item.excerpt || "",
    seo_keywords: item.seo_keywords || "",
    canonical: item.canonical_url || site.url(`/en/research/${item.type}/${item.slug}`),
    og_image: item.og_image_url ? site.url(item.og_image_url) : site.ogImageUrl,
    og_image_alt: safeAlt(item.og_image_alt, item.title),
    robots: item.robots || "index,follow",
    sections_html: sectionsHtml,
    claims_html: claimsHtml,
    sources_html: sourcesHtml,
    related_html: relatedHtml,
    last_verified_display: item.last_verified_at ? item.last_verified_at.split(" ")[0].split("T")[0] : "",
    research_pdf_data_json: JSON.stringify(pdfData).replace(/</g, "\\u003c"),
  }, [articleSchema, faqSchema].filter(Boolean), buildBreadcrumbs("researchItem", {
    researchType: item.type,
    label: researchTypeLabel(item.type),
    title: item.title
  }));

  return new Response(html, { headers: cacheHeaders() });
}
