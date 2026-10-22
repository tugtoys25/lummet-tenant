// ── Category Edit ──

async function editCategory(id) {
  try {
    const res = await fetch(`/en/api/v1/category/get-by-id?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const c = data.category;
    const form = document.getElementById("categoryForm");
    form.querySelector("[name='id']").value = c.id;
    form.querySelector("[name='slug']").value = c.slug;
    form.querySelector("[name='name']").value = c.name;
    form.querySelector("[name='description']").value = c.description || "";
    setTimeout(() => {
      RichEditor.set("category-description", c.description || "");
    }, 300);
    form.querySelector("[name='seo_title']").value = c.seo_title || "";
    form.querySelector("[name='seo_description']").value = c.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = c.seo_keywords || "";
    form.querySelector("[name='robots']").value = c.robots || "index,follow";
    form.querySelector("[name='status']").value = c.status || "published";
    form.querySelector("[name='published']").value = c.published === 0 ? "0" : "1";

    if (c.og_image && (c.og_image_url)) {
      setCategoryOgImage(c.og_image, c.og_image_url, c.og_image_alt || "");
    } else {
      clearCategoryOgImage();
    }

    let content = {};
    try { content = typeof c.content_json === "string" ? JSON.parse(c.content_json) : (c.content_json || {}); } catch (e) {}
    const state = seoPageState.category;
    state.sections = Array.isArray(content.sections) ? content.sections : [];
    state.categorySlug = c.slug;
    renderSeoSections("category");
    loadCategoryFormEligibleCasinos(c.slug);

    document.getElementById("categorySubmitBtn").textContent = "Update Category";
    document.getElementById("categoryCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load category"); }
}

function cancelCategoryEdit() {
  const form = document.getElementById("categoryForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("categorySubmitBtn").textContent = "Create Category";
  document.getElementById("categoryCancelEdit").style.display = "none";
  RichEditor.set("category-description", "");
  const state = seoPageState.category;
  state.sections = [];
  state.categorySlug = null;
  renderSeoSections("category");
}

// ── Country Edit ──
async function editCountry(code) {
  try {
    const res = await fetch(`/en/api/v1/country/get-by-code?code=${code}`);
    const data = await res.json();
    if (!data.success) return;
    const c = data.country;
    const form = document.getElementById("countryForm");
    form.querySelector("[name='code']").value = c.code;
    form.querySelector("[name='code']").readOnly = true; // Prevent changing primary key
    form.querySelector("[name='name']").value = c.name;
    form.querySelector("[name='currency']").value = c.currency || "";
    form.querySelector("[name='language']").value = c.language || "";
    form.querySelector("[name='legal_status']").value = c.legal_status || "";
    form.querySelector("[name='seo_title']").value = c.seo_title || "";
    form.querySelector("[name='seo_description']").value = c.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = c.seo_keywords || "";
    form.querySelector("[name='robots']").value = c.robots || "index,follow";
    form.querySelector("[name='status']").value = c.status || "published";
    form.querySelector("[name='published']").value = c.published === 0 ? "0" : "1";
    form.querySelector("[name='is_featured']").value = c.is_featured === 1 ? "1" : "0";
    form.querySelector("[name='featured_position']").value = c.featured_position ?? 0;
    form.querySelector("[name='tier']").value = c.tier ?? 3;

    if (c.og_image && c.og_image_url) {
      setCountryOgImage(c.og_image, c.og_image_url, c.og_image_alt || "");
    } else {
      clearCountryOgImage();
    }

    let content = {};
    try { content = typeof c.content_json === "string" ? JSON.parse(c.content_json) : (c.content_json || {}); } catch (e) {}
    const state = seoPageState.country;
    state.sections = Array.isArray(content.sections) ? content.sections : [];
    state.countryCode = c.code;
    renderSeoSections("country");
    loadSeoEligibleCasinos("country");

    document.getElementById("countrySubmitBtn").textContent = "Update Country";
    document.getElementById("countryCancelEdit").style.display = "";
    form.dataset.editMode = "true";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load country"); }
}
function cancelCountryEdit() {
  const form = document.getElementById("countryForm");
  form.reset();
  form.querySelector("[name='code']").readOnly = false;
  delete form.dataset.editMode;
  document.getElementById("countrySubmitBtn").textContent = "Create Country";
  document.getElementById("countryCancelEdit").style.display = "none";
  const state = seoPageState.country;
  state.sections = [];
  state.countryCode = "";
  renderSeoSections("country");
}


/* =========================================================
PAYMENT METHODS
========================================================= */

