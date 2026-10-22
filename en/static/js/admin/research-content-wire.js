function wireResearchSectionBuilder() {
  const root = document.getElementById("researchFormSections");
  const addBtn = document.getElementById("researchAddSectionBtn");
  const addTypeSelect = document.getElementById("researchAddSectionType");
  if (!root || root.dataset.wired === "true") return;
  root.dataset.wired = "true";

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      syncResearchSectionsFromDom();
      researchSectionState.sections.push(researchDefaultSectionFor(addTypeSelect.value));
      renderResearchFormSections();
    });
  }

  root.addEventListener("click", async (e) => {
    const sectionRowEl = e.target.closest("[data-section-row]");

    if (e.target.closest("[data-remove-section]")) {
      syncResearchSectionsFromDom();
      researchSectionState.sections.splice(Number(sectionRowEl.dataset.sectionRow), 1);
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-move-section-up]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      if (i > 0) {
        const [moved] = researchSectionState.sections.splice(i, 1);
        researchSectionState.sections.splice(i - 1, 0, moved);
        renderResearchFormSections();
      }
      return;
    }
    if (e.target.closest("[data-move-section-down]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      if (i < researchSectionState.sections.length - 1) {
        const [moved] = researchSectionState.sections.splice(i, 1);
        researchSectionState.sections.splice(i + 1, 0, moved);
        renderResearchFormSections();
      }
      return;
    }
    if (e.target.closest("[data-add-event]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      if (!Array.isArray(researchSectionState.sections[i].events)) researchSectionState.sections[i].events = [];
      researchSectionState.sections[i].events.push({ date: "", title: "", description: "" });
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-remove-event]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      const j = Number(e.target.closest("[data-event-row]").dataset.eventRow);
      researchSectionState.sections[i].events.splice(j, 1);
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-add-faq]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      if (!Array.isArray(researchSectionState.sections[i].items)) researchSectionState.sections[i].items = [];
      researchSectionState.sections[i].items.push({ q: "", a: "" });
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-remove-faq]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      const j = Number(e.target.closest("[data-faq-row]").dataset.faqRow);
      researchSectionState.sections[i].items.splice(j, 1);
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-add-link]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      if (!Array.isArray(researchSectionState.sections[i].links)) researchSectionState.sections[i].links = [];
      researchSectionState.sections[i].links.push({ label: "", url: "" });
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-remove-link]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      const j = Number(e.target.closest("[data-link-row]").dataset.linkRow);
      researchSectionState.sections[i].links.splice(j, 1);
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-add-column]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      if (!Array.isArray(researchSectionState.sections[i].columns)) researchSectionState.sections[i].columns = [];
      researchSectionState.sections[i].columns.push("");
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-add-row]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      const colCount = (researchSectionState.sections[i].columns || []).length;
      if (!Array.isArray(researchSectionState.sections[i].rows)) researchSectionState.sections[i].rows = [];
      researchSectionState.sections[i].rows.push(new Array(colCount).fill(""));
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-remove-row]")) {
      syncResearchSectionsFromDom();
      const i = Number(sectionRowEl.dataset.sectionRow);
      const j = Number(e.target.closest("[data-table-row]").dataset.tableRow);
      researchSectionState.sections[i].rows.splice(j, 1);
      renderResearchFormSections();
      return;
    }
    if (e.target.closest("[data-fetch-snapshot]")) {
      const i = Number(sectionRowEl.dataset.sectionRow);
      const refSelect = sectionRowEl.querySelector("[data-ref-item-select]");
      const refId = refSelect ? refSelect.value : "";
      if (!refId) { alert("Choose a research item first."); return; }
      try {
        const res = await fetch(`/en/api/v1/research/get-by-id?id=${refId}`);
        const data = await res.json();
        if (!data.success) { alert(data.error || "Could not load that item"); return; }
        syncResearchSectionsFromDom();
        researchSectionState.sections[i].research_item_id = refId;
        researchSectionState.sections[i].snapshot_title = data.item.title || "";
        researchSectionState.sections[i].snapshot_excerpt = data.item.excerpt || "";
        researchSectionState.sections[i].snapshot_at = new Date().toISOString().slice(0, 10);
        renderResearchFormSections();
      } catch { alert("Network error"); }
      return;
    }
  });

  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-section-type]")) {
      syncResearchSectionsFromDom();
      const i = Number(e.target.closest("[data-section-row]").dataset.sectionRow);
      const newType = e.target.value;
      // Switching type replaces the section with a fresh default for
      // that type — keeps the state shape always valid for whichever
      // type is now selected, rather than carrying over stale fields
      // from the previous type.
      researchSectionState.sections[i] = researchDefaultSectionFor(newType);
      renderResearchFormSections();
      return;
    }
    if (e.target.matches("[data-section-field='mode']")) {
      syncResearchSectionsFromDom();
      renderResearchFormSections();
      return;
    }
    if (e.target.matches("[data-dataset-select]")) {
      syncResearchSectionsFromDom();
      renderResearchFormSections();
      return;
    }
  });
}

