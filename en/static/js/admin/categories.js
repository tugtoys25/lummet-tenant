// ============================================
// CATEGORIES
// ============================================

async function loadCategoriesTable() {
  const tbody = document.getElementById("categoriesTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/categories/list");
    const data = await res.json();
    const cats = data.categories || [];
    if (cats.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No categories yet.</td></tr>';
      return;
    }
    tbody.innerHTML = cats.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.slug}</td>
        <td>${c.description || ""}</td>
        <td>${c.status === "draft" || c.published === 0 ? '<span class="badge-dim">Draft</span>' : '<span class="badge-ok">Published</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editCategory(${c.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteCategory('${c.slug}')">Delete</button>
        </td>

      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteCategory(slug) {
  if (!confirm(`Delete category "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/category/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadCategoriesTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

// ── Category OG Image (optional) ──────
function openCategoryOgImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.id) return;
    setCategoryOgImage(media.id, media.url || media.thumbnail_url || "", media.alt_text || "");
  }, "category");
}

function setCategoryOgImage(id, url, alt) {
  const idInput = document.getElementById("categoryOgImageId");
  const imgEl = document.getElementById("categoryOgImageImg");
  const preview = document.getElementById("categoryOgImagePreview");
  const selectBtn = document.getElementById("categorySelectOgImage");

  if (idInput) idInput.value = String(id);
  if (imgEl) { imgEl.src = url; imgEl.alt = alt; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearCategoryOgImage() {
  const idInput = document.getElementById("categoryOgImageId");
  const imgEl = document.getElementById("categoryOgImageImg");
  const preview = document.getElementById("categoryOgImagePreview");
  const selectBtn = document.getElementById("categorySelectOgImage");

  if (idInput) idInput.value = "";
  if (imgEl) { imgEl.src = ""; imgEl.alt = ""; }
  if (preview) preview.style.display = "none";
  if (selectBtn) selectBtn.style.display = "";
}

function initCategoryForm() {
  const form = document.getElementById("categoryForm");
  if (!form) return;
  wireSeoSectionBuilder("category", "categoryFormSections", "categoryFormAddSectionBtn");

  const ogSelectBtn = document.getElementById("categorySelectOgImage");
  const ogChangeBtn = document.getElementById("categoryChangeOgImage");
  const ogRemoveBtn = document.getElementById("categoryRemoveOgImage");
  if (ogSelectBtn) ogSelectBtn.addEventListener("click", openCategoryOgImagePicker);
  if (ogChangeBtn) ogChangeBtn.addEventListener("click", openCategoryOgImagePicker);
  if (ogRemoveBtn) ogRemoveBtn.addEventListener("click", clearCategoryOgImage);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("categoryFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    syncSeoSectionsFromDom("category");
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/category/update" : "/en/api/v1/category/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      slug: formData.get("slug"),
      name: formData.get("name"),
      description: formData.get("description") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      content_json: { sections: seoPageState.category.sections },
      robots: formData.get("robots") || "index,follow",
      status: formData.get("status") || "published",
      published: formData.get("published") === "0" ? 0 : 1,
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
          alertEl.textContent = isEdit ? "Category updated!" : "Category created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("categorySubmitBtn").textContent = "Create Category";
        document.getElementById("categoryCancelEdit").style.display = "none";
        clearCategoryOgImage();
        seoPageState.category.sections = [];
        seoPageState.category.categorySlug = null;
        renderSeoSections("category");
        loadCategoriesTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

// Base category hub pages have no country context at all (unlike
// category_country combo pages), so their section-level casino
// pickers pull from every casino in the category, matching exactly
// what already shows in the page's own automatic casino grid.
async function loadCategoryFormEligibleCasinos(slug) {
  if (!slug) return;
  try {
    const res = await fetch("/en/api/v1/category/eligible-casinos?slug=" + encodeURIComponent(slug));
    const data = await res.json().catch(() => ({}));
    seoPageState.category.eligibleCasinos = data.casinos || [];
  } catch (e) {
    seoPageState.category.eligibleCasinos = [];
  }
  syncSeoSectionsFromDom("category");
  renderSeoSections("category");
}

