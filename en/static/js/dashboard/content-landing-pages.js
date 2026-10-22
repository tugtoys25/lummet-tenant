

// ---- Content Landing Pages ("SEO landing pages for generic types") ----
async function loadContentLandingPagesTable(contentType) {
  const tbody = document.getElementById("landingPagesTableBody");
  if (!tbody) return;
  const typeFilter = document.getElementById("landingPageTypeFilter");
  const type = contentType !== undefined ? contentType : (typeFilter ? typeFilter.value : "");
  try {
    const params = new URLSearchParams();
    if (type) params.set("content_type", type);
    const res = await fetch(`/en/api/v1/content-landing-pages/list?${params.toString()}`);
    const data = await res.json();
    const pages = data.pages || [];
    if (pages.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="muted">No landing pages yet.</td></tr>'; return; }
    tbody.innerHTML = pages.map((p) => `
      <tr>
        <td><strong>${escapeHtmlClient(p.title)}</strong></td>
        <td>${escapeHtmlClient(p.slug)}</td>
        <td>${escapeHtmlClient(p.content_type)}${p.custom_type_slug ? ` (${escapeHtmlClient(p.custom_type_slug)})` : ""}</td>
        <td>${escapeHtmlClient(p.item_mode)}</td>
        <td><span class="status-badge ${p.status === "published" ? "status-published" : "status-draft"}">${escapeHtmlClient(p.status)}</span></td>
        <td class="table-actions">
          ${p.status === "published" ? `<a href="/en/best/${encodeURIComponent(p.slug)}" class="btn btn--ghost btn--sm" target="_blank">View</a>` : ""}
          <a href="/en/dashboard/content-landing-page/edit/${encodeURIComponent(p.slug)}" class="btn btn--ghost btn--sm">Edit</a>
          <button class="btn btn--danger btn--sm" onclick="deleteContentLandingPage('${p.slug}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

function initContentLandingPagesTable() {
  if (!document.getElementById("landingPagesTableBody")) return;
  loadContentLandingPagesTable();
  document.getElementById("landingPageTypeFilter")?.addEventListener("change", (e) => loadContentLandingPagesTable(e.target.value));
}

async function deleteContentLandingPage(slug) {
  if (!confirm(`Delete landing page "${slug}"? This cannot be undone.`)) return;
  try {
    const res = await fetch("/en/api/v1/content-landing-page/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
    const data = await res.json();
    if (data.success) loadContentLandingPagesTable(); else alert(data.error || "Delete failed");
  } catch { alert("Network error. Try again."); }
}

function initLandingPageModeToggle(contentTypeEl) {
  const modeSelect = document.getElementById("landingPageItemMode");
  const autoFields = document.getElementById("landingPageAutoFields");
  const manualFields = document.getElementById("landingPageManualFields");
  if (!modeSelect) return;
  const update = () => {
    autoFields.style.display = modeSelect.value === "auto" ? "" : "none";
    manualFields.style.display = modeSelect.value === "auto" ? "none" : "";
  };
  modeSelect.addEventListener("change", update);
  update();
}

function initContentLandingPageForm() {
  const form = document.getElementById("landingPageForm");
  if (!form) return;

  const contentTypeSelect = document.getElementById("landingPageContentType");
  const customTypeField = document.getElementById("landingPageCustomTypeField");
  const customTypeSelect = document.getElementById("landingPageCustomTypeSelect");
  initLandingPageModeToggle(contentTypeSelect);

  async function updateCustomTypeVisibility() {
    const isCustom = contentTypeSelect.value === "custom";
    customTypeField.style.display = isCustom ? "" : "none";
    if (isCustom && !customTypeSelect.dataset.loaded) {
      customTypeSelect.dataset.loaded = "1";
      try {
        const res = await fetch("/en/api/v1/custom-types/list");
        const data = await res.json();
        customTypeSelect.innerHTML = (data.types || []).map((t) => `<option value="${t.slug}">${escapeHtmlClient(t.label)}</option>`).join("");
      } catch { customTypeSelect.innerHTML = '<option value="">Failed to load</option>'; }
    }
  }
  contentTypeSelect.addEventListener("change", updateCustomTypeVisibility);
  updateCustomTypeVisibility();

  const picker = initComparisonItemPicker({
    contentTypeSelectEl: contentTypeSelect,
    searchInputId: "itemSearchInput", resultsId: "itemSearchResults",
    selectedRowsId: "selectedItemRows", rowTemplateId: "selectedItemRowTemplate",
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("landingPageFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const payload = {
      content_type: formData.get("content_type"),
      custom_type_slug: formData.get("content_type") === "custom" ? (formData.get("custom_type_slug") || null) : null,
      title: formData.get("title"), slug: formData.get("slug"), description: formData.get("description") || null,
      item_mode: formData.get("item_mode"), auto_limit: parseInt(formData.get("auto_limit")) || 10,
      status: formData.get("status") || "draft",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
      item_ids: picker.getSelected().map((it) => it.itemId),
    };
    try {
      const res = await fetch("/en/api/v1/content-landing-page/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success"; alertEl.textContent = "Landing page created!"; alertEl.style.display = "block";
        setTimeout(() => { window.location.href = "/en/dashboard/content-landing-pages"; }, 1200);
      } else {
        alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed to create"; alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error"; alertEl.textContent = "Network error. Try again."; alertEl.style.display = "block";
    }
  });
}

async function initContentLandingPageEditForm() {
  const form = document.getElementById("landingPageEditForm");
  if (!form) return;
  const slug = form.dataset.slug;
  const alertEl = document.getElementById("landingPageEditAlert");
  function showAlert(kind, msg) { alertEl.className = `alert alert--${kind}`; alertEl.textContent = msg; alertEl.style.display = "block"; }

  const contentTypeInput = document.getElementById("landingPageContentType");
  initLandingPageModeToggle(contentTypeInput);

  let page, itemIds;
  try {
    const res = await fetch(`/en/api/v1/content-landing-page/get?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.success) { showAlert("error", data.error || "Not found"); form.style.display = "none"; return; }
    page = data.page; itemIds = data.item_ids || [];
    contentTypeInput.value = page.content_type + (page.custom_type_slug ? ` (${page.custom_type_slug})` : "");
    form.elements.title.value = page.title;
    form.elements.description.value = page.description || "";
    form.elements.item_mode.value = page.item_mode;
    form.elements.auto_limit.value = page.auto_limit;
    form.elements.status.value = page.status;
    form.elements.seo_title.value = page.seo_title || "";
    form.elements.seo_description.value = page.seo_description || "";
    form.elements.seo_keywords.value = page.seo_keywords || "";
    document.getElementById("landingPageItemMode").dispatchEvent(new Event("change"));
  } catch {
    showAlert("error", "Failed to load landing page.");
    form.style.display = "none";
    return;
  }

  const picker = initComparisonItemPicker({
    contentTypeSelectEl: contentTypeInput,
    searchInputId: "itemSearchInput", resultsId: "itemSearchResults",
    selectedRowsId: "selectedItemRows", rowTemplateId: "selectedItemRowTemplate",
  });
  await Promise.all(itemIds.map(async (id) => {
    try {
      const r = await fetch(`/en/api/v1/content-item/search?content_type=${encodeURIComponent(page.content_type)}&id=${id}`);
      const rd = await r.json();
      picker.addPreset((rd.items || [])[0] || { id, content_type: page.content_type, name: `#${id}` });
    } catch { picker.addPreset({ id, content_type: page.content_type, name: `#${id}` }); }
  }));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const payload = {
      slug,
      title: formData.get("title"), description: formData.get("description") || null,
      item_mode: formData.get("item_mode"), auto_limit: parseInt(formData.get("auto_limit")) || 10,
      status: formData.get("status") || "draft",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
      item_ids: picker.getSelected().map((it) => it.itemId),
    };
    try {
      const res = await fetch("/en/api/v1/content-landing-page/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) showAlert("success", "Saved.");
      else showAlert("error", data.error || "Failed to save");
    } catch { showAlert("error", "Network error. Try again."); }
  });

  document.getElementById("deleteLandingPageBtn").addEventListener("click", async () => {
    if (!confirm("Delete this landing page? This cannot be undone.")) return;
    try {
      const res = await fetch("/en/api/v1/content-landing-page/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      const data = await res.json();
      if (data.success) window.location.href = "/en/dashboard/content-landing-pages";
      else alert(data.error || "Delete failed");
    } catch { alert("Network error. Try again."); }
  });
}
