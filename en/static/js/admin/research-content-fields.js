// ---- per-type card body renderers ----
// Each returns the INNER html for a section card (the type
// selector + remove/move controls are added by
// researchSectionCardHtml, shared across every type).

function researchRichTextarea(index, field, value, label, rows) {
  const id = researchEditorIdFor(index, field);
  return `<label>${label}</label><textarea data-editor-id="${id}" data-rich-field data-section-field="${field}" rows="${rows || 6}">${escapeHtml(value || "")}</textarea>`;
}

function researchFieldsHtml_heading(s) {
  return `<label>Heading text</label><input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}" placeholder="e.g. Regulatory Framework">`;
}

function researchFieldsHtml_rich_text(s, index) {
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Subtitle (optional)</label>
    <input type="text" data-section-field="subtitle" value="${escapeHtml(s.subtitle || "")}">
    ${researchRichTextarea(index, "body", s.body, "Body")}`;
}

function researchFieldsHtml_statistic(s) {
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <div class="form-row">
      <div class="form-group"><label>Value</label><input type="text" data-section-field="value" value="${escapeHtml(s.value ?? "")}" placeholder="30.5"></div>
      <div class="form-group"><label>Unit</label><input type="text" data-section-field="unit" value="${escapeHtml(s.unit || "")}" placeholder="%"></div>
    </div>
    <label>Label</label>
    <input type="text" data-section-field="label" value="${escapeHtml(s.label || "")}" placeholder="Gambling tax rate">
    <label>Context (optional)</label>
    <input type="text" data-section-field="context" value="${escapeHtml(s.context || "")}" placeholder="Applied to gross gaming revenue.">`;
}

function researchTimelineEventRow(ev, i) {
  return `
    <div class="research-subrow" data-event-row="${i}">
      <div class="research-subrow__head">
        <input type="date" data-event-field="date" value="${escapeHtml(ev.date || "")}" style="max-width:160px">
        <input type="text" data-event-field="title" value="${escapeHtml(ev.title || "")}" placeholder="Event title" style="flex:1">
        <button type="button" class="btn btn--ghost btn--sm" data-remove-event>Remove</button>
      </div>
      <textarea data-event-field="description" rows="2" placeholder="Description (optional)">${escapeHtml(ev.description || "")}</textarea>
    </div>`;
}

function researchFieldsHtml_timeline(s) {
  const events = Array.isArray(s.events) ? s.events : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Events</label>
    <div data-events-container>${events.map(researchTimelineEventRow).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-event>+ Add event</button>`;
}

function researchTableRow(row, columns, rowIndex) {
  const cells = columns.map((col, ci) =>
    `<input type="text" data-cell-field="${ci}" value="${escapeHtml(row[ci] ?? "")}" placeholder="${escapeHtml(col || "Column " + (ci + 1))}" style="flex:1;min-width:80px">`
  ).join("");
  return `<div class="research-subrow" data-table-row="${rowIndex}" style="display:flex;gap:6px;align-items:center">${cells}<button type="button" class="btn btn--ghost btn--sm" data-remove-row>✕</button></div>`;
}

function researchFieldsHtml_table(s) {
  const columns = Array.isArray(s.columns) ? s.columns : [];
  const rows = Array.isArray(s.rows) ? s.rows : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Caption (optional)</label>
    <input type="text" data-section-field="caption" value="${escapeHtml(s.caption || "")}">
    <label>Columns <span class="muted">(one per box — this is the header row)</span></label>
    <div data-columns-container style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      ${columns.map((c, i) => `<input type="text" data-column-field="${i}" value="${escapeHtml(c || "")}" placeholder="Column ${i + 1}" style="width:120px">`).join("")}
    </div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-column>+ Add column</button>
    <label style="margin-top:10px">Rows</label>
    <div data-table-rows-container>${rows.map((r, i) => researchTableRow(r, columns, i)).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-row>+ Add row</button>`;
}

function researchFieldsHtml_source_citation(s, index, sourcesList) {
  const options = (sourcesList || []).map((src) =>
    `<option value="${src.id}" ${String(s.source_id) === String(src.id) ? "selected" : ""}>${escapeHtml(src.organisation)}${src.title ? " — " + escapeHtml(src.title) : ""}</option>`
  ).join("");
  return `
    <label>Statement</label>
    <textarea data-section-field="body" rows="2" placeholder="What the source supports">${escapeHtml(s.body || "")}</textarea>
    <label>Source</label>
    <select data-section-field="source_id">
      <option value="">— Choose a source (from the Sources library below) —</option>
      ${options}
    </select>
    <p class="muted" style="margin:4px 0 0">Don't see the source you need? Add it in the Sources section further down this page, then come back and pick it here.</p>`;
}

function researchFieldsHtml_fact_card(s, index) {
  return `
    <label>Card title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    ${researchRichTextarea(index, "body", s.body, "Card content")}`;
}

function researchFaqItemRow(item, i) {
  return `
    <div class="research-subrow" data-faq-row="${i}">
      <div class="research-subrow__head">
        <input type="text" data-faq-field="q" value="${escapeHtml(item.q || "")}" placeholder="Question" style="flex:1">
        <button type="button" class="btn btn--ghost btn--sm" data-remove-faq>Remove</button>
      </div>
      <textarea data-faq-field="a" rows="2" placeholder="Answer">${escapeHtml(item.a || "")}</textarea>
    </div>`;
}

function researchFieldsHtml_faq(s) {
  const items = Array.isArray(s.items) ? s.items : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "FAQ")}">
    <label>Questions</label>
    <div data-faq-container>${items.map(researchFaqItemRow).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-faq>+ Add question</button>`;
}

function researchLinkRow(link, i) {
  return `
    <div class="research-subrow" data-link-row="${i}" style="display:flex;gap:6px;align-items:center">
      <input type="text" data-link-field="label" value="${escapeHtml(link.label || "")}" placeholder="Link text" style="flex:1">
      <input type="text" data-link-field="url" value="${escapeHtml(link.url || "")}" placeholder="/en/research/..." style="flex:1">
      <button type="button" class="btn btn--ghost btn--sm" data-remove-link>✕</button>
    </div>`;
}

function researchFieldsHtml_internal_links(s) {
  const links = Array.isArray(s.links) ? s.links : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "Related reading")}">
    <label>Links</label>
    <div data-links-container>${links.map(researchLinkRow).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-link>+ Add link</button>`;
}

function researchFieldsHtml_research_reference(s, index, itemsList) {
  const mode = s.mode === "snapshot" ? "snapshot" : "live";
  const options = (itemsList || [])
    .filter((it) => String(it.id) !== String(researchSectionState.editingItemId || ""))
    .map((it) => `<option value="${it.id}" ${String(s.research_item_id) === String(it.id) ? "selected" : ""}>${escapeHtml(it.title)} (${it.type})</option>`)
    .join("");
  return `
    <label>Which research item?</label>
    <select data-section-field="research_item_id" data-ref-item-select>
      <option value="">— Choose a research item —</option>
      ${options}
    </select>
    <label style="margin-top:8px">Mode</label>
    <select data-section-field="mode">
      <option value="live" ${mode === "live" ? "selected" : ""}>Live — always shows the current published version</option>
      <option value="snapshot" ${mode === "snapshot" ? "selected" : ""}>Snapshot — frozen text, captured now</option>
    </select>
    <div data-snapshot-fields style="${mode === "snapshot" ? "" : "display:none"};margin-top:8px">
      <button type="button" class="btn btn--ghost btn--sm" data-fetch-snapshot>Fetch current text from selected item &amp; freeze it here</button>
      <label style="margin-top:8px">Frozen title</label>
      <input type="text" data-section-field="snapshot_title" value="${escapeHtml(s.snapshot_title || "")}">
      <label>Frozen excerpt</label>
      <textarea data-section-field="snapshot_excerpt" rows="2">${escapeHtml(s.snapshot_excerpt || "")}</textarea>
      <label>Snapshot date</label>
      <input type="date" data-section-field="snapshot_at" value="${escapeHtml(s.snapshot_at || "")}">
    </div>`;
}

function researchFieldsHtml_dataset_table(s, index, datasetsList) {
  const options = (datasetsList || []).map((d) =>
    `<option value="${d.id}" ${String(s.dataset_id) === String(d.id) ? "selected" : ""}>${escapeHtml(d.title)}</option>`
  ).join("");
  return `
    <label>Dataset</label>
    <select data-section-field="dataset_id" data-dataset-select>
      <option value="">— Choose a dataset (from the Research Datasets page) —</option>
      ${options}
    </select>
    <label style="margin-top:8px">Version</label>
    <select data-section-field="version" data-dataset-version-select>
      <option value="latest" ${(!s.version || s.version === "latest") ? "selected" : ""}>Latest (always current)</option>
    </select>
    <label style="margin-top:8px">Caption (optional)</label>
    <input type="text" data-section-field="caption" value="${escapeHtml(s.caption || "")}">`;
}

function researchFieldsHtml_image(s) {
  return `
    <label>Caption / alt text</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Image URL</label>
    <input type="text" data-section-field="image" value="${escapeHtml(s.image || "")}" placeholder="Paste a URL from the Media Library page">`;
}

