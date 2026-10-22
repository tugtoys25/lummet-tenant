// ============================================
// RESEARCH DATASETS (Phase 6)
// ============================================

// ============================================
// RESEARCH DATASETS — visual spreadsheet-style grid
// Replaces raw columns_json/rows_json textareas. Internally this
// editor works purely positionally (columns = ordered label list,
// rows = ordered arrays of cell values) — exactly like a real
// spreadsheet, so reordering/renaming a column never has to worry
// about a "key" concept. Column keys (what research_datasets
// actually stores, and what dataset_table content blocks bind
// against) are derived fresh from the current labels only at
// save time — see buildDatasetPayloadFromGrid().
// ============================================

const datasetGridState = { columns: [], rows: [] };

function slugifyDatasetColumnKey(label, usedKeys) {
  let base = String(label || "column").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) base = "column";
  let key = base;
  let i = 2;
  while (usedKeys.has(key)) { key = base + "_" + i; i++; }
  usedKeys.add(key);
  return key;
}

function datasetGridSeedBlank() {
  datasetGridState.columns = ["Column 1", "Column 2", "Column 3"];
  datasetGridState.rows = [["", "", ""], ["", "", ""]];
}

function datasetGridLoadFrom(columnsJsonRaw, rowsJsonRaw) {
  let columns = [];
  let rows = [];
  try { columns = typeof columnsJsonRaw === "string" ? JSON.parse(columnsJsonRaw || "[]") : (columnsJsonRaw || []); } catch { columns = []; }
  try { rows = typeof rowsJsonRaw === "string" ? JSON.parse(rowsJsonRaw || "[]") : (rowsJsonRaw || []); } catch { rows = []; }
  datasetGridState.columns = columns.map((c) => c.label || c.key || "");
  datasetGridState.rows = rows.map((r) => columns.map((c) => (r && r[c.key] !== undefined) ? r[c.key] : ""));
  if (datasetGridState.columns.length === 0) datasetGridSeedBlank();
}

function buildDatasetPayloadFromGrid() {
  const usedKeys = new Set();
  const columnsJson = datasetGridState.columns.map((label) => ({ key: slugifyDatasetColumnKey(label, usedKeys), label }));
  const rowsJson = datasetGridState.rows
    // drop fully-empty rows (e.g. a blank starter row the editor never filled in)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const obj = {};
      columnsJson.forEach((c, i) => { obj[c.key] = row[i] ?? ""; });
      return obj;
    });
  return { columnsJson, rowsJson };
}

function renderDatasetGrid() {
  const table = document.getElementById("datasetGridTable");
  if (!table) return;
  const cols = datasetGridState.columns;
  const rows = datasetGridState.rows;

  const headerCells = cols.map((label, ci) => `
    <th>
      <div style="display:flex;align-items:center">
        <input type="text" data-grid-header-cell="${ci}" value="${escapeHtml(label)}" placeholder="Column ${ci + 1}">
        <button type="button" class="dataset-grid__col-remove" data-remove-column="${ci}" title="Remove column">✕</button>
      </div>
    </th>`).join("");

  const bodyRows = rows.map((row, ri) => {
    const cells = cols.map((_, ci) => `
      <td><input type="text" data-grid-cell="${ri}:${ci}" value="${escapeHtml(row[ci] ?? "")}"></td>`).join("");
    return `<tr>${cells}<td class="dataset-grid__corner"><button type="button" class="dataset-grid__row-remove" data-remove-row="${ri}" title="Remove row">✕</button></td></tr>`;
  }).join("");

  if (cols.length === 0) {
    table.innerHTML = `<tr><td class="dataset-grid__empty muted">No columns yet — click "+ Add column" to start.</td></tr>`;
    return;
  }

  table.innerHTML = `
    <thead><tr>${headerCells}<th class="dataset-grid__corner"></th></tr></thead>
    <tbody>${bodyRows || `<tr><td colspan="${cols.length + 1}" class="dataset-grid__empty muted">No rows yet — click "+ Add row" to start.</td></tr>`}</tbody>`;
}

function parseTsvClipboard(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line, i, arr) => !(i === arr.length - 1 && line === "")) // drop a single trailing blank line from copy
    .map((line) => line.split("\t"));
}

function wireDatasetGrid() {
  const table = document.getElementById("datasetGridTable");
  const addColBtn = document.getElementById("datasetAddColumnBtn");
  const addRowBtn = document.getElementById("datasetAddRowBtn");
  if (!table || table.dataset.wired === "true") return;
  table.dataset.wired = "true";

  if (addColBtn) {
    addColBtn.addEventListener("click", () => {
      datasetGridState.columns.push("Column " + (datasetGridState.columns.length + 1));
      datasetGridState.rows.forEach((r) => r.push(""));
      renderDatasetGrid();
    });
  }
  if (addRowBtn) {
    addRowBtn.addEventListener("click", () => {
      datasetGridState.rows.push(new Array(datasetGridState.columns.length).fill(""));
      renderDatasetGrid();
    });
  }

  table.addEventListener("input", (e) => {
    const headerCell = e.target.closest("[data-grid-header-cell]");
    if (headerCell) {
      datasetGridState.columns[Number(headerCell.dataset.gridHeaderCell)] = headerCell.value;
      return;
    }
    const cell = e.target.closest("[data-grid-cell]");
    if (cell) {
      const [ri, ci] = cell.dataset.gridCell.split(":").map(Number);
      datasetGridState.rows[ri][ci] = cell.value;
    }
  });

  table.addEventListener("click", (e) => {
    const removeCol = e.target.closest("[data-remove-column]");
    if (removeCol) {
      const ci = Number(removeCol.dataset.removeColumn);
      datasetGridState.columns.splice(ci, 1);
      datasetGridState.rows.forEach((r) => r.splice(ci, 1));
      renderDatasetGrid();
      return;
    }
    const removeRow = e.target.closest("[data-remove-row]");
    if (removeRow) {
      datasetGridState.rows.splice(Number(removeRow.dataset.removeRow), 1);
      renderDatasetGrid();
    }
  });

  // Paste a whole table copied from Excel/Google Sheets/anywhere else
  // that exports tab-separated text — starts filling from whichever
  // cell the paste lands on, growing the grid to fit if the pasted
  // block is bigger than the current columns/rows.
  table.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return; // single-cell paste: let the browser handle it normally
    e.preventDefault();
    const matrix = parseTsvClipboard(text);
    if (matrix.length === 0) return;

    const headerCell = e.target.closest("[data-grid-header-cell]");
    const bodyCell = e.target.closest("[data-grid-cell]");

    let startRow, startCol;
    let firstRowIsHeader = false;
    if (headerCell) {
      startCol = Number(headerCell.dataset.gridHeaderCell);
      startRow = 0;
      firstRowIsHeader = true;
    } else if (bodyCell) {
      const [ri, ci] = bodyCell.dataset.gridCell.split(":").map(Number);
      startRow = ri;
      startCol = ci;
    } else {
      return;
    }

    let matrixRows = matrix;
    if (firstRowIsHeader) {
      const headerRow = matrix[0];
      headerRow.forEach((label, offset) => {
        const ci = startCol + offset;
        while (datasetGridState.columns.length <= ci) datasetGridState.columns.push("Column " + (datasetGridState.columns.length + 1));
        datasetGridState.columns[ci] = label;
        datasetGridState.rows.forEach((r) => { while (r.length <= ci) r.push(""); });
      });
      matrixRows = matrix.slice(1);
    }

    matrixRows.forEach((rowValues, rOffset) => {
      const ri = startRow + rOffset;
      while (datasetGridState.rows.length <= ri) datasetGridState.rows.push(new Array(datasetGridState.columns.length).fill(""));
      rowValues.forEach((val, cOffset) => {
        const ci = startCol + cOffset;
        while (datasetGridState.columns.length <= ci) {
          datasetGridState.columns.push("Column " + (datasetGridState.columns.length + 1));
          datasetGridState.rows.forEach((r) => { while (r.length <= ci) r.push(""); });
        }
        datasetGridState.rows[ri][ci] = val;
      });
    });

    renderDatasetGrid();
  });
}


async function loadDatasetsTable() {
  const tbody = document.getElementById("datasetsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/research-datasets/list");
    const data = await res.json();
    const datasets = data.datasets || [];
    if (datasets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No datasets yet.</td></tr>';
      return;
    }
    tbody.innerHTML = datasets.map(d => {
      let rowCount = 0;
      try { rowCount = JSON.parse(d.rows_json || "[]").length; } catch { /* leave 0 on malformed JSON */ }
      return `
        <tr>
          <td><strong>${d.title}</strong></td>
          <td><code>${d.slug}</code></td>
          <td><span class="badge ${d.published ? "badge-ok" : "badge-dim"}">${d.status}</span></td>
          <td>${rowCount}</td>
          <td class="table-actions">
            <button class="btn btn--ghost btn--sm" onclick="editDataset(${d.id})">Edit</button>
            <button class="btn btn--danger btn--sm" onclick="deleteDataset(${d.id}, '${d.title.replace(/'/g, "\\'")}')">Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function editDataset(id) {
  try {
    const res = await fetch(`/en/api/v1/research-datasets/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Could not load dataset"); return; }
    const d = data.dataset;

    const form = document.getElementById("datasetForm");
    if (!form) return;
    form.querySelector("[name='id']").value = d.id;
    form.querySelector("[name='title']").value = d.title || "";
    form.querySelector("[name='slug']").value = d.slug || "";
    form.querySelector("[name='description']").value = d.description || "";
    datasetGridLoadFrom(d.columns_json, d.rows_json);
    renderDatasetGrid();
    form.querySelector("[name='status']").value = d.status || "draft";
    form.querySelector("[name='published']").value = String(d.published || 0);

    form.dataset.editMode = "true";
    document.getElementById("datasetSubmitBtn").textContent = "Update Dataset";
    document.getElementById("datasetCancelEdit").style.display = "";
    form.scrollIntoView({ behavior: "smooth" });

    loadDatasetVersions(d.id);
  } catch {
    alert("Network error");
  }
}

function cancelDatasetEdit() {
  const form = document.getElementById("datasetForm");
  if (!form) return;
  form.reset();
  delete form.dataset.editMode;
  document.getElementById("datasetSubmitBtn").textContent = "Create Dataset";
  document.getElementById("datasetCancelEdit").style.display = "none";
  const versionsSection = document.getElementById("datasetVersionsSection");
  if (versionsSection) versionsSection.style.display = "none";
  datasetGridSeedBlank();
  renderDatasetGrid();
}

async function loadDatasetVersions(datasetId) {
  const section = document.getElementById("datasetVersionsSection");
  const tbody = document.getElementById("datasetVersionsTableBody");
  if (!section || !tbody) return;
  try {
    const res = await fetch(`/en/api/v1/research-datasets/versions?dataset_id=${datasetId}`);
    const data = await res.json();
    const versions = data.versions || [];
    if (versions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="muted">No versions yet — saved once this dataset is published.</td></tr>';
    } else {
      tbody.innerHTML = versions.map(v => `
        <tr>
          <td>v${v.version_number}</td>
          <td>${(v.created_at || "").replace("T", " ").slice(0, 16)}</td>
          <td>${v.changed_by || "—"}</td>
        </tr>
      `).join("");
    }
    section.style.display = "";
  } catch { /* leave the versions panel hidden on failure */ }
}

async function deleteDataset(id, title) {
  if (!confirm(`Delete dataset "${title}"? Any content blocks embedding it will stop rendering.`)) return;
  try {
    const res = await fetch("/en/api/v1/research-datasets/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) loadDatasetsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initDatasetForm() {
  const form = document.getElementById("datasetForm");
  if (!form) return;

  wireDatasetGrid();
  datasetGridSeedBlank();
  renderDatasetGrid();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("datasetFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);

    const { columnsJson, rowsJson } = buildDatasetPayloadFromGrid();
    if (columnsJson.length === 0) {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Add at least one column before saving."; alertEl.style.display = "block"; }
      return;
    }

    const isEdit = form.dataset.editMode === "true";
    const endpoint = isEdit ? "/en/api/v1/research-datasets/update" : "/en/api/v1/research-datasets/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      title: formData.get("title"),
      slug: formData.get("slug"),
      description: formData.get("description") || null,
      columns_json: columnsJson,
      rows_json: rowsJson,
      status: formData.get("status") || "draft",
      published: formData.get("published") === "1" ? 1 : 0,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) { alertEl.className = "alert alert--success"; alertEl.textContent = isEdit ? "Dataset updated!" : "Dataset created!"; alertEl.style.display = "block"; }
        cancelDatasetEdit();
        loadDatasetsTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

