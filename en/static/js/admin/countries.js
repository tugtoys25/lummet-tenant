// ============================================
// COUNTRIES
// ============================================

async function loadCountriesTable() {
  const tbody = document.getElementById("countriesTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/countries/list");
    const data = await res.json();
    const countriesList = data.countries || [];
    if (countriesList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No countries yet.</td></tr>';
      return;
    }
    tbody.innerHTML = countriesList.map(c => {
      const isPublished = !(c.status === "draft" || c.published === 0);
      return `
      <tr>
        <td><strong>${c.code}</strong></td>
        <td>${c.name}</td>
        <td>${c.currency || "—"}</td>
        <td>${c.legal_status || "—"}</td>
        <td>
          <button type="button" class="badge-toggle ${isPublished ? "badge-ok" : "badge-dim"}" onclick="toggleCountryPublished('${c.code}')" title="Click to ${isPublished ? "unpublish (set to Draft)" : "publish"}">
            ${isPublished ? "Published" : "Draft"}
          </button>
        </td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editCountry('${c.code}')">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteCountry('${c.code}')">Delete</button>
        </td>

      </tr>
    `;
    }).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

async function toggleCountryPublished(code) {
  try {
    const res = await fetch(`/en/api/v1/country/get-by-code?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Could not load country"); return; }
    const c = data.country;

    const isCurrentlyPublished = !(c.status === "draft" || c.published === 0);
    const payload = {
      ...c,
      status: isCurrentlyPublished ? "draft" : "published",
      published: isCurrentlyPublished ? 0 : 1,
    };

    const updateRes = await fetch("/en/api/v1/country/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const updateData = await updateRes.json();
    if (updateData.success) loadCountriesTable();
    else alert(updateData.error || "Could not update status");
  } catch {
    alert("Network error");
  }
}

async function deleteCountry(code) {
  if (!confirm(`Delete country "${code}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/country/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.success) loadCountriesTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

// ── Country OG Image (optional) ──────
function openCountryOgImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.id) return;
    setCountryOgImage(media.id, media.url || media.thumbnail_url || "", media.alt_text || "");
  }, "country");
}

function setCountryOgImage(id, url, alt) {
  const idInput = document.getElementById("countryOgImageId");
  const imgEl = document.getElementById("countryOgImageImg");
  const preview = document.getElementById("countryOgImagePreview");
  const selectBtn = document.getElementById("countrySelectOgImage");

  if (idInput) idInput.value = String(id);
  if (imgEl) { imgEl.src = url; imgEl.alt = alt; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearCountryOgImage() {
  const idInput = document.getElementById("countryOgImageId");
  const imgEl = document.getElementById("countryOgImageImg");
  const preview = document.getElementById("countryOgImagePreview");
  const selectBtn = document.getElementById("countrySelectOgImage");

  if (idInput) idInput.value = "";
  if (imgEl) { imgEl.src = ""; imgEl.alt = ""; }
  if (preview) preview.style.display = "none";
  if (selectBtn) selectBtn.style.display = "";
}

function initCountryForm() {
  const form = document.getElementById("countryForm");
  if (!form) return;
  wireSeoSectionBuilder("country", "countryFormSections", "countryFormAddSectionBtn");

  const ogSelectBtn = document.getElementById("countrySelectOgImage");
  const ogChangeBtn = document.getElementById("countryChangeOgImage");
  const ogRemoveBtn = document.getElementById("countryRemoveOgImage");
  if (ogSelectBtn) ogSelectBtn.addEventListener("click", openCountryOgImagePicker);
  if (ogChangeBtn) ogChangeBtn.addEventListener("click", openCountryOgImagePicker);
  if (ogRemoveBtn) ogRemoveBtn.addEventListener("click", clearCountryOgImage);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("countryFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    syncSeoSectionsFromDom("country");

    const isEdit = form.dataset.editMode === "true";
    const endpoint = isEdit ? "/en/api/v1/country/update" : "/en/api/v1/country/create";
    const payload = {
      code: formData.get("code"),
      name: formData.get("name"),
      currency: formData.get("currency") || null,
      language: formData.get("language") || null,
      legal_status: formData.get("legal_status") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      content_json: { sections: seoPageState.country.sections },
      robots: formData.get("robots") || "index,follow",
      status: formData.get("status") || "published",
      published: formData.get("published") === "0" ? 0 : 1,
      is_featured: formData.get("is_featured") === "1" ? 1 : 0,
      featured_position: formData.get("featured_position") ? parseInt(formData.get("featured_position")) : 0,
      tier: formData.get("tier") ? parseInt(formData.get("tier")) : 3,
      og_image: formData.get("og_image") ? parseInt(formData.get("og_image")) : null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = isEdit ? "Country updated!" : "Country created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='code']").readOnly = false;
        delete form.dataset.editMode;
        document.getElementById("countrySubmitBtn").textContent = "Create Country";
        document.getElementById("countryCancelEdit").style.display = "none";
        clearCountryOgImage();
        seoPageState.country.sections = [];
        seoPageState.country.countryCode = "";
        renderSeoSections("country");
        loadCountriesTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

