async function loadCategoryCountryGroups() {
  const root = document.getElementById("categoryCountryGroups");
  if (!root) return;
  try {
    const res = await fetch("/en/api/v1/seo-pages/discover?min=1");
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Failed to load.");
    const combos = data.combos || [];
    if (!combos.length) { root.innerHTML = '<p class="muted">No eligible combinations found yet.</p>'; return; }
    const byCategory = {};
    combos.forEach((c) => {
      if (!byCategory[c.category_slug]) byCategory[c.category_slug] = { name: c.category_name, rows: [] };
      byCategory[c.category_slug].rows.push(c);
    });
    root.innerHTML = Object.entries(byCategory).map(([slug, group]) => `
      <div class="admin-card" style="margin-bottom:14px;padding:14px;border:1px solid var(--border-color,#333);border-radius:8px;">
        <h3 style="margin-top:0;">${escapeHtml(group.name)}</h3>
        <table class="admin-table">
          <thead><tr><th>Country</th><th>Casinos</th><th>Status</th><th>URL</th><th></th></tr></thead>
          <tbody>
            ${group.rows.map((r) => `
              <tr>
                <td>${escapeHtml(r.country_name)} (${escapeHtml(r.country_code)})</td>
                <td>${r.casino_count}</td>
                <td>${r.published ? "Published" : escapeHtml(r.status)}</td>
                <td class="muted">/en/category/${escapeHtml(slug)}/${escapeHtml(r.country_code)}</td>
                <td>
                  ${r.seo_page_id
                    ? `<button type="button" class="btn btn--ghost btn--sm" onclick="editCategoryCountry(${r.seo_page_id})">Edit</button>`
                    : `<button type="button" class="btn btn--ghost btn--sm" onclick="generateCategoryCountryDraft(${r.category_id}, '${slug}', '${escapeHtml(group.name).replace(/'/g, "\\'")}', '${r.country_code}', '${escapeHtml(r.country_name).replace(/'/g, "\\'")}')">Generate draft</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`).join("");
  } catch (e) {
    root.innerHTML = '<p class="muted">Could not load: ' + escapeHtml(e.message) + '</p>';
  }
}

async function generateCategoryCountryDraft(categoryId, categorySlug, categoryName, countryCode, countryName) {
  const res = await fetch("/en/api/v1/seo-pages/generate-draft", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id: categoryId, category_slug: categorySlug, category_name: categoryName, country_code: countryCode, country_name: countryName })
  });
  const data = await res.json().catch(() => ({}));
  if (data.success) {
    await loadCategoryCountryGroups();
    editCategoryCountry(data.id);
  } else {
    alert("Could not generate: " + (data.error || "unknown error"));
  }
}

async function editCategoryCountry(id) {
  const res = await fetch("/en/api/v1/seo-pages/get?id=" + id);
  const data = await res.json().catch(() => ({}));
  if (!data.success) { alert("Could not load page."); return; }
  const p = data.page;
  const state = seoPageState.category_country;
  state.editingId = id;
  state.countryCode = p.country_code;
  state.selectedCasinos = (p.casino_selections || []).map((c) => ({ casino_id: c.id, name: c.name, is_featured: !!c.is_featured, custom_label: c.custom_label }));
  let content = {};
  try { content = typeof p.content_json === "string" ? JSON.parse(p.content_json) : (p.content_json || {}); } catch (e) {}
  state.sections = Array.isArray(content.sections) ? content.sections : [];

  document.getElementById("categoryCountryId").value = id;
  const catSelect = document.getElementById("categoryCountryCategorySelect");
  if (catSelect) catSelect.value = p.category_id || "";
  const selectedOpt = catSelect ? catSelect.options[catSelect.selectedIndex] : null;
  state.categorySlug = selectedOpt ? selectedOpt.dataset.slug : null;
  document.getElementById("categoryCountrySearch").value = p.country_code;
  document.getElementById("categoryCountryCodeHidden").value = p.country_code;
  document.getElementById("categoryCountryTitle").value = p.title || "";
  document.getElementById("categoryCountryNavLabel").value = p.nav_label || "";
  document.getElementById("categoryCountrySeoTitle").value = p.seo_title || "";
  document.getElementById("categoryCountrySeoDescription").value = p.seo_description || "";
  document.getElementById("categoryCountrySeoKeywords").value = p.seo_keywords || "";
  if (p.og_image) {
    setCategoryCountryOgImage(p.og_image, "");
  } else {
    clearCategoryCountryOgImage();
  }
  document.getElementById("categoryCountryCanonical").value = p.canonical_url || "";
  document.getElementById("categoryCountryRobots").value = p.robots || "index,follow";
  document.getElementById("categoryCountryMinCasinos").value = p.min_casino_count ?? 1;
  document.getElementById("categoryCountryAuthorSelect").value = p.author_id || "";
  document.getElementById("categoryCountryCasinoMode").value = p.casino_mode || "auto_priority";
  document.getElementById("categoryCountryStatus").value = p.status || "draft";
  document.getElementById("categoryCountryPublished").value = p.published ? "1" : "0";
  document.getElementById("categoryCountrySitemap").value = p.sitemap_enabled === false ? "0" : "1";
  const introTextarea = document.getElementById("categoryCountryIntro");
  if (introTextarea) introTextarea.value = content.intro || "";
  if (window.RichEditor) window.RichEditor.set ? window.RichEditor.set("category-country-intro", content.intro || "") : null;

  renderSeoSections("category_country");
  updateSeoUrlPreview("category_country");
  loadSeoEligibleCasinos("category_country");

  document.getElementById("categoryCountryFormTitle").textContent = "Edit Category Country Page";
  document.getElementById("categoryCountrySubmitBtn").textContent = "Save Changes";
  document.getElementById("categoryCountryCancelBtn").style.display = "";
  document.getElementById("categoryCountryForm").scrollIntoView({ behavior: "smooth" });
}

function cancelCategoryCountryEdit() {
  resetCategoryCountryForm();
}

function resetCategoryCountryForm() {
  const state = seoPageState.category_country;
  state.editingId = null;
  state.selectedCasinos = [];
  state.sections = [];
  state.countryCode = "";
  state.categorySlug = null;
  document.getElementById("categoryCountryForm").reset();
  document.getElementById("categoryCountryId").value = "";
  clearCategoryCountryOgImage();
  renderSeoSections("category_country");
  renderSeoCasinoSelected("category_country");
  document.getElementById("categoryCountryFormTitle").textContent = "Create Category Country Page";
  document.getElementById("categoryCountrySubmitBtn").textContent = "Create Page";
  document.getElementById("categoryCountryCancelBtn").style.display = "none";
}

async function loadCategoriesInto(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await fetch("/en/api/v1/categories/list");
    const data = await res.json().catch(() => ({}));
    const cats = data.categories || [];
    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.dataset.slug = c.slug;
      opt.dataset.name = c.name;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  } catch (e) { /* non-fatal */ }
}

// ── Category Country Page OG Image (stores a plain URL, picked via Media Library) ──────
function openCategoryCountryOgImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.url) return;
    setCategoryCountryOgImage(media.url, media.alt_text || "");
  }, "seo-pages");
}

function setCategoryCountryOgImage(url, alt) {
  const input = document.getElementById("categoryCountryOgImage");
  const imgEl = document.getElementById("categoryCountryOgImageImg");
  const preview = document.getElementById("categoryCountryOgImagePreview");
  const selectBtn = document.getElementById("categoryCountrySelectOgImage");

  if (input) input.value = url || "";
  if (imgEl) { imgEl.src = url || ""; imgEl.alt = alt || ""; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearCategoryCountryOgImage() {
  setCategoryCountryOgImage("", "");
}

function initCategoryCountryForm() {
  const form = document.getElementById("categoryCountryForm");
  if (!form) return;
  loadSeoAuthorsInto("categoryCountryAuthorSelect");
  loadCategoriesInto("categoryCountryCategorySelect");
  wireSeoCountrySearch("category_country", "categoryCountrySearch", "categoryCountryResults", "categoryCountryCodeHidden");
  wireSeoCasinoPicker("category_country", "categoryCountryCasinoAdd", "categoryCountryCasinoAddBtn", "categoryCountryCasinoSelected");
  wireSeoSectionBuilder("category_country", "categoryCountrySections", "categoryCountryAddSectionBtn");

  const ogSelectBtn = document.getElementById("categoryCountrySelectOgImage");
  const ogChangeBtn = document.getElementById("categoryCountryChangeOgImage");
  const ogRemoveBtn = document.getElementById("categoryCountryRemoveOgImage");
  if (ogSelectBtn) ogSelectBtn.addEventListener("click", openCategoryCountryOgImagePicker);
  if (ogChangeBtn) ogChangeBtn.addEventListener("click", openCategoryCountryOgImagePicker);
  if (ogRemoveBtn) ogRemoveBtn.addEventListener("click", clearCategoryCountryOgImage);

  document.getElementById("categoryCountryCategorySelect").addEventListener("change", (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    seoPageState.category_country.categorySlug = opt.dataset.slug || null;
    updateSeoUrlPreview("category_country");
    loadSeoEligibleCasinos("category_country");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    syncSeoSectionsFromDom("category_country");
    const state = seoPageState.category_country;
    const catSelect = document.getElementById("categoryCountryCategorySelect");
    const catOpt = catSelect.options[catSelect.selectedIndex];
    const introEl = document.getElementById("categoryCountryIntro");
    const payload = {
      page_type: "category_country",
      slug: catOpt ? catOpt.dataset.slug : "",
      category_id: Number(catSelect.value),
      country_code: state.countryCode || document.getElementById("categoryCountryCodeHidden").value,
      title: document.getElementById("categoryCountryTitle").value,
      nav_label: document.getElementById("categoryCountryNavLabel").value || null,
      seo_title: document.getElementById("categoryCountrySeoTitle").value,
      seo_description: document.getElementById("categoryCountrySeoDescription").value,
      seo_keywords: document.getElementById("categoryCountrySeoKeywords").value,
      og_image: document.getElementById("categoryCountryOgImage").value,
      canonical_url: document.getElementById("categoryCountryCanonical").value,
      robots: document.getElementById("categoryCountryRobots").value,
      min_casino_count: Number(document.getElementById("categoryCountryMinCasinos").value) || 1,
      author_id: document.getElementById("categoryCountryAuthorSelect").value || null,
      casino_mode: document.getElementById("categoryCountryCasinoMode").value,
      status: document.getElementById("categoryCountryStatus").value,
      published: document.getElementById("categoryCountryPublished").value === "1",
      sitemap_enabled: document.getElementById("categoryCountrySitemap").value === "1",
      content_json: { intro: introEl ? introEl.value : "", sections: state.sections },
      casino_selections: state.selectedCasinos.map((c, i) => ({ casino_id: c.casino_id, position: i, display_mode: "card", custom_label: c.custom_label || null, is_featured: !!c.is_featured }))
    };
    if (state.editingId) payload.id = state.editingId;

    const alertEl = document.getElementById("categoryCountryFormAlert");
    try {
      const res = await fetch(state.editingId ? "/en/api/v1/seo-pages/update" : "/en/api/v1/seo-pages/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed.");
      resetCategoryCountryForm();
      loadCategoryCountryGroups();
      alertEl.style.display = "none";
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.style.display = "block";
    }
  });
}

document.addEventListener("DOMContentLoaded", function () {
  if (document.getElementById("countryPageForm")) {
    initCountryPageForm();
    loadCountryPagesTable();
  }
  if (document.getElementById("categoryCountryForm")) {
    initCategoryCountryForm();
    loadCategoryCountryGroups();
  }
});
