// =====================================================
// ADMIN DASHBOARD JS
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadStats();
  loadTopCasinos();
  loadTopCountries();
  loadCasinosTable();
  initCasinoForm();
  loadContentItemsTable();
  initContentItemForm();
  loadCustomTypesTable();
  initCustomTypeForm();
  loadComparisonsTable();
  initComparisonForm();
  initContentItemEditForm();
  initCustomTypeEditForm();
  initComparisonEditForm();
  initContentTypeSettingsForm();
  loadGenericReviewsTable();
  initGenericReviewForm();
  initGenericReviewEditForm();
  initContentLandingPagesTable();
  initContentLandingPageForm();
  initContentLandingPageEditForm();
});


// ---- Generic review: full edit page (gaps #3 full edit, #14 structured content) ----
async function initGenericReviewEditForm() {
  const form = document.getElementById("genericReviewEditForm");
  if (!form) return;

  const id = parseInt(form.dataset.id);
  const alertEl = document.getElementById("genericReviewEditAlert");
  const blockRowsContainer = document.getElementById("reviewBlockRows");
  const blockTemplate = document.getElementById("reviewBlockRowTemplate");

  function addBlockRow(block = { title: "", content: "" }) {
    const clone = blockTemplate.content.cloneNode(true);
    clone.querySelector(".block-title").value = block.title || "";
    clone.querySelector(".block-content").value = block.content || "";
    blockRowsContainer.appendChild(clone);
  }
  document.getElementById("addReviewBlockBtn").addEventListener("click", () => addBlockRow());
  blockRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-review-block")) e.target.closest(".review-block-row").remove();
  });

  function showAlert(kind, message) {
    alertEl.className = `alert alert--${kind}`;
    alertEl.textContent = message;
    alertEl.style.display = "block";
  }

  let review;
  try {
    const res = await fetch(`/en/api/v1/generic-review/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { showAlert("error", data.error || "Review not found"); form.style.display = "none"; return; }
    review = data.review;
    document.getElementById("genericReviewEditSubtitle").textContent = `Reviewing: ${review.reviewed_content_type} #${review.reviewed_content_id}`;
    form.elements.title.value = review.title;
    form.elements.slug.value = review.slug;
    form.elements.content.value = review.content || "";
    const fromJsonArray = (raw) => { try { return (JSON.parse(raw || "[]") || []).join("\n"); } catch { return raw || ""; } };
    form.elements.pros.value = fromJsonArray(review.pros);
    form.elements.cons.value = fromJsonArray(review.cons);
    if (review.rating != null) form.elements.rating.value = review.rating;
    form.elements.verdict.value = review.verdict || "";
    form.elements.published.checked = !!review.published;
    form.elements.seo_title.value = review.seo_title || "";
    form.elements.seo_description.value = review.seo_description || "";
    form.elements.seo_keywords.value = review.seo_keywords || "";
  } catch {
    showAlert("error", "Failed to load review.");
    form.style.display = "none";
    return;
  }

  try {
    const res = await fetch(`/en/api/v1/review-blocks/list?review_slug=${encodeURIComponent(review.slug)}`);
    const data = await res.json();
    (data.blocks || []).forEach((b) => addBlockRow(b));
  } catch { /* structured blocks are optional; a load failure just leaves the section empty rather than blocking the edit form */ }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const toJsonArray = (text) => JSON.stringify((text || "").split("\n").map((s) => s.trim()).filter(Boolean));
    const payload = {
      id,
      title: formData.get("title"), content: formData.get("content"),
      pros: toJsonArray(formData.get("pros")), cons: toJsonArray(formData.get("cons")),
      rating: formData.get("rating") || null, verdict: formData.get("verdict") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
      published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
    };
    const blocks = Array.from(blockRowsContainer.querySelectorAll(".review-block-row")).map((row) => ({
      title: row.querySelector(".block-title").value.trim(),
      content: row.querySelector(".block-content").value.trim(),
    })).filter((b) => b.title && b.content);

    try {
      const [updRes, blocksRes] = await Promise.all([
        fetch("/en/api/v1/generic-review/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
        fetch("/en/api/v1/review-blocks/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_slug: review.slug, blocks }) }),
      ]);
      const updData = await updRes.json();
      if (updData.success && blocksRes.ok) showAlert("success", "Saved.");
      else showAlert("error", updData.error || "Failed to save");
    } catch {
      showAlert("error", "Network error. Try again.");
    }
  });

  document.getElementById("deleteGenericReviewBtn").addEventListener("click", async () => {
    if (!confirm("Delete this review? This cannot be undone.")) return;
    try {
      const res = await fetch("/en/api/v1/generic-review/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (data.success) window.location.href = "/en/dashboard/reviews/generic";
      else alert(data.error || "Delete failed");
    } catch { alert("Network error. Try again."); }
  });
}


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


// ---- Shared: admin list pagination (audit #15) ----
// Renders Prev/Next + "showing X-Y of N" into a container, and calls
// onPageChange(newPage) when clicked. A list whose API call omitted
// page/per_page (no `total` in the response) renders nothing here --
// pagination is opt-in per list via PAGE_STATE below, existing callers
// of these loaders with no page argument are unaffected.
function renderPagerControls(containerId, page, perPage, total, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (total == null) { el.innerHTML = ""; return; }
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  el.innerHTML = `
    <button type="button" class="btn btn--ghost btn--sm" id="${containerId}PrevBtn" ${page <= 1 ? "disabled" : ""}>&laquo; Prev</button>
    <span class="muted">Showing ${from}-${to} of ${total}</span>
    <button type="button" class="btn btn--ghost btn--sm" id="${containerId}NextBtn" ${page >= totalPages ? "disabled" : ""}>Next &raquo;</button>
  `;
  document.getElementById(`${containerId}PrevBtn`)?.addEventListener("click", () => page > 1 && onPageChange(page - 1));
  document.getElementById(`${containerId}NextBtn`)?.addEventListener("click", () => page < totalPages && onPageChange(page + 1));
}

const PAGE_STATE = { contentItems: 1, customTypes: 1, comparisons: 1, genericReviews: 1 };
const PER_PAGE = 25;

// ---- Stats ----
async function loadStats() {
  try {
    const res = await fetch("/en/api/v1/dashboard");
    const data = await res.json();

    const el = (id) => document.getElementById(id);
    if (el("statCasinos")) el("statCasinos").textContent = data.casinos ?? 0;
    if (el("statReviews")) el("statReviews").textContent = data.reviews ?? 0;
    if (el("statClicks")) el("statClicks").textContent = data.clicks ?? 0;
    if (el("statPages")) el("statPages").textContent = data.pages ?? 0;
  } catch {
    console.error("Failed to load stats");
  }
}

// ---- Top casinos by clicks ----
async function loadTopCasinos() {
  const container = document.getElementById("topCasinosTable");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/stats/top-casinos");
    const data = await res.json();
    const items = data.casinos || [];

    if (items.length === 0) {
      container.innerHTML = '<p class="muted">No click data yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>Casino</th><th>Clicks</th></tr></thead>
        <tbody>
          ${items.map((c) => `
            <tr><td>${c.casino_slug}</td><td>${c.clicks}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Top countries by clicks ----
async function loadTopCountries() {
  const container = document.getElementById("topCountriesTable");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/stats/countries");
    const data = await res.json();
    const items = data.countries || [];

    if (items.length === 0) {
      container.innerHTML = '<p class="muted">No country data yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>Country</th><th>Clicks</th></tr></thead>
        <tbody>
          ${items.map((c) => `
            <tr><td>${c.country_code || "Unknown"}</td><td>${c.clicks}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Casinos table ----
async function loadCasinosTable() {
  const tbody = document.getElementById("casinosTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/casinos/list");
    const data = await res.json();
    const casinos = data.casinos || [];

    if (casinos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No casinos yet.</td></tr>';
      return;
    }

    tbody.innerHTML = casinos
      .map(
        (c) => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.slug}</td>
        <td>★ ${c.rating || "N/A"}</td>
        <td>${c.featured ? "⭐ Yes" : "—"}</td>
        <td><span class="status-badge ${c.status === "published" ? "status-published" : "status-draft"}">${c.status || "draft"}</span></td>
        <td class="table-actions">
          <a href="/en/dashboard/casino/edit/${c.slug}" class="btn btn--ghost btn--sm">Edit</a>
          <a href="/en/casino/${c.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteCasino('${c.slug}')">Delete</button>
        </td>
      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

// ---- Delete casino ----
async function deleteCasino(slug) {
  if (!confirm(`Delete casino "${slug}"? This cannot be undone.`)) return;

  try {
    const res = await fetch("/en/api/v1/casino/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();

    if (data.success) {
      loadCasinosTable();
    } else {
      alert(data.error || "Delete failed");
    }
  } catch {
    alert("Network error. Try again.");
  }
}

// ---- Casino create form ----
async function initCasinoForm() {
  const form = document.getElementById("casinoForm");
  if (!form) return;

    // Load countries for geo targeting
  const countryBox = document.getElementById("countryCheckboxes");
  if (countryBox && !countryBox.dataset.loaded) {
    countryBox.dataset.loaded = "1";
    try {
      const res = await fetch("/en/api/v1/countries/list");
      const data = await res.json();
      const countries = data.countries || [];
      countryBox.innerHTML = countries.map(c => `
        <label style="display:block;padding:4px 0">
          <input type="checkbox" value="${c.code}"> ${c.name} (${c.code})
        </label>
      `).join("");
    } catch {
      countryBox.innerHTML = '<p class="muted">Failed to load countries</p>';
    }
  }
    // Load categories for assignment
  const categoryBox = document.getElementById("categoryCheckboxes");
  if (categoryBox && !categoryBox.dataset.loaded) {
    categoryBox.dataset.loaded = "1";
    try {
      const catRes = await fetch("/en/api/v1/categories/list");
      const catData = await catRes.json();
      const cats = catData.categories || [];
      categoryBox.innerHTML = cats.map(c => `
        <label style="display:block;padding:4px 0">
          <input type="checkbox" value="${c.id}"> ${c.name} (${c.slug})
        </label>
      `).join("");
    } catch {
      categoryBox.innerHTML = '<p class="muted">Failed to load categories</p>';
    }
  }


  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("casinoFormAlert");
    alertEl.style.display = "none";

    const formData = new FormData(form);
    const features = formData.get("features");
    const payload = {
      name: formData.get("name"),
      slug: formData.get("slug"),
      logo: formData.get("logo") || null,
      website_url: formData.get("website_url"),
      affiliate_url: formData.get("affiliate_url"),
      rating: parseFloat(formData.get("rating")) || 0,
      bonus_title: formData.get("bonus_title") || null,
      bonus_value: formData.get("bonus_value") || null,
      features: features ? features.split(",").map((f) => f.trim()).filter(Boolean) : [],
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      featured: parseInt(formData.get("featured")) || 0,
      sort_order: parseInt(formData.get("sort_order")) || 0,
      status: formData.get("status") || "draft",
      category_ids: Array.from(
        document.querySelectorAll("#categoryCheckboxes input:checked")
      ).map(c => parseInt(c.value)),
    };

    try {
      const res = await fetch("/en/api/v1/casino/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

           if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Casino created successfully!";
        alertEl.style.display = "block";

        // Capture geo data BEFORE form.reset()
        const geoMode = formData.get("geo_mode") || "allow";
        const selectedCountries = Array.from(
          document.querySelectorAll("#countryCheckboxes input:checked")
        ).map(c => c.value);

        // Sync geo rules FIRST
        if (selectedCountries.length > 0) {
          const rules = selectedCountries.map(code => ({
            country_code: code,
            status: geoMode === "allow" ? "allowed" : "blocked",
            bonus_override: null
          }));
          await fetch("/en/api/v1/geo/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ casino_slug: payload.slug, rules })
          });
        }

        form.reset();  // NOW safe to reset
        setTimeout(() => {
          window.location.href = "/en/dashboard/casinos";
        }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create casino";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

// =====================================================
// GENERIC CONTENT ENGINE (Phase 8 — admin UI)
// Every function below no-ops if its page's elements aren't present
// on the current page, same guard style as loadCasinosTable() above
// -- safe to call unconditionally from DOMContentLoaded on every
// admin page.
// =====================================================

// ---- Content items table (sportsbook/affiliate_partner/custom) ----
async function loadContentItemsTable(contentType) {
  const tbody = document.getElementById("contentItemsTableBody");
  if (!tbody) return;

  const typeFilter = document.getElementById("contentItemTypeFilter");
  const type = contentType || (typeFilter ? typeFilter.value : "sportsbook");
  const statusFilter = document.getElementById("contentItemStatusFilter");
  const searchInput = document.getElementById("contentItemSearchInput");
  const status = statusFilter ? statusFilter.value : "";
  const search = searchInput ? searchInput.value.trim() : "";

  try {
    const params = new URLSearchParams({ content_type: type, page: String(PAGE_STATE.contentItems), per_page: String(PER_PAGE) });
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    const res = await fetch(`/en/api/v1/content-items/list?${params.toString()}`);
    const data = await res.json();
    const items = data.items || [];
    renderPagerControls("contentItemsPager", PAGE_STATE.contentItems, PER_PAGE, data.total, (p) => { PAGE_STATE.contentItems = p; loadContentItemsTable(type); });

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No items yet for this type.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map((i) => {
      const isLive = i.status === "published" && !!i.published;
      return `
      <tr>
        <td><strong>${escapeHtmlClient(i.name)}</strong></td>
        <td>${escapeHtmlClient(i.slug)}</td>
        <td>${escapeHtmlClient(i.content_type)}${i.custom_type_slug ? ` (${escapeHtmlClient(i.custom_type_slug)})` : ""}</td>
        <td>★ ${i.rating || "N/A"}</td>
        <td><span class="status-badge ${i.status === "published" ? "status-published" : "status-draft"}">${escapeHtmlClient(i.status || "draft")}</span> ${isLive ? "" : '<span class="muted" style="font-size:11px">(not public)</span>'}</td>
        <td class="table-actions">
          ${isLive ? `<a href="${contentItemPublicUrl(i)}" class="btn btn--ghost btn--sm" target="_blank">View</a>` : ""}
          <a href="/en/dashboard/content-item/edit/${encodeURIComponent(i.content_type)}/${encodeURIComponent(i.slug)}" class="btn btn--ghost btn--sm">Edit</a>
          <button class="btn btn--ghost btn--sm" onclick="togglePublishContentItem('${i.content_type}', '${i.slug}', ${isLive})">${isLive ? "Unpublish" : "Publish now"}</button>
          <button class="btn btn--danger btn--sm" onclick="deleteContentItem('${i.content_type}', '${i.slug}')">Delete</button>
        </td>
      </tr>
    `;
    }).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

// Public URL per content_type (matches routes.js). View is only offered
// for live items, since a draft's public URL is a 404 by design.
function contentItemPublicUrl(i) {
  const slug = encodeURIComponent(i.slug);
  if (i.content_type === "sportsbook") return `/en/sportsbook/${slug}`;
  if (i.content_type === "affiliate_partner") return `/en/affiliate-partner/${slug}`;
  return `/en/custom/${encodeURIComponent(i.custom_type_slug || "")}/${slug}`;
}

// Minimal client-side HTML escaper for admin table rows -- admin-entered
// name/slug/status are untrusted input the same way a custom field
// value is, so escape before interpolating into innerHTML.
function escapeHtmlClient(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

document.addEventListener("change", (e) => {
  if (e.target && (e.target.id === "contentItemTypeFilter" || e.target.id === "contentItemStatusFilter")) {
    PAGE_STATE.contentItems = 1;
    loadContentItemsTable(document.getElementById("contentItemTypeFilter")?.value);
  }
  if (e.target && e.target.id === "comparisonTypeFilter") {
    PAGE_STATE.comparisons = 1;
    loadComparisonsTable(e.target.value);
  }
});

let contentItemSearchDebounce;
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "contentItemSearchInput") {
    clearTimeout(contentItemSearchDebounce);
    contentItemSearchDebounce = setTimeout(() => { PAGE_STATE.contentItems = 1; loadContentItemsTable(); }, 300);
  }
});

async function deleteContentItem(contentType, slug) {
  if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
  try {
    const res = await fetch("/en/api/v1/content-item/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: contentType, slug }),
    });
    const data = await res.json();
    if (data.success) loadContentItemsTable(contentType);
    else alert(data.error || "Delete failed");
  } catch {
    alert("Network error. Try again.");
  }
}

// One-click publish/unpublish -- previously the only way to flip an
// item's lifecycle state was to open the full edit form, change the
// Status dropdown AND the Publicly Active checkbox, and save. This is
// a quick action for the common case; it still goes through the same
// content-item/update endpoint (same permission checks, same audit
// logging), just pre-filling the two fields that matter for "is this
// live" rather than requiring the whole form. Unpublishing sets status
// back to 'draft' (not just published=0) so the item doesn't sit in a
// confusing "status: published, but published: false" in-between state.
async function togglePublishContentItem(contentType, slug, currentlyLive) {
  const action = currentlyLive ? "unpublish" : "publish";
  if (!confirm(currentlyLive ? `Unpublish "${slug}"? It will no longer be visible on the public site.` : `Publish "${slug}" now? It will become visible on the public site immediately.`)) return;
  try {
    const res = await fetch("/en/api/v1/content-item/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: contentType, slug,
        status: currentlyLive ? "draft" : "published",
        published: !currentlyLive,
      }),
    });
    const data = await res.json();
    if (data.success) loadContentItemsTable(contentType);
    else alert(data.error || `Failed to ${action}`);
  } catch {
    alert("Network error. Try again.");
  }
}

// ---- Content item create form ----
async function initContentItemForm() {
  const form = document.getElementById("contentItemForm");
  if (!form) return;

  const typeSelect = document.getElementById("contentTypeSelect");
  const customTypeField = document.getElementById("customTypeField");
  const customTypeSelect = document.getElementById("customTypeSelect");
  const sportsbookFields = document.getElementById("sportsbookFields");
  const affiliatePartnerFields = document.getElementById("affiliatePartnerFields");
  const customFieldsContainer = document.getElementById("customFieldsContainer");
  const customFieldRows = document.getElementById("customFieldRows");

  async function loadCustomTypeOptions() {
    if (customTypeSelect.dataset.loaded) return;
    customTypeSelect.dataset.loaded = "1";
    try {
      const res = await fetch("/en/api/v1/custom-types/list");
      const data = await res.json();
      customTypeSelect.innerHTML = (data.types || [])
        .map((t) => `<option value="${t.slug}">${escapeHtmlClient(t.label)}</option>`).join("");
      if (customTypeSelect.value) loadCustomFieldInputs(customTypeSelect.value);
    } catch {
      customTypeSelect.innerHTML = '<option value="">Failed to load custom types</option>';
    }
  }

  async function loadCustomFieldInputs(typeSlug) {
    if (!typeSlug) { customFieldRows.innerHTML = "Select a custom type above to see its fields."; return; }
    try {
      const res = await fetch(`/en/api/v1/custom-type/fields?type_slug=${encodeURIComponent(typeSlug)}`);
      const data = await res.json();
      const fields = data.fields || [];
      customFieldRows.innerHTML = fields.length
        ? fields.map((def) => `
            <label>${escapeHtmlClient(def.label)}${def.required ? " *" : ""}
              <input type="text" class="custom-field-input" data-field-key="${def.field_key}">
            </label>
          `).join("")
        : "<p class='muted'>This type has no custom fields defined.</p>";
    } catch {
      customFieldRows.innerHTML = "<p class='muted'>Failed to load fields.</p>";
    }
  }

  customTypeSelect.addEventListener("change", () => loadCustomFieldInputs(customTypeSelect.value));

  function updateVisibleFields() {
    const type = typeSelect.value;
    customTypeField.style.display = type === "custom" ? "" : "none";
    sportsbookFields.style.display = type === "sportsbook" ? "" : "none";
    affiliatePartnerFields.style.display = type === "affiliate_partner" ? "" : "none";
    customFieldsContainer.style.display = type === "custom" ? "" : "none";
    if (type === "custom") loadCustomTypeOptions();
    if (type === "sportsbook") loadRelationshipCheckboxes();
  }

  typeSelect.addEventListener("change", updateVisibleFields);
  updateVisibleFields();
  loadCategoryCheckboxes();
  initGeoRuleEditor();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("contentItemFormAlert");
    alertEl.style.display = "none";

    const contentType = new FormData(form).get("content_type");
    const formData = new FormData(form);
    const payload = {
      content_type: formData.get("content_type"),
      custom_type_slug: formData.get("custom_type_slug") || null,
      name: formData.get("name"),
      slug: formData.get("slug"),
      title: formData.get("title") || null,
      description: formData.get("description") || null,
      website: formData.get("website") || null,
      rating: parseFloat(formData.get("rating")) || 0,
      license: formData.get("license") || null,
      license_country: formData.get("license_country") || null,
      live_betting: formData.get("live_betting") === "on",
      pre_match: formData.get("pre_match") === "on",
      cashout: formData.get("cashout") === "on",
      mobile_app: formData.get("mobile_app") === "on",
      linked_affiliate_partner_id: formData.get("linked_affiliate_partner_id") || null,
      tracking_url: formData.get("tracking_url") || null,
      logo_media_id: formData.get("logo_media_id") || null,
      featured_image_media_id: formData.get("featured_image_media_id") || null,
      featured: formData.get("featured") === "on" ? 1 : 0,
      sort_order: parseInt(formData.get("sort_order")) || 0,
      status: formData.get("status") || "draft",
      published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
    };
    if (document.getElementById("categoryCheckboxes")?.dataset.loaded === "1") payload.category_ids = readCheckedIds("categoryCheckboxes");
    const geoRulesToSend = readGeoRules();
    if (geoRulesToSend !== null) payload.geo_rules = geoRulesToSend;
    if (contentType === "sportsbook") {
      payload.sport_ids = readCheckedIds("sportsCheckboxes");
      payload.currency_ids = readCheckedIds("currenciesCheckboxes");
      payload.payment_method_ids = readCheckedIds("paymentMethodsCheckboxes");
    }
    if (contentType === "custom") {
      const values = {};
      customFieldRows.querySelectorAll(".custom-field-input").forEach((input) => {
        values[input.dataset.fieldKey] = input.value;
      });
      payload.custom_field_values = values;
    }

    try {
      const res = await fetch("/en/api/v1/content-item/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Content item created successfully!";
        alertEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/dashboard/content-items"; }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create content item";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

// ---- Shared: sports/currencies/payment-methods checkbox groups ----
// Used by both the create form and the edit form.
async function loadRelationshipCheckboxes(selected = {}) {
  const { sportIds = [], currencyIds = [], paymentMethodIds = [] } = selected;

  async function fill(containerId, url, listKey, selectedIds) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const rows = data[listKey] || [];
      if (rows.length === 0) {
        container.innerHTML = '<span class="muted">None configured yet.</span>';
        return;
      }
      container.innerHTML = rows.map((row) => `
        <label style="display:block;font-weight:normal">
          <input type="checkbox" value="${row.id}" ${selectedIds.includes(row.id) ? "checked" : ""}>
          ${escapeHtmlClient(row.name || row.code)}
        </label>
      `).join("");
    } catch {
      container.innerHTML = '<span class="muted">Failed to load.</span>';
    }
  }

  await Promise.all([
    fill("sportsCheckboxes", "/en/api/v1/sports/list", "sports", sportIds),
    fill("currenciesCheckboxes", "/en/api/v1/currencies/list", "currencies", currencyIds),
    fill("paymentMethodsCheckboxes", "/en/api/v1/payment-methods/list", "payment_methods", paymentMethodIds),
  ]);
}


// ---- Shared: categories checkboxes + GEO rule rows (content_categories / content_geo) ----
async function loadCategoryCheckboxes(selectedIds = []) {
  const container = document.getElementById("categoryCheckboxes");
  if (!container) return;
  try {
    const res = await fetch("/en/api/v1/categories/list");
    const data = await res.json();
    const rows = data.categories || [];
    container.dataset.loaded = "1"; // only then is an empty selection meaningful (vs. "failed to load")
    container.innerHTML = rows.length ? rows.map((c) => `
      <label style="display:block;font-weight:normal">
        <input type="checkbox" value="${c.id}" ${selectedIds.includes(c.id) ? "checked" : ""}> ${escapeHtmlClient(c.name)}
      </label>`).join("") : '<span class="muted">No categories configured yet.</span>';
  } catch {
    container.innerHTML = '<span class="muted">Failed to load categories.</span>';
  }
}

let geoCountryOptionsHtml = null;
async function getGeoCountryOptionsHtml() {
  if (geoCountryOptionsHtml !== null) return geoCountryOptionsHtml;
  try {
    const res = await fetch("/en/api/v1/countries/list");
    const data = await res.json();
    geoCountryOptionsHtml = (data.countries || []).map((c) => `<option value="${escapeHtmlClient(c.code)}">${escapeHtmlClient(c.name)} (${escapeHtmlClient(c.code)})</option>`).join("");
  } catch {
    geoCountryOptionsHtml = null; // failed: don't cache, and readGeoRules() will refuse to send anything
    return "";
  }
  return geoCountryOptionsHtml;
}

async function addGeoRuleRow(rule = { country_code: "", status: "allowed" }) {
  const container = document.getElementById("geoRuleRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "geo-rule-row";
  row.style.cssText = "display:flex;gap:8px;margin-bottom:6px;align-items:center";
  row.innerHTML = `
    <select class="geo-rule-country" style="flex:2">${await getGeoCountryOptionsHtml()}</select>
    <select class="geo-rule-status" style="flex:1">
      <option value="allowed">Allowed</option>
      <option value="blocked">Blocked</option>
    </select>
    <button type="button" class="btn btn--ghost btn--sm remove-geo-rule">✕</button>`;
  row.querySelector(".geo-rule-country").value = rule.country_code;
  row.querySelector(".geo-rule-status").value = rule.status;
  container.appendChild(row);
}

function initGeoRuleEditor(initialRules = []) {
  const container = document.getElementById("geoRuleRows");
  const addBtn = document.getElementById("addGeoRuleBtn");
  if (!container || !addBtn) return;
  addBtn.addEventListener("click", () => addGeoRuleRow());
  container.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-geo-rule")) e.target.closest(".geo-rule-row").remove();
  });
  initialRules.forEach((r) => addGeoRuleRow(r));
}

// Returns null (=> omit geo_rules from the payload, leaving stored rules
// untouched) if the country list never loaded -- otherwise a failed load
// would render rows with no matching <option>, read back as empty, and a
// save would silently wipe the item's existing rules.
function readGeoRules() {
  if (geoCountryOptionsHtml === null || geoCountryOptionsHtml === "") {
    return document.querySelector("#geoRuleRows .geo-rule-row") ? null : [];
  }
  return Array.from(document.querySelectorAll("#geoRuleRows .geo-rule-row")).map((row) => ({
    country_code: row.querySelector(".geo-rule-country").value,
    status: row.querySelector(".geo-rule-status").value,
  })).filter((r) => r.country_code);
}


// ---- Shared: logo/hero media picker for content-item forms (gap #5/#6) ----
// Same MediaPicker.openImagePicker() API news/admin.js already uses.
function openContentItemMediaPicker(which) {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function (media) {
    if (!media || !media.id) return;
    setContentItemMedia(which, media.id, media.url || media.thumbnail_url || "");
  }, "content-items");
}

function setContentItemMedia(which, id, url) {
  const idInput = document.getElementById(which === "logo" ? "logoMediaId" : "heroMediaId");
  const img = document.getElementById(which === "logo" ? "logoImg" : "heroImg");
  const preview = document.getElementById(which === "logo" ? "logoPreview" : "heroPreview");
  const selectBtn = document.getElementById(which === "logo" ? "selectLogo" : "selectHero");
  const clearBtn = document.getElementById(which === "logo" ? "clearLogo" : "clearHero");
  if (idInput) idInput.value = id ? String(id) : "";
  if (img) img.src = url || "";
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
  if (clearBtn) clearBtn.style.display = url ? "" : "none";
}

function clearContentItemMedia(which) {
  setContentItemMedia(which, "", "");
}

function readCheckedIds(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((el) => parseInt(el.value)).filter((n) => !Number.isNaN(n));
}

// ---- Custom content types table ----
async function loadCustomTypesTable() {
  const tbody = document.getElementById("customTypesTableBody");
  if (!tbody) return;

  try {
    const res = await fetch(`/en/api/v1/custom-types/list?page=${PAGE_STATE.customTypes}&per_page=${PER_PAGE}`);
    const data = await res.json();
    const types = data.types || [];
    renderPagerControls("customTypesPager", PAGE_STATE.customTypes, PER_PAGE, data.total, (p) => { PAGE_STATE.customTypes = p; loadCustomTypesTable(); });

    if (types.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No custom types yet.</td></tr>';
      return;
    }

    tbody.innerHTML = types.map((t) => `
      <tr>
        <td><strong>${escapeHtmlClient(t.label)}</strong></td>
        <td>${escapeHtmlClient(t.slug)}</td>
        <td>${escapeHtmlClient(t.plural_label)}</td>
        <td>${t.review_enabled ? "Yes" : "No"}</td>
        <td>${t.comparison_enabled ? "Yes" : "No"}</td>
        <td class="table-actions">
          <a href="/en/custom/${encodeURIComponent(t.slug)}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <a href="/en/dashboard/custom-type/edit/${encodeURIComponent(t.slug)}" class="btn btn--ghost btn--sm">Edit</a>
          <button class="btn btn--danger btn--sm" onclick="deleteCustomType('${t.slug}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

// ---- Custom type create form (with dynamic field-definition rows) ----
function initCustomTypeForm() {
  const form = document.getElementById("customTypeForm");
  if (!form) return;

  const fieldRowsContainer = document.getElementById("fieldRows");
  const template = document.getElementById("fieldRowTemplate");

  document.getElementById("addFieldRowBtn").addEventListener("click", () => {
    const clone = template.content.cloneNode(true);
    fieldRowsContainer.appendChild(clone);
  });

  fieldRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-field-row")) {
      e.target.closest(".field-row").remove();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("customTypeFormAlert");
    alertEl.style.display = "none";

    const formData = new FormData(form);
    const fields = Array.from(fieldRowsContainer.querySelectorAll(".field-row")).map((row) => ({
      field_key: row.querySelector(".field-key").value.trim(),
      label: row.querySelector(".field-label").value.trim(),
      field_type: row.querySelector(".field-type").value,
      required: row.querySelector(".field-required").checked,
    })).filter((f) => f.field_key && f.label);

    const payload = {
      label: formData.get("label"),
      plural_label: formData.get("plural_label"),
      slug: formData.get("slug"),
      icon: formData.get("icon") || null,
      review_enabled: formData.get("review_enabled") === "on",
      comparison_enabled: formData.get("comparison_enabled") === "on",
      fields,
    };

    try {
      const res = await fetch("/en/api/v1/custom-type/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Custom type created successfully!";
        alertEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/dashboard/custom-types"; }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create custom type";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

// ---- Comparisons table ----
async function loadComparisonsTable(contentType) {
  const tbody = document.getElementById("comparisonsTableBody");
  if (!tbody) return;

  const typeFilter = document.getElementById("comparisonTypeFilter");
  const type = contentType || (typeFilter ? typeFilter.value : "casino");

  try {
    const res = await fetch(`/en/api/v1/comparisons/list?content_type=${encodeURIComponent(type)}&page=${PAGE_STATE.comparisons}&per_page=${PER_PAGE}`);
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

function initCriterionRowEditor(criterionRowsContainer, addBtn, template) {
  addBtn.addEventListener("click", () => {
    criterionRowsContainer.appendChild(template.content.cloneNode(true));
  });
  criterionRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-criterion-row")) e.target.closest(".criterion-row").remove();
  });
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
  initCriterionRowEditor(criterionRowsContainer, document.getElementById("addCriterionRowBtn"), criterionTemplate);
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

// =====================================================
// EDIT FORMS + SETTINGS + GENERIC REVIEWS (production-readiness pass)
// Same no-op-if-absent guard style as every function above.
// =====================================================

// ---- Content item edit ----
async function initContentItemEditForm() {
  const form = document.getElementById("contentItemEditForm");
  if (!form) return;

  const contentType = form.dataset.contentType;
  const slug = form.dataset.slug;
  const alertEl = document.getElementById("contentItemEditAlert");
  const sportsbookFields = document.getElementById("sportsbookFields");
  const affiliatePartnerFields = document.getElementById("affiliatePartnerFields");
  const customFieldsContainer = document.getElementById("customFieldsContainer");
  const customFieldRows = document.getElementById("customFieldRows");

  if (contentType === "sportsbook") sportsbookFields.style.display = "";
  if (contentType === "affiliate_partner") affiliatePartnerFields.style.display = "";

  // Load current values and pre-fill the form
  try {
    const res = await fetch(`/en/api/v1/content-item/get?content_type=${encodeURIComponent(contentType)}&slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to load");
    const item = data.item;
    setContentItemMedia("logo", item.logo_media_id, item.logo);
    setContentItemMedia("hero", item.featured_image_media_id, item.hero_image);
    for (const [key, val] of Object.entries({
      name: item.name, title: item.title, description: item.description, website: item.website, tracking_url: item.tracking_url,
      rating: item.rating, license: item.license, license_country: item.license_country,
      linked_affiliate_partner_id: item.linked_affiliate_partner_id, sort_order: item.sort_order,
      status: item.status, seo_title: item.seo_title, seo_description: item.seo_description, seo_keywords: item.seo_keywords,
    })) {
      const el = form.elements[key];
      if (el && val !== null && val !== undefined) el.value = val;
    }
    for (const key of ["live_betting", "pre_match", "cashout", "mobile_app", "featured", "published"]) {
      const el = form.elements[key];
      if (el) el.checked = !!item[key];
    }

    await loadCategoryCheckboxes(data.category_ids || []);
    initGeoRuleEditor(data.geo_rules || []);

    if (contentType === "sportsbook") {
      await loadRelationshipCheckboxes({
        sportIds: data.sport_ids || [], currencyIds: data.currency_ids || [], paymentMethodIds: data.payment_method_ids || [],
      });
    }

    if (contentType === "custom") {
      customFieldsContainer.style.display = "";
      const cfRes = await fetch(`/en/api/v1/content-item/custom-field-values?content_type=custom&slug=${encodeURIComponent(slug)}`);
      const cfData = await cfRes.json();
      if (cfData.success) {
        customFieldRows.innerHTML = (cfData.definitions || []).map((def) => `
          <label>${def.label}
            <input type="text" class="custom-field-input" data-field-key="${def.field_key}" value="${(cfData.values[def.field_key] || "").toString().replace(/"/g, "&quot;")}">
          </label>
        `).join("") || "<p class='muted'>This type has no custom fields defined.</p>";
      }
    }
  } catch (e) {
    alertEl.className = "alert alert--error";
    alertEl.textContent = "Failed to load current values: " + e.message;
    alertEl.style.display = "block";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const payload = {
      content_type: contentType, slug,
      name: formData.get("name"), title: formData.get("title") || null, description: formData.get("description") || null,
      website: formData.get("website") || null, rating: formData.get("rating"),
      license: formData.get("license") || null, license_country: formData.get("license_country") || null,
      live_betting: formData.get("live_betting") === "on", pre_match: formData.get("pre_match") === "on",
      cashout: formData.get("cashout") === "on", mobile_app: formData.get("mobile_app") === "on",
      linked_affiliate_partner_id: formData.get("linked_affiliate_partner_id") || null,
      tracking_url: formData.get("tracking_url") || null,
      logo_media_id: formData.get("logo_media_id") || null,
      featured_image_media_id: formData.get("featured_image_media_id") || null,
      featured: formData.get("featured") === "on", sort_order: formData.get("sort_order"),
      status: formData.get("status"), published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
    };
    if (contentType === "custom") {
      const values = {};
      customFieldRows.querySelectorAll(".custom-field-input").forEach((input) => {
        values[input.dataset.fieldKey] = input.value;
      });
      payload.custom_field_values = values;
    }
    if (document.getElementById("categoryCheckboxes")?.dataset.loaded === "1") payload.category_ids = readCheckedIds("categoryCheckboxes");
    const geoRulesToSend = readGeoRules();
    if (geoRulesToSend !== null) payload.geo_rules = geoRulesToSend;
    if (contentType === "sportsbook") {
      payload.sport_ids = readCheckedIds("sportsCheckboxes");
      payload.currency_ids = readCheckedIds("currenciesCheckboxes");
      payload.payment_method_ids = readCheckedIds("paymentMethodsCheckboxes");
    }
    try {
      const res = await fetch("/en/api/v1/content-item/update", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

// ---- Custom type edit ----
async function initCustomTypeEditForm() {
  const form = document.getElementById("customTypeEditForm");
  if (!form) return;

  const typeSlug = form.dataset.typeSlug;
  const alertEl = document.getElementById("customTypeEditAlert");
  const fieldRowsContainer = document.getElementById("fieldRows");
  const template = document.getElementById("fieldRowTemplate");

  document.getElementById("addFieldRowBtn").addEventListener("click", () => {
    fieldRowsContainer.appendChild(template.content.cloneNode(true));
  });
  fieldRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-field-row")) e.target.closest(".field-row").remove();
  });

  function addFieldRow(field) {
    const clone = template.content.cloneNode(true);
    clone.querySelector(".field-key").value = field.field_key;
    clone.querySelector(".field-label").value = field.label;
    clone.querySelector(".field-type").value = field.field_type;
    clone.querySelector(".field-required").checked = !!field.required;
    fieldRowsContainer.appendChild(clone);
  }

  try {
    const [typesRes, fieldsRes] = await Promise.all([
      fetch("/en/api/v1/custom-types/list"),
      fetch(`/en/api/v1/custom-type/fields?type_slug=${encodeURIComponent(typeSlug)}`),
    ]);
    const typesData = await typesRes.json();
    const type = (typesData.types || []).find((t) => t.slug === typeSlug);
    if (type) {
      form.elements.label.value = type.label;
      form.elements.plural_label.value = type.plural_label;
      form.elements.icon.value = type.icon || "";
      form.elements.review_enabled.checked = !!type.review_enabled;
      form.elements.comparison_enabled.checked = !!type.comparison_enabled;
    }
    const fieldsData = await fieldsRes.json();
    // Existing fields are now pre-populated as the SAME editable rows
    // the create form uses -- previously this was a static read-only
    // <ul>, and an admin could only append new fields, never edit,
    // remove, or reorder one that already existed.
    (fieldsData.fields || []).forEach((f) => addFieldRow(f));
  } catch (e) {
    alertEl.className = "alert alert--error";
    alertEl.textContent = "Failed to load current values.";
    alertEl.style.display = "block";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const fields = Array.from(fieldRowsContainer.querySelectorAll(".field-row")).map((row) => ({
      field_key: row.querySelector(".field-key").value.trim(),
      label: row.querySelector(".field-label").value.trim(),
      field_type: row.querySelector(".field-type").value,
      required: row.querySelector(".field-required").checked,
    })).filter((f) => f.field_key && f.label);

    try {
      // Sends the full replacement set as `fields` (updateCustomFieldDefinitions())
      // rather than the old append-only `new_fields` -- this is what
      // lets removing/reordering/relabeling an existing field actually work.
      const res = await fetch("/en/api/v1/custom-type/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: typeSlug, label: formData.get("label"), plural_label: formData.get("plural_label"),
          icon: formData.get("icon") || null, review_enabled: formData.get("review_enabled") === "on",
          comparison_enabled: formData.get("comparison_enabled") === "on", fields,
        }),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

async function deleteCustomType(slug) {
  if (!confirm(`Delete custom type "${slug}"? This only works if no content items use it.`)) return;
  try {
    const res = await fetch("/en/api/v1/custom-type/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadCustomTypesTable();
    else alert(data.error || "Delete failed");
  } catch {
    alert("Network error. Try again.");
  }
}

// ---- Comparison edit ----
async function initComparisonEditForm() {
  const form = document.getElementById("comparisonEditForm");
  if (!form) return;

  const compareType = form.dataset.compareType;
  const slug = form.dataset.slug;
  const alertEl = document.getElementById("comparisonEditAlert");
  const criterionRowsContainer = document.getElementById("criterionRows");
  const criterionTemplate = document.getElementById("criterionRowTemplate");
  initCriterionRowEditor(criterionRowsContainer, document.getElementById("addCriterionRowBtn"), criterionTemplate);

  const itemSearchContentType = document.getElementById("itemSearchContentType");
  itemSearchContentType.value = compareType; // default the picker to the comparison's own type; still changeable for cross-type comparisons
  const picker = initComparisonItemPicker({
    contentTypeSelectEl: itemSearchContentType,
    searchInputId: "itemSearchInput", resultsId: "itemSearchResults",
    selectedRowsId: "selectedItemRows", rowTemplateId: "selectedItemRowTemplate",
  });

  try {
    const res = await fetch(`/en/api/v1/comparison/get?content_type=${encodeURIComponent(compareType)}&slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const c = data.comparison;
    form.elements.title.value = c.title;
    form.elements.description.value = c.description || "";
    form.elements.status.value = c.status;
    form.elements.seo_title.value = c.seo_title || "";
    form.elements.seo_description.value = c.seo_description || "";
    let editorialPreset = null;
    if (c.editorial_selection_item_type) {
      form.elements.editorial_selection_item_type.value = c.editorial_selection_item_type;
      try {
        const r = await fetch(`/en/api/v1/content-item/search?content_type=${encodeURIComponent(c.editorial_selection_item_type)}&id=${c.editorial_selection_item_id}`);
        const rd = await r.json();
        editorialPreset = (rd.items || [])[0] || { id: c.editorial_selection_item_id, content_type: c.editorial_selection_item_type, name: `#${c.editorial_selection_item_id}` };
      } catch {
        editorialPreset = { id: c.editorial_selection_item_id, content_type: c.editorial_selection_item_type, name: `#${c.editorial_selection_item_id}` };
      }
    }
    initEditorialPickPicker(editorialPreset);
    // comparison_items only stores (item_content_type, item_id), no
    // name -- resolve each already-selected item's label via the exact
    // -id lookup on content-item/search so the picker can show
    // something readable instead of a bare number.
    await Promise.all((data.items || []).map(async (item) => {
      try {
        const r = await fetch(`/en/api/v1/content-item/search?content_type=${encodeURIComponent(item.item_content_type)}&id=${item.item_id}`);
        const rd = await r.json();
        const resolved = (rd.items || [])[0];
        picker.addPreset(resolved || { id: item.item_id, content_type: item.item_content_type, name: `#${item.item_id}`, status: "" });
      } catch {
        picker.addPreset({ id: item.item_id, content_type: item.item_content_type, name: `#${item.item_id}`, status: "" });
      }
    }));
    let criteria = [];
    try { criteria = JSON.parse(c.criteria_json || "[]"); } catch {}
    criteria.forEach((crit) => {
      const row = criterionTemplate.content.cloneNode(true);
      row.querySelector(".criterion-key").value = crit.key;
      row.querySelector(".criterion-label").value = crit.label;
      criterionRowsContainer.appendChild(row);
    });
  } catch (e) {
    alertEl.className = "alert alert--error";
    alertEl.textContent = "Failed to load current values.";
    alertEl.style.display = "block";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const items = picker.getSelected().map((it, idx) => ({ item_content_type: it.itemContentType, item_id: it.itemId, position: idx }));
    const criteria = readCriterionRows(criterionRowsContainer);
    const editorialType = formData.get("editorial_selection_item_type");

    try {
      const res = await fetch("/en/api/v1/comparison/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: compareType, slug, title: formData.get("title"), description: formData.get("description") || null,
          status: formData.get("status"), items, criteria,
          editorial_selection_item_type: editorialType || null,
          editorial_selection_item_id: editorialType ? (parseInt(formData.get("editorial_selection_item_id")) || null) : null,
          seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null,
        }),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

// ---- Content type enablement settings ----
async function initContentTypeSettingsForm() {
  const form = document.getElementById("contentTypeSettingsForm");
  if (!form) return;

  const alertEl = document.getElementById("settingsAlert");
  const loadingEl = document.getElementById("settingsLoading");

  try {
    const res = await fetch("/en/api/v1/content-types-enabled");
    const data = await res.json();
    if (data.success) {
      document.getElementById("toggleSportsbook").checked = !!data.enablement.sportsbook;
      document.getElementById("toggleAffiliatePartner").checked = !!data.enablement.affiliate_partner;
      document.getElementById("toggleCustom").checked = !!data.enablement.custom;
    }
    loadingEl.style.display = "none";
    form.style.display = "";
  } catch {
    loadingEl.textContent = "Failed to load settings.";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    try {
      const res = await fetch("/en/api/v1/content-types-enabled/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportsbook: document.getElementById("toggleSportsbook").checked,
          affiliate_partner: document.getElementById("toggleAffiliatePartner").checked,
          custom: document.getElementById("toggleCustom").checked,
        }),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Settings saved. Changes are live immediately." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

// ---- Generic reviews (sportsbook/affiliate_partner/custom) ----
async function loadGenericReviewsTable(reviewedContentType) {
  const tbody = document.getElementById("genericReviewsTableBody");
  if (!tbody) return;
  const typeFilter = document.getElementById("genericReviewTypeFilter");
  const type = reviewedContentType || (typeFilter ? typeFilter.value : "sportsbook");

  try {
    const res = await fetch(`/en/api/v1/generic-reviews/list?reviewed_content_type=${encodeURIComponent(type)}&page=${PAGE_STATE.genericReviews}&per_page=${PER_PAGE}`);
    const data = await res.json();
    const reviews = data.reviews || [];
    renderPagerControls("genericReviewsPager", PAGE_STATE.genericReviews, PER_PAGE, data.total, (p) => { PAGE_STATE.genericReviews = p; loadGenericReviewsTable(type); });
    if (reviews.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No reviews yet for this type.</td></tr>';
      return;
    }
    // Public review URL per reviewed type (routes.js). Custom-type reviews
    // are addressed under their custom type slug, which the review row
    // doesn't carry, so no View link is offered for those.
    const viewPrefix = { sportsbook: "/en/sportsbook/review/", affiliate_partner: "/en/affiliate-partner/review/" }[type];
    tbody.innerHTML = reviews.map((r) => `
      <tr>
        <td><strong>${escapeHtmlClient(r.title)}</strong></td>
        <td>${escapeHtmlClient(r.slug)}</td>
        <td>${r.rating != null ? "★ " + escapeHtmlClient(r.rating) : "—"}</td>
        <td>${r.published ? "Yes" : "No"}</td>
        <td class="table-actions">
          ${viewPrefix && r.published ? `<a href="${viewPrefix}${encodeURIComponent(r.slug)}" class="btn btn--ghost btn--sm" target="_blank">View</a>` : ""}
          <button class="btn btn--ghost btn--sm" onclick="toggleGenericReviewPublished(${Number(r.id)}, ${r.published ? "true" : "false"}, '${type}')">${r.published ? "Unpublish" : "Publish"}</button>
          <button class="btn btn--danger btn--sm" onclick="deleteGenericReview(${Number(r.id)}, '${type}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteGenericReview(id, type) {
  if (!confirm("Delete this review? This cannot be undone.")) return;
  try {
    const res = await fetch("/en/api/v1/generic-review/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await res.json();
    if (data.success) loadGenericReviewsTable(type); else alert(data.error || "Delete failed");
  } catch { alert("Network error. Try again."); }
}

// Uses the existing /generic-review/update endpoint (which had no UI at all).
async function toggleGenericReviewPublished(id, currentlyPublished, type) {
  try {
    const res = await fetch("/en/api/v1/generic-review/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, published: !currentlyPublished }) });
    const data = await res.json();
    if (data.success) loadGenericReviewsTable(type); else alert(data.error || "Update failed");
  } catch { alert("Network error. Try again."); }
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "genericReviewTypeFilter") { PAGE_STATE.genericReviews = 1; loadGenericReviewsTable(e.target.value); }
});

async function initGenericReviewForm() {
  const form = document.getElementById("genericReviewForm");
  if (!form) return;

  const typeSelect = document.getElementById("reviewedContentTypeSelect");
  const itemSelect = document.getElementById("reviewedItemSelect");

  async function loadItemOptions() {
    itemSelect.innerHTML = '<option value="">Loading...</option>';
    try {
      const res = await fetch(`/en/api/v1/content-items/list?content_type=${encodeURIComponent(typeSelect.value)}`);
      const data = await res.json();
      const items = data.items || [];
      itemSelect.innerHTML = items.length
        ? items.map((i) => `<option value="${i.id}">${i.name} (${i.slug})</option>`).join("")
        : '<option value="">No items of this type yet -- create one first</option>';
    } catch {
      itemSelect.innerHTML = '<option value="">Failed to load items</option>';
    }
  }
  typeSelect.addEventListener("change", loadItemOptions);
  loadItemOptions();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("genericReviewFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    // pros/cons textareas (one per line) -> JSON array, matching the
    // storage shape reviews.pros/cons already use for casino reviews.
    const toJsonArray = (text) => JSON.stringify((text || "").split("\n").map((s) => s.trim()).filter(Boolean));

    const payload = {
      reviewed_content_type: formData.get("reviewed_content_type"),
      reviewed_content_id: parseInt(formData.get("reviewed_content_id")),
      title: formData.get("title"), slug: formData.get("slug"), content: formData.get("content"),
      pros: toJsonArray(formData.get("pros")), cons: toJsonArray(formData.get("cons")),
      rating: formData.get("rating") || null, verdict: formData.get("verdict") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
      published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
    };
    if (!payload.reviewed_content_id) {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Select an item to review -- none available for this type yet.";
      alertEl.style.display = "block";
      return;
    }
    try {
      const res = await fetch("/en/api/v1/generic-review/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Review created successfully!";
        alertEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/dashboard/reviews/generic"; }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create review";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
