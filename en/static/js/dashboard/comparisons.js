
// ---- Comparisons table ----
async function loadComparisonsTable(contentType) {
  const tbody = document.getElementById("comparisonsTableBody");
  if (!tbody) return;

  const typeFilter = document.getElementById("comparisonTypeFilter");
  const type = contentType || (typeFilter ? typeFilter.value : "casino");

  try {
    const res = await fetch(`/en/api/v1/comparisons/list?content_type=${encodeURIComponent(type)}&page=${PAGE_STATE.comparisons}&per_page=${PER_PAGE}${listSearchParam("comparisonsTableBody")}`);
    const data = await res.json();
    const comparisons = data.comparisons || [];
    renderPagerControls("comparisonsPager", PAGE_STATE.comparisons, PER_PAGE, data.total, (p) => { PAGE_STATE.comparisons = p; loadComparisonsTable(type); });

    if (comparisons.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No comparisons yet for this type.</td></tr>';
      return;
    }

    tbody.innerHTML = comparisons.map((c) => `
      <tr>
        <td><strong>${escapeHtmlClient(c.title)}</strong></td>
        <td>${escapeHtmlClient(c.slug)}</td>
        <td>${escapeHtmlClient(c.content_type)}</td>
        <td><span class="status-badge ${c.status === "published" ? "status-published" : "status-draft"}">${escapeHtmlClient(c.status)}</span></td>
        <td class="table-actions">
          <a href="/en/compare/${encodeURIComponent(c.content_type)}/${encodeURIComponent(c.slug)}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <a href="/en/dashboard/comparison/edit/${encodeURIComponent(c.content_type)}/${encodeURIComponent(c.slug)}" class="btn btn--ghost btn--sm">Edit</a>
          <button class="btn btn--danger btn--sm" onclick="deleteComparison('${c.content_type}', '${c.slug}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteComparison(contentType, slug) {
  if (!confirm(`Delete comparison "${slug}"? This cannot be undone.`)) return;
  try {
    const res = await fetch("/en/api/v1/comparison/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: contentType, slug }),
    });
    const data = await res.json();
    if (data.success) loadComparisonsTable(contentType);
    else alert(data.error || "Delete failed");
  } catch {
    alert("Network error. Try again.");
  }
}

// ---- Shared comparison item-picker (search-as-you-type, replaces raw numeric ID entry) ----
// Used by both the create form and the edit form.
function initComparisonItemPicker({ contentTypeSelectEl, searchInputId, resultsId, selectedRowsId, rowTemplateId }) {
  const searchInput = document.getElementById(searchInputId);
  const resultsEl = document.getElementById(resultsId);
  const selectedRowsEl = document.getElementById(selectedRowsId);
  const rowTemplate = document.getElementById(rowTemplateId);
  if (!searchInput || !resultsEl || !selectedRowsEl || !rowTemplate) return { getSelected: () => [], addPreset: () => {} };

  const selected = new Map(); // key: `${content_type}:${id}` -> { itemContentType, itemId, label }

  function renderSelectedRows() {
    selectedRowsEl.innerHTML = "";
    for (const [key, entry] of selected.entries()) {
      const clone = rowTemplate.content.cloneNode(true);
      clone.querySelector(".item-row-label").textContent = entry.label;
      const row = clone.querySelector(".item-row");
      row.dataset.key = key;
      selectedRowsEl.appendChild(clone);
    }
  }

  selectedRowsEl.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-selected-item")) {
      const row = e.target.closest(".item-row");
      selected.delete(row.dataset.key);
      row.remove();
    }
  });

  function addSelected(item) {
    const key = `${item.content_type}:${item.id}`;
    if (selected.has(key)) return;
    selected.set(key, { itemContentType: item.content_type, itemId: item.id, label: `${item.name} (${item.content_type}${item.status && item.status !== "published" ? ", " + item.status : ""})` });
    renderSelectedRows();
  }

  let debounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = searchInput.value.trim();
    debounce = setTimeout(async () => {
      const contentType = contentTypeSelectEl.value;
      if (!contentType) { resultsEl.innerHTML = ""; return; }
      try {
        const res = await fetch(`/en/api/v1/content-item/search?content_type=${encodeURIComponent(contentType)}&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const items = data.items || [];
        if (items.length === 0) {
          resultsEl.innerHTML = '<span class="muted">No matches.</span>';
          return;
        }
        resultsEl.innerHTML = items.map((it, idx) => `
          <button type="button" class="btn btn--ghost btn--sm item-search-result" data-idx="${idx}" style="margin:2px">
            ${escapeHtmlClient(it.name)} <span class="muted">(${escapeHtmlClient(it.status || "")})</span>
          </button>
        `).join("");
        resultsEl.dataset.itemsJson = JSON.stringify(items);
      } catch {
        resultsEl.innerHTML = '<span class="muted">Search failed.</span>';
      }
    }, 250);
  });

  resultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".item-search-result");
    if (!btn) return;
    const items = JSON.parse(resultsEl.dataset.itemsJson || "[]");
    const item = items[parseInt(btn.dataset.idx)];
    if (item) { addSelected(item); resultsEl.innerHTML = ""; searchInput.value = ""; }
  });

  contentTypeSelectEl.addEventListener("change", () => {
    resultsEl.innerHTML = "";
    searchInput.value = "";
  });

  return {
    getSelected: () => Array.from(selected.values()),
    addPreset: (item) => addSelected(item),
  };
}


// ---- Shared: single-select searchable Editorial Pick (gap #8) ----
// Same /content-item/search backend the multi-select item picker uses,
// but keeps only one selection instead of accumulating a list.
function initEditorialPickPicker(preset = null) {
  const typeSelect = document.getElementById("editorialPickContentType");
  const idInput = document.getElementById("editorialPickItemId");
  const searchInput = document.getElementById("editorialPickSearchInput");
  const resultsEl = document.getElementById("editorialPickSearchResults");
  const selectedEl = document.getElementById("editorialPickSelected");
  if (!typeSelect || !idInput || !searchInput || !resultsEl || !selectedEl) return;

  function showSelected(item) {
    idInput.value = item ? item.id : "";
    selectedEl.textContent = item ? `Selected: ${item.name} (${item.content_type})` : "No item selected.";
  }

  let debounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = searchInput.value.trim();
    debounce = setTimeout(async () => {
      const contentType = typeSelect.value;
      if (!contentType) { resultsEl.innerHTML = ""; return; }
      try {
        const res = await fetch(`/en/api/v1/content-item/search?content_type=${encodeURIComponent(contentType)}&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const items = data.items || [];
        resultsEl.innerHTML = items.length
          ? items.map((it, idx) => `<button type="button" class="btn btn--ghost btn--sm editorial-pick-result" data-idx="${idx}" style="margin:2px">${escapeHtmlClient(it.name)}</button>`).join("")
          : '<span class="muted">No matches.</span>';
        resultsEl.dataset.itemsJson = JSON.stringify(items);
      } catch {
        resultsEl.innerHTML = '<span class="muted">Search failed.</span>';
      }
    }, 250);
  });

  resultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".editorial-pick-result");
    if (!btn) return;
    const items = JSON.parse(resultsEl.dataset.itemsJson || "[]");
    const item = items[parseInt(btn.dataset.idx)];
    if (item) { showSelected(item); resultsEl.innerHTML = ""; searchInput.value = ""; }
  });

  typeSelect.addEventListener("change", () => { resultsEl.innerHTML = ""; searchInput.value = ""; showSelected(null); });

  if (preset && preset.id) showSelected(preset);
}

// Criteria are PICKED from what the chosen type can be compared on; typing a key by hand
// is still possible ("Custom key") so nothing that worked before stops working.
const criterionFieldCache = {};
async function loadComparableFields(contentType) {
  if (!contentType) return [];
  if (!criterionFieldCache[contentType]) {
    criterionFieldCache[contentType] = fetch(`/en/api/v1/comparison/fields?content_type=${encodeURIComponent(contentType)}`)
      .then((r) => r.json()).then((d) => (d.success ? d.fields : [])).catch(() => []);
  }
  return criterionFieldCache[contentType];
}

function enhanceCriterionRow(row, getType) {
  if (!row || row.querySelector(".criterion-pick")) return;
  const keyInput = row.querySelector(".criterion-key");
  const labelInput = row.querySelector(".criterion-label");
  if (!keyInput || !labelInput) return;
  const select = document.createElement("select");
  select.className = "criterion-pick";
  select.style.flex = "1";
  select.setAttribute("aria-label", "Pick what to compare");
  const fill = async () => {
    const fields = await loadComparableFields(getType());
    const current = keyInput.value.trim();
    select.innerHTML = `<option value="">Pick a field to compare...</option>` +
      fields.map((f) => `<option value="${f.key}">${f.label}</option>`).join("") +
      `<option value="__custom">Custom key...</option>`;
    if (current) {
      select.value = fields.some((f) => f.key === current) ? current : "__custom";
    }
    keyInput.style.display = select.value === "__custom" ? "" : "none";
  };
  select.addEventListener("change", async () => {
    if (select.value === "__custom") { keyInput.style.display = ""; keyInput.focus(); return; }
    keyInput.style.display = "none";
    keyInput.value = select.value;
    const fields = await loadComparableFields(getType());
    const f = fields.find((x) => x.key === select.value);
    if (f && !labelInput.value.trim()) labelInput.value = f.label;
  });
  row.insertBefore(select, keyInput);
  keyInput.style.display = keyInput.value.trim() ? "" : "none";
  fill();
}

function mountComparisonDesign(picker, criterionRowsContainer, criteriaEditor) {
  const container = document.getElementById("cmpDesign");
  if (!container || !window.ComparisonDesign) return null;
  return window.ComparisonDesign.mount({
    container,
    getItems: () => picker.getSelected(),
    getCriteria: () => readCriterionRows(criterionRowsContainer),
    addCriterion: (key, label) => criteriaEditor.addRow(key, label),
    watch: [document.getElementById("selectedItemRows"), criterionRowsContainer],
  });
}

function initCriterionRowEditor(criterionRowsContainer, addBtn, template, getType = () => "") {
  const addRow = (key, label) => {
    const frag = template.content.cloneNode(true);
    const row = frag.querySelector(".criterion-row");
    if (key) row.querySelector(".criterion-key").value = key;
    if (label) row.querySelector(".criterion-label").value = label;
    criterionRowsContainer.appendChild(frag);
    enhanceCriterionRow(criterionRowsContainer.lastElementChild, getType);
  };
  addBtn.addEventListener("click", () => addRow());

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "btn btn--ghost btn--sm";
  allBtn.textContent = "Add all comparable fields";
  allBtn.style.marginLeft = "8px";
  allBtn.addEventListener("click", async () => {
    const fields = await loadComparableFields(getType());
    const have = new Set(Array.from(criterionRowsContainer.querySelectorAll(".criterion-key")).map((i) => i.value.trim()));
    fields.filter((f) => f.key !== "rating" && !have.has(f.key)).forEach((f) => addRow(f.key, f.label));
  });
  addBtn.insertAdjacentElement("afterend", allBtn);

  criterionRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-criterion-row")) e.target.closest(".criterion-row").remove();
  });
  return { addRow, refresh: () => Array.from(criterionRowsContainer.querySelectorAll(".criterion-row")).forEach((r) => { const s = r.querySelector(".criterion-pick"); if (s) s.remove(); enhanceCriterionRow(r, getType); }) };
}

function readCriterionRows(criterionRowsContainer) {
  return Array.from(criterionRowsContainer.querySelectorAll(".criterion-row")).map((row) => ({
    key: row.querySelector(".criterion-key").value.trim(),
    label: row.querySelector(".criterion-label").value.trim(),
  })).filter((c) => c.key && c.label);
}

// ---- Comparison create form (with searchable item picker + dynamic criterion rows) ----
function initComparisonForm() {
  const form = document.getElementById("comparisonForm");
  if (!form) return;

  const picker = initComparisonItemPicker({
    contentTypeSelectEl: document.getElementById("itemSearchContentType"),
    searchInputId: "itemSearchInput", resultsId: "itemSearchResults",
    selectedRowsId: "selectedItemRows", rowTemplateId: "selectedItemRowTemplate",
  });

  const criterionRowsContainer = document.getElementById("criterionRows");
  const criterionTemplate = document.getElementById("criterionRowTemplate");
  const criteriaEditor = initCriterionRowEditor(criterionRowsContainer, document.getElementById("addCriterionRowBtn"), criterionTemplate,
    () => (form.elements.content_type ? form.elements.content_type.value : ""));
  if (form.elements.content_type) form.elements.content_type.addEventListener("change", () => criteriaEditor.refresh());
  const designEditor = mountComparisonDesign(picker, criterionRowsContainer, criteriaEditor);
  initEditorialPickPicker();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("comparisonFormAlert");
    alertEl.style.display = "none";

    const formData = new FormData(form);
    const items = picker.getSelected().map((it, idx) => ({ item_content_type: it.itemContentType, item_id: it.itemId, position: idx }));
    const criteria = readCriterionRows(criterionRowsContainer);

    const editorialType = formData.get("editorial_selection_item_type");
    const payload = {
      content_type: formData.get("content_type"),
      title: formData.get("title"),
      slug: formData.get("slug"),
      description: formData.get("description") || null,
      status: formData.get("status") || "draft",
      items,
      criteria,
      design: designEditor ? designEditor.read() : undefined,
      editorial_selection_item_type: editorialType || null,
      editorial_selection_item_id: editorialType ? (parseInt(formData.get("editorial_selection_item_id")) || null) : null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
    };

    try {
      const res = await fetch("/en/api/v1/comparison/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Comparison created successfully!";
        alertEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/dashboard/comparisons"; }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create comparison";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
