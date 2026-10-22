// Comparison list and comparison page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as customTypes from "../database/custom-types.js";
import * as comparisonsDb from "../database/comparisons.js";
import { resolveContentItemById } from "../content-resolver.js";
import { getComparableFields, buildComparisonRows, loadRelatedValues } from "../comparison-fields.js";
import { getComparisonDesign, renderComparisonSections, pageStyle, cellStyle, headStyle, labelStyle } from "../comparison-design.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { cacheHeaders, escapeHtml, escapeReviewText } from "./shared.js";
import { render404 } from "./system-pages.js";

// =====================================================
// COMPARISON ENGINE (Phase 7 — generic content engine)
// Storage: comparisons / comparison_items (migration 0051). This is
// the persistent, SEO-indexable comparison-PAGE engine -- separate
// from the existing database-driven `comparison_table` COMPONENT
// (component-engine.js), which is an admin-authored embeddable
// widget with its own JSON content shape, used to drop a small
// comparison into the middle of some other page. Both can coexist;
// this project does not force them into one system, since their data
// shapes and lifecycles are genuinely different (a full page with its
// own URL/SEO/publish workflow vs. an inline widget). See the Phase
// 6 report for the fuller reasoning.
//
// Route shape: /en/compare/{type}/{slug} and /en/compare/{type}.
// {type} IS the comparison's content_type (casino included -- a
// casino comparison is exactly as valid as a sportsbook one; this
// engine was never casino-exclusive to begin with).
// =====================================================

/** Best-effort per-item field lookup for a comparison criterion: checks the item's own raw row first, then (for custom items) its typed custom-field values. Returns null, not a guess, when nothing matches -- callers render "—" rather than fabricating a value. */
function resolveCriterionValue(item, criterionKey, customFieldValuesByItemKey) {
  if (item.raw && Object.prototype.hasOwnProperty.call(item.raw, criterionKey)) {
    return item.raw[criterionKey];
  }
  if (item.contentType === "custom") {
    const values = customFieldValuesByItemKey[`${item.contentType}:${item.id}`];
    if (values && Object.prototype.hasOwnProperty.call(values, criterionKey)) {
      return values[criterionKey];
    }
  }
  return null;
}

function formatCriterionCellValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return "—";
  if (rawValue === 1 || rawValue === true || rawValue === "1" || rawValue === "true") return "✓";
  if (rawValue === 0 || rawValue === false || rawValue === "0" || rawValue === "false") return "✗";
  return escapeReviewText(rawValue);
}

async function loadComparisonRowItems(db, comparisonItemRows) {
  const items = [];
  const customFieldValuesByItemKey = {};
  for (const row of comparisonItemRows) {
    const item = await resolveContentItemById(db, row.item_content_type, row.item_id);
    if (!item) continue; // an item that's since been deleted/unpublished -- skip rather than break the whole page (Phase 66 of the original spec: optional/missing data degrades gracefully)
    items.push(item);
    if (item.contentType === "custom") {
      customFieldValuesByItemKey[`${item.contentType}:${item.id}`] = await customTypes.getCustomFieldValues(db, item.id);
    }
  }
  return { items, customFieldValuesByItemKey };
}

function renderComparisonHeaderCells(items, comparison, design = null) {
  return items.map((i) => {
    const isPick = comparison.editorial_selection_item_type === i.contentType && Number(comparison.editorial_selection_item_id) === Number(i.id);
    const st = headStyle(design && design.items[`${i.contentType}:${i.id}`]);
    return `<th scope="col" class="cmp-head${isPick ? " cmp-head--pick" : ""}"${st ? ` style="${st}"` : ""}>
      ${isPick ? `<span class="cmp-pick-badge">Our pick</span>` : ""}
      <button type="button" class="cmp-remove" aria-label="Remove ${escapeReviewText(i.name)} from this comparison" title="Remove from comparison">&times;</button>
      <a class="cmp-head__link" href="${linkPrefixForItem(i)}/${i.slug}">
        <img src="${escapeReviewText(i.logo || "/static/images/default.png")}" alt="" loading="lazy" onerror="this.src='/static/images/default.png'">
        <span class="cmp-head__name">${escapeReviewText(i.name)}</span>
      </a>
    </th>`;
  }).join("");
}

function renderComparisonCells(row, items, design = null) {
  const rowSt = design && design.rows[row.key];
  return row.cells.map((cell, idx) => {
    const it = items[idx];
    const st = cellStyle(rowSt, it && design && design.items[`${it.contentType}:${it.id}`]);
    const best = row.best === idx;
    return `<td class="${best ? "cmp-best" : ""}${cell.custom ? " cmp-custom" : ""}" data-label=""${st ? ` style="${st}"` : ""}>${cell.html}${best ? `<span class="cmp-best-tag">Best</span>` : ""}</td>`;
  }).join("");
}

function renderComparisonRows(rows, items, heading, design = null) {
  if (!rows.length) return "";
  const head = heading ? `<tr class="cmp-group"><th colspan="${items.length + 1}" scope="colgroup">${escapeReviewText(heading)}</th></tr>` : "";
  return head + rows.map((row) => {
    const ls = labelStyle(design && design.rows[row.key]);
    return `<tr class="${row.differs ? "cmp-diff" : "cmp-same"}"><th scope="row" class="cmp-label"${ls ? ` style="${ls}"` : ""}>${escapeReviewText(row.label)}</th>${renderComparisonCells(row, items, design)}</tr>`;
  }).join("");
}

function renderComparisonSummary(items, ratingRow) {
  const rated = items.map((i, idx) => ({ i, n: ratingRow.cells[idx].num })).filter((x) => x.n !== null);
  if (rated.length < 2) return "";
  const top = rated.reduce((a, b) => (b.n > a.n ? b : a));
  return `<p class="cmp-summary"><strong>${escapeReviewText(top.i.name)}</strong> is rated highest of these ${items.length}, at ${top.n.toFixed(1)} out of 5.</p>`;
}

function linkPrefixForItem(item) {
  switch (item.contentType) {
    case "casino": return "/en/casino";
    case "sportsbook": return "/en/sportsbook";
    case "affiliate_partner": return "/en/affiliate-partner";
    case "custom": return `/en/custom/${item.customTypeSlug}`;
    default: return "/en";
  }
}

export async function renderComparisonList(request, env, compareType) {
  const renderer = new Renderer(env, request);

  const [site, comparisonList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    comparisonsDb.getPublishedComparisons(env.DB, compareType, { limit: 200 }),
    renderer.renderAllComponents(`compare_${compareType}_list`, `compare_${compareType}_list`),
    renderer.loadDynamicSeo(`compare_${compareType}_list`, `compare_${compareType}_list`),
  ]);

  const cardsHtml = comparisonList.map(c => `
    <div class="casino-card">
      <div class="casino-card__body"><h3 class="casino-card__name">${escapeReviewText(c.title)}</h3><p>${escapeReviewText(c.description || "")}</p></div>
      <div class="casino-card__footer"><a href="/en/compare/${compareType}/${c.slug}" class="btn btn--primary">View Comparison</a></div>
    </div>`).join("");

  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url(`/en/compare/${compareType}`),
    category: `${compareType.charAt(0).toUpperCase() + compareType.slice(1)} Comparisons`,
    description: `Head-to-head comparisons.`,
    casino_cards: cardsHtml,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    seo_title: dynamicSeo.seo_title || `${compareType} Comparisons — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || "Head-to-head comparisons.",
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, {
    "@context": "https://schema.org", "@type": "ItemList",
    "itemListElement": comparisonList.map((c, idx) => ({ "@type": "ListItem", "position": idx + 1, "url": site.url(`/en/compare/${compareType}/${c.slug}`) }))
  }, buildBreadcrumbs("comparisonList", { compareType }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderComparison(request, env, compareType, slug, ctx = null) {
  // Public-gated lookup -- comparisons had no status check at all here
  // before (getComparison() is unfiltered), so a draft comparison was
  // fully reachable at its own public URL. See getPublishedComparison()'s
  // doc comment in database/comparisons.js.
  const comparison = await comparisonsDb.getPublishedComparison(env.DB, compareType, slug);
  if (!comparison) return render404(request, env);

  const renderer = new Renderer(env, request);
  const comparisonItemRows = await comparisonsDb.getComparisonItems(env.DB, comparison.id);
  const { items, customFieldValuesByItemKey } = await loadComparisonRowItems(env.DB, comparisonItemRows);

  let criteria = [];
  try {
    const parsed = JSON.parse(comparison.criteria_json || "[]");
    criteria = Array.isArray(parsed) ? parsed : [];
  } catch { criteria = []; }

  const [site, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents(`compare_${compareType}`, slug, ctx),
    renderer.loadDynamicSeo(`compare_${compareType}`, slug),
  ]);

  const customSlug = (items.find((i) => i.contentType === "custom") || {}).customTypeSlug || "";
  const catalog = await getComparableFields(env.DB, compareType, customSlug);
  const design = await getComparisonDesign(env.DB, compareType, slug);
  const related = await loadRelatedValues(env.DB, items);
  const table = buildComparisonRows(items, criteria, catalog, customFieldValuesByItemKey, design, related);
  const sectionsHtml = await renderComparisonSections(env.DB, design.sections);

  let editorialPickHtml = "";
  if (comparison.editorial_selection_item_type && comparison.editorial_selection_item_id) {
    const pick = await resolveContentItemById(env.DB, comparison.editorial_selection_item_type, comparison.editorial_selection_item_id);
    if (pick) {
      editorialPickHtml = `<p><strong>${escapeReviewText(pick.name)}</strong> is our top pick. <a href="${linkPrefixForItem(pick)}/${pick.slug}">View ${escapeReviewText(pick.name)}</a></p>`;
    }
  }

  const itemSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": comparison.title,
    "itemListElement": items.map((item, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`${linkPrefixForItem(item)}/${item.slug}`)
    })),
  };

  const html = await renderer.render("comparison.html", {
    title: escapeHtml(comparison.title),
    description: comparison.description || "",
    item_header_cells_html: renderComparisonHeaderCells(items, comparison, design),
    design_style: pageStyle(design),
    item_rating_cells_html: renderComparisonCells(table.ratingRow, items, design),
    criteria_rows_html: renderComparisonRows(table.main, items, "", design),
    more_rows_html: table.more.length ? renderComparisonRows(table.more, items, criteria.length ? "More details" : "Comparison details", design) : "",
    item_cta_cells_html: items.map((i) => `<td data-label="${escapeReviewText(i.name)}"><a href="${linkPrefixForItem(i)}/${i.slug}" class="btn btn--primary">View ${escapeReviewText(i.name)}</a></td>`).join(""),
    summary_html: renderComparisonSummary(items, table.ratingRow),
    column_count: items.length + 1,
    sections_html: sectionsHtml,
    editorial_pick_html: editorialPickHtml,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    seo_title: dynamicSeo.seo_title || comparison.seo_title || comparison.title,
    seo_description: dynamicSeo.seo_description || comparison.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || comparison.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url(`/en/compare/${compareType}/${slug}`),
  }, itemSchema, buildBreadcrumbs("comparison", { compareType, title: comparison.title }));

  return new Response(html, { headers: cacheHeaders() });
}
