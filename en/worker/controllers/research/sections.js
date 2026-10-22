import * as researchDatasets from "../../database/research-datasets.js";

// =====================================================
// RESEARCH ENGINE — content block renderer (Phase 1)
// Separate function from renderSeoPageSections (never touches
// it) but same content_json shape and same section types
// (rich_text, heading, image, faq, cta, internal_links) plus
// research-specific additions: statistic, timeline,
// source_citation, fact_card. Casino-oriented section types
// (casino_grid, casino_editorial, ...) are intentionally not
// carried over here — research pages are source/fact-oriented,
// not casino-listing pages.
// =====================================================

export async function renderResearchSections(content, citations = null, db = null) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  // citations: { sourcesById: Map<id, sourceRow>, list: [] } — list is
  // mutated in place, accumulating footnotes in the order they're
  // first cited, so numbering stays stable within one render pass.
  const footnoteNumberFor = (sourceId) => {
    if (!citations) return null;
    const existingIndex = citations.list.findIndex((s) => s.id === sourceId);
    if (existingIndex !== -1) return existingIndex + 1;
    const source = citations.sourcesById.get(sourceId);
    if (!source) return null;
    citations.list.push(source);
    return citations.list.length;
  };

  const rendered = await Promise.all(sections.map(async (section) => {
      const heading = section.title
        ? `<h2 class="research-section__title">${section.title}</h2>${section.subtitle ? `<p class="research-section__subtitle muted">${section.subtitle}</p>` : ""}`
        : "";

      switch (section.type) {
        case "rich_text":
        case "text":
          return `<section class="research-section research-section--text">${heading}<div class="research-section__body">${section.body || ""}</div></section>`;

        case "heading":
          return `<h2 class="research-section__title">${section.title || ""}</h2>`;

        case "image":
          return section.image
            ? `<section class="research-section research-section--image">${heading}<img src="${section.image}" alt="${section.title || ""}" loading="lazy" /></section>`
            : "";

        // { value, unit, label, context } — a single highlighted figure.
        case "statistic":
          return `
            <section class="research-section research-section--statistic">
              ${heading}
              <div class="research-stat">
                <div class="research-stat__value">${section.value ?? ""}${section.unit ? `<span class="research-stat__unit">${section.unit}</span>` : ""}</div>
                ${section.label ? `<div class="research-stat__label">${section.label}</div>` : ""}
                ${section.context ? `<p class="research-stat__context muted">${section.context}</p>` : ""}
              </div>
            </section>`;

        // { events: [ {date, title, description} ] }
        case "timeline": {
          const events = Array.isArray(section.events) ? section.events : [];
          if (events.length === 0) return "";
          return `
            <section class="research-section research-section--timeline">
              ${heading}
              <ol class="research-timeline">
                ${events.map((ev) => `
                  <li class="research-timeline__event">
                    <span class="research-timeline__date">${ev.date || ""}</span>
                    <strong class="research-timeline__title">${ev.title || ""}</strong>
                    ${ev.description ? `<p>${ev.description}</p>` : ""}
                  </li>`).join("")}
              </ol>
            </section>`;
        }

        // { columns: [...], rows: [[...], ...], caption }
        case "table": {
          const cols = Array.isArray(section.columns) ? section.columns : [];
          const rows = Array.isArray(section.rows) ? section.rows : [];
          if (cols.length === 0 || rows.length === 0) return "";
          return `
            <section class="research-section research-section--table">
              ${heading}
              <div class="research-table-wrap">
                <table class="research-table">
                  ${section.caption ? `<caption>${section.caption}</caption>` : ""}
                  <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
                  <tbody>${rows.map((r) => `<tr>${cols.map((_, ci) => `<td>${(r[ci] ?? "") === "" ? `<span class="research-table__empty">—</span>` : r[ci]}</td>`).join("")}</tr>`).join("")}</tbody>
                </table>
              </div>
            </section>`;
        }

        // { body, source_id } preferred — resolves to a numbered
        // footnote against a real research_sources row. Falls back to
        // { source_label, source_url } (Phase 1 shape) when no
        // source_id is given or it doesn't resolve, so existing
        // content written before Phase 2 keeps rendering unchanged.
        case "source_citation": {
          const num = section.source_id ? footnoteNumberFor(Number(section.source_id)) : null;
          const footnoteLink = num
            ? `<a href="#research-source-${num}" class="research-citation__footnote">[${num}]</a>`
            : section.source_label
              ? `<cite class="research-citation__source">${section.source_url ? `<a href="${section.source_url}" rel="nofollow noopener" target="_blank">${section.source_label}</a>` : section.source_label}</cite>`
              : "";
          return `<p class="research-citation">${section.body || ""} ${footnoteLink}</p>`;
        }

        case "fact_card":
          return `
            <section class="research-section research-section--fact-card">
              ${heading}
              <div class="research-fact-card">${section.body || ""}</div>
            </section>`;

        case "faq": {
          const items = Array.isArray(section.items) ? section.items : [];
          if (items.length === 0) return "";
          return `
            <section class="research-section research-section--faq">
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

        case "internal_links":
        case "custom_links": {
          const links = Array.isArray(section.links) ? section.links : [];
          if (links.length === 0) return "";
          return `
            <section class="research-section research-section--links">
              ${heading}
              <ul class="research-section__links">
                ${links.map((l) => `<li><a href="${l.url}">${l.label}</a></li>`).join("")}
              </ul>
            </section>`;
        }

        // { research_item_id, mode: 'live' | 'snapshot' }. Report
        // composition (spec section 17) needs no separate join table
        // — a report section referencing another research item is
        // just this block type. 'live' always reflects that item's
        // current published title/excerpt/verification date; the DB
        // is only queried here, per reference, when mode is 'live'.
        // 'snapshot' uses the frozen snapshot_* fields already stored
        // on the block itself (captured by the admin at composition
        // time) and needs no query at all.
        case "research_reference": {
          if (section.mode === "snapshot") {
            if (!section.snapshot_title) return "";
            return `
              <section class="research-section research-section--reference">
                <div class="research-reference-card">
                  <h3>${section.snapshot_title}</h3>
                  ${section.snapshot_excerpt ? `<p>${section.snapshot_excerpt}</p>` : ""}
                  <p class="muted research-reference-card__note">Snapshot${section.snapshot_at ? ` from ${section.snapshot_at}` : ""} — may differ from the current version.</p>
                </div>
              </section>`;
          }

          if (!db || !section.research_item_id) return "";
          const referenced = await db.prepare(
            `SELECT type, slug, title, excerpt, last_verified_at FROM research_items WHERE id = ? AND published = 1 AND status != 'draft' LIMIT 1`
          ).bind(Number(section.research_item_id)).first();
          if (!referenced) return "";
          return `
            <section class="research-section research-section--reference">
              <a class="research-reference-card" href="/en/research/${referenced.type}/${referenced.slug}">
                <h3>${referenced.title}</h3>
                ${referenced.excerpt ? `<p>${referenced.excerpt}</p>` : ""}
                ${referenced.last_verified_at ? `<p class="muted research-reference-card__note">Last verified: ${String(referenced.last_verified_at).split(" ")[0].split("T")[0]}</p>` : ""}
              </a>
            </section>`;
        }

        // { dataset_id, version: 'latest' | N, caption } — renders a
        // reusable dataset (spec section 27) as a table, the same
        // dataset a report section, a country page, and a comparison
        // page can all embed without copying its rows into each one.
        case "dataset_table": {
          if (!db || !section.dataset_id) return "";
          const data = await researchDatasets.resolveDatasetData(db, Number(section.dataset_id), section.version || "latest");
          if (!data || data.columns.length === 0 || data.rows.length === 0) return "";

          // Type-aware cell rendering — columns_json carries an optional
          // display-type hint (text/number/boolean/date) per the schema
          // comment in 0050; this is the first renderer to actually act
          // on it rather than printing every value as raw text.
          const renderDatasetCell = (col, value) => {
            if (value === null || value === undefined || value === "") return `<span class="research-table__empty">—</span>`;
            if (col.type === "boolean") {
              const isTrue = value === true || value === "true" || value === 1 || value === "1";
              return `<span class="research-table__bool research-table__bool--${isTrue ? "yes" : "no"}">${isTrue ? "✓" : "✗"}</span>`;
            }
            return value;
          };
          const cellClass = (col) => col.type === "number" || col.type === "boolean" ? ` class="research-table__cell--${col.type}"` : "";

          return `
            <section class="research-section research-section--table research-section--dataset">
              ${heading}
              <div class="research-table-wrap">
                <table class="research-table">
                  <caption>${section.caption || data.title}<span class="muted"> (${data.versionLabel})</span></caption>
                  <thead><tr>${data.columns.map((c) => `<th${cellClass(c)}>${c.label || c.key}</th>`).join("")}</tr></thead>
                  <tbody>${data.rows.map((row) => `<tr>${data.columns.map((c) => `<td${cellClass(c)}>${renderDatasetCell(c, row[c.key])}</td>`).join("")}</tr>`).join("")}</tbody>
                </table>
              </div>
            </section>`;
        }

        default:
          return "";
      }
    }));

  return rendered.join("\n");
}

// { organisation, title, url, source_type, is_primary } — renders the
// numbered footnote list a source_citation block's [n] links point to.
export function renderResearchSourcesFootnotes(sourcesList) {
  if (!sourcesList || sourcesList.length === 0) return "";
  return `
    <section class="research-section research-section--sources" aria-label="Sources">
      <h2 class="research-section__title">Sources</h2>
      <ol class="research-footnotes">
        ${sourcesList.map((s, i) => `
          <li id="research-source-${i + 1}">
            <span class="research-footnotes__org">${s.organisation}</span>${s.is_primary ? `<span class="research-footnotes__primary-badge">Primary source</span>` : ""}
            ${s.title ? ` — ${s.title}` : ""}
            ${s.url ? ` — <a href="${s.url}" rel="nofollow noopener" target="_blank">${s.url}</a>` : ""}
          </li>
        `).join("")}
      </ol>
    </section>`;
}

// [{ claim_text, status, sources: [...] }] — renders the "Key Facts"
// block on a research item page: independently verifiable statements,
// each with its own status badge and cited sources.
export function renderResearchClaims(claimsList) {
  if (!claimsList || claimsList.length === 0) return "";
  const statusLabel = {
    verified: "Verified", unverified: "Unverified",
    disputed: "Disputed", superseded: "Superseded"
  };
  return `
    <section class="research-section research-section--claims" aria-label="Key facts">
      <h2 class="research-section__title">Key facts</h2>
      <ul class="research-claims-list">
        ${claimsList.map((c) => `
          <li class="research-claim research-claim--${c.status}">
            <span class="research-claim__badge">${statusLabel[c.status] || c.status}</span>
            <p class="research-claim__text">${c.claim_text}</p>
            ${c.sources.length > 0 ? `
              <p class="research-claim__sources muted">
                ${c.sources.map((s) => s.source_url ? `<a href="${s.source_url}" rel="nofollow noopener" target="_blank">${s.organisation}</a>` : s.organisation).join(", ")}
              </p>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>`;
}

const RELATION_TYPE_LABEL = {
  covers: "Covers", located_in: "Located in", operates_in: "Operates in",
  regulated_by: "Regulated by", regulates: "Regulates", licensed_by: "Licensed by",
  requires: "Requires", uses: "Uses", related_to: "Related to", part_of: "Part of",
  contains: "Contains", updates: "Updates", supersedes: "Supersedes",
  superseded_by: "Superseded by", cites: "Cites", supports: "Supports",
  contradicts: "Contradicts", derived_from: "Derived from", mentions: "Mentions",
  affects: "Affects", affected_by: "Affected by", applies_to: "Applies to",
  available_in: "Available in", restricted_in: "Restricted in"
};

// [{ relation_type, label, target: {label, url, exists} }] — renders
// the "Related" section on a research item page, grouped by relation
// type so e.g. all "regulated_by" links sit together. Entries whose
// target no longer resolves (a linked casino/country row was deleted)
// are silently skipped rather than rendering a dead link.
export function renderResearchRelated(relations) {
  const usable = (relations || []).filter((r) => r.target?.exists && r.target?.url);
  if (usable.length === 0) return "";

  const groups = new Map();
  for (const r of usable) {
    const key = r.relation_type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  return `
    <section class="research-section research-section--related" aria-label="Related">
      <h2 class="research-section__title">Related</h2>
      <div class="research-related-groups">
        ${[...groups.entries()].map(([type, items]) => `
          <div class="research-related-group">
            <h3 class="research-related-group__label">${RELATION_TYPE_LABEL[type] || type}</h3>
            <ul class="research-related-group__list">
              ${items.map((r) => `<li><a href="${r.target.url}">${r.label || r.target.label}</a></li>`).join("")}
            </ul>
          </div>
        `).join("")}
      </div>
    </section>`;
}

export function researchTypeLabel(type) {
  const labels = {
    report: "Reports",
    country: "Countries",
    regulator: "Regulators",
    topic: "Topics",
    development: "Regulatory Developments",
    legislation: "Legislation",
    licence: "Licences"
  };
  return labels[type] || type;
}
