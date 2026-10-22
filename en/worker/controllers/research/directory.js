import { researchTypeLabel } from "./sections.js";

// =====================================================
// RESEARCH ENGINE — public controllers (Phase 1)
// =====================================================

// Card markup shared by the hub and type-list pages. data-* attributes
// carry everything the client-side filter/search script
// (research-directory-filter.js) needs — country and related-entity
// filtering, and a searchable text blob — so filtering never has to
// re-fetch anything; it just shows/hides these already-rendered cards.
export const RESEARCH_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently updated",
  title_asc: "Title A to Z",
  title_desc: "Title Z to A"
};

export function researchSortOptionsHtml(selected) {
  return Object.entries(RESEARCH_SORTS)
    .map(([k, label]) => `<option value="${k}"${k === selected ? " selected" : ""}>${label}</option>`)
    .join("");
}

export function sortResearchItems(items, key) {
  const date = (i) => String(i.published_at || i.created_at || "");
  const upd = (i) => String(i.updated_at || i.published_at || "");
  const title = (i) => String(i.title || "").toLowerCase();
  const copy = [...items];
  if (key === "oldest") copy.sort((a, b) => date(a).localeCompare(date(b)));
  else if (key === "updated") copy.sort((a, b) => upd(b).localeCompare(upd(a)));
  else if (key === "title_asc") copy.sort((a, b) => title(a).localeCompare(title(b)));
  else if (key === "title_desc") copy.sort((a, b) => title(b).localeCompare(title(a)));
  else copy.sort((a, b) => date(b).localeCompare(date(a)));
  return copy;
}

export function researchItemCardHtml(item, relations, showType) {
  const relatedLabels = (relations || [])
    .filter((r) => r.target?.exists)
    .map((r) => r.target.label);
  const searchBlob = [item.title, item.excerpt, item.country_name, ...relatedLabels]
    .filter(Boolean).join(" ").toLowerCase().replace(/"/g, "&quot;");

  return `
    <a class="research-card" href="/en/research/${item.type}/${item.slug}"
       data-type="${item.type}"
       data-country="${item.country_name || ""}"
       data-related="${relatedLabels.join("|").replace(/"/g, "&quot;")}"
       data-title="${String(item.title || "").toLowerCase().replace(/"/g, "&quot;")}"
       data-published="${String(item.published_at || item.created_at || "").replace(/"/g, "")}"
       data-updated="${String(item.updated_at || item.published_at || "").replace(/"/g, "")}"
       data-search="${searchBlob}">
      ${showType ? `<span class="research-card__type">${researchTypeLabel(item.type)}</span>` : ""}
      <h3 class="research-card__title">${item.title}</h3>
      ${item.excerpt ? `<p class="research-card__excerpt">${item.excerpt}</p>` : ""}
      ${relatedLabels.length > 0 ? `<p class="research-card__related">${relatedLabels.slice(0, 3).map((l) => `<span>${l}</span>`).join("")}</p>` : ""}
    </a>`;
}

// Distinct country/relation values across a set of items, for
// populating the filter dropdowns — computed from data already in
// hand, no extra queries.
export function researchDirectoryFilterOptions(items, relationsByItemId) {
  const countries = new Set();
  const related = new Set();
  for (const item of items) {
    if (item.country_name) countries.add(item.country_name);
    for (const r of relationsByItemId.get(String(item.id)) || []) {
      if (r.target?.exists) related.add(r.target.label);
    }
  }
  return {
    countries: [...countries].sort(),
    related: [...related].sort()
  };
}

// The components assigned to a research page, as the template variables research.html and
// research-list.html already contain.
export function researchComponentVars(all) {
  return {
    components_top: all.top,
    components_content_top: all.content_top,
    components_content_bottom: all.content_bottom,
    components_bottom: all.bottom,
    components_sidebar: all.sidebar
  };
}
