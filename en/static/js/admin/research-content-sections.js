function researchSectionCardHtml(section, index, caches) {
  const type = RESEARCH_SECTION_TYPES.includes(section.type) ? section.type : "rich_text";
  const builders = {
    heading: () => researchFieldsHtml_heading(section),
    rich_text: () => researchFieldsHtml_rich_text(section, index),
    statistic: () => researchFieldsHtml_statistic(section),
    timeline: () => researchFieldsHtml_timeline(section),
    table: () => researchFieldsHtml_table(section),
    source_citation: () => researchFieldsHtml_source_citation(section, index, caches.sources),
    fact_card: () => researchFieldsHtml_fact_card(section, index),
    faq: () => researchFieldsHtml_faq(section),
    internal_links: () => researchFieldsHtml_internal_links(section),
    research_reference: () => researchFieldsHtml_research_reference(section, index, caches.items),
    dataset_table: () => researchFieldsHtml_dataset_table(section, index, caches.datasets),
    image: () => researchFieldsHtml_image(section)
  };

  return `
    <div class="research-section-card" data-section-row="${index}">
      <div class="research-section-card__head">
        <span class="research-section-card__badge">#${index + 1}</span>
        <select data-section-type>
          ${RESEARCH_SECTION_TYPES.map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${RESEARCH_SECTION_TYPE_LABELS[t]}</option>`).join("")}
        </select>
        <button type="button" class="btn btn--ghost btn--sm" data-move-section-up ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn btn--ghost btn--sm" data-move-section-down>↓</button>
        <button type="button" class="btn btn--danger btn--sm" data-remove-section style="margin-left:auto">Remove section</button>
      </div>
      ${builders[type] ? builders[type]() : ""}
    </div>`;
}

async function renderResearchFormSections() {
  const root = document.getElementById("researchFormSections");
  if (!root) return;

  destroyResearchSectionEditors();

  const [sources, datasets, items] = await Promise.all([
    fetchSourcesCached(),
    fetchResearchDatasetsCached(),
    fetchResearchItemsCached()
  ]);
  const caches = { sources, datasets, items };

  if (researchSectionState.sections.length === 0) {
    root.innerHTML = '<p class="muted">No sections yet — use "+ Add Section" below, or a quick-start template above.</p>';
    return;
  }

  root.innerHTML = researchSectionState.sections.map((s, i) => researchSectionCardHtml(s, i, caches)).join("");
  initResearchSectionEditors();

  // Dataset version dropdowns need each dataset's real version list,
  // fetched per-section since it depends on which dataset is picked.
  root.querySelectorAll("[data-dataset-select]").forEach(async (sel) => {
    if (!sel.value) return;
    const versions = await fetchResearchDatasetVersionsFor(sel.value);
    const versionSelect = sel.closest(".research-section-card").querySelector("[data-dataset-version-select]");
    const currentSection = researchSectionState.sections[Number(sel.closest("[data-section-row]").dataset.sectionRow)];
    const currentVersion = currentSection ? currentSection.version : "latest";
    versionSelect.innerHTML = '<option value="latest">Latest (always current)</option>' +
      versions.map((v) => `<option value="${v.version_number}" ${String(currentVersion) === String(v.version_number) ? "selected" : ""}>v${v.version_number} — ${(v.created_at || "").slice(0, 10)}</option>`).join("");
  });
}

function syncResearchSectionsFromDom() {
  const root = document.getElementById("researchFormSections");
  if (!root) return;
  const rows = Array.from(root.querySelectorAll("[data-section-row]"));

  researchSectionState.sections = rows.map((row) => {
    const index = Number(row.dataset.sectionRow);
    const existing = researchSectionState.sections[index] || {};
    const type = row.querySelector("[data-section-type]").value;
    const section = { id: existing.id || ("rs" + Date.now() + index), type };

    row.querySelectorAll("[data-section-field]").forEach((el) => {
      const key = el.dataset.sectionField;
      if (el.dataset.richField !== undefined) {
        section[key] = researchEditorValue(index, key, el);
      } else {
        section[key] = el.value;
      }
    });

    // Repeatable sub-lists — each lives in its own container, read
    // separately from the flat data-section-field loop above.
    const eventsContainer = row.querySelector("[data-events-container]");
    if (eventsContainer) {
      section.events = Array.from(eventsContainer.querySelectorAll("[data-event-row]")).map((er) => ({
        date: er.querySelector("[data-event-field='date']").value,
        title: er.querySelector("[data-event-field='title']").value,
        description: er.querySelector("[data-event-field='description']").value
      }));
    }

    const faqContainer = row.querySelector("[data-faq-container]");
    if (faqContainer) {
      section.items = Array.from(faqContainer.querySelectorAll("[data-faq-row]")).map((fr) => ({
        q: fr.querySelector("[data-faq-field='q']").value,
        a: fr.querySelector("[data-faq-field='a']").value
      }));
    }

    const linksContainer = row.querySelector("[data-links-container]");
    if (linksContainer) {
      section.links = Array.from(linksContainer.querySelectorAll("[data-link-row]")).map((lr) => ({
        label: lr.querySelector("[data-link-field='label']").value,
        url: lr.querySelector("[data-link-field='url']").value
      }));
    }

    const columnsContainer = row.querySelector("[data-columns-container]");
    if (columnsContainer) {
      section.columns = Array.from(columnsContainer.querySelectorAll("[data-column-field]")).map((c) => c.value);
    }
    const tableRowsContainer = row.querySelector("[data-table-rows-container]");
    if (tableRowsContainer) {
      section.rows = Array.from(tableRowsContainer.querySelectorAll("[data-table-row]")).map((tr) =>
        Array.from(tr.querySelectorAll("[data-cell-field]")).map((c) => c.value)
      );
    }

    return section;
  });
}

function researchDefaultSectionFor(type) {
  const defaults = {
    heading: { title: "" },
    rich_text: { title: "", subtitle: "", body: "" },
    statistic: { title: "", value: "", unit: "", label: "", context: "" },
    timeline: { title: "", events: [] },
    table: { title: "", caption: "", columns: [], rows: [] },
    source_citation: { body: "", source_id: "" },
    fact_card: { title: "", body: "" },
    faq: { title: "FAQ", items: [] },
    internal_links: { title: "Related reading", links: [] },
    research_reference: { mode: "live", research_item_id: "" },
    dataset_table: { dataset_id: "", version: "latest", caption: "" },
    image: { title: "", image: "" }
  };
  return { id: "rs" + Date.now(), type, ...(defaults[type] || {}) };
}

