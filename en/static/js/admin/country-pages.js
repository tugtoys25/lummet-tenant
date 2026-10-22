async function loadCountryPagesTable() {
  const tbody = document.getElementById("countryPagesTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/seo-pages/list?page_type=country_custom");
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Failed to load.");
    const pages = data.pages || [];
    if (!pages.length) { tbody.innerHTML = '<tr><td colspan="6" class="muted">No country pages yet.</td></tr>'; return; }
    tbody.innerHTML = pages.map((p) => `
      <tr>
        <td><strong>${escapeHtml(p.title)}</strong></td>
        <td>${escapeHtml(p.country_code)}</td>
        <td class="muted">/en/country/${escapeHtml(p.country_code)}/${escapeHtml(p.slug)}</td>
        <td>${p.published ? "Published" : escapeHtml(p.status)}</td>
        <td class="muted">${(p.robots || "").includes("noindex") ? "noindex" : "index"}</td>
        <td>
          <button type="button" class="btn btn--ghost btn--sm" onclick="editCountryPage(${p.id})">Edit</button>
          <button type="button" class="btn btn--ghost btn--sm" onclick="deleteCountryPage(${p.id})">Delete</button>
        </td>
      </tr>`).join("");
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Could not load: ' + escapeHtml(e.message) + '</td></tr>';
  }
}

async function editCountryPage(id) {
  const res = await fetch("/en/api/v1/seo-pages/get?id=" + id);
  const data = await res.json().catch(() => ({}));
  if (!data.success) { alert("Could not load page."); return; }
  const p = data.page;
  const state = seoPageState.country_page;
  state.editingId = id;
  state.countryCode = p.country_code;
  state.selectedCasinos = (p.casino_selections || []).map((c) => ({ casino_id: c.id, name: c.name, is_featured: !!c.is_featured, custom_label: c.custom_label }));
  let content = {};
  try { content = typeof p.content_json === "string" ? JSON.parse(p.content_json) : (p.content_json || {}); } catch (e) {}
  state.sections = Array.isArray(content.sections) ? content.sections : [];

  document.getElementById("countryPageId").value = id;
  document.getElementById("countryPageSearch").value = p.country_code;
  document.getElementById("countryPageCodeHidden").value = p.country_code;
  document.getElementById("countryPageSlug").value = p.slug;
  document.getElementById("countryPageTitle").value = p.title || "";
  document.getElementById("countryPageNavLabel").value = p.nav_label || "";
  document.getElementById("countryPageSeoTitle").value = p.seo_title || "";
  document.getElementById("countryPageSeoDescription").value = p.seo_description || "";
  document.getElementById("countryPageSeoKeywords").value = p.seo_keywords || "";
  if (p.og_image) {
    setCountryPageOgImage(p.og_image, "");
  } else {
    clearCountryPageOgImage();
  }
  if (p.featured_image) {
    setCountryPageFeaturedImage(p.featured_image, "");
  } else {
    clearCountryPageFeaturedImage();
  }
  document.getElementById("countryPageCanonical").value = p.canonical_url || "";
  document.getElementById("countryPageRobots").value = p.robots || "index,follow";
  document.getElementById("countryPageAuthorSelect").value = p.author_id || "";
  document.getElementById("countryPageCasinoMode").value = p.casino_mode || "auto_priority";
  document.getElementById("countryPageStatus").value = p.status || "draft";
  document.getElementById("countryPagePublished").value = p.published ? "1" : "0";
  document.getElementById("countryPageSitemap").value = p.sitemap_enabled === false ? "0" : "1";
  if (window.RichEditor) window.RichEditor.set ? window.RichEditor.set("country-page-intro", content.intro || "") : null;
  const introTextarea = document.getElementById("countryPageIntro");
  if (introTextarea) introTextarea.value = content.intro || "";

  renderSeoSections("country_page");
  updateSeoUrlPreview("country_page");
  loadSeoEligibleCasinos("country_page");

  document.getElementById("countryPageFormTitle").textContent = "Edit Country Page";
  document.getElementById("countryPageSubmitBtn").textContent = "Save Changes";
  document.getElementById("countryPageCancelBtn").style.display = "";
  document.getElementById("countryPageForm").scrollIntoView({ behavior: "smooth" });
}

function cancelCountryPageEdit() {
  resetCountryPageForm();
}

function resetCountryPageForm() {
  const state = seoPageState.country_page;
  state.editingId = null;
  state.selectedCasinos = [];
  state.sections = [];
  state.countryCode = "";
  document.getElementById("countryPageForm").reset();
  document.getElementById("countryPageId").value = "";
  clearCountryPageOgImage();
  clearCountryPageFeaturedImage();
  renderSeoSections("country_page");
  renderSeoCasinoSelected("country_page");
  document.getElementById("countryPageFormTitle").textContent = "Add Country Page";
  document.getElementById("countryPageSubmitBtn").textContent = "Create Page";
  document.getElementById("countryPageCancelBtn").style.display = "none";
}

async function deleteCountryPage(id) {
  if (!confirm("Delete this page?")) return;
  const res = await fetch("/en/api/v1/seo-pages/delete", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id })
  });
  const data = await res.json().catch(() => ({}));
  if (data.success) loadCountryPagesTable();
  else alert("Delete failed: " + (data.error || "unknown error"));
}

// ── Country Page OG Image (stores a plain URL, picked via Media Library) ──────
function openCountryPageOgImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.url) return;
    setCountryPageOgImage(media.url, media.alt_text || "");
  }, "seo-pages");
}

function setCountryPageOgImage(url, alt) {
  const input = document.getElementById("countryPageOgImage");
  const imgEl = document.getElementById("countryPageOgImageImg");
  const preview = document.getElementById("countryPageOgImagePreview");
  const selectBtn = document.getElementById("countryPageSelectOgImage");

  if (input) input.value = url || "";
  if (imgEl) { imgEl.src = url || ""; imgEl.alt = alt || ""; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearCountryPageOgImage() {
  setCountryPageOgImage("", "");
}

// ── Country Page Featured Image (stores a plain URL, picked via Media Library) ──────
function openCountryPageFeaturedImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.url) return;
    setCountryPageFeaturedImage(media.url, media.alt_text || "");
  }, "seo-pages");
}

function setCountryPageFeaturedImage(url, alt) {
  const input = document.getElementById("countryPageFeaturedImage");
  const imgEl = document.getElementById("countryPageFeaturedImageImg");
  const preview = document.getElementById("countryPageFeaturedImagePreview");
  const selectBtn = document.getElementById("countryPageSelectFeaturedImage");

  if (input) input.value = url || "";
  if (imgEl) { imgEl.src = url || ""; imgEl.alt = alt || ""; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearCountryPageFeaturedImage() {
  setCountryPageFeaturedImage("", "");
}

function initCountryPageForm() {
  const form = document.getElementById("countryPageForm");
  if (!form) return;
  loadSeoAuthorsInto("countryPageAuthorSelect");
  wireSeoCountrySearch("country_page", "countryPageSearch", "countryPageResults", "countryPageCodeHidden");
  wireSeoCasinoPicker("country_page", "countryPageCasinoAdd", "countryPageCasinoAddBtn", "countryPageCasinoSelected");
  wireSeoSectionBuilder("country_page", "countryPageSections", "countryPageAddSectionBtn");
  document.getElementById("countryPageSlug").addEventListener("input", () => updateSeoUrlPreview("country_page"));

  const ogSelectBtn = document.getElementById("countryPageSelectOgImage");
  const ogChangeBtn = document.getElementById("countryPageChangeOgImage");
  const ogRemoveBtn = document.getElementById("countryPageRemoveOgImage");
  if (ogSelectBtn) ogSelectBtn.addEventListener("click", openCountryPageOgImagePicker);
  if (ogChangeBtn) ogChangeBtn.addEventListener("click", openCountryPageOgImagePicker);
  if (ogRemoveBtn) ogRemoveBtn.addEventListener("click", clearCountryPageOgImage);

  const featSelectBtn = document.getElementById("countryPageSelectFeaturedImage");
  const featChangeBtn = document.getElementById("countryPageChangeFeaturedImage");
  const featRemoveBtn = document.getElementById("countryPageRemoveFeaturedImage");
  if (featSelectBtn) featSelectBtn.addEventListener("click", openCountryPageFeaturedImagePicker);
  if (featChangeBtn) featChangeBtn.addEventListener("click", openCountryPageFeaturedImagePicker);
  if (featRemoveBtn) featRemoveBtn.addEventListener("click", clearCountryPageFeaturedImage);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    syncSeoSectionsFromDom("country_page");
    const state = seoPageState.country_page;
    const introEl = document.getElementById("countryPageIntro");
    const payload = {
      page_type: "country_custom",
      slug: document.getElementById("countryPageSlug").value,
      country_code: state.countryCode || document.getElementById("countryPageCodeHidden").value,
      title: document.getElementById("countryPageTitle").value,
      nav_label: document.getElementById("countryPageNavLabel").value || null,
      seo_title: document.getElementById("countryPageSeoTitle").value,
      seo_description: document.getElementById("countryPageSeoDescription").value,
      seo_keywords: document.getElementById("countryPageSeoKeywords").value,
      og_image: document.getElementById("countryPageOgImage").value,
      featured_image: document.getElementById("countryPageFeaturedImage").value,
      canonical_url: document.getElementById("countryPageCanonical").value,
      robots: document.getElementById("countryPageRobots").value,
      author_id: document.getElementById("countryPageAuthorSelect").value || null,
      casino_mode: document.getElementById("countryPageCasinoMode").value,
      status: document.getElementById("countryPageStatus").value,
      published: document.getElementById("countryPagePublished").value === "1",
      sitemap_enabled: document.getElementById("countryPageSitemap").value === "1",
      content_json: { intro: introEl ? introEl.value : "", sections: state.sections },
      casino_selections: state.selectedCasinos.map((c, i) => ({ casino_id: c.casino_id, position: i, display_mode: "card", custom_label: c.custom_label || null, is_featured: !!c.is_featured }))
    };
    if (state.editingId) payload.id = state.editingId;

    const alertEl = document.getElementById("countryPageFormAlert");
    try {
      const res = await fetch(state.editingId ? "/en/api/v1/seo-pages/update" : "/en/api/v1/seo-pages/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed.");
      resetCountryPageForm();
      loadCountryPagesTable();
      alertEl.style.display = "none";
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.style.display = "block";
    }
  });
}

/* ---------------- CATEGORY COUNTRIES ---------------- */

