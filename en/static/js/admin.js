// =====================================================
// ADMIN: REVIEWS, NEWS, PAGES, SETTINGS, AI
// Handles all admin sub-pages beyond dashboard + casinos
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadReviewsTable();
  loadNewsTable();
  loadPagesTable();
  loadSettingsForm();
  initReviewForm();
  initNewsForm();
  initPageForm();
  initSettingsForm();
  initAIGenerator();
  loadCategoriesTable();
  initCategoryForm();
  loadCountriesTable();
  initCountryForm();
  loadPaymentMethodsTable();
  initPaymentMethodForm();
  loadResearchTable();
  initResearchForm();
  loadSourcesTable();
  initSourceForm();
  initResearchClaimForm();
  initResearchRelationForm();
  loadReviewQueueSummary();
  loadDatasetsTable();
  initDatasetForm();
});

// ============================================
// REVIEWS
// ============================================

async function loadReviewsTable() {
  const tbody = document.getElementById("reviewsTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/reviews/list");
    const data = await res.json();
    const reviews = data.reviews || [];

    if (reviews.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No reviews yet.</td></tr>';
      return;
    }

    tbody.innerHTML = reviews
      .map(
        (r) => `
      <tr>
        <td><strong>${r.title}</strong></td>
        <td>${r.casino_slug || "—"}</td>
        <td>${r.country_code || "Global"}</td>
        <td>★ ${r.rating || "N/A"}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editReview('${r.slug}')">Edit</button>
          <a href="/en/review/${r.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteReview('${r.slug}')">Delete</button>
        </td>

      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

function initReviewForm() {
  const form = document.getElementById("reviewForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("reviewFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/review/update" : "/en/api/v1/review/create";
  //  const payload = {
    //  slug: formData.get("slug"),
     // casino_slug: formData.get("casino_slug"),
     // country_code: formData.get("country_code") || null,
     // title: formData.get("title"),
     // content: formData.get("content"),
     // pros: formData.get("pros") ? formData.get("pros").split("\n").map((p) => p.trim()).filter(Boolean) : [],
     // cons: formData.get("cons") ? formData.get("cons").split("\n").map((c) => c.trim()).filter(Boolean) : [],
     // rating: parseFloat(formData.get("rating")) || 0,
     // seo_title: formData.get("seo_title") || null,
     // seo_description: formData.get("seo_description") || null,
     // author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
   // };

const payload = {
  slug: formData.get("slug"),
  casino_slug: formData.get("casino_slug"),
  country_code: formData.get("country_code") || null,

  title: formData.get("title"),

  overview: formData.get("overview") || "",
  games: formData.get("games") || "",
  bonuses: formData.get("bonuses") || "",
  payments: formData.get("payments") || "",
  licenses: formData.get("licenses") || "",
  verdict: formData.get("verdict") || "",

  content: formData.get("content") || "",

  pros: formData.get("pros")
    ? formData.get("pros")
        .split("\n")
        .map(p => p.trim())
        .filter(Boolean)
    : [],

  cons: formData.get("cons")
    ? formData.get("cons")
        .split("\n")
        .map(c => c.trim())
        .filter(Boolean)
    : [],

  faq_json: formData.get("faq_json") || "[]",
  rating: parseFloat(formData.get("rating")) || 0,

  seo_title: formData.get("seo_title") || null,

  seo_description: formData.get("seo_description") || null,

  seo_keywords: formData.get("seo_keywords") || null,

  author_id: formData.get("author_id")
    ? parseInt(formData.get("author_id"))
    : null
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
          alertEl.textContent = isEdit ? "Review updated!" : "Review created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("reviewSubmitBtn").textContent = "Create Review";
        document.getElementById("reviewCancelEdit").style.display = "none";
        loadReviewsTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}

// ============================================
// NEWS
// ============================================


async function loadNewsTable() {
  const tbody = document.getElementById("newsTableBody");
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="muted">Loading...</td></tr>';

  try {
    const res = await fetch("/en/api/v1/news/list");
    const data = await res.json();
    const articles = data.news || [];

    if (articles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No news articles yet.</td></tr>';
      return;
    }

    tbody.innerHTML = articles.map(article => {
      const image = article.featured_image_url || article.featured_image_thumbnail || "";
      const status = Number(article.published) === 1;
      const date = article.published_at || article.created_at;

      const imageCell = image
        ? `<img src="${escapeHtml(image)}" alt="" width="72" height="45" loading="lazy" style="width:72px;height:45px;object-fit:cover;border-radius:6px;flex:none">`
        : `<div style="width:72px;height:45px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--gray);font-size:11px;flex:none">No image</div>`;

      return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:12px">
            ${imageCell}
            <div>
              <strong>${escapeHtml(article.title || "")}</strong>
              <div class="muted" style="font-size:12px;margin-top:3px">/en/news/${escapeHtml(article.slug || "")}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(article.author_name || article.author || "Admin")}</td>
        <td>
          <span style="display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;background:${status ? "#e6fff5" : "var(--bg)"};color:${status ? "#059669" : "var(--gray)"}">
            ${status ? "Published" : "Draft"}
          </span>
        </td>
        <td>${date ? escapeHtml(new Date(date).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})) : "—"}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editNews('${escapeJs(article.slug)}')">Edit</button>
          <a href="/en/news/${encodeURIComponent(article.slug)}" class="btn btn--ghost btn--sm" target="_blank" rel="noopener">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteNewsArticle('${escapeJs(article.slug)}')">Delete</button>
        </td>
      </tr>
      `;
    }).join("");

  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function loadNewsTablebackup() {
  const tbody = document.getElementById("newsTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/news/list");
    const data = await res.json();
    const news = data.news || [];

    if (news.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No news articles yet.</td></tr>';
      return;
    }

    tbody.innerHTML = news
      .map(
        (n) => `
      <tr>
        <td><strong>${n.title}</strong></td>
        <td>${n.author || "Admin"}</td>
        <td>${new Date(n.created_at).toLocaleDateString()}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editNews('${n.slug}')">Edit</button>
          <a href="/en/news/${n.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteNewsArticle('${n.slug}')">Delete</button>
        </td>

      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

function initNewsForm() {
  const form = document.getElementById("newsForm");
  if (!form) return;

  // ── Featured image picker buttons ──────────────────
  const selectBtn = document.getElementById("newsSelectFeaturedImage");
  const changeBtn = document.getElementById("newsChangeFeaturedImage");
  const removeBtn = document.getElementById("newsRemoveFeaturedImage");

  if (selectBtn) selectBtn.addEventListener("click", openNewsFeaturedImagePicker);
  if (changeBtn) changeBtn.addEventListener("click", openNewsFeaturedImagePicker);
  if (removeBtn) removeBtn.addEventListener("click", clearNewsFeaturedImage);

  // ── OG image picker buttons ──────────────────
  const ogSelectBtn = document.getElementById("newsSelectOgImage");
  const ogChangeBtn = document.getElementById("newsChangeOgImage");
  const ogRemoveBtn = document.getElementById("newsRemoveOgImage");

  if (ogSelectBtn) ogSelectBtn.addEventListener("click", openNewsOgImagePicker);
  if (ogChangeBtn) ogChangeBtn.addEventListener("click", openNewsOgImagePicker);
  if (ogRemoveBtn) ogRemoveBtn.addEventListener("click", clearNewsOgImage);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("newsFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/news/update" : "/en/api/v1/news/create";

    const payload = {
      old_slug: form.dataset.slug || null,
      slug: formData.get("slug"),
      title: formData.get("title"),
      content: formData.get("content"),
      author: formData.get("author") || "Admin",
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
      featured_image: formData.get("featured_image") ? parseInt(formData.get("featured_image")) : null,
      og_image: formData.get("og_image") ? parseInt(formData.get("og_image")) : null,
      excerpt: formData.get("excerpt") || null,
      tags: formData.get("tags") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      published: parseInt(formData.get("published") || "1"),
      published_at: formData.get("published_at") || null,
      ai_generated: parseInt(formData.get("ai_generated") || "0")
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
          alertEl.textContent = isEdit ? "Article updated!" : "News article created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.dataset.slug = "";
        form.querySelector("[name='id']").value = "";
        clearNewsFeaturedImage();
        clearNewsOgImage();
        if (window.RichEditor && typeof RichEditor.set === "function") {
          RichEditor.set("news-content", "");
        }
        document.getElementById("newsSubmitBtn").textContent = "Create Article";
        document.getElementById("newsCancelEdit").style.display = "none";
        document.getElementById("newsFormTitle").textContent = "Add News Article";
        loadNewsTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}

function openNewsFeaturedImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.id) return;
    setNewsFeaturedImage(media.id, media.url || media.thumbnail_url || "", media.alt_text || "Featured image");
  }, "news");
}

function setNewsFeaturedImage(id, url, alt) {
  const idInput = document.getElementById("newsFeaturedImageId");
  const imgEl = document.getElementById("newsFeaturedImageImg");
  const preview = document.getElementById("newsFeaturedImagePreview");
  const selectBtn = document.getElementById("newsSelectFeaturedImage");

  if (idInput) idInput.value = String(id);
  if (imgEl) { imgEl.src = url; imgEl.alt = alt; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearNewsFeaturedImage() {
  const idInput = document.getElementById("newsFeaturedImageId");
  const imgEl = document.getElementById("newsFeaturedImageImg");
  const preview = document.getElementById("newsFeaturedImagePreview");
  const selectBtn = document.getElementById("newsSelectFeaturedImage");

  if (idInput) idInput.value = "";
  if (imgEl) { imgEl.src = ""; imgEl.alt = ""; }
  if (preview) preview.style.display = "none";
  if (selectBtn) selectBtn.style.display = "";
}

// ── OG Image (optional, independent of Featured Image) ──────
function openNewsOgImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.id) return;
    setNewsOgImage(media.id, media.url || media.thumbnail_url || "", media.alt_text || "");
  }, "news");
}

function setNewsOgImage(id, url, alt) {
  const idInput = document.getElementById("newsOgImageId");
  const imgEl = document.getElementById("newsOgImageImg");
  const preview = document.getElementById("newsOgImagePreview");
  const selectBtn = document.getElementById("newsSelectOgImage");

  if (idInput) idInput.value = String(id);
  if (imgEl) { imgEl.src = url; imgEl.alt = alt; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearNewsOgImage() {
  const idInput = document.getElementById("newsOgImageId");
  const imgEl = document.getElementById("newsOgImageImg");
  const preview = document.getElementById("newsOgImagePreview");
  const selectBtn = document.getElementById("newsSelectOgImage");

  if (idInput) idInput.value = "";
  if (imgEl) { imgEl.src = ""; imgEl.alt = ""; }
  if (preview) preview.style.display = "none";
  if (selectBtn) selectBtn.style.display = "";
}


function initNewsFormbackup() {
  const form = document.getElementById("newsForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("newsFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/news/update" : "/en/api/v1/news/create";
    const oldSlug = form.dataset.slug;
    const payload = {
      old_slug: form.dataset.slug,
      slug: formData.get("slug"),
      title: formData.get("title"),
      content: formData.get("content"),
      author: formData.get("author") || "Admin",
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        form.dataset.slug = payload.slug;
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = isEdit ? "Article updated!" : "News article created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("newsSubmitBtn").textContent = "Create Article";
        document.getElementById("newsCancelEdit").style.display = "none";
        loadNewsTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}

// ============================================
// PAGES
// ============================================

async function loadPagesTable() {
  const tbody = document.getElementById("pagesTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/pages/list");
    const data = await res.json();
    const pages = data.pages || [];

    if (pages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No pages yet.</td></tr>';
      return;
    }

    tbody.innerHTML = pages
      .map(
        (p) => `
      <tr>
        <td><strong>${p.title}</strong></td>
        <td>${p.slug}</td>
        <td>${p.type}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editPage('${p.slug}')">Edit</button>
          <a href="/en/${p.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deletePage('${p.slug}')">Delete</button>
        </td>

      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

function initPageForm() {
  const form = document.getElementById("pageForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("pageFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/page/update" : "/en/api/v1/page/create";
    const payload = {
      slug: formData.get("slug"),
      type: formData.get("type") || "page",
      template: formData.get("template") || "page",
      title: formData.get("title"),
      content_json: formData.get("content_json") || {},
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
    };

    // Try to parse content_json if it's a string
    if (typeof payload.content_json === "string") {
      try {
        payload.content_json = JSON.parse(payload.content_json);
      } catch {
        payload.content_json = { text: payload.content_json };
      }
    }

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
          alertEl.textContent = isEdit ? "Page updated!" : "Page created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("pageSubmitBtn").textContent = "Create Page";
        document.getElementById("pageCancelEdit").style.display = "none";
        loadPagesTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}


// ============================================================
// SITE SETTINGS
// ============================================================

let currentComplianceItems = [];

async function loadSettingsForm() {

  const form =
    document.getElementById("settingsForm");

  if (!form) return;

  try {

    const res =
      await fetch("/en/api/v1/settings/get");

    if (!res.ok) {
      throw new Error(
        `Settings request failed: ${res.status}`
      );
    }

    const data =
      await res.json();


    const settings =
      data.settings || {};

    homepageSections = [];

if (settings.homepage_sections) {
  try {
    const parsed =
      JSON.parse(
        settings.homepage_sections
      );

    if (Array.isArray(parsed)) {
      homepageSections = parsed;
    }
  } catch (error) {
    console.warn(
      "Invalid homepage_sections JSON",
      error
    );
  }
}

if (!homepageSections.length) {
  homepageSections = [
    createHomepageSection(
      "features"
    )
  ];

  homepageSections[0].title =
    "Why Choose Us";

  homepageSections[0].cards = [
    {
      id: homepageId("card"),
      enabled: true,
      title: "Expert Reviews",
      text:
        "In-depth analysis from industry veterans with years of experience.",
      iconType: "icon",
      icon: "★",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Exclusive Bonuses",
      text:
        "Access special bonus offers available only through {{site_name}}.",
      iconType: "icon",
      icon: "🔒",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Geo-Targeted",
      text:
        "See casinos available in your country with localized bonus offers.",
      iconType: "icon",
      icon: "🌐",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Real Data",
      text:
        "Click tracking and player analytics for transparent recommendations.",
      iconType: "icon",
      icon: "📊",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    }
  ];
}

renderHomepageSections();

    const heroEnabled =
  document.getElementById("siteHeroEnabled");

if (heroEnabled) {
  heroEnabled.checked =
    settings.site_hero_enabled !== "false";
}

const heroOverlay =
  document.getElementById("siteHeroOverlay");

if (heroOverlay) {
  heroOverlay.checked =
    settings.site_hero_overlay !== "false";
}

const gpwaSealEnabled =
  document.getElementById("gpwaSealEnabled");

if (gpwaSealEnabled) {
  gpwaSealEnabled.checked =
    settings.gpwa_seal_enabled === "true";
}

    // --------------------------------------------------------
    // Populate normal fields
    // --------------------------------------------------------

    form.querySelectorAll(
      "input[name], textarea[name]"
    ).forEach(input => {

      const key =
        input.name;

      if (
        key === "footer_compliance"
      ) {
        return;
      }

      if (
        settings[key] !== undefined &&
        settings[key] !== null
      ) {
        input.value =
          settings[key];
      }
    });


    // --------------------------------------------------------
    // Compliance JSON
    // --------------------------------------------------------

    currentComplianceItems = [];

    if (settings.footer_compliance) {

      try {

        const parsed =
          JSON.parse(
            settings.footer_compliance
          );

        if (Array.isArray(parsed)) {
          currentComplianceItems =
            parsed;
        }

      } catch (error) {

        console.warn(
          "Invalid footer compliance JSON"
        );

      }
    }


    renderComplianceRows();

  } catch (error) {

    console.error(
      "Failed to load settings:",
      error
    );

  }
}




// ------------------------------------------------------------
// Compliance rows
// ------------------------------------------------------------

function renderComplianceRows() {

  const container =
    document.getElementById(
      "complianceRows"
    );

  if (!container) return;

  container.innerHTML = "";

  currentComplianceItems.forEach(
    (item, index) => {

      const row =
        document.createElement("div");

      row.className =
        "site-compliance-row";

      row.style.cssText = `
        border:1px solid var(--border);
        border-radius:8px;
        padding:16px;
        margin:12px 0;
      `;

      row.innerHTML = `
        <div class="form-group">
          <label>Image URL</label>
          <input
            type="url"
            class="compliance-image"
            value="${escapeHtmlAttribute(item.image || "")}"
            placeholder="/static/images/logo/example.svg"
          >
        </div>

        <div class="form-group">
          <label>Link URL</label>
          <input
            type="url"
            class="compliance-url"
            value="${escapeHtmlAttribute(item.url || "")}"
            placeholder="https://..."
          >
        </div>

        <div class="form-group">
          <label>Alt Text</label>
          <input
            type="text"
            class="compliance-alt"
            value="${escapeHtmlAttribute(item.alt || "")}"
            placeholder="Compliance organization"
          >
        </div>

        <button
          type="button"
          class="btn btn--ghost remove-compliance"
        >
          Remove
        </button>
      `;

      row
        .querySelector(
          ".remove-compliance"
        )
        .addEventListener(
          "click",
          () => {

            currentComplianceItems
              .splice(index, 1);

            renderComplianceRows();

          }
        );

      container.appendChild(row);
    }
  );
}


// ------------------------------------------------------------
// Add compliance item
// ------------------------------------------------------------

function addComplianceRow() {

  currentComplianceItems.push({
    image: "",
    url: "",
    alt: ""
  });

  renderComplianceRows();
}


// ------------------------------------------------------------
// Read compliance rows
// ------------------------------------------------------------

function collectComplianceRows() {

  const rows =
    document.querySelectorAll(
      "#complianceRows .site-compliance-row"
    );

  return Array.from(rows)
    .map(row => ({
      image:
        row.querySelector(
          ".compliance-image"
        )?.value.trim() || "",

      url:
        row.querySelector(
          ".compliance-url"
        )?.value.trim() || "",

      alt:
        row.querySelector(
          ".compliance-alt"
        )?.value.trim() || ""
    }))
    .filter(item => item.image);
}


// ------------------------------------------------------------
// Escape HTML attribute
// ------------------------------------------------------------

function escapeHtmlAttribute(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}








// ============================================================
// HOMEPAGE SECTION BUILDER
// ============================================================

let homepageSections = [];


// ------------------------------------------------------------
// Escape HTML attribute
// ------------------------------------------------------------

function homepageEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ------------------------------------------------------------
// Create IDs
// ------------------------------------------------------------

function homepageId(prefix = "item") {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}


// ------------------------------------------------------------
// Default card
// ------------------------------------------------------------

function createHomepageCard() {

  return {
    id: homepageId("card"),

    enabled: true,

    title: "New Feature",

    text:
      "Add your feature description here.",

    iconType: "icon",

    icon: "★",

    imageUrl: "",

    url: "",

    target: "_self",

    backgroundColor: "",

    backgroundImage: "",

    textColor: "",

    iconColor: ""
  };
}


// ------------------------------------------------------------
// Default section
// ------------------------------------------------------------

function createHomepageSection(type) {

  const section = {

    id:
      homepageId("section"),

    enabled: true,

    type,

    title: "",

    subtitle: "",

    description: "",

    alignment: "center",

    backgroundColor: "",

    backgroundImage: "",

    textColor: "",

    cards: [],

    paragraphs: [],

    buttonText: "",

    buttonUrl: "",

    buttonStyle: "primary"
  };


  if (type === "features") {

    section.title =
      "Why Choose Us";

    section.cards = [
      createHomepageCard()
    ];

  }


  if (type === "cards") {

    section.title =
      "Featured";

    section.cards = [
      createHomepageCard()
    ];

  }


  return section;
}


// ------------------------------------------------------------
// Render builder
// ------------------------------------------------------------

function renderHomepageSections() {

  const container =
    document.getElementById(
      "homepageSections"
    );

  if (!container) return;

  container.innerHTML = "";

  homepageSections.forEach(
    (section, sectionIndex) => {

      const wrapper =
        document.createElement("div");

      wrapper.className =
        "homepage-admin-section";

      wrapper.style.cssText = `
        border:1px solid var(--border);
        border-radius:10px;
        padding:18px;
        margin:16px 0;
      `;

      wrapper.innerHTML = `
        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
            margin-bottom:16px;
          "
        >

          <strong>
            Section ${sectionIndex + 1}
          </strong>

          <div style="display:flex;gap:6px">

            <button
              type="button"
              class="btn btn--ghost move-up"
            >
              ↑
            </button>

            <button
              type="button"
              class="btn btn--ghost move-down"
            >
              ↓
            </button>

            <button
              type="button"
              class="btn btn--ghost duplicate-section"
            >
              Duplicate
            </button>

            <button
              type="button"
              class="btn btn--ghost remove-section"
            >
              Remove
            </button>

          </div>

        </div>


        <div class="form-group">

          <label>
            Enabled
          </label>

          <input
            type="checkbox"
            class="section-enabled"
            ${section.enabled !== false ? "checked" : ""}
          >

        </div>


        <div class="form-group">

          <label>
            Section Type
          </label>

          <select class="section-type">

            <option
              value="features"
              ${section.type === "features" ? "selected" : ""}
            >
              Featured Grid
            </option>

            <option
              value="cards"
              ${section.type === "cards" ? "selected" : ""}
            >
              Cards
            </option>

            <option
              value="text"
              ${section.type === "text" ? "selected" : ""}
            >
              Text / Paragraphs
            </option>

          </select>

        </div>


        <div class="form-group">

          <label>
            Section Title
          </label>

          <input
            type="text"
            class="section-title"
            value="${homepageEscape(section.title)}"
          >

        </div>


        <div class="form-group">

          <label>
            Section Subtitle
          </label>

          <input
            type="text"
            class="section-subtitle"
            value="${homepageEscape(section.subtitle)}"
          >

        </div>


        <div class="form-group">

          <label>
            Section Description
          </label>

          <textarea
            class="section-description"
            rows="3"
          >${homepageEscape(section.description)}</textarea>

        </div>


        <div class="form-group">

          <label>
            Alignment
          </label>

          <select class="section-alignment">

            <option
              value="left"
              ${section.alignment === "left" ? "selected" : ""}
            >
              Left
            </option>

            <option
              value="center"
              ${section.alignment === "center" ? "selected" : ""}
            >
              Center
            </option>

            <option
              value="right"
              ${section.alignment === "right" ? "selected" : ""}
            >
              Right
            </option>

          </select>

        </div>


        <div class="form-group">

          <label>
            Background Color
          </label>

          <input
            type="text"
            class="section-background-color"
            value="${homepageEscape(section.backgroundColor)}"
            placeholder="#111827 or rgba(...)"
          >

        </div>


        <div class="form-group">

          <label>
            Background Image URL
          </label>

          <input
            type="url"
            class="section-background-image"
            value="${homepageEscape(section.backgroundImage)}"
            placeholder="https://..."
          >

        </div>


        <div class="form-group">

          <label>
            Text Color
          </label>

          <input
            type="text"
            class="section-text-color"
            value="${homepageEscape(section.textColor)}"
            placeholder="#ffffff"
          >

        </div>


        <div class="form-group">

          <label>
            Button Text
          </label>

          <input
            type="text"
            class="section-button-text"
            value="${homepageEscape(section.buttonText)}"
          >

        </div>


        <div class="form-group">

          <label>
            Button URL
          </label>

          <input
            type="text"
            class="section-button-url"
            value="${homepageEscape(section.buttonUrl)}"
          >

        </div>


        <div class="form-group">

          <label>
            Button Style
          </label>

          <select class="section-button-style">

            <option
              value="primary"
              ${section.buttonStyle === "primary" ? "selected" : ""}
            >
              Primary
            </option>

            <option
              value="ghost"
              ${section.buttonStyle === "ghost" ? "selected" : ""}
            >
              Ghost
            </option>

          </select>

        </div>


        <h3>
          Paragraphs
        </h3>

        <div class="section-paragraphs"></div>

        <button
          type="button"
          class="btn btn--ghost add-paragraph"
        >
          + Add Paragraph
        </button>


        <h3 style="margin-top:24px">
          Cards
        </h3>

        <div class="section-cards"></div>

        <button
          type="button"
          class="btn btn--ghost add-card"
        >
          + Add Card
        </button>
      `;


      // ------------------------------------------------------
      // Paragraphs
      // ------------------------------------------------------

      const paragraphsContainer =
        wrapper.querySelector(
          ".section-paragraphs"
        );

      (section.paragraphs || [])
        .forEach(
          (paragraph, paragraphIndex) => {

            const row =
              document.createElement("div");

            row.style.cssText = `
              display:flex;
              gap:8px;
              margin-bottom:8px;
            `;

            row.innerHTML = `
              <textarea
                rows="3"
                style="flex:1"
                class="paragraph-input"
              >${homepageEscape(paragraph)}</textarea>

              <button
                type="button"
                class="btn btn--ghost remove-paragraph"
              >
                Remove
              </button>
            `;

            row
              .querySelector(
                ".remove-paragraph"
              )
              .addEventListener(
                "click",
                () => {

                  section.paragraphs
                    .splice(
                      paragraphIndex,
                      1
                    );

                  renderHomepageSections();
                }
              );

            paragraphsContainer
              .appendChild(row);
          }
        );


      // ------------------------------------------------------
      // Cards
      // ------------------------------------------------------

      const cardsContainer =
        wrapper.querySelector(
          ".section-cards"
        );


      (section.cards || [])
        .forEach(
          (card, cardIndex) => {

            const cardElement =
              document.createElement("div");

            cardElement.style.cssText = `
              border:1px solid var(--border);
              border-radius:8px;
              padding:16px;
              margin:12px 0;
            `;

            cardElement.innerHTML = `

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  margin-bottom:12px;
                "
              >

                <strong>
                  Card ${cardIndex + 1}
                </strong>

                <button
                  type="button"
                  class="btn btn--ghost remove-card"
                >
                  Remove
                </button>

              </div>


              <div class="form-group">

                <label>
                  Enabled
                </label>

                <input
                  type="checkbox"
                  class="card-enabled"
                  ${card.enabled !== false ? "checked" : ""}
                >

              </div>


              <div class="form-group">

                <label>
                  Title
                </label>

                <input
                  type="text"
                  class="card-title"
                  value="${homepageEscape(card.title)}"
                >

              </div>


              <div class="form-group">

                <label>
                  Content
                </label>

                <textarea
                  rows="3"
                  class="card-text"
                >${homepageEscape(card.text)}</textarea>

              </div>


              <div class="form-group">

                <label>
                  Icon Type
                </label>

                <select class="card-icon-type">

                  <option
                    value="icon"
                    ${card.iconType === "icon" ? "selected" : ""}
                  >
                    Text / Emoji / Symbol
                  </option>

                  <option
                    value="image"
                    ${card.iconType === "image" ? "selected" : ""}
                  >
                    Image URL
                  </option>

                </select>

              </div>


              <div class="form-group">

                <label>
                  Icon / Symbol
                </label>

                <input
                  type="text"
                  class="card-icon"
                  value="${homepageEscape(card.icon)}"
                  placeholder="★ 🔒 🌐"
                >

              </div>


              <div class="form-group">

                <label>
                  Icon Image URL
                </label>

                <input
                  type="url"
                  class="card-image-url"
                  value="${homepageEscape(card.imageUrl)}"
                  placeholder="https://..."
                >

              </div>


              <div class="form-group">

                <label>
                  Card URL
                </label>

                <input
                  type="text"
                  class="card-url"
                  value="${homepageEscape(card.url)}"
                  placeholder="/en/review/example"
                >

              </div>


              <div class="form-group">

                <label>
                  Open Link
                </label>

                <select class="card-target">

                  <option
                    value="_self"
                    ${card.target !== "_blank" ? "selected" : ""}
                  >
                    Same Window
                  </option>

                  <option
                    value="_blank"
                    ${card.target === "_blank" ? "selected" : ""}
                  >
                    New Window
                  </option>

                </select>

              </div>


              <div class="form-group">

                <label>
                  Card Background Color
                </label>

                <input
                  type="text"
                  class="card-background-color"
                  value="${homepageEscape(card.backgroundColor)}"
                  placeholder="#111827"
                >

              </div>


              <div class="form-group">

                <label>
                  Card Background Image URL
                </label>

                <input
                  type="url"
                  class="card-background-image"
                  value="${homepageEscape(card.backgroundImage)}"
                  placeholder="https://..."
                >

              </div>


              <div class="form-group">

                <label>
                  Card Text Color
                </label>

                <input
                  type="text"
                  class="card-text-color"
                  value="${homepageEscape(card.textColor)}"
                  placeholder="#ffffff"
                >

              </div>


              <div class="form-group">

                <label>
                  Icon Color
                </label>

                <input
                  type="text"
                  class="card-icon-color"
                  value="${homepageEscape(card.iconColor)}"
                  placeholder="#ffffff"
                >

              </div>
            `;


            cardElement
              .querySelector(
                ".remove-card"
              )
              .addEventListener(
                "click",
                () => {

                  section.cards
                    .splice(
                      cardIndex,
                      1
                    );

                  renderHomepageSections();
                }
              );


            cardsContainer
              .appendChild(
                cardElement
              );
          }
        );


      // ------------------------------------------------------
      // Section controls
      // ------------------------------------------------------

      wrapper
        .querySelector(
          ".remove-section"
        )
        .addEventListener(
          "click",
          () => {

            homepageSections
              .splice(
                sectionIndex,
                1
              );

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".duplicate-section"
        )
        .addEventListener(
          "click",
          () => {

            const copy =
              JSON.parse(
                JSON.stringify(section)
              );

            copy.id =
              homepageId("section");

            homepageSections
              .splice(
                sectionIndex + 1,
                0,
                copy
              );

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".move-up"
        )
        .addEventListener(
          "click",
          () => {

            if (sectionIndex === 0)
              return;

            [
              homepageSections[
                sectionIndex - 1
              ],
              homepageSections[
                sectionIndex
              ]
            ] = [
              homepageSections[
                sectionIndex
              ],
              homepageSections[
                sectionIndex - 1
              ]
            ];

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".move-down"
        )
        .addEventListener(
          "click",
          () => {

            if (
              sectionIndex >=
              homepageSections.length - 1
            ) return;

            [
              homepageSections[
                sectionIndex + 1
              ],
              homepageSections[
                sectionIndex
              ]
            ] = [
              homepageSections[
                sectionIndex
              ],
              homepageSections[
                sectionIndex + 1
              ]
            ];

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".add-paragraph"
        )
        .addEventListener(
          "click",
          () => {

            section.paragraphs =
              section.paragraphs || [];

            section.paragraphs.push(
              "New paragraph..."
            );

            renderHomepageSections();
          }
        );


      wrapper
        .querySelector(
          ".add-card"
        )
        .addEventListener(
          "click",
          () => {

            section.cards =
              section.cards || [];

            section.cards.push(
              createHomepageCard()
            );

            renderHomepageSections();
          }
        );


      container.appendChild(
        wrapper
      );
    }
  );
}

function collectHomepageSections() {

  const containers =
    document.querySelectorAll(
      "#homepageSections .homepage-admin-section"
    );

  return Array.from(containers)
    .map((wrapper, sectionIndex) => {

      const original =
        homepageSections[sectionIndex] ||
        createHomepageSection(
          "features"
        );

      const paragraphs =
        Array.from(
          wrapper.querySelectorAll(
            ".paragraph-input"
          )
        )
        .map(input =>
          input.value.trim()
        )
        .filter(Boolean);


      const cards =
        Array.from(
          wrapper.querySelectorAll(
            ".section-cards > div"
          )
        )
        .map(cardElement => ({

          id:
            homepageId("card"),

          enabled:
            cardElement.querySelector(
              ".card-enabled"
            )?.checked !== false,

          title:
            cardElement.querySelector(
              ".card-title"
            )?.value.trim() || "",

          text:
            cardElement.querySelector(
              ".card-text"
            )?.value.trim() || "",

          iconType:
            cardElement.querySelector(
              ".card-icon-type"
            )?.value || "icon",

          icon:
            cardElement.querySelector(
              ".card-icon"
            )?.value || "",

          imageUrl:
            cardElement.querySelector(
              ".card-image-url"
            )?.value.trim() || "",

          url:
            cardElement.querySelector(
              ".card-url"
            )?.value.trim() || "",

          target:
            cardElement.querySelector(
              ".card-target"
            )?.value === "_blank"
              ? "_blank"
              : "_self",

          backgroundColor:
            cardElement.querySelector(
              ".card-background-color"
            )?.value.trim() || "",

          backgroundImage:
            cardElement.querySelector(
              ".card-background-image"
            )?.value.trim() || "",

          textColor:
            cardElement.querySelector(
              ".card-text-color"
            )?.value.trim() || "",

          iconColor:
            cardElement.querySelector(
              ".card-icon-color"
            )?.value.trim() || ""
        }));


      return {

        id:
          original.id ||
          homepageId("section"),

        enabled:
          wrapper.querySelector(
            ".section-enabled"
          )?.checked !== false,

        type:
          wrapper.querySelector(
            ".section-type"
          )?.value || "features",

        title:
          wrapper.querySelector(
            ".section-title"
          )?.value.trim() || "",

        subtitle:
          wrapper.querySelector(
            ".section-subtitle"
          )?.value.trim() || "",

        description:
          wrapper.querySelector(
            ".section-description"
          )?.value.trim() || "",

        alignment:
          wrapper.querySelector(
            ".section-alignment"
          )?.value || "center",

        backgroundColor:
          wrapper.querySelector(
            ".section-background-color"
          )?.value.trim() || "",

        backgroundImage:
          wrapper.querySelector(
            ".section-background-image"
          )?.value.trim() || "",

        textColor:
          wrapper.querySelector(
            ".section-text-color"
          )?.value.trim() || "",

        cards,

        paragraphs,

        buttonText:
          wrapper.querySelector(
            ".section-button-text"
          )?.value.trim() || "",

        buttonUrl:
          wrapper.querySelector(
            ".section-button-url"
          )?.value.trim() || "",

        buttonStyle:
          wrapper.querySelector(
            ".section-button-style"
          )?.value || "primary"
      };
    });
}




// ============================================================
// THEME PRESETS
// ============================================================

const SITE_THEME_PRESETS = {

  midnight: {
    theme_primary: "#8b5cf6",
    theme_primary_hover: "#7c3aed",
    theme_secondary: "#ec4899",
    theme_secondary_hover: "#db2777",
    theme_accent: "#22d3ee",
    theme_background: "#050505",
    theme_surface: "#0f0f12",
    theme_surface_alt: "#15151a",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#27272a",
    theme_button_text: "#ffffff"
  },


  ocean: {
    theme_primary: "#0ea5e9",
    theme_primary_hover: "#0284c7",
    theme_secondary: "#06b6d4",
    theme_secondary_hover: "#0891b2",
    theme_accent: "#38bdf8",
    theme_background: "#020617",
    theme_surface: "#0f172a",
    theme_surface_alt: "#172554",
    theme_text: "#ffffff",
    theme_text_muted: "#94a3b8",
    theme_border: "#1e3a5f",
    theme_button_text: "#ffffff"
  },


  emerald: {
    theme_primary: "#10b981",
    theme_primary_hover: "#059669",
    theme_secondary: "#14b8a6",
    theme_secondary_hover: "#0d9488",
    theme_accent: "#34d399",
    theme_background: "#02110c",
    theme_surface: "#071a13",
    theme_surface_alt: "#0b241a",
    theme_text: "#ffffff",
    theme_text_muted: "#9ca3af",
    theme_border: "#164e3b",
    theme_button_text: "#ffffff"
  },


  ruby: {
    theme_primary: "#ef4444",
    theme_primary_hover: "#dc2626",
    theme_secondary: "#f43f5e",
    theme_secondary_hover: "#e11d48",
    theme_accent: "#fb7185",
    theme_background: "#110304",
    theme_surface: "#1c0709",
    theme_surface_alt: "#2a0a0d",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#4c0519",
    theme_button_text: "#ffffff"
  },


  gold: {
    theme_primary: "#eab308",
    theme_primary_hover: "#ca8a04",
    theme_secondary: "#f59e0b",
    theme_secondary_hover: "#d97706",
    theme_accent: "#facc15",
    theme_background: "#0c0a04",
    theme_surface: "#171207",
    theme_surface_alt: "#211a08",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#4d3b0a",
    theme_button_text: "#000000"
  },


  light: {
    theme_primary: "#2563eb",
    theme_primary_hover: "#1d4ed8",
    theme_secondary: "#7c3aed",
    theme_secondary_hover: "#6d28d9",
    theme_accent: "#0891b2",
    theme_background: "#ffffff",
    theme_surface: "#f8fafc",
    theme_surface_alt: "#f1f5f9",
    theme_text: "#111827",
    theme_text_muted: "#64748b",
    theme_border: "#e2e8f0",
    theme_button_text: "#ffffff"
  }

};


function applyThemePreset(name) {

  const preset =
    SITE_THEME_PRESETS[name];

  if (!preset) return;

  Object.entries(preset).forEach(
    ([key, value]) => {

      const field =
        document.querySelector(
          `[name="${key}"]`
        );

      if (field) {
        field.value = value;
      }

    }
  );
}
// ── Load ad components for display in settings ──────────
async function loadAdComponents() {
  const container = document.getElementById("adComponentsList");
  const empty = document.getElementById("adComponentsEmpty");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/components/list?type=ad", {
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    const components = data.components || [];

    if (components.length === 0) {
      if (empty) {
        empty.textContent =
          "No ad components found. Create one in the Components page with type 'ad'.";
      }
      return;
    }

    if (empty) empty.style.display = "none";

    container.innerHTML = components
      .map(
        (comp) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
        <div>
          <strong style="font-size:14px">${escapeHtml(comp.name)}</strong>
          <span style="margin-left:8px;font-size:12px;color:var(--text-muted)">/${escapeHtml(comp.slug)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;padding:3px 8px;border-radius:999px;background:${comp.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(161,161,170,0.15)"};color:${comp.status === "active" ? "#22c55e" : "var(--text-muted)"}">${comp.status === "active" ? "Active" : "Inactive"}</span>
          <a href="/en/admin/components" target="_blank" style="font-size:12px;text-decoration:none">Edit</a>
        </div>
      </div>
    `
      )
      .join("");
  } catch (e) {
    if (empty) {
      empty.textContent = "Could not load ad components.";
    }
  }
}

// ------------------------------------------------------------
// Initialize settings form
// ------------------------------------------------------------

function initSettingsForm() {

  const form =
    document.getElementById(
      "settingsForm"
    );

  if (!form) return;

  // Load active/inactive ad components
  loadAdComponents();
    // ==========================================================
  // THEME PRESET
  // ==========================================================

  const themePreset =
    document.getElementById(
      "themePreset"
    );

  if (themePreset) {

    themePreset.addEventListener(
      "change",
      () => {

        if (
          themePreset.value !== "custom"
        ) {

          applyThemePreset(
            themePreset.value
          );

        }

      }
    );

  }

    // ============================================================
  // LIVE THEME PREVIEW
  // ============================================================

  function updateThemePreview() {

    const preview =
      document.getElementById(
        "themePreview"
      );

    if (!preview) return;


    const getValue = id => {

      const el =
        document.getElementById(id);

      return el
        ? el.value
        : "";

    };


    const primary =
      getValue("themePrimary") ||
      "#8b5cf6";

    const primaryHover =
      getValue("themePrimaryHover") ||
      "#7c3aed";

    const secondary =
      getValue("themeSecondary") ||
      "#ec4899";

    const secondaryHover =
      getValue("themeSecondaryHover") ||
      "#db2777";

    const accent =
      getValue("themeAccent") ||
      "#22d3ee";

    const background =
      getValue("themeBackground") ||
      "#050505";

    const surface =
      getValue("themeSurface") ||
      "#0f0f12";

    const surfaceAlt =
      getValue("themeSurfaceAlt") ||
      "#15151a";

    const text =
      getValue("themeText") ||
      "#ffffff";

    const textMuted =
      getValue("themeTextMuted") ||
      "#a1a1aa";

    const border =
      getValue("themeBorder") ||
      "#27272a";

    const buttonText =
      getValue("themeButtonText") ||
      "#ffffff";


    const cardRadius =
      document.querySelector(
        '[name="theme_card_radius"]'
      )?.value ||
      "12px";


    const buttonRadius =
      document.querySelector(
        '[name="theme_button_radius"]'
      )?.value ||
      "8px";


    // ----------------------------------------------------------
    // Preview container
    // ----------------------------------------------------------

    preview.style.backgroundColor =
      background;

    preview.style.color =
      text;

    preview.style.borderColor =
      border;


    // ----------------------------------------------------------
    // Preview card
    // ----------------------------------------------------------

    const card =
      document.getElementById(
        "themePreviewCard"
      );

    if (card) {

      card.style.backgroundColor =
        surface;

      card.style.borderColor =
        border;

      card.style.borderRadius =
        cardRadius;

      card.style.color =
        text;

    }


    // ----------------------------------------------------------
    // Preview heading
    // ----------------------------------------------------------

    const heading =
      document.getElementById(
        "themePreviewHeading"
      );

    if (heading) {

      heading.style.color =
        text;

    }


    // ----------------------------------------------------------
    // Preview description
    // ----------------------------------------------------------

    const description =
      document.getElementById(
        "themePreviewDescription"
      );

    if (description) {

      description.style.color =
        textMuted;

    }


    // ----------------------------------------------------------
    // Preview muted text
    // ----------------------------------------------------------

    const muted =
      document.getElementById(
        "themePreviewMuted"
      );

    if (muted) {

      muted.style.color =
        textMuted;

    }


    // ----------------------------------------------------------
    // Primary button
    // ----------------------------------------------------------

    const primaryButton =
      document.getElementById(
        "themePreviewPrimary"
      );

    if (primaryButton) {

      primaryButton.style.backgroundColor =
        primary;

      primaryButton.style.color =
        buttonText;

      primaryButton.style.borderColor =
        primary;

      primaryButton.style.borderRadius =
        buttonRadius;

      primaryButton.onmouseenter =
        () => {

          primaryButton.style.backgroundColor =
            primaryHover;

        };

      primaryButton.onmouseleave =
        () => {

          primaryButton.style.backgroundColor =
            primary;

        };

    }


    // ----------------------------------------------------------
    // Secondary button
    // ----------------------------------------------------------

    const secondaryButton =
      document.getElementById(
        "themePreviewSecondary"
      );

    if (secondaryButton) {

      secondaryButton.style.backgroundColor =
        "transparent";

      secondaryButton.style.color =
        secondary;

      secondaryButton.style.borderColor =
        secondary;

      secondaryButton.style.borderRadius =
        buttonRadius;

      secondaryButton.onmouseenter =
        () => {

          secondaryButton.style.backgroundColor =
            secondary;

          secondaryButton.style.color =
            buttonText;

        };

      secondaryButton.onmouseleave =
        () => {

          secondaryButton.style.backgroundColor =
            "transparent";

          secondaryButton.style.color =
            secondary;

        };

    }


    // ----------------------------------------------------------
    // Color swatches
    // ----------------------------------------------------------

    const swatches =
      preview.querySelectorAll(
        "[data-theme-preview-color]"
      );


    swatches.forEach(
      swatch => {

        const type =
          swatch.dataset.themePreviewColor;


        if (type === "primary") {

          swatch.style.backgroundColor =
            primary;

        }


        if (type === "secondary") {

          swatch.style.backgroundColor =
            secondary;

        }


        if (type === "accent") {

          swatch.style.backgroundColor =
            accent;

        }


        if (type === "background") {

          swatch.style.backgroundColor =
            background;

        }


        if (type === "surface") {

          swatch.style.backgroundColor =
            surface;

        }

      }
    );

  }


  // ------------------------------------------------------------
  // Listen to every theme input
  // ------------------------------------------------------------

  const themeInputs = [

    "themePreset",

    "themePrimary",

    "themePrimaryHover",

    "themeSecondary",

    "themeSecondaryHover",

    "themeAccent",

    "themeBackground",

    "themeSurface",

    "themeSurfaceAlt",

    "themeText",

    "themeTextMuted",

    "themeBorder",

    "themeButtonText"

  ];


  themeInputs.forEach(
    id => {

      const input =
        document.getElementById(id);

      if (!input) return;

      input.addEventListener(
        "input",
        updateThemePreview
      );

      input.addEventListener(
        "change",
        updateThemePreview
      );

    }
  );


  const radiusInputs =
    document.querySelectorAll(
      '[name="theme_card_radius"], [name="theme_button_radius"]'
    );


  radiusInputs.forEach(
    input => {

      input.addEventListener(
        "input",
        updateThemePreview
      );

    }
  );


  // Initial preview

  updateThemePreview();

  


  const addButton =
    document.getElementById(
      "addComplianceBtn"
    );

  if (addButton) {

    addButton.addEventListener(
      "click",
      addComplianceRow
    );

  }

  const addFeaturesSectionButton =
  document.getElementById(
    "addFeaturesSectionBtn"
  );

if (addFeaturesSectionButton) {
  addFeaturesSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "features"
        )
      );

      renderHomepageSections();
    }
  );
}


const addTextSectionButton =
  document.getElementById(
    "addTextSectionBtn"
  );

if (addTextSectionButton) {
  addTextSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "text"
        )
      );

      renderHomepageSections();
    }
  );
}


const addCardsSectionButton =
  document.getElementById(
    "addCardsSectionBtn"
  );

if (addCardsSectionButton) {
  addCardsSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "cards"
        )
      );

      renderHomepageSections();
    }
  );
}


  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const alertEl =
        document.getElementById(
          "settingsFormAlert"
        );

      try {

        const formData =
          new FormData(form);

        const payload = {};


        for (
          const [key, value]
          of formData.entries()
        ) {

          payload[key] =
            String(value);

        }

        // The homepage hero is managed on Dashboard > Header & Hero. Only send
        // these when the checkboxes exist on this page, otherwise saving here
        // would switch the hero off.
        const heroEnabled =
  document.getElementById("siteHeroEnabled");

if (heroEnabled) {
  payload.site_hero_enabled =
    heroEnabled.checked
      ? "true"
      : "false";
}


const heroOverlay =
  document.getElementById("siteHeroOverlay");

if (heroOverlay) {
  payload.site_hero_overlay =
    heroOverlay.checked
      ? "true"
      : "false";
}

const gpwaSealEnabledInput =
  document.getElementById("gpwaSealEnabled");

payload.gpwa_seal_enabled =
  gpwaSealEnabledInput && gpwaSealEnabledInput.checked
    ? "true"
    : "false";

        payload.footer_compliance =
          JSON.stringify(
            collectComplianceRows()
          );

        payload.homepage_sections =
          JSON.stringify(
            collectHomepageSections()
          );


        const res =
          await fetch(
            "/en/api/v1/settings/save",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify(payload)
            }
          );


        const data =
          await res.json();


        if (!res.ok || data.success === false) {

          throw new Error(
            data.error ||
            "Failed to save settings"
          );

        }


        if (alertEl) {

          alertEl.style.display =
            "block";

          alertEl.textContent =
            "Site settings saved successfully.";

        }

      } catch (error) {

        console.error(
          "Failed to save settings:",
          error
        );

        if (alertEl) {

          alertEl.style.display =
            "block";

          alertEl.textContent =
            error.message ||
            "Failed to save settings.";

        }

      }

    }
  );
}


// ============================================
// AI GENERATOR
// ============================================

function initAIGenerator() {
  const form = document.getElementById("aiForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("aiAlert");
    const outputEl = document.getElementById("aiOutput");
    const submitBtn = form.querySelector('button[type="submit"]');

    if (alertEl) alertEl.style.display = "none";
    if (outputEl) outputEl.value = "Generating... please wait.";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Generating...";
    }

    const formData = new FormData(form);
    const payload = {
      casino: formData.get("casino"),
      country: formData.get("country") || "Global",
      slug: formData.get("slug") || formData.get("casino").toLowerCase().replace(/\s+/g, "-"),
    };

    try {
      const res = await fetch("/en/api/v1/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        if (outputEl) outputEl.value = data.content || "No content returned.";
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Review generated! Copy the content below.";
          alertEl.style.display = "block";
        }
      } else {
        if (outputEl) outputEl.value = "";
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Generation failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (outputEl) outputEl.value = "";
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error. Try again.";
        alertEl.style.display = "block";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Generate Review";
      }
    }
  });
}



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

// ============================================
// RESEARCH (Phase 1)
// ============================================

async function loadResearchTable() {
  const tbody = document.getElementById("researchTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/research/list");
    const data = await res.json();
    const items = data.research || [];
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No research items yet.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(r => {
      const isPublished = !!r.published && r.status !== "draft";
      return `
      <tr>
        <td>${r.type}</td>
        <td><strong>${r.title}</strong><br><span class="muted" style="font-size:12px">/en/research/${r.type}/${r.slug}</span></td>
        <td>${r.country_name || "—"}</td>
        <td><span class="badge ${isPublished ? "badge-ok" : "badge-dim"}">${r.status}</span></td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editResearch(${r.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteResearch(${r.id}, '${r.title.replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>
    `;
    }).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function populateResearchDropdowns() {
  const countrySel = document.getElementById("researchCountrySelect");
  const authorSel = document.getElementById("researchAuthorSelect");

  if (countrySel && countrySel.dataset.loaded !== "true") {
    try {
      const res = await fetch("/en/api/v1/countries/list");
      const data = await res.json();
      (data.countries || []).forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.code;
        opt.textContent = c.name;
        countrySel.appendChild(opt);
      });
      countrySel.dataset.loaded = "true";
    } catch { /* dropdown stays with just the blank option */ }
  }

  if (authorSel && authorSel.dataset.loaded !== "true") {
    try {
      const res = await fetch("/en/api/v1/authors/list");
      const data = await res.json();
      (data.authors || []).forEach(a => {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.name;
        authorSel.appendChild(opt);
      });
      authorSel.dataset.loaded = "true";
    } catch { /* dropdown stays with just the blank option */ }
  }
}

async function editResearch(id) {
  try {
    const res = await fetch(`/en/api/v1/research/get-by-id?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Could not load research item"); return; }
    const r = data.item;

    await populateResearchDropdowns();

    const form = document.getElementById("researchForm");
    if (!form) return;

    form.querySelector("[name='id']").value = r.id;
    form.querySelector("[name='type']").value = r.type;
    form.querySelector("[name='slug']").value = r.slug;
    form.querySelector("[name='title']").value = r.title || "";
    form.querySelector("[name='subtitle']").value = r.subtitle || "";
    form.querySelector("[name='excerpt']").value = r.excerpt || "";
    form.querySelector("[name='country_id']").value = r.country_id || "";
    form.querySelector("[name='author_id']").value = r.author_id || "";
    form.querySelector("[name='seo_title']").value = r.seo_title || "";
    form.querySelector("[name='seo_description']").value = r.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = r.seo_keywords || "";
    form.querySelector("[name='canonical_url']").value = r.canonical_url || "";
    form.querySelector("[name='status']").value = r.status || "draft";
    form.querySelector("[name='published']").value = String(r.published || 0);
    form.querySelector("[name='robots']").value = r.robots || "index,follow";
    form.querySelector("[name='featured']").value = String(r.featured || 0);
    form.querySelector("[name='last_verified_at']").value = (r.last_verified_at || "").split(" ")[0].split("T")[0] || "";
    form.querySelector("[name='next_review_at']").value = (r.next_review_at || "").split(" ")[0].split("T")[0] || "";

    const parsedContentSource = r.content_json;
    let parsedContent = parsedContentSource;
    try { parsedContent = typeof parsedContentSource === "string" ? JSON.parse(parsedContentSource) : parsedContentSource; } catch { parsedContent = null; }
    researchSectionState.sections = (parsedContent && Array.isArray(parsedContent.sections)) ? parsedContent.sections : [];
    researchSectionState.editingItemId = r.id;
    await renderResearchFormSections();

    form.dataset.editMode = "true";
    document.getElementById("researchSubmitBtn").textContent = "Update Research Item";
    document.getElementById("researchCancelEdit").style.display = "";
    form.scrollIntoView({ behavior: "smooth" });
    showResearchClaimsPanel(r.id, r.title);
    showResearchRelationsPanel(r.id, r.title);
    showResearchVersionsPanel(r.id, r.title);
  } catch {
    alert("Network error");
  }
}

function cancelResearchEdit() {
  const form = document.getElementById("researchForm");
  if (!form) return;
  form.reset();
  delete form.dataset.editMode;
  document.getElementById("researchSubmitBtn").textContent = "Create Research Item";
  document.getElementById("researchCancelEdit").style.display = "none";
  hideResearchClaimsPanel();
  hideResearchRelationsPanel();
  hideResearchVersionsPanel();
  researchSectionState.sections = [];
  researchSectionState.editingItemId = null;
  renderResearchFormSections();
}

async function deleteResearch(id, title) {
  if (!confirm(`Delete research item "${title}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/research/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) loadResearchTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

// ============================================
// RESEARCH CONTENT — visual section builder
// Replaces raw-JSON authoring with pick-a-type, fill-a-form
// cards, same pattern as wireSeoSectionBuilder/renderSeoSections
// used by countries/categories, adapted for research's own
// section types (see renderResearchSections in controllers.js —
// this UI produces exactly the JSON shape that renderer expects,
// the editor just never has to see or write that JSON directly).
// ============================================

const researchSectionState = { sections: [], editingItemId: null };

const RESEARCH_SECTION_TYPES = [
  "heading", "rich_text", "statistic", "timeline", "table",
  "source_citation", "fact_card", "faq", "internal_links",
  "research_reference", "dataset_table", "image"
];

const RESEARCH_SECTION_TYPE_LABELS = {
  heading: "Heading",
  rich_text: "Rich Text",
  statistic: "Statistic",
  timeline: "Timeline",
  table: "Table",
  source_citation: "Source Citation",
  fact_card: "Fact Card",
  faq: "FAQ",
  internal_links: "Internal Links",
  research_reference: "Research Reference",
  dataset_table: "Dataset Table",
  image: "Image"
};

// ---- shared caches (loaded once, reused by every section card) ----

let _researchAllItemsCache = null;
async function fetchResearchItemsCached(force = false) {
  if (_researchAllItemsCache && !force) return _researchAllItemsCache;
  try {
    const res = await fetch("/en/api/v1/research/list");
    const data = await res.json();
    _researchAllItemsCache = data.research || [];
  } catch { _researchAllItemsCache = []; }
  return _researchAllItemsCache;
}

let _researchAllDatasetsCache = null;
async function fetchResearchDatasetsCached(force = false) {
  if (_researchAllDatasetsCache && !force) return _researchAllDatasetsCache;
  try {
    const res = await fetch("/en/api/v1/research-datasets/list");
    const data = await res.json();
    _researchAllDatasetsCache = data.datasets || [];
  } catch { _researchAllDatasetsCache = []; }
  return _researchAllDatasetsCache;
}

async function fetchResearchDatasetVersionsFor(datasetId) {
  try {
    const res = await fetch(`/en/api/v1/research-datasets/versions?dataset_id=${datasetId}`);
    const data = await res.json();
    return data.versions || [];
  } catch { return []; }
}

// Every rich-text-capable textarea this builder renders gets an id
// in this shape so init/destroy can find exactly its own editors
// without touching any other page's RichEditor instances.
function researchEditorIdFor(sectionIndex, field) {
  return `research-sec-${sectionIndex}-${field}`;
}

function destroyResearchSectionEditors() {
  const root = document.getElementById("researchFormSections");
  if (!root || !window.RichEditor) return;
  root.querySelectorAll("textarea[data-editor-id]").forEach((ta) => {
    RichEditor.destroy(ta.dataset.editorId);
  });
}

function initResearchSectionEditors() {
  const root = document.getElementById("researchFormSections");
  if (!root || !window.RichEditor) return;
  root.querySelectorAll("textarea[data-rich-field]").forEach((ta) => {
    RichEditor.init(ta, { height: 220 });
  });
}

function researchEditorValue(sectionIndex, field, fallbackEl) {
  const editorId = researchEditorIdFor(sectionIndex, field);
  if (window.RichEditor && RichEditor.isReady(editorId)) return RichEditor.get(editorId);
  return fallbackEl ? fallbackEl.value : "";
}

// ---- per-type card body renderers ----
// Each returns the INNER html for a section card (the type
// selector + remove/move controls are added by
// researchSectionCardHtml, shared across every type).

function researchRichTextarea(index, field, value, label, rows) {
  const id = researchEditorIdFor(index, field);
  return `<label>${label}</label><textarea data-editor-id="${id}" data-rich-field data-section-field="${field}" rows="${rows || 6}">${escapeHtml(value || "")}</textarea>`;
}

function researchFieldsHtml_heading(s) {
  return `<label>Heading text</label><input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}" placeholder="e.g. Regulatory Framework">`;
}

function researchFieldsHtml_rich_text(s, index) {
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Subtitle (optional)</label>
    <input type="text" data-section-field="subtitle" value="${escapeHtml(s.subtitle || "")}">
    ${researchRichTextarea(index, "body", s.body, "Body")}`;
}

function researchFieldsHtml_statistic(s) {
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <div class="form-row">
      <div class="form-group"><label>Value</label><input type="text" data-section-field="value" value="${escapeHtml(s.value ?? "")}" placeholder="30.5"></div>
      <div class="form-group"><label>Unit</label><input type="text" data-section-field="unit" value="${escapeHtml(s.unit || "")}" placeholder="%"></div>
    </div>
    <label>Label</label>
    <input type="text" data-section-field="label" value="${escapeHtml(s.label || "")}" placeholder="Gambling tax rate">
    <label>Context (optional)</label>
    <input type="text" data-section-field="context" value="${escapeHtml(s.context || "")}" placeholder="Applied to gross gaming revenue.">`;
}

function researchTimelineEventRow(ev, i) {
  return `
    <div class="research-subrow" data-event-row="${i}">
      <div class="research-subrow__head">
        <input type="date" data-event-field="date" value="${escapeHtml(ev.date || "")}" style="max-width:160px">
        <input type="text" data-event-field="title" value="${escapeHtml(ev.title || "")}" placeholder="Event title" style="flex:1">
        <button type="button" class="btn btn--ghost btn--sm" data-remove-event>Remove</button>
      </div>
      <textarea data-event-field="description" rows="2" placeholder="Description (optional)">${escapeHtml(ev.description || "")}</textarea>
    </div>`;
}

function researchFieldsHtml_timeline(s) {
  const events = Array.isArray(s.events) ? s.events : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Events</label>
    <div data-events-container>${events.map(researchTimelineEventRow).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-event>+ Add event</button>`;
}

function researchTableRow(row, columns, rowIndex) {
  const cells = columns.map((col, ci) =>
    `<input type="text" data-cell-field="${ci}" value="${escapeHtml(row[ci] ?? "")}" placeholder="${escapeHtml(col || "Column " + (ci + 1))}" style="flex:1;min-width:80px">`
  ).join("");
  return `<div class="research-subrow" data-table-row="${rowIndex}" style="display:flex;gap:6px;align-items:center">${cells}<button type="button" class="btn btn--ghost btn--sm" data-remove-row>✕</button></div>`;
}

function researchFieldsHtml_table(s) {
  const columns = Array.isArray(s.columns) ? s.columns : [];
  const rows = Array.isArray(s.rows) ? s.rows : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Caption (optional)</label>
    <input type="text" data-section-field="caption" value="${escapeHtml(s.caption || "")}">
    <label>Columns <span class="muted">(one per box — this is the header row)</span></label>
    <div data-columns-container style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      ${columns.map((c, i) => `<input type="text" data-column-field="${i}" value="${escapeHtml(c || "")}" placeholder="Column ${i + 1}" style="width:120px">`).join("")}
    </div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-column>+ Add column</button>
    <label style="margin-top:10px">Rows</label>
    <div data-table-rows-container>${rows.map((r, i) => researchTableRow(r, columns, i)).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-row>+ Add row</button>`;
}

function researchFieldsHtml_source_citation(s, index, sourcesList) {
  const options = (sourcesList || []).map((src) =>
    `<option value="${src.id}" ${String(s.source_id) === String(src.id) ? "selected" : ""}>${escapeHtml(src.organisation)}${src.title ? " — " + escapeHtml(src.title) : ""}</option>`
  ).join("");
  return `
    <label>Statement</label>
    <textarea data-section-field="body" rows="2" placeholder="What the source supports">${escapeHtml(s.body || "")}</textarea>
    <label>Source</label>
    <select data-section-field="source_id">
      <option value="">— Choose a source (from the Sources library below) —</option>
      ${options}
    </select>
    <p class="muted" style="margin:4px 0 0">Don't see the source you need? Add it in the Sources section further down this page, then come back and pick it here.</p>`;
}

function researchFieldsHtml_fact_card(s, index) {
  return `
    <label>Card title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    ${researchRichTextarea(index, "body", s.body, "Card content")}`;
}

function researchFaqItemRow(item, i) {
  return `
    <div class="research-subrow" data-faq-row="${i}">
      <div class="research-subrow__head">
        <input type="text" data-faq-field="q" value="${escapeHtml(item.q || "")}" placeholder="Question" style="flex:1">
        <button type="button" class="btn btn--ghost btn--sm" data-remove-faq>Remove</button>
      </div>
      <textarea data-faq-field="a" rows="2" placeholder="Answer">${escapeHtml(item.a || "")}</textarea>
    </div>`;
}

function researchFieldsHtml_faq(s) {
  const items = Array.isArray(s.items) ? s.items : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "FAQ")}">
    <label>Questions</label>
    <div data-faq-container>${items.map(researchFaqItemRow).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-faq>+ Add question</button>`;
}

function researchLinkRow(link, i) {
  return `
    <div class="research-subrow" data-link-row="${i}" style="display:flex;gap:6px;align-items:center">
      <input type="text" data-link-field="label" value="${escapeHtml(link.label || "")}" placeholder="Link text" style="flex:1">
      <input type="text" data-link-field="url" value="${escapeHtml(link.url || "")}" placeholder="/en/research/..." style="flex:1">
      <button type="button" class="btn btn--ghost btn--sm" data-remove-link>✕</button>
    </div>`;
}

function researchFieldsHtml_internal_links(s) {
  const links = Array.isArray(s.links) ? s.links : [];
  return `
    <label>Section title (optional)</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "Related reading")}">
    <label>Links</label>
    <div data-links-container>${links.map(researchLinkRow).join("")}</div>
    <button type="button" class="btn btn--ghost btn--sm" data-add-link>+ Add link</button>`;
}

function researchFieldsHtml_research_reference(s, index, itemsList) {
  const mode = s.mode === "snapshot" ? "snapshot" : "live";
  const options = (itemsList || [])
    .filter((it) => String(it.id) !== String(researchSectionState.editingItemId || ""))
    .map((it) => `<option value="${it.id}" ${String(s.research_item_id) === String(it.id) ? "selected" : ""}>${escapeHtml(it.title)} (${it.type})</option>`)
    .join("");
  return `
    <label>Which research item?</label>
    <select data-section-field="research_item_id" data-ref-item-select>
      <option value="">— Choose a research item —</option>
      ${options}
    </select>
    <label style="margin-top:8px">Mode</label>
    <select data-section-field="mode">
      <option value="live" ${mode === "live" ? "selected" : ""}>Live — always shows the current published version</option>
      <option value="snapshot" ${mode === "snapshot" ? "selected" : ""}>Snapshot — frozen text, captured now</option>
    </select>
    <div data-snapshot-fields style="${mode === "snapshot" ? "" : "display:none"};margin-top:8px">
      <button type="button" class="btn btn--ghost btn--sm" data-fetch-snapshot>Fetch current text from selected item &amp; freeze it here</button>
      <label style="margin-top:8px">Frozen title</label>
      <input type="text" data-section-field="snapshot_title" value="${escapeHtml(s.snapshot_title || "")}">
      <label>Frozen excerpt</label>
      <textarea data-section-field="snapshot_excerpt" rows="2">${escapeHtml(s.snapshot_excerpt || "")}</textarea>
      <label>Snapshot date</label>
      <input type="date" data-section-field="snapshot_at" value="${escapeHtml(s.snapshot_at || "")}">
    </div>`;
}

function researchFieldsHtml_dataset_table(s, index, datasetsList) {
  const options = (datasetsList || []).map((d) =>
    `<option value="${d.id}" ${String(s.dataset_id) === String(d.id) ? "selected" : ""}>${escapeHtml(d.title)}</option>`
  ).join("");
  return `
    <label>Dataset</label>
    <select data-section-field="dataset_id" data-dataset-select>
      <option value="">— Choose a dataset (from the Research Datasets page) —</option>
      ${options}
    </select>
    <label style="margin-top:8px">Version</label>
    <select data-section-field="version" data-dataset-version-select>
      <option value="latest" ${(!s.version || s.version === "latest") ? "selected" : ""}>Latest (always current)</option>
    </select>
    <label style="margin-top:8px">Caption (optional)</label>
    <input type="text" data-section-field="caption" value="${escapeHtml(s.caption || "")}">`;
}

function researchFieldsHtml_image(s) {
  return `
    <label>Caption / alt text</label>
    <input type="text" data-section-field="title" value="${escapeHtml(s.title || "")}">
    <label>Image URL</label>
    <input type="text" data-section-field="image" value="${escapeHtml(s.image || "")}" placeholder="Paste a URL from the Media Library page">`;
}

function researchSectionCardHtml(section, index, caches) {
  const type = RESEARCH_SECTION_TYPES.includes(section.type) ? section.type : "rich_text";
  const builders = {
    heading: () => researchFieldsHtml_heading(section),
    rich_text: () => researchFieldsHtml_rich_text(section, index),
    statistic: () => researchFieldsHtml_statistic(section),
    timeline: () => researchFieldsHtml_timeline(section),
    table: () => researchFieldsHtml_table(section),
    source_citation: () => researchFieldsHtml_source_citation(section, index, caches.sources),
    fact_card: () => researchFieldsHtml_fact_card(section, index),
    faq: () => researchFieldsHtml_faq(section),
    internal_links: () => researchFieldsHtml_internal_links(section),
    research_reference: () => researchFieldsHtml_research_reference(section, index, caches.items),
    dataset_table: () => researchFieldsHtml_dataset_table(section, index, caches.datasets),
    image: () => researchFieldsHtml_image(section)
  };

  return `
    <div class="research-section-card" data-section-row="${index}">
      <div class="research-section-card__head">
        <span class="research-section-card__badge">#${index + 1}</span>
        <select data-section-type>
          ${RESEARCH_SECTION_TYPES.map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${RESEARCH_SECTION_TYPE_LABELS[t]}</option>`).join("")}
        </select>
        <button type="button" class="btn btn--ghost btn--sm" data-move-section-up ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn btn--ghost btn--sm" data-move-section-down>↓</button>
        <button type="button" class="btn btn--danger btn--sm" data-remove-section style="margin-left:auto">Remove section</button>
      </div>
      ${builders[type] ? builders[type]() : ""}
    </div>`;
}

async function renderResearchFormSections() {
  const root = document.getElementById("researchFormSections");
  if (!root) return;

  destroyResearchSectionEditors();

  const [sources, datasets, items] = await Promise.all([
    fetchSourcesCached(),
    fetchResearchDatasetsCached(),
    fetchResearchItemsCached()
  ]);
  const caches = { sources, datasets, items };

  if (researchSectionState.sections.length === 0) {
    root.innerHTML = '<p class="muted">No sections yet — use "+ Add Section" below, or a quick-start template above.</p>';
    return;
  }

  root.innerHTML = researchSectionState.sections.map((s, i) => researchSectionCardHtml(s, i, caches)).join("");
  initResearchSectionEditors();

  // Dataset version dropdowns need each dataset's real version list,
  // fetched per-section since it depends on which dataset is picked.
  root.querySelectorAll("[data-dataset-select]").forEach(async (sel) => {
    if (!sel.value) return;
    const versions = await fetchResearchDatasetVersionsFor(sel.value);
    const versionSelect = sel.closest(".research-section-card").querySelector("[data-dataset-version-select]");
    const currentSection = researchSectionState.sections[Number(sel.closest("[data-section-row]").dataset.sectionRow)];
    const currentVersion = currentSection ? currentSection.version : "latest";
    versionSelect.innerHTML = '<option value="latest">Latest (always current)</option>' +
      versions.map((v) => `<option value="${v.version_number}" ${String(currentVersion) === String(v.version_number) ? "selected" : ""}>v${v.version_number} — ${(v.created_at || "").slice(0, 10)}</option>`).join("");
  });
}

function syncResearchSectionsFromDom() {
  const root = document.getElementById("researchFormSections");
  if (!root) return;
  const rows = Array.from(root.querySelectorAll("[data-section-row]"));

  researchSectionState.sections = rows.map((row) => {
    const index = Number(row.dataset.sectionRow);
    const existing = researchSectionState.sections[index] || {};
    const type = row.querySelector("[data-section-type]").value;
    const section = { id: existing.id || ("rs" + Date.now() + index), type };

    row.querySelectorAll("[data-section-field]").forEach((el) => {
      const key = el.dataset.sectionField;
      if (el.dataset.richField !== undefined) {
        section[key] = researchEditorValue(index, key, el);
      } else {
        section[key] = el.value;
      }
    });

    // Repeatable sub-lists — each lives in its own container, read
    // separately from the flat data-section-field loop above.
    const eventsContainer = row.querySelector("[data-events-container]");
    if (eventsContainer) {
      section.events = Array.from(eventsContainer.querySelectorAll("[data-event-row]")).map((er) => ({
        date: er.querySelector("[data-event-field='date']").value,
        title: er.querySelector("[data-event-field='title']").value,
        description: er.querySelector("[data-event-field='description']").value
      }));
    }

    const faqContainer = row.querySelector("[data-faq-container]");
    if (faqContainer) {
      section.items = Array.from(faqContainer.querySelectorAll("[data-faq-row]")).map((fr) => ({
        q: fr.querySelector("[data-faq-field='q']").value,
        a: fr.querySelector("[data-faq-field='a']").value
      }));
    }

    const linksContainer = row.querySelector("[data-links-container]");
    if (linksContainer) {
      section.links = Array.from(linksContainer.querySelectorAll("[data-link-row]")).map((lr) => ({
        label: lr.querySelector("[data-link-field='label']").value,
        url: lr.querySelector("[data-link-field='url']").value
      }));
    }

    const columnsContainer = row.querySelector("[data-columns-container]");
    if (columnsContainer) {
      section.columns = Array.from(columnsContainer.querySelectorAll("[data-column-field]")).map((c) => c.value);
    }
    const tableRowsContainer = row.querySelector("[data-table-rows-container]");
    if (tableRowsContainer) {
      section.rows = Array.from(tableRowsContainer.querySelectorAll("[data-table-row]")).map((tr) =>
        Array.from(tr.querySelectorAll("[data-cell-field]")).map((c) => c.value)
      );
    }

    return section;
  });
}

function researchDefaultSectionFor(type) {
  const defaults = {
    heading: { title: "" },
    rich_text: { title: "", subtitle: "", body: "" },
    statistic: { title: "", value: "", unit: "", label: "", context: "" },
    timeline: { title: "", events: [] },
    table: { title: "", caption: "", columns: [], rows: [] },
    source_citation: { body: "", source_id: "" },
    fact_card: { title: "", body: "" },
    faq: { title: "FAQ", items: [] },
    internal_links: { title: "Related reading", links: [] },
    research_reference: { mode: "live", research_item_id: "" },
    dataset_table: { dataset_id: "", version: "latest", caption: "" },
    image: { title: "", image: "" }
  };
  return { id: "rs" + Date.now(), type, ...(defaults[type] || {}) };
}

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

// ---- one-click templates ----

function insertResearchTemplate(templateName) {
  syncResearchSectionsFromDom();
  const templates = {
    country_report: [
      { ...researchDefaultSectionFor("heading"), title: "Regulatory Framework" },
      { ...researchDefaultSectionFor("rich_text"), body: "<p>Describe the licensing framework here.</p>" },
      { ...researchDefaultSectionFor("statistic"), label: "Gambling tax rate", unit: "%" },
      { ...researchDefaultSectionFor("timeline") },
      { ...researchDefaultSectionFor("table") }
    ],
    regulator_profile: [
      { ...researchDefaultSectionFor("heading"), title: "Overview" },
      { ...researchDefaultSectionFor("rich_text") },
      { ...researchDefaultSectionFor("fact_card"), title: "Responsibilities" },
      { ...researchDefaultSectionFor("faq") }
    ],
    sourced_claim: [
      { ...researchDefaultSectionFor("rich_text") },
      { ...researchDefaultSectionFor("source_citation") }
    ],
    report_composition: [
      { ...researchDefaultSectionFor("heading"), title: "Executive Summary" },
      { ...researchDefaultSectionFor("rich_text") },
      { ...researchDefaultSectionFor("research_reference") },
      { ...researchDefaultSectionFor("dataset_table") }
    ]
  };
  const toAdd = templates[templateName];
  if (!toAdd) return;
  researchSectionState.sections.push(...toAdd);
  renderResearchFormSections();
}



function initResearchForm() {
  const form = document.getElementById("researchForm");
  if (!form) return;

  populateResearchDropdowns();
  wireResearchSectionBuilder();
  renderResearchFormSections();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("researchFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);

    syncResearchSectionsFromDom();
    const contentJson = { sections: researchSectionState.sections };

    const isEdit = form.dataset.editMode === "true";
    const endpoint = isEdit ? "/en/api/v1/research/update" : "/en/api/v1/research/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      type: formData.get("type"),
      slug: formData.get("slug"),
      title: formData.get("title"),
      subtitle: formData.get("subtitle") || null,
      excerpt: formData.get("excerpt") || null,
      country_id: formData.get("country_id") || null,
      author_id: formData.get("author_id") || null,
      content_json: contentJson,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      canonical_url: formData.get("canonical_url") || null,
      status: formData.get("status") || "draft",
      published: formData.get("published") === "1" ? 1 : 0,
      robots: formData.get("robots") || "index,follow",
      featured: formData.get("featured") === "1" ? 1 : 0,
      last_verified_at: formData.get("last_verified_at") || null,
      next_review_at: formData.get("next_review_at") || null,
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
          alertEl.textContent = isEdit ? "Research item updated!" : "Research item created!";
          alertEl.style.display = "block";
        }
        cancelResearchEdit();
        loadResearchTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

// ============================================
// RESEARCH — SOURCES & CLAIMS (Phase 2)
// ============================================

let _researchSourcesCache = null;

async function fetchSourcesCached(force = false) {
  if (_researchSourcesCache && !force) return _researchSourcesCache;
  try {
    const res = await fetch("/en/api/v1/research-sources/list");
    const data = await res.json();
    _researchSourcesCache = data.sources || [];
  } catch {
    _researchSourcesCache = [];
  }
  return _researchSourcesCache;
}

async function loadSourcesTable() {
  const tbody = document.getElementById("sourcesTableBody");
  if (!tbody) return;
  try {
    const sources = await fetchSourcesCached(true);
    if (sources.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No sources yet.</td></tr>';
      return;
    }
    tbody.innerHTML = sources.map(s => `
      <tr>
        <td><strong>${s.organisation}</strong>${s.title ? `<br><span class="muted" style="font-size:12px">${s.title}</span>` : ""}</td>
        <td>${s.source_type}</td>
        <td>${s.country_name || "—"}</td>
        <td>${s.is_primary ? '<span class="badge badge-ok">Primary</span>' : "—"}</td>
        <td>${s.citation_count || 0}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editSource(${s.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteSource(${s.id}, '${(s.organisation || "").replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

async function populateCountrySelect(selectEl) {
  if (!selectEl || selectEl.dataset.loaded === "true") return;
  try {
    const res = await fetch("/en/api/v1/countries/list");
    const data = await res.json();
    (data.countries || []).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = c.name;
      selectEl.appendChild(opt);
    });
    selectEl.dataset.loaded = "true";
  } catch { /* dropdown stays with just the blank option */ }
}

async function editSource(id) {
  try {
    const res = await fetch(`/en/api/v1/research-sources/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Could not load source"); return; }
    const s = data.source;

    await populateCountrySelect(document.getElementById("sourceCountrySelect"));

    const form = document.getElementById("sourceForm");
    if (!form) return;
    form.querySelector("[name='id']").value = s.id;
    form.querySelector("[name='organisation']").value = s.organisation || "";
    form.querySelector("[name='source_type']").value = s.source_type || "other";
    form.querySelector("[name='title']").value = s.title || "";
    form.querySelector("[name='url']").value = s.url || "";
    form.querySelector("[name='country_id']").value = s.country_id || "";
    form.querySelector("[name='is_primary']").value = String(s.is_primary || 0);
    form.querySelector("[name='publication_date']").value = (s.publication_date || "").split(" ")[0].split("T")[0] || "";
    form.querySelector("[name='accessed_at']").value = (s.accessed_at || "").split(" ")[0].split("T")[0] || "";
    form.querySelector("[name='notes']").value = s.notes || "";

    form.dataset.editMode = "true";
    document.getElementById("sourceSubmitBtn").textContent = "Update Source";
    document.getElementById("sourceCancelEdit").style.display = "";
    form.scrollIntoView({ behavior: "smooth" });
  } catch {
    alert("Network error");
  }
}

function cancelSourceEdit() {
  const form = document.getElementById("sourceForm");
  if (!form) return;
  form.reset();
  delete form.dataset.editMode;
  document.getElementById("sourceSubmitBtn").textContent = "Add Source";
  document.getElementById("sourceCancelEdit").style.display = "none";
}

async function deleteSource(id, organisation) {
  if (!confirm(`Delete source "${organisation}"? This also removes it from any claims that cite it.`)) return;
  try {
    const res = await fetch("/en/api/v1/research-sources/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) { loadSourcesTable(); fetchSourcesCached(true); }
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initSourceForm() {
  const form = document.getElementById("sourceForm");
  if (!form) return;

  populateCountrySelect(document.getElementById("sourceCountrySelect"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("sourceFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);

    const isEdit = form.dataset.editMode === "true";
    const endpoint = isEdit ? "/en/api/v1/research-sources/update" : "/en/api/v1/research-sources/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      organisation: formData.get("organisation"),
      source_type: formData.get("source_type") || "other",
      title: formData.get("title") || null,
      url: formData.get("url") || null,
      country_id: formData.get("country_id") || null,
      is_primary: formData.get("is_primary") === "1" ? 1 : 0,
      publication_date: formData.get("publication_date") || null,
      accessed_at: formData.get("accessed_at") || null,
      notes: formData.get("notes") || null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) { alertEl.className = "alert alert--success"; alertEl.textContent = isEdit ? "Source updated!" : "Source added!"; alertEl.style.display = "block"; }
        cancelSourceEdit();
        loadSourcesTable();
        fetchSourcesCached(true);
        syncResearchSectionsFromDom();
        renderResearchFormSections();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

// ---- Claims (scoped to whichever research item is being edited) ----

async function loadResearchClaimsTable(researchItemId) {
  const tbody = document.getElementById("researchClaimsTableBody");
  if (!tbody) return;
  try {
    const [claimsRes, sources] = await Promise.all([
      fetch(`/en/api/v1/research-claims/list-for-item?research_item_id=${researchItemId}`),
      fetchSourcesCached(),
    ]);
    const claimsData = await claimsRes.json();
    const claims = claimsData.claims || [];

    if (claims.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No claims yet.</td></tr>';
      return;
    }

    const sourceOptions = sources.map(s => `<option value="${s.id}">${s.organisation}${s.title ? " — " + s.title : ""}</option>`).join("");

    tbody.innerHTML = claims.map(c => `
      <tr>
        <td style="max-width:320px">${c.claim_text}</td>
        <td><span class="badge ${c.status === "verified" ? "badge-ok" : "badge-dim"}">${c.status}</span></td>
        <td>
          ${c.sources.map(s => `
            <span class="badge badge-dim" style="margin-right:4px">
              ${s.organisation}
              <a href="#" onclick="detachClaimSource(${s.id}, ${researchItemId}); return false;" title="Remove" style="margin-left:4px">&times;</a>
            </span>
          `).join("") || '<span class="muted">none</span>'}
          <div style="margin-top:6px;display:flex;gap:4px">
            <select id="attachSourceSelect-${c.id}" style="max-width:180px">
              <option value="">Attach source...</option>
              ${sourceOptions}
            </select>
            <button type="button" class="btn btn--ghost btn--sm" onclick="attachClaimSource(${c.id}, ${researchItemId})">Attach</button>
          </div>
        </td>
        <td class="table-actions">
          <button class="btn btn--danger btn--sm" onclick="deleteClaim(${c.id}, ${researchItemId})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

async function attachClaimSource(claimId, researchItemId) {
  const select = document.getElementById(`attachSourceSelect-${claimId}`);
  const sourceId = select ? select.value : "";
  if (!sourceId) return;
  try {
    const res = await fetch("/en/api/v1/research-claims/attach-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: claimId, source_id: parseInt(sourceId) }),
    });
    const data = await res.json();
    if (data.success) loadResearchClaimsTable(researchItemId);
    else alert(data.error || "Could not attach source");
  } catch { alert("Network error"); }
}

async function detachClaimSource(claimSourceId, researchItemId) {
  try {
    const res = await fetch("/en/api/v1/research-claims/detach-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: claimSourceId }),
    });
    const data = await res.json();
    if (data.success) loadResearchClaimsTable(researchItemId);
    else alert(data.error || "Could not remove source");
  } catch { alert("Network error"); }
}

async function deleteClaim(id, researchItemId) {
  if (!confirm("Delete this claim?")) return;
  try {
    const res = await fetch("/en/api/v1/research-claims/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) loadResearchClaimsTable(researchItemId);
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initResearchClaimForm() {
  const form = document.getElementById("researchClaimForm");
  if (!form) return;

  populateCountrySelect(document.getElementById("researchClaimJurisdictionSelect"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const researchItemId = parseInt(formData.get("research_item_id"));
    if (!researchItemId) { alert("Save the research item first."); return; }

    const payload = {
      research_item_id: researchItemId,
      claim_text: formData.get("claim_text"),
      status: formData.get("status") || "unverified",
      jurisdiction_id: formData.get("jurisdiction_id") || null,
      valid_from: formData.get("valid_from") || null,
      valid_until: formData.get("valid_until") || null,
    };

    try {
      const res = await fetch("/en/api/v1/research-claims/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        form.reset();
        form.querySelector("[name='research_item_id']").value = researchItemId;
        loadResearchClaimsTable(researchItemId);
      } else {
        alert(data.error || "Could not create claim");
      }
    } catch { alert("Network error"); }
  });
}

// Shows the claims/sources panel for the research item currently
// loaded into the edit form — called from editResearch() once a
// research item (which must already have an id) is loaded.
function showResearchClaimsPanel(researchItemId, title) {
  const section = document.getElementById("researchClaimsSection");
  if (!section) return;
  document.getElementById("researchClaimsItemTitle").textContent = title || "";
  document.getElementById("researchClaimItemId").value = researchItemId;
  populateCountrySelect(document.getElementById("researchClaimJurisdictionSelect"));
  fetchSourcesCached(true);
  section.style.display = "";
  loadResearchClaimsTable(researchItemId);
}

function hideResearchClaimsPanel() {
  const section = document.getElementById("researchClaimsSection");
  if (section) section.style.display = "none";
}

// ============================================
// RESEARCH RELATIONSHIPS (Phase 3)
// ============================================

const RESEARCH_RELATION_TYPES = [
  "covers", "located_in", "operates_in", "regulated_by", "regulates",
  "licensed_by", "requires", "uses", "related_to", "part_of", "contains",
  "updates", "supersedes", "superseded_by", "cites", "supports",
  "contradicts", "derived_from", "mentions", "affects", "affected_by",
  "applies_to", "available_in", "restricted_in"
];

function populateRelationTypeSelect() {
  const select = document.getElementById("researchRelationTypeSelect");
  if (!select || select.dataset.loaded === "true") return;
  select.innerHTML = RESEARCH_RELATION_TYPES.map(t => `<option value="${t}">${t.replace(/_/g, " ")}</option>`).join("");
  select.dataset.loaded = "true";
}

async function loadResearchRelationsTable(researchItemId) {
  const tbody = document.getElementById("researchRelationsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch(`/en/api/v1/research-relations/list-for-entity?type=research_item&id=${researchItemId}`);
    const data = await res.json();
    const relations = (data.relations || []).filter(r => r.target && r.target.exists);

    if (relations.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="muted">No relationships yet.</td></tr>';
      return;
    }

    tbody.innerHTML = relations.map(r => `
      <tr>
        <td>${r.relation_type.replace(/_/g, " ")}</td>
        <td>${r.target.label || "—"} <span class="muted" style="font-size:12px">(${r.target.type})</span></td>
        <td class="table-actions">
          <button class="btn btn--danger btn--sm" onclick="deleteResearchRelation(${r.id}, ${researchItemId})">Remove</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteResearchRelation(id, researchItemId) {
  if (!confirm("Remove this relationship?")) return;
  try {
    const res = await fetch("/en/api/v1/research-relations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) loadResearchRelationsTable(researchItemId);
    else alert(data.error || "Could not remove relationship");
  } catch { alert("Network error"); }
}

let _relationEntitySearchTimer = null;

function initResearchRelationEntitySearch() {
  const input = document.getElementById("researchRelationEntitySearch");
  const resultsBox = document.getElementById("researchRelationEntityResults");
  if (!input || !resultsBox || input.dataset.wired === "true") return;
  input.dataset.wired = "true";

  input.addEventListener("input", () => {
    clearTimeout(_relationEntitySearchTimer);
    const q = input.value.trim();
    document.getElementById("researchRelationSubmitBtn").disabled = true;
    document.getElementById("researchRelationToType").value = "";
    document.getElementById("researchRelationToId").value = "";
    document.getElementById("researchRelationEntitySelected").textContent = "";

    if (q.length < 2) { resultsBox.style.display = "none"; resultsBox.innerHTML = ""; return; }

    _relationEntitySearchTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/en/api/v1/research-relations/search-entities?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const results = data.results || [];
        if (results.length === 0) {
          resultsBox.innerHTML = '<div class="admin-autocomplete-empty muted">No matches</div>';
          resultsBox.style.display = "";
          return;
        }
        resultsBox.innerHTML = results.map((r, i) => `
          <div class="admin-autocomplete-item" data-idx="${i}" style="cursor:pointer;padding:6px 8px">
            ${r.label} <span class="muted" style="font-size:12px">(${r.type})</span>
          </div>
        `).join("");
        resultsBox.style.display = "";
        resultsBox.querySelectorAll("[data-idx]").forEach(el => {
          el.addEventListener("click", () => {
            const picked = results[parseInt(el.dataset.idx)];
            document.getElementById("researchRelationToType").value = picked.type;
            document.getElementById("researchRelationToId").value = picked.id;
            document.getElementById("researchRelationEntitySelected").textContent = `Selected: ${picked.label} (${picked.type})`;
            input.value = picked.label;
            resultsBox.style.display = "none";
            document.getElementById("researchRelationSubmitBtn").disabled = false;
          });
        });
      } catch { resultsBox.style.display = "none"; }
    }, 300);
  });
}

function initResearchRelationForm() {
  const form = document.getElementById("researchRelationForm");
  if (!form) return;

  populateRelationTypeSelect();
  initResearchRelationEntitySearch();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fromId = parseInt(document.getElementById("researchRelationFromId").value);
    const toType = document.getElementById("researchRelationToType").value;
    const toId = document.getElementById("researchRelationToId").value;
    const relationType = document.getElementById("researchRelationTypeSelect").value;
    if (!fromId || !toType || !toId || !relationType) return;

    try {
      const res = await fetch("/en/api/v1/research-relations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_type: "research_item", from_id: fromId, to_type: toType, to_id: toId, relation_type: relationType }),
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById("researchRelationEntitySearch").value = "";
        document.getElementById("researchRelationEntitySelected").textContent = "";
        document.getElementById("researchRelationToType").value = "";
        document.getElementById("researchRelationToId").value = "";
        document.getElementById("researchRelationSubmitBtn").disabled = true;
        loadResearchRelationsTable(fromId);
      } else {
        alert(data.error || "Could not add relationship");
      }
    } catch { alert("Network error"); }
  });
}

function showResearchRelationsPanel(researchItemId, title) {
  const section = document.getElementById("researchRelationsSection");
  if (!section) return;
  document.getElementById("researchRelationsItemTitle").textContent = title || "";
  document.getElementById("researchRelationFromId").value = researchItemId;
  populateRelationTypeSelect();
  section.style.display = "";
  loadResearchRelationsTable(researchItemId);
}

function hideResearchRelationsPanel() {
  const section = document.getElementById("researchRelationsSection");
  if (section) section.style.display = "none";
}

// ============================================
// RESEARCH VERSION HISTORY (Phase 4)
// ============================================

const FIELD_LABELS = {
  type: "Type", slug: "Slug", title: "Title", subtitle: "Subtitle", excerpt: "Excerpt",
  content_json: "Content sections", country_id: "Country", author_id: "Author",
  status: "Status", published: "Published", robots: "Robots", seo_title: "SEO title",
  seo_description: "SEO description", seo_keywords: "SEO keywords",
  canonical_url: "Canonical URL", og_image: "OG image", featured: "Featured"
};

function truncateForDiff(value) {
  const str = value === null || value === undefined ? "(empty)" : String(value);
  return str.length > 140 ? str.slice(0, 140) + "…" : str;
}

async function loadResearchVersionsTable(researchItemId) {
  const tbody = document.getElementById("researchVersionsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch(`/en/api/v1/research-versions/list-for-item?research_item_id=${researchItemId}`);
    const data = await res.json();
    const versions = data.versions || [];

    if (versions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No versions yet — versions are saved once this item is published.</td></tr>';
      return;
    }

    tbody.innerHTML = versions.map(v => `
      <tr>
        <td>v${v.version_number}</td>
        <td>${(v.created_at || "").replace("T", " ").slice(0, 16)}</td>
        <td>${v.changed_by || "—"}</td>
        <td>${v.restored_from_version ? `<span class="badge badge-dim">Restored from v${v.restored_from_version}</span>` : (v.change_summary || "—")}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="viewResearchVersionDiff(${v.id})">View changes</button>
          <button class="btn btn--danger btn--sm" onclick="restoreResearchVersion(${v.id}, ${researchItemId}, ${v.version_number})">Restore</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function viewResearchVersionDiff(versionId) {
  const box = document.getElementById("researchVersionDiffBox");
  const content = document.getElementById("researchVersionDiffContent");
  if (!box || !content) return;
  content.innerHTML = "Loading...";
  box.style.display = "";
  try {
    const res = await fetch(`/en/api/v1/research-versions/diff?id=${versionId}&compare_to=current`);
    const data = await res.json();
    const changes = data.changes || [];
    if (changes.length === 0) {
      content.innerHTML = '<p class="muted">No differences from the current version.</p>';
      return;
    }
    content.innerHTML = changes.map(c => `
      <div style="margin-bottom:10px">
        <strong>${FIELD_LABELS[c.field] || c.field}</strong>
        <div style="display:flex;gap:12px;margin-top:4px">
          <div style="flex:1;color:#d97676"><span class="muted" style="font-size:11px">This version</span><br>${truncateForDiff(c.before)}</div>
          <div style="flex:1;color:#7fbf7f"><span class="muted" style="font-size:11px">Current</span><br>${truncateForDiff(c.after)}</div>
        </div>
      </div>
    `).join("");
  } catch {
    content.innerHTML = '<p class="muted">Failed to load diff.</p>';
  }
}

async function restoreResearchVersion(versionId, researchItemId, versionNumber) {
  if (!confirm(`Restore version ${versionNumber}? This overwrites the current content (a new version recording this restore will be saved).`)) return;
  try {
    const res = await fetch("/en/api/v1/research-versions/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: versionId }),
    });
    const data = await res.json();
    if (data.success) {
      alert("Restored. Reloading the form with the restored content...");
      await editResearch(researchItemId);
    } else {
      alert(data.error || "Could not restore version");
    }
  } catch { alert("Network error"); }
}

function showResearchVersionsPanel(researchItemId, title) {
  const section = document.getElementById("researchVersionsSection");
  if (!section) return;
  document.getElementById("researchVersionsItemTitle").textContent = title || "";
  document.getElementById("researchVersionDiffBox").style.display = "none";
  section.style.display = "";
  loadResearchVersionsTable(researchItemId);
}

function hideResearchVersionsPanel() {
  const section = document.getElementById("researchVersionsSection");
  if (section) section.style.display = "none";
}

// ============================================
// RESEARCH REVIEW QUEUE (Phase 5)
// ============================================

const REVIEW_QUEUE_CATEGORIES = [
  { key: "overdue_verification", label: "Overdue verification", countKey: "overdueVerification" },
  { key: "broken_sources", label: "Broken sources", countKey: "brokenSources" },
  { key: "stale_sources", label: "Stale sources", countKey: "staleSources" },
  { key: "missing_citations", label: "Missing citations", countKey: "missingCitations" },
  { key: "missing_seo", label: "Missing SEO", countKey: "missingSeo" },
  { key: "orphan_relations", label: "Broken relationships", countKey: "orphanRelations" },
];

async function loadReviewQueueSummary() {
  const cardsEl = document.getElementById("reviewQueueCards");
  if (!cardsEl) return;
  try {
    const res = await fetch("/en/api/v1/research-review-queue/summary");
    const data = await res.json();
    const counts = data.counts || {};
    cardsEl.innerHTML = REVIEW_QUEUE_CATEGORIES.map(cat => `
      <div class="admin-card" style="cursor:pointer;padding:16px;border:1px solid var(--border,#333);border-radius:6px" onclick="loadReviewQueueDetail('${cat.key}', '${cat.label}')">
        <div style="font-size:28px;font-weight:600">${counts[cat.countKey] ?? 0}</div>
        <div class="muted">${cat.label}</div>
      </div>
    `).join("");
  } catch {
    cardsEl.innerHTML = '<div class="muted">Failed to load.</div>';
  }
}

function reviewQueueItemLink(item) {
  if (item.type && item.slug) return `/en/research/${item.type}/${item.slug}`;
  return null;
}

async function loadReviewQueueDetail(category, label) {
  const detailEl = document.getElementById("reviewQueueDetail");
  if (!detailEl) return;
  detailEl.innerHTML = `<h2>${label}</h2><p class="muted">Loading...</p>`;
  try {
    const res = await fetch(`/en/api/v1/research-review-queue/list?category=${category}`);
    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      detailEl.innerHTML = `<h2>${label}</h2><p class="muted">Nothing here — all clear.</p>`;
      return;
    }

    let rows = "";
    if (category === "broken_sources" || category === "stale_sources") {
      rows = items.map(s => `
        <tr>
          <td><strong>${s.organisation}</strong>${s.title ? `<br><span class="muted" style="font-size:12px">${s.title}</span>` : ""}</td>
          <td>${s.url ? `<a href="${s.url}" target="_blank" rel="nofollow noopener">${s.url}</a>` : "—"}</td>
          <td>${(s.accessed_at || "never").toString().replace("T", " ").slice(0, 16)}</td>
          <td class="table-actions"><button class="btn btn--ghost btn--sm" onclick="checkSourceHealthNow(${s.id}, '${category}', '${label.replace(/'/g, "\\'")}')">Check now</button></td>
        </tr>
      `).join("");
      detailEl.innerHTML = `
        <h2>${label}</h2>
        <table class="admin-table">
          <thead><tr><th>Source</th><th>URL</th><th>Last checked</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      return;
    }

    if (category === "orphan_relations") {
      rows = items.map(r => `
        <tr>
          <td>${r.from_type}:${r.from_id}</td>
          <td>${r.relation_type.replace(/_/g, " ")}</td>
          <td>${r.unresolved_target} <span class="muted" style="font-size:12px">(no longer exists)</span></td>
          <td class="table-actions"><button class="btn btn--danger btn--sm" onclick="deleteOrphanRelation(${r.id})">Remove</button></td>
        </tr>
      `).join("");
      detailEl.innerHTML = `
        <h2>${label}</h2>
        <table class="admin-table">
          <thead><tr><th>From</th><th>Relation</th><th>Missing target</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      return;
    }

    // overdue_verification, missing_citations, missing_seo — all research_items rows
    rows = items.map(item => {
      const link = reviewQueueItemLink(item);
      return `
        <tr>
          <td>${link ? `<a href="${link}" target="_blank">${item.title}</a>` : item.title}</td>
          <td>${item.type || "—"}</td>
          <td>${(item.next_review_at || "").toString().replace("T", " ").slice(0, 16) || "—"}</td>
        </tr>
      `;
    }).join("");
    detailEl.innerHTML = `
      <h2>${label}</h2>
      <table class="admin-table">
        <thead><tr><th>Title</th><th>Type</th><th>Next review</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch {
    detailEl.innerHTML = `<h2>${label}</h2><p class="muted">Failed to load.</p>`;
  }
}

async function checkSourceHealthNow(sourceId, category, label) {
  try {
    const res = await fetch("/en/api/v1/research-sources/check-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sourceId }),
    });
    const data = await res.json();
    if (data.success) {
      loadReviewQueueDetail(category, label);
      loadReviewQueueSummary();
    } else {
      alert(data.error || "Health check failed");
    }
  } catch { alert("Network error"); }
}

async function deleteOrphanRelation(id) {
  if (!confirm("Remove this broken relationship?")) return;
  try {
    const res = await fetch("/en/api/v1/research-relations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) {
      loadReviewQueueDetail("orphan_relations", "Broken relationships");
      loadReviewQueueSummary();
    } else {
      alert(data.error || "Could not remove");
    }
  } catch { alert("Network error"); }
}

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

async function deleteReview(slug) {
  if (!confirm(`Delete review "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/review/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadReviewsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}


async function deletePage(slug) {
  if (!confirm(`Delete page "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/page/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadPagesTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

async function deleteNewsArticle(slug) {
  if (!confirm(`Delete news article "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/news/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadNewsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}


// ── Review Edit ──

async function editReview(slug) {
  try {
    const res = await fetch("/en/api/v1/reviews/list");
    const data = await res.json();
    const review = (data.reviews || []).find(r => r.slug === slug);
    if (!review) return;
    const form = document.getElementById("reviewForm");
    form.querySelector("[name='id']").value = review.id || review.slug;
    form.querySelector("[name='slug']").value = review.slug;
    form.querySelector("[name='casino_slug']").value = review.casino_slug || "";
    form.querySelector("[name='country_code']").value = review.country_code || "";
    form.querySelector("[name='rating']").value = review.rating || 0;
    form.querySelector("[name='title']").value = review.title;
    form.querySelector("[name='overview']").value = review.overview || "";
    form.querySelector("[name='games']").value = review.games || "";
    form.querySelector("[name='bonuses']").value = review.bonuses || "";
    form.querySelector("[name='payments']").value = review.payments || "";
    form.querySelector("[name='licenses']").value = review.licenses || "";
    form.querySelector("[name='verdict']").value = review.verdict || "";

    form.querySelector("[name='content']").value = review.content || "";
   // setTimeout(() => {
     // RichEditor.set("review-overview", review.content || "");
   // }, 300); 
setTimeout(() => {

  RichEditor.set(
    "review-overview",
    review.overview || ""
  );

  RichEditor.set(
    "review-games",
    review.games || ""
  );

  RichEditor.set(
    "review-bonuses",
    review.bonuses || ""
  );

  RichEditor.set(
    "review-payments",
    review.payments || ""
  );

  RichEditor.set(
    "review-licenses",
    review.licenses || ""
  );

  RichEditor.set(
    "review-verdict",
    review.verdict || ""
  );

  RichEditor.set(
    "review-content",
    review.content || ""
  );

}, 300);

    let pros = [];
    try { pros = JSON.parse(review.pros || "[]"); } catch {}
    form.querySelector("[name='pros']").value = pros.join("\n");
    let cons = [];
    try { cons = JSON.parse(review.cons || "[]"); } catch {}
    form.querySelector("[name='cons']").value = cons.join("\n");
    form.querySelector("[name='faq_json']").value = review.faq_json || "[]";
    form.querySelector("[name='seo_title']").value = review.seo_title || "";
    form.querySelector("[name='seo_description']").value = review.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = review.seo_keywords || "";
        // Set author dropdown
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = review.author_id || "";

    document.getElementById("reviewSubmitBtn").textContent = "Update Review";
    document.getElementById("reviewCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load review"); }
}

function cancelReviewEdit() {
  const form = document.getElementById("reviewForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("reviewSubmitBtn").textContent = "Create Review";
  document.getElementById("reviewCancelEdit").style.display = "none";
  RichEditor.set("review-overview", "");
}


// ── News Edit ──
async function editNews(slug) {
  try {
    const res = await fetch("/en/api/v1/news/list");
    const data = await res.json();
    const article = (data.news || []).find(n => n.slug === slug);
    if (!article) return;
    const form = document.getElementById("newsForm");

    form.querySelector("[name='id']").value = article.id;
    form.querySelector("[name='slug']").value = article.slug;
    form.dataset.slug = article.slug;
    form.querySelector("[name='author']").value = article.author || "Admin";
    form.querySelector("[name='title']").value = article.title;

    const excerptField = form.querySelector("[name='excerpt']");
    if (excerptField) excerptField.value = article.excerpt || "";

    const tagsField = form.querySelector("[name='tags']");
    if (tagsField) tagsField.value = article.tags || "";

    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = article.author_id || "";

    form.querySelector("[name='content']").value = article.content || "";
    setTimeout(() => {
      if (window.RichEditor && typeof RichEditor.set === "function") {
        RichEditor.set("news-content", article.content || "");
      }
    }, 300);

    // Featured image
    if (article.featured_image && (article.featured_image_url || article.featured_image_thumbnail)) {
      setNewsFeaturedImage(
        article.featured_image,
        article.featured_image_url || article.featured_image_thumbnail,
        article.featured_image_alt || article.title || "Featured image"
      );
    } else {
      clearNewsFeaturedImage();
    }

    // OG image (optional — independent of Featured Image)
    if (article.og_image && (article.og_image_url || article.og_image_thumbnail)) {
      setNewsOgImage(
        article.og_image,
        article.og_image_url || article.og_image_thumbnail,
        article.og_image_alt || ""
      );
    } else {
      clearNewsOgImage();
    }

    // SEO
    form.querySelector("[name='seo_title']").value = article.seo_title || "";
    form.querySelector("[name='seo_description']").value = article.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = article.seo_keywords || "";

    // Publishing
    const publishedSelect = form.querySelector("[name='published']");
    if (publishedSelect) publishedSelect.value = article.published ? "1" : "0";

    const publishedAtInput = form.querySelector("[name='published_at']");
    if (publishedAtInput) {
      publishedAtInput.value = article.published_at ? toDatetimeLocal(article.published_at) : "";
    }

    const aiGeneratedSelect = form.querySelector("[name='ai_generated']");
    if (aiGeneratedSelect) aiGeneratedSelect.value = article.ai_generated ? "1" : "0";

    document.getElementById("newsSubmitBtn").textContent = "Update Article";
    document.getElementById("newsCancelEdit").style.display = "";
    document.getElementById("newsFormTitle").textContent = "Edit News Article";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load article"); }
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}


async function editNewsbackup(slug) {
  try {
    const res = await fetch("/en/api/v1/news/list");
    const data = await res.json();
    const article = (data.news || []).find(n => n.slug === slug);
    if (!article) return;
    const form = document.getElementById("newsForm");
    form.querySelector("[name='id']").value = article.id;
    form.querySelector("[name='slug']").value = article.slug;
    form.dataset.slug = article.slug;
    form.querySelector("[name='author']").value = article.author || "Admin";
    form.querySelector("[name='title']").value = article.title;
    form.querySelector("[name='content']").value = article.content || "";
    setTimeout(() => {
      RichEditor.set("news-content", article.content || "");
    }, 300);
    form.querySelector("[name='seo_title']").value = article.seo_title || "";
    form.querySelector("[name='seo_description']").value = article.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = article.seo_keywords || "";
        // Set author dropdown
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = article.author_id || "";

    document.getElementById("newsSubmitBtn").textContent = "Update Article";
    document.getElementById("newsCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load article"); }
}

function cancelNewsEdit() {
  const form = document.getElementById("newsForm");
  form.reset();
  form.dataset.slug = "";
  form.querySelector("[name='id']").value = "";
  clearNewsFeaturedImage();
  if (window.RichEditor && typeof RichEditor.set === "function") {
    RichEditor.set("news-content", "");
  }
  document.getElementById("newsSubmitBtn").textContent = "Create Article";
  document.getElementById("newsCancelEdit").style.display = "none";
  document.getElementById("newsFormTitle").textContent = "Add News Article";
}


function cancelNewsEdibackupt() {
  const form = document.getElementById("newsForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("newsSubmitBtn").textContent = "Create Article";
  document.getElementById("newsCancelEdit").style.display = "none";
  RichEditor.set("news-content", "");
}




// ── Page Edit new ──
async function editPage(slug) {
  try {
    const res = await fetch("/en/api/v1/pages/list");
    const data = await res.json();

    const page = (data.pages || []).find(p => p.slug === slug);
    if (!page) return;

    const form = document.getElementById("pageForm");
    if (!form) return;

    // Basic fields
    form.querySelector("[name='id']").value = page.id || "";
    form.querySelector("[name='slug']").value = page.slug || "";
    form.querySelector("[name='type']").value = page.type || "page";
    form.querySelector("[name='template']").value = page.template || "page";
    form.querySelector("[name='title']").value = page.title || "";

    // ==========================================
    // CONTENT
    // Supports old JSON + new HTML
    // ==========================================

    let pageContent = page.content_json || "";

    // If stored as JSON string, parse it
    if (typeof pageContent === "string") {
      const trimmed = pageContent.trim();

      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          pageContent = JSON.parse(trimmed);
        } catch {
          // Keep as normal HTML/text
        }
      }
    }

    // If old content is an object/array
    if (typeof pageContent === "object" && pageContent !== null) {

      // Most likely old structures
      pageContent =
        pageContent.html ??
        pageContent.content ??
        pageContent.body ??
        pageContent.text ??
        pageContent.value ??
        pageContent.description ??
        "";

      // If the selected value is still an object/array,
      // convert its useful values to editor content
      if (typeof pageContent === "object" && pageContent !== null) {
        pageContent = Array.isArray(pageContent)
          ? pageContent
              .map(item =>
                typeof item === "string"
                  ? item
                  : item.html ||
                    item.content ||
                    item.body ||
                    item.text ||
                    ""
              )
              .filter(Boolean)
              .join("\n")
          : pageContent.html ||
            pageContent.content ||
            pageContent.body ||
            pageContent.text ||
            "";
      }
    }

    // Final safety
    pageContent = String(pageContent || "");

    console.log("Original:", page.content_json);
    console.log("Editor content:", pageContent);

    // Keep textarea/hidden field synchronized
    const contentField = form.querySelector(
      "[name='content_json']"
    );

    if (contentField) {
      contentField.value = pageContent;
    }

    // ==========================================
    // RICH EDITOR
    // ==========================================

    const setEditor = () => {
      if (
        window.RichEditor &&
        typeof RichEditor.set === "function"
      ) {
        RichEditor.set("page-content", pageContent);
      }
    };

    setEditor();
    setTimeout(setEditor, 300);
    setTimeout(setEditor, 800);

    // SEO
    form.querySelector("[name='seo_title']").value =
      page.seo_title || "";

    form.querySelector("[name='seo_description']").value =
      page.seo_description || "";

    form.querySelector("[name='seo_keywords']").value =
      page.seo_keywords || "";

    // Author
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) {
      authorSelect.value = page.author_id || "";
    }

    // Edit mode
    document.getElementById("pageSubmitBtn").textContent =
      "Update Page";

    document.getElementById("pageCancelEdit").style.display = "";

    window.scrollTo({
      top: form.offsetTop - 100,
      behavior: "smooth"
    });

  } catch (err) {
    console.error("Failed to load page:", err);
    alert("Failed to load page");
  }
}

// ── Page Edit legacy ──


async function editPagebackup(slug) {
  try {
    const res = await fetch("/en/api/v1/pages/list");
    const data = await res.json();
    const page = (data.pages || []).find(p => p.slug === slug);
    if (!page) return;
    const form = document.getElementById("pageForm");
    form.querySelector("[name='id']").value = page.id;
    form.querySelector("[name='slug']").value = page.slug;
    form.querySelector("[name='type']").value = page.type || "page";
    form.querySelector("[name='template']").value = page.template || "page";
    form.querySelector("[name='title']").value = page.title;

    let pageContent = page.content_json || "";

    // Convert JSON content into plain editor content
    if (typeof pageContent === "string") {
      try {
        pageContent = JSON.parse(pageContent);
      } catch {
        // Already plain text
      }
    }

    if (pageContent && typeof pageContent === "object") {
      pageContent = pageContent.text || "";
    }

    form.querySelector("[name='content_json']").value = pageContent;

    setTimeout(() => {
      if (window.RichEditor && typeof RichEditor.set === "function") {
        RichEditor.set("page-content", pageContent || "");
      }
    }, 300);
    form.querySelector("[name='seo_title']").value = page.seo_title || "";
    form.querySelector("[name='seo_description']").value = page.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = page.seo_keywords || "";
        // Set author dropdown
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = page.author_id || "";

    document.getElementById("pageSubmitBtn").textContent = "Update Page";
    document.getElementById("pageCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load page"); }
}

function cancelPageEdit() {
  const form = document.getElementById("pageForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("pageSubmitBtn").textContent = "Create Page";
  document.getElementById("pageCancelEdit").style.display = "none";
  RichEditor.set("page-content", "");
}


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

async function loadPaymentMethodsTable() {
  const tbody = document.getElementById("paymentMethodsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/payment-methods/list");
    const data = await res.json();
    const methods = data.payment_methods || [];
    if (methods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No payment methods yet.</td></tr>';
      return;
    }
    tbody.innerHTML = methods.map(m => `
      <tr>
        <td>${m.icon_url ? `<img src="${m.icon_url}" alt="${m.name}" style="width:32px;height:32px;object-fit:contain">` : '<span class="muted">—</span>'}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.slug}</td>
        <td>${m.method_type || "card"}</td>
        <td>${m.status === "draft" || m.published === 0 ? '<span class="badge-dim">Draft</span>' : '<span class="badge-ok">Published</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editPaymentMethod(${m.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deletePaymentMethod('${m.slug}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

async function deletePaymentMethod(slug) {
  if (!confirm(`Delete payment method "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/payment-method/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadPaymentMethodsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initPaymentMethodForm() {
  const form = document.getElementById("paymentMethodForm");
  if (!form) return;

  wireSeoSectionBuilder("payment_method", "pmFormSections", "pmFormAddSectionBtn");

  const selectBtn = document.getElementById("pmSelectIcon");
  const changeBtn = document.getElementById("pmChangeIcon");
  const removeBtn = document.getElementById("pmRemoveIcon");
  if (selectBtn) selectBtn.addEventListener("click", openPaymentMethodIconPicker);
  if (changeBtn) changeBtn.addEventListener("click", openPaymentMethodIconPicker);
  if (removeBtn) removeBtn.addEventListener("click", clearPaymentMethodIcon);

  const saveCasinosBtn = document.getElementById("pmSaveCasinosBtn");
  if (saveCasinosBtn) saveCasinosBtn.addEventListener("click", savePaymentMethodCasinos);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("paymentMethodFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    syncSeoSectionsFromDom("payment_method");
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/payment-method/update" : "/en/api/v1/payment-method/create";

    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      slug: formData.get("slug"),
      name: formData.get("name"),
      icon_url: formData.get("icon_url") || null,
      method_type: formData.get("method_type") || "card",
      description: formData.get("description") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      content_json: { sections: seoPageState.payment_method.sections },
      sort_order: parseInt(formData.get("sort_order") || "0"),
      status: formData.get("status") || "published",
      published: formData.get("published") === "0" ? 0 : 1,
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
          alertEl.textContent = isEdit ? "Payment method updated!" : "Payment method created!";
          alertEl.style.display = "block";
        }
        const wasNew = !isEdit;
        const newSlug = payload.slug;
        form.reset();
        form.querySelector("[name='id']").value = "";
        clearPaymentMethodIcon();
        document.getElementById("paymentMethodSubmitBtn").textContent = "Create Payment Method";
        document.getElementById("paymentMethodCancelEdit").style.display = "none";
        document.getElementById("paymentMethodFormTitle").textContent = "Add Payment Method";
        document.getElementById("pmCasinosGroup").style.display = "none";
        seoPageState.payment_method.sections = [];
        renderSeoSections("payment_method");
        loadPaymentMethodsTable();
        // A brand-new method has nothing to link yet on this same
        // load (its id wasn't known to the form) -- jump straight
        // into editing it so the casino checklist becomes available
        // immediately instead of requiring a second click.
        if (wasNew && newSlug) {
          setTimeout(() => {
            fetch(`/en/api/v1/payment-methods/list`).then(r => r.json()).then(d => {
              const created = (d.payment_methods || []).find(m => m.slug === newSlug);
              if (created) editPaymentMethod(created.id);
            });
          }, 200);
        }
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

function openPaymentMethodIconPicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media) return;
    setPaymentMethodIcon(media.url || media.thumbnail_url || "", media.alt_text || "Payment method icon");
  }, "payments");
}

function setPaymentMethodIcon(url, alt) {
  const urlInput = document.getElementById("pmIconUrl");
  const imgEl = document.getElementById("pmIconImg");
  const preview = document.getElementById("pmIconPreview");
  const selectBtn = document.getElementById("pmSelectIcon");

  if (urlInput) urlInput.value = url || "";
  if (imgEl) { imgEl.src = url || ""; imgEl.alt = alt || ""; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearPaymentMethodIcon() {
  setPaymentMethodIcon("", "");
}

async function editPaymentMethod(id) {
  try {
    const res = await fetch(`/en/api/v1/payment-method/get-by-id?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const m = data.payment_method;
    const form = document.getElementById("paymentMethodForm");
    form.querySelector("[name='id']").value = m.id;
    form.querySelector("[name='slug']").value = m.slug;
    form.querySelector("[name='name']").value = m.name;
    form.querySelector("[name='method_type']").value = m.method_type || "card";
    form.querySelector("[name='sort_order']").value = m.sort_order || 0;
    form.querySelector("[name='seo_title']").value = m.seo_title || "";
    form.querySelector("[name='seo_description']").value = m.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = m.seo_keywords || "";
    form.querySelector("[name='status']").value = m.status || "published";
    form.querySelector("[name='published']").value = m.published === 0 ? "0" : "1";
    setPaymentMethodIcon(m.icon_url || "", m.name);
    setTimeout(() => {
      if (window.RichEditor && typeof RichEditor.set === "function") {
        RichEditor.set("payment-method-description", m.description || "");
      }
    }, 300);

    document.getElementById("paymentMethodSubmitBtn").textContent = "Update Payment Method";
    document.getElementById("paymentMethodCancelEdit").style.display = "";
    document.getElementById("paymentMethodFormTitle").textContent = `Edit — ${m.name}`;

    let content = {};
    try { content = typeof m.content_json === "string" ? JSON.parse(m.content_json) : (m.content_json || {}); } catch (e) {}
    seoPageState.payment_method.sections = Array.isArray(content.sections) ? content.sections : [];
    renderSeoSections("payment_method");
    loadPaymentMethodFormEligibleCasinos(m.slug);

    await loadPaymentMethodCasinoCheckboxes(m.id, m.slug);

    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load payment method"); }
}

async function loadPaymentMethodFormEligibleCasinos(slug) {
  if (!slug) return;
  try {
    const res = await fetch("/en/api/v1/payment-method/eligible-casinos?slug=" + encodeURIComponent(slug));
    const data = await res.json().catch(() => ({}));
    seoPageState.payment_method.eligibleCasinos = data.casinos || [];
  } catch (e) {
    seoPageState.payment_method.eligibleCasinos = [];
  }
  syncSeoSectionsFromDom("payment_method");
  renderSeoSections("payment_method");
}

function cancelPaymentMethodEdit() {
  const form = document.getElementById("paymentMethodForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  clearPaymentMethodIcon();
  document.getElementById("paymentMethodSubmitBtn").textContent = "Create Payment Method";
  document.getElementById("paymentMethodCancelEdit").style.display = "none";
  document.getElementById("paymentMethodFormTitle").textContent = "Add Payment Method";
  document.getElementById("pmCasinosGroup").style.display = "none";
  seoPageState.payment_method.sections = [];
  renderSeoSections("payment_method");
  if (window.RichEditor && typeof RichEditor.set === "function") {
    RichEditor.set("payment-method-description", "");
  }
}

async function loadPaymentMethodCasinoCheckboxes(paymentMethodId, slug) {
  const group = document.getElementById("pmCasinosGroup");
  const list = document.getElementById("pmCasinosList");
  if (!group || !list) return;
  group.style.display = "";
  group.dataset.paymentMethodId = paymentMethodId;
  list.innerHTML = '<span class="muted">Loading casinos...</span>';

  try {
    const [allRes, linkedRes] = await Promise.all([
      fetch("/en/api/v1/casinos/list"),
      fetch(`/en/api/v1/payment-method/casinos?slug=${encodeURIComponent(slug)}`),
    ]);
    const allData = await allRes.json();
    const linkedData = await linkedRes.json();
    const casinos = allData.casinos || [];
    const linkedIds = new Set(linkedData.casino_ids || []);

    if (casinos.length === 0) {
      list.innerHTML = '<span class="muted">No casinos yet.</span>';
      return;
    }

    list.innerHTML = casinos.map(c => `
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400">
        <input type="checkbox" class="pm-casino-checkbox" value="${c.id}" ${linkedIds.has(c.id) ? "checked" : ""}>
        ${c.name}
      </label>
    `).join("");
  } catch {
    list.innerHTML = '<span class="muted">Failed to load casinos.</span>';
  }
}

async function savePaymentMethodCasinos() {
  const group = document.getElementById("pmCasinosGroup");
  const statusEl = document.getElementById("pmCasinosSaveStatus");
  const paymentMethodId = group ? parseInt(group.dataset.paymentMethodId) : null;
  if (!paymentMethodId) return;

  const checked = Array.from(document.querySelectorAll(".pm-casino-checkbox:checked")).map(cb => parseInt(cb.value));

  if (statusEl) statusEl.textContent = "Saving...";
  try {
    const res = await fetch("/en/api/v1/payment-method/set-casinos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_method_id: paymentMethodId, casino_ids: checked }),
    });
    const data = await res.json();
    if (statusEl) statusEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
  } catch {
    if (statusEl) statusEl.textContent = "Network error";
  }
}



/* =========================================================
PLATFORM UPDATES
========================================================= */

async function loadPlatformUpdatesTable() {
const tbody = document.getElementById("updatesTableBody");

if (!tbody) return;

try {
const res = await fetch(
"/en/api/v1/platform-updates/list"
);

const data = await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error || "Failed to load platform updates."
  );
}

const updates = data.updates || [];

if (!updates.length) {
  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="muted">
        No platform updates yet.
      </td>
    </tr>
  `;

  return;
}

tbody.innerHTML = updates.map(update => {

  const published = Number(update.published) === 1;
  const featured = Number(update.featured) === 1;

  const dateValue =
    update.published_at ||
    update.created_at;

  const date = dateValue
    ? new Date(dateValue).toLocaleDateString()
    : "—";

  const author =
    update.author_name ||
    "No author";

  return `
    <tr>

      <td>
        <strong>
          ${escapeHtml(update.title || "Untitled")}
        </strong>

        <div class="muted">
          /updates/${escapeHtml(update.slug || "")}
        </div>
      </td>

      <td>
        ${escapeHtml(author)}
      </td>

      <td>
        ${
          published
            ? '<span class="status status--success">Published</span>'
            : '<span class="status status--muted">Draft</span>'
        }
      </td>

      <td>
        ${
          featured
            ? '<span class="status status--success">Featured</span>'
            : '<span class="muted">No</span>'
        }
      </td>

      <td>
        ${escapeHtml(date)}
      </td>

      <td class="table-actions">

        ${
          published
            ? `
              <a
                href="/en/updates/${encodeURIComponent(update.slug)}"
                class="btn btn--ghost btn--sm"
                target="_blank"
                rel="noopener"
              >
                View
              </a>
            `
            : ""
        }

        <button
          type="button"
          class="btn btn--ghost btn--sm"
          onclick="editPlatformUpdate(${Number(update.id)})"
        >
          Edit
        </button>

        <button
          type="button"
          class="btn btn--danger btn--sm"
          onclick="deletePlatformUpdate(${Number(update.id)})"
        >
          Delete
        </button>

      </td>

    </tr>
  `;
}).join("");

} catch (error) {

console.error(
  "Failed to load platform updates:",
  error
);

tbody.innerHTML = `
  <tr>
    <td colspan="6" class="muted">
      Failed to load platform updates.
    </td>
  </tr>
`;

}
}

/* =========================================================
INITIALIZE FORM
========================================================= */

// ── Platform Update Featured Image (media_library FK, picked via Media Library) ──────
function openUpdateFeaturedImagePicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media || !media.id) return;
    setUpdateFeaturedImage(media.id, media.url || media.thumbnail_url || "", media.alt_text || "");
  }, "updates");
}

function setUpdateFeaturedImage(id, url, alt) {
  const idInput = document.getElementById("updateFeaturedImage");
  const imgEl = document.getElementById("updateFeaturedImageImg");
  const preview = document.getElementById("updateFeaturedImagePreview");
  const selectBtn = document.getElementById("updateSelectFeaturedImage");

  if (idInput) idInput.value = String(id);
  if (imgEl) { imgEl.src = url; imgEl.alt = alt; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearUpdateFeaturedImage() {
  const idInput = document.getElementById("updateFeaturedImage");
  const imgEl = document.getElementById("updateFeaturedImageImg");
  const preview = document.getElementById("updateFeaturedImagePreview");
  const selectBtn = document.getElementById("updateSelectFeaturedImage");

  if (idInput) idInput.value = "";
  if (imgEl) { imgEl.src = ""; imgEl.alt = ""; }
  if (preview) preview.style.display = "none";
  if (selectBtn) selectBtn.style.display = "";
}

function initPlatformUpdateForm() {
const form =
document.getElementById("platformUpdateForm");

if (!form) return;

const ogSelectBtn = document.getElementById("updateSelectFeaturedImage");
const ogChangeBtn = document.getElementById("updateChangeFeaturedImage");
const ogRemoveBtn = document.getElementById("updateRemoveFeaturedImage");
if (ogSelectBtn) ogSelectBtn.addEventListener("click", openUpdateFeaturedImagePicker);
if (ogChangeBtn) ogChangeBtn.addEventListener("click", openUpdateFeaturedImagePicker);
if (ogRemoveBtn) ogRemoveBtn.addEventListener("click", clearUpdateFeaturedImage);

form.addEventListener(
"submit",
async function(event) {

  event.preventDefault();

  const alertEl =
    document.getElementById(
      "platformUpdateFormAlert"
    );

  if (alertEl) {
    alertEl.style.display = "none";
  }

  const formData =
    new FormData(form);

  const id =
    formData.get("id");

  const isEdit =
    Boolean(id);

  const endpoint =
    isEdit
      ? "/en/api/v1/platform-updates/update"
      : "/en/api/v1/platform-updates/create";

  const payload = {
    id: id
      ? Number(id)
      : null,

    slug:
      String(
        formData.get("slug") || ""
      ).trim(),

    title:
      String(
        formData.get("title") || ""
      ).trim(),

    excerpt:
      String(
        formData.get("excerpt") || ""
      ).trim() || null,

    content:
      formData.get("content") || "",

    featured_image:
      formData.get("featured_image")
        ? Number(formData.get("featured_image"))
        : null,

    seo_title:
      String(
        formData.get("seo_title") || ""
      ).trim() || null,

    seo_description:
      String(
        formData.get("seo_description") || ""
      ).trim() || null,

    seo_keywords:
      String(
        formData.get("seo_keywords") || ""
      ).trim() || null,

    author_id:
      formData.get("author_id")
        ? Number(formData.get("author_id"))
        : null,

    published:
      Number(
        formData.get("published") || 0
      ),

    featured:
      Number(
        formData.get("featured") || 0
      ),

    published_at:
      formData.get("published_at")
        || null
  };

  if (!payload.slug) {
    showPlatformUpdateAlert(
      "Slug is required.",
      "error"
    );
    return;
  }

  if (!payload.title) {
    showPlatformUpdateAlert(
      "Title is required.",
      "error"
    );
    return;
  }

  if (!payload.content.trim()) {
    showPlatformUpdateAlert(
      "Content is required.",
      "error"
    );
    return;
  }

  const submitBtn =
    document.getElementById(
      "platformUpdateSubmitBtn"
    );

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent =
      isEdit
        ? "Saving..."
        : "Creating...";
  }

  try {

    const res = await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(payload)
      }
    );

    const data =
      await res.json();

    if (!res.ok || !data.success) {
      throw new Error(
        data.error ||
        "Failed to save platform update."
      );
    }

    showPlatformUpdateAlert(
      isEdit
        ? "Platform update updated successfully."
        : "Platform update created successfully.",
      "success"
    );

    resetPlatformUpdateForm();

    await loadPlatformUpdatesTable();

  } catch (error) {

    console.error(
      "Platform update save error:",
      error
    );

    showPlatformUpdateAlert(
      error.message ||
      "Failed to save platform update.",
      "error"
    );

  } finally {

    if (submitBtn) {
      submitBtn.disabled = false;

      submitBtn.textContent =
        "Create Update";
    }
  }
}

);
}

/* =========================================================
EDIT
========================================================= */

async function editPlatformUpdate(id) {

try {

const res = await fetch(
  "/en/api/v1/platform-updates/list"
);

const data =
  await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error ||
    "Failed to load platform updates."
  );
}

const update =
  (data.updates || [])
    .find(
      item =>
        Number(item.id) === Number(id)
    );

if (!update) {
  showPlatformUpdateAlert(
    "Platform update not found.",
    "error"
  );

  return;
}

const form =
  document.getElementById(
    "platformUpdateForm"
  );

if (!form) return;


form.dataset.id =
  String(update.id);


form.querySelector(
  "[name='id']"
).value =
  update.id;


form.querySelector(
  "[name='slug']"
).value =
  update.slug || "";


form.querySelector(
  "[name='title']"
).value =
  update.title || "";


form.querySelector(
  "[name='excerpt']"
).value =
  update.excerpt || "";


form.querySelector(
  "[name='content']"
).value =
  update.content || "";


if (update.featured_image && (update.featured_image_url || update.featured_image_thumbnail)) {
  setUpdateFeaturedImage(
    update.featured_image,
    update.featured_image_url || update.featured_image_thumbnail,
    update.featured_image_alt || update.title || "Featured image"
  );
} else {
  clearUpdateFeaturedImage();
}


form.querySelector(
  "[name='seo_title']"
).value =
  update.seo_title || "";


form.querySelector(
  "[name='seo_description']"
).value =
  update.seo_description || "";


form.querySelector(
  "[name='seo_keywords']"
).value =
  update.seo_keywords || "";


form.querySelector(
  "[name='author_id']"
).value =
  update.author_id || "";


form.querySelector(
  "[name='published']"
).value =
  Number(update.published) === 1
    ? "1"
    : "0";


form.querySelector(
  "[name='featured']"
).value =
  Number(update.featured) === 1
    ? "1"
    : "0";


const publishedAt =
  form.querySelector(
    "[name='published_at']"
  );

if (publishedAt) {

  publishedAt.value =
    formatDateTimeLocal(
      update.published_at
    );
}


const title =
  document.getElementById(
    "updatesFormTitle"
  );

if (title) {
  title.textContent =
    "Edit Platform Update";
}


const submitBtn =
  document.getElementById(
    "platformUpdateSubmitBtn"
  );

if (submitBtn) {
  submitBtn.textContent =
    "Save Changes";
}


const cancelBtn =
  document.getElementById(
    "platformUpdateCancelBtn"
  );

if (cancelBtn) {
  cancelBtn.style.display =
    "inline-flex";
}

setTimeout(() => {
  RichEditor.set(
    "platform-update-content",
    update.content || ""
  );
}, 300);


form.scrollIntoView({
  behavior: "smooth",
  block: "start"
});

} catch (error) {

console.error(
  "Platform update edit error:",
  error
);

showPlatformUpdateAlert(
  error.message ||
  "Failed to load platform update.",
  "error"
);

}
}

/* =========================================================
DELETE
========================================================= */

async function deletePlatformUpdate(id) {

if (!confirm(
"Delete this platform update permanently?"
)) {
return;
}

try {

const res = await fetch(
  "/en/api/v1/platform-updates/delete",
  {
    method: "POST",

    headers: {
      "Content-Type":
        "application/json"
    },

    body:
      JSON.stringify({
        id: Number(id)
      })
  }
);

const data =
  await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error ||
    "Delete failed."
  );
}

await loadPlatformUpdatesTable();

showPlatformUpdateAlert(
  "Platform update deleted.",
  "success"
);

} catch (error) {

console.error(
  "Platform update delete error:",
  error
);

showPlatformUpdateAlert(
  error.message ||
  "Failed to delete platform update.",
  "error"
);

}
}

/* =========================================================
CANCEL EDIT
========================================================= */

function cancelPlatformUpdateEdit() {
resetPlatformUpdateForm();
}

/* =========================================================
RESET FORM
========================================================= */

function resetPlatformUpdateForm() {

const form =
document.getElementById(
"platformUpdateForm"
);

if (!form) return;

form.reset();

clearUpdateFeaturedImage();

form.dataset.id = "";

const id =
form.querySelector(
"[name='id']"
);

if (id) {
id.value = "";
}

const title =
document.getElementById(
"updatesFormTitle"
);

if (title) {
title.textContent =
"Add Platform Update";
}

const submitBtn =
document.getElementById(
"platformUpdateSubmitBtn"
);

if (submitBtn) {
submitBtn.textContent =
"Create Update";
}

const cancelBtn =
document.getElementById(
"platformUpdateCancelBtn"
);

if (cancelBtn) {
cancelBtn.style.display =
"none";
}

const alertEl =
document.getElementById(
"platformUpdateFormAlert"
);

if (alertEl) {
alertEl.style.display =
"none";
}
}

/* =========================================================
ALERT
========================================================= */
function showPlatformUpdateAlert(message, type = "error") {
  const alertEl = document.getElementById(
    "platformUpdateFormAlert"
  );

  if (!alertEl) return;

  alertEl.className =
    type === "success"
      ? "alert alert--success"
      : "alert alert--error";

  alertEl.textContent = message;
  alertEl.style.display = "block";

  clearTimeout(window.platformUpdateAlertTimer);

  window.platformUpdateAlertTimer = setTimeout(() => {
    alertEl.style.display = "none";
  }, 5000);
}
function showPlatformUpdateAlertbackup(
message,
type = "error"
) {

const alertEl =
document.getElementById(
"platformUpdateFormAlert"
);

if (!alertEl) return;

alertEl.className =
type === "success"
? "alert alert--success"
: "alert alert--error";

alertEl.textContent =
message;

alertEl.style.display =
"block";
}

/* =========================================================
DATETIME HELPER
========================================================= */

function formatDateTimeLocal(value) {

if (!value) return "";

const date =
new Date(value);

if (Number.isNaN(date.getTime())) {
return "";
}

const pad =
number =>
String(number).padStart(2, "0");

return (
date.getFullYear() +
"-" +
pad(date.getMonth() + 1) +
"-" +
pad(date.getDate()) +
"T" +
pad(date.getHours()) +
":" +
pad(date.getMinutes())
);
}

/* =========================================================
HTML ESCAPE
========================================================= */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function escapeHtmlbackup(value) {

return String(value ?? "")
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">")
.replace(/"/g, '&quot;')
.replace(/'/g, "'");
}


/* =========================================================
INITIALIZE
========================================================= */

document.addEventListener(
"DOMContentLoaded",
function() {

if (
  document.getElementById(
    "platformUpdateForm"
  )
) {

  initPlatformUpdateForm();

  loadPlatformUpdatesTable();
}

}
);










// ============================================================
// AD RULES MANAGEMENT
// ============================================================

var adComponentsCache = [];

async function loadAdComponentsForRules() {
  try {
    var res = await fetch('/en/api/v1/components/list?type=ad', { credentials: 'same-origin' });
    if (!res.ok) return [];
    var data = await res.json();
    adComponentsCache = data.components || [];
    return adComponentsCache;
  } catch (e) {
    return [];
  }
}

async function loadAdRules() {
  var container = document.getElementById('adRulesContainer');
  if (!container) return;

  try {
    var [rulesRes, components] = await Promise.all([
      fetch('/en/api/v1/ad-rules/list', { credentials: 'same-origin' }),
      loadAdComponentsForRules()
    ]);

    if (!rulesRes.ok) throw new Error('Failed to load');
    var data = await rulesRes.json();
    var rules = data.rules || [];

    if (rules.length === 0) {
      container.innerHTML = '<p class="muted">No automatic ad rules configured. Click "Add Automatic Ad Rule" to create one.</p>';
      return;
    }

    container.innerHTML = rules.map(function(rule) {
      var isEnabled = rule.enabled === 1;
      var badgeClass = isEnabled ? 'ad-badge-active' : 'ad-badge-inactive';
      var badgeText = isEnabled ? 'Active' : 'Disabled';

      var placementLabel = {
        'after_paragraph': 'After paragraph ' + rule.position_value,
        'before_paragraph': 'Before paragraph ' + rule.position_value,
        'end_of_article': 'End of article',
        'before_article': 'Before article',
        'after_heading': 'After first heading',
        'before_heading': 'Before first heading',
        'after_first_image': 'After first image',
        'middle_of_article': 'Middle of article'
      }[rule.placement] || rule.placement;

      var repeatText = rule.repeat_interval > 0
        ? ' (repeat every ' + rule.repeat_interval + ' paragraphs, max ' + rule.max_appearances + ')'
        : '';

      var deviceLabel = rule.devices === 'all' ? 'All devices' : rule.devices;
      var countryLabel = rule.countries === 'all' ? 'All countries' : rule.countries;
      var pageLabel = rule.page_type === 'all' ? 'All pages' : rule.page_type;
      var scheduleLabel = '';
      if (rule.start_date || rule.end_date) {
        scheduleLabel = ' · Schedule: ' + (rule.start_date || '—') + ' to ' + (rule.end_date || '—');
      }

      return '<div class="ad-rule-card" data-rule-id="' + rule.id + '" style="padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<div>' +
        '<strong>' + escapeHtmlSafe(rule.component_name || 'Unknown') + '</strong>' +
        ' <span class="' + badgeClass + '" style="font-size:11px;padding:2px 8px;border-radius:999px;margin-left:8px">' + badgeText + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn--secondary ad-rule-edit" data-id="' + rule.id + '">Edit</button>' +
        '<button type="button" class="btn btn--danger ad-rule-delete" data-id="' + rule.id + '">Delete</button>' +
        '</div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--gray);line-height:1.6">' +
        '<div>📍 ' + placementLabel + repeatText + '</div>' +
        '<div>📱 ' + deviceLabel + ' · 🌍 ' + countryLabel + ' · 📄 ' + pageLabel + '</div>' +
        '<div>⚡ Priority: ' + rule.priority + scheduleLabel + '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.ad-rule-edit').forEach(function(btn) {
      btn.addEventListener('click', function() { editAdRule(this.getAttribute('data-id')); });
    });
    container.querySelectorAll('.ad-rule-delete').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteAdRule(this.getAttribute('data-id'), this); });
    });

  } catch (e) {
    container.innerHTML = '<p class="muted" style="color:red">Error loading ad rules.</p>';
  }
}

function openAdRuleModal(ruleId) {
  var modal = document.getElementById('adRuleModal');
  var title = document.getElementById('adRuleModalTitle');
  var componentSelect = document.getElementById('adRuleComponent');

  // Populate component dropdown
  componentSelect.innerHTML = adComponentsCache.map(function(c) {
    return '<option value="' + c.id + '">' + escapeHtmlSafe(c.name) + ' (/' + escapeHtmlSafe(c.slug) + ')</option>';
  }).join('');

  if (ruleId) {
    title.textContent = 'Edit Ad Rule';
    // Load rule data — fetch from the rules list
    fetch('/en/api/v1/ad-rules/list', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var rule = (data.rules || []).find(function(r) { return r.id == ruleId; });
        if (!rule) return;
        document.getElementById('adRuleId').value = rule.id;
        document.getElementById('adRuleComponent').value = rule.component_id;
        document.getElementById('adRulePlacement').value = rule.placement;
        document.getElementById('adRulePosition').value = rule.position_value;
        document.getElementById('adRuleRepeatInterval').value = rule.repeat_interval;
        document.getElementById('adRuleMaxAppearances').value = rule.max_appearances;
        document.getElementById('adRuleDevices').value = rule.devices;
        document.getElementById('adRuleCountries').value = rule.countries;
        document.getElementById('adRulePageType').value = rule.page_type;
        document.getElementById('adRulePriority').value = rule.priority;
        document.getElementById('adRuleStartDate').value = rule.start_date || '';
        document.getElementById('adRuleEndDate').value = rule.end_date || '';
        document.getElementById('adRuleEnabled').checked = rule.enabled === 1;
      });
  } else {
    title.textContent = 'Create Ad Rule';
    document.getElementById('adRuleId').value = '';
    // Reset form
    document.getElementById('adRulePlacement').value = 'after_paragraph';
    document.getElementById('adRulePosition').value = '3';
    document.getElementById('adRuleRepeatInterval').value = '0';
    document.getElementById('adRuleMaxAppearances').value = '1';
    document.getElementById('adRuleDevices').value = 'all';
    document.getElementById('adRuleCountries').value = 'all';
    document.getElementById('adRulePageType').value = 'all';
    document.getElementById('adRulePriority').value = '100';
    document.getElementById('adRuleStartDate').value = '';
    document.getElementById('adRuleEndDate').value = '';
    document.getElementById('adRuleEnabled').checked = true;
  }

  modal.style.display = 'flex';
}

function closeAdRuleModal() {
  document.getElementById('adRuleModal').style.display = 'none';
}

function editAdRule(id) {
  openAdRuleModal(id);
}

async function saveAdRule() {
  var id = document.getElementById('adRuleId').value;
  var data = {
    component_id: parseInt(document.getElementById('adRuleComponent').value, 10),
    enabled: document.getElementById('adRuleEnabled').checked,
    placement: document.getElementById('adRulePlacement').value,
    position_value: parseInt(document.getElementById('adRulePosition').value, 10),
    repeat_interval: parseInt(document.getElementById('adRuleRepeatInterval').value, 10),
    max_appearances: parseInt(document.getElementById('adRuleMaxAppearances').value, 10),
    devices: document.getElementById('adRuleDevices').value,
    countries: document.getElementById('adRuleCountries').value,
    page_type: document.getElementById('adRulePageType').value,
    priority: parseInt(document.getElementById('adRulePriority').value, 10),
    start_date: document.getElementById('adRuleStartDate').value || null,
    end_date: document.getElementById('adRuleEndDate').value || null
  };

  if (!data.component_id) {
    alert('Please select an advertisement component');
    return;
  }

  var url = id ? '/en/api/v1/ad-rules/update' : '/en/api/v1/ad-rules/create';
  if (id) data.id = parseInt(id, 10);

  try {
    var res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    var result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to save');
    closeAdRuleModal();
    loadAdRules();
    if (typeof showNotification === 'function') {
      showNotification('Ad rule saved', 'success');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function deleteAdRule(id, btn) {
  if (!confirm('Delete this ad rule?')) return;
  try {
    var res = await fetch('/en/api/v1/ad-rules/delete', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(id, 10) })
    });
    if (!res.ok) throw new Error('Failed to delete');
    loadAdRules();
    if (typeof showNotification === 'function') {
      showNotification('Ad rule deleted', 'success');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function escapeHtmlSafe(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wire up on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  var addBtn = document.getElementById('addAdRuleBtn');
  if (addBtn) addBtn.addEventListener('click', function() { openAdRuleModal(null); });

  var saveBtn = document.getElementById('adRuleSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveAdRule);

  var cancelBtn = document.getElementById('adRuleCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeAdRuleModal);

  loadAdRules();
});

/* =========================================================
SEO LANDING PAGES (Country Pages / Category Countries)
========================================================= */

const SEO_PAGE_SECTION_TYPES = ["rich_text", "heading", "image", "casino_grid", "casino_editorial", "casino_spotlights", "faq", "cta", "internal_links"];
const SEO_PAGE_FIELDS_BY_TYPE = {
  rich_text: ["title", "subtitle", "body"],
  heading: ["title"],
  image: ["title", "image_url"],
  casino_grid: ["title", "subtitle", "casino_ids"],
  casino_editorial: ["title", "casino_id", "body"],
  casino_spotlights: ["title", "subtitle", "spotlights"],
  faq: ["title", "faq_json"],
  cta: ["title", "body", "cta_url", "cta_label", "background"],
  internal_links: ["title", "links_json"]
};
const SEO_PAGE_FIELD_LABELS = {
  title: "Title", subtitle: "Subtitle", body: "Body (HTML allowed)",
  image_url: "Image URL", casino_ids: "Casinos (select one or more — type to search)",
  casino_id: "Casino (type to search)", faq_json: "FAQ items (pre-filled with common questions — edit freely, or edit as JSON)",
  cta_url: "Button URL", cta_label: "Button label", background: "Background (CSS color, optional)",
  links_json: 'Links JSON — e.g. [{"label":"...","url":"..."}]',
  spotlights: "Casino spotlights — add one or more casinos, each with its own write-up"
};

// Section data is stored under different keys than the form fields that edit
// it (e.g. the faq_json textarea edits section.items, not section.faq_json).
// Used both to read the current value into the field and, for FAQ, to decide
// when to show the default starter template instead of a blank textarea.
const SEO_SECTION_FIELD_TO_DATA_KEY = {
  faq_json: "items",
  links_json: "links",
  cta_url: "url",
  cta_label: "label"
};

const SEO_PAGE_DEFAULT_FAQ_ITEMS = [
  { q: "Is this casino safe and legal to play at?", a: "" },
  { q: "What payment methods are accepted?", a: "" },
  { q: "Is there a welcome bonus for new players?", a: "" },
  { q: "Can I play on mobile?", a: "" }
];

// State per page type, so Country Pages and Category Countries can
// share all this logic without colliding.
const seoPageState = {
  country_page: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  category_country: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  // Base hub pages (countries.js/categories.js content_json) — no
  // casino_mode/selectedCasinos concept here (the hub page already
  // lists its casinos automatically; these sections are extra
  // editorial content), so only sections + eligibleCasinos matter.
  country: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  category: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  // Payment method hub pages -- same "no casino_mode, just extra
  // editorial sections" shape as country/category above (the page
  // already lists its casinos via the casino_payment_methods join).
  payment_method: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null }
};

function seoCasinoPickerOptionsHtml(prefix, selectedIds) {
  const state = seoPageState[prefix];
  const pool = (state.eligibleCasinos && state.eligibleCasinos.length) ? state.eligibleCasinos :
    state.selectedCasinos.map((c) => ({ id: c.casino_id, name: c.name || ("#" + c.casino_id) }));
  return pool.map((c) =>
    '<option value="' + c.id + '"' + (selectedIds.has(c.id) ? " selected" : "") + '>' + escapeHtml(c.name) + " (#" + c.id + ")" + '</option>'
  ).join("");
}

function seoSectionRowHtml(section, index, prefix) {
  const type = section.type || "rich_text";
  const fields = SEO_PAGE_FIELDS_BY_TYPE[type] || [];
  let html = '<div class="admin-card" data-section-row="' + index + '" style="border:1px solid var(--border-color,#333);border-radius:8px;padding:14px;margin-bottom:10px;">' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
    '<select data-section-type>' + SEO_PAGE_SECTION_TYPES.map((t) => '<option value="' + t + '" ' + (t === type ? "selected" : "") + '>' + t + '</option>').join("") + '</select>' +
    '<label class="muted" style="white-space:nowrap;">Pos <input type="number" data-section-position value="' + (section.position ?? index) + '" style="width:55px;" /></label>' +
    '<button type="button" class="btn btn--ghost" data-remove-section style="margin-left:auto;">Remove</button>' +
    '</div>';
  fields.forEach((f) => {
    // Casino fields: a real picker sourced from this page's eligible/selected
    // casinos, instead of a text box where the editor has to already know
    // (or guess) the numeric casino ID.
    if (f === "casino_id") {
      const selId = section.casino_id ? Number(section.casino_id) : null;
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label>' +
        '<select data-section-field="casino_id"><option value="">— Select a casino —</option>' +
        seoCasinoPickerOptionsHtml(prefix, new Set(selId ? [selId] : [])) + '</select>';
      return;
    }
    if (f === "casino_ids") {
      const selIds = new Set((Array.isArray(section.casino_ids) ? section.casino_ids : []).map(Number));
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label>' +
        '<select data-section-field="casino_ids" multiple size="6" style="min-height:120px;">' +
        seoCasinoPickerOptionsHtml(prefix, selIds) + '</select>' +
        '<p class="muted" style="margin:4px 0 10px;">Ctrl/Cmd-click (or long-press on mobile) to select multiple. Type a letter to jump to a casino by name.</p>';
      return;
    }
    // casino_spotlights: several independent {casino_id, body} pairs
    // inside one section — unlike casino_editorial (always exactly
    // one casino) this is a repeatable list the editor builds up
    // with its own add/remove controls, wired in wireSeoSectionBuilder.
    if (f === "spotlights") {
      const spotlights = Array.isArray(section.spotlights) ? section.spotlights : [];
      const rows = spotlights.map((sp, j) => {
        const selId = sp.casino_id ? Number(sp.casino_id) : null;
        return '<div class="admin-card" data-spotlight-row="' + j + '" style="border:1px dashed var(--border-color,#333);border-radius:6px;padding:10px;margin-bottom:8px;">' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<select data-spotlight-field="casino_id" style="flex:1;"><option value="">— Select a casino —</option>' +
              seoCasinoPickerOptionsHtml(prefix, new Set(selId ? [selId] : [])) +
            '</select>' +
            '<button type="button" class="btn btn--ghost" data-remove-spotlight>Remove</button>' +
          '</div>' +
          '<label style="margin-top:6px;">Write-up for this casino</label>' +
          '<textarea data-spotlight-field="body" rows="4">' + escapeHtml(sp.body || "") + '</textarea>' +
        '</div>';
      }).join("");
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label>' +
        '<div data-spotlights-container>' + rows + '</div>' +
        '<button type="button" class="btn btn--ghost" data-add-spotlight>+ Add casino spotlight</button>';
      return;
    }
    const dataKey = SEO_SECTION_FIELD_TO_DATA_KEY[f] || f;
    let raw = section[dataKey];
    // FAQ sections start pre-filled with common starter questions instead of
    // a blank textarea — the editor edits/replaces them rather than writing
    // JSON from scratch. Only applies while the section has no items yet.
    if (f === "faq_json" && (!Array.isArray(raw) || raw.length === 0)) raw = SEO_PAGE_DEFAULT_FAQ_ITEMS;
    const val = (raw !== undefined && raw !== null) ? (typeof raw === "object" ? JSON.stringify(raw, null, 2) : raw) : "";
    if (f === "body" || f === "faq_json" || f === "links_json") {
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label><textarea data-section-field="' + f + '" rows="' + (f === "body" ? 3 : 6) + '">' + escapeHtml(val) + '</textarea>';
    } else {
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label><input type="text" data-section-field="' + f + '" value="' + escapeHtml(val) + '" />';
    }
  });
  return html + '</div>';
}

// Section-builder root element IDs, keyed by state prefix. Started
// as a two-way ternary (country_page/category_country only); this
// map is what lets the same builder power the BASE country/category
// hub pages too ("country"/"category" prefixes, added alongside the
// countries.js/categories.js content_json fields) without touching
// the seo_pages-specific prefixes' behavior at all.
const SEO_SECTION_ROOT_IDS = {
  country_page: "countryPageSections",
  category_country: "categoryCountrySections",
  country: "countryFormSections",
  category: "categoryFormSections",
  payment_method: "pmFormSections"
};

function renderSeoSections(prefix) {
  const state = seoPageState[prefix];
  const root = document.getElementById(SEO_SECTION_ROOT_IDS[prefix]);
  if (!root) return;
  root.innerHTML = state.sections.map((s, i) => seoSectionRowHtml(s, i, prefix)).join("");
}

function syncSeoSectionsFromDom(prefix) {
  const state = seoPageState[prefix];
  const root = document.getElementById(SEO_SECTION_ROOT_IDS[prefix]);
  if (!root) return;
  const rows = Array.from(root.querySelectorAll("[data-section-row]"));
  state.sections = rows.map((row) => {
    const i = Number(row.dataset.sectionRow);
    const existing = state.sections[i] || {};
    const type = row.querySelector("[data-section-type]").value;
    const position = Number(row.querySelector("[data-section-position]").value) || 0;
    const section = { id: existing.id || ("s" + Date.now() + i), type, position };
    row.querySelectorAll("[data-section-field]").forEach((el) => {
      const key = el.dataset.sectionField;
      if (key === "casino_ids") {
        section.casino_ids = el.multiple ? Array.from(el.selectedOptions).map((o) => Number(o.value)).filter(Boolean) : [];
        return;
      }
      const val = el.value;
      if (key === "casino_id") section.casino_id = val ? Number(val) : null;
      else if (key === "faq_json") { try { section.items = val.trim() ? JSON.parse(val) : []; } catch (e) { section.items = []; } }
      else if (key === "links_json") { try { section.links = val.trim() ? JSON.parse(val) : []; } catch (e) { section.links = []; } }
      else if (key === "cta_url") section.url = val;
      else if (key === "cta_label") section.label = val;
      else section[key] = val;
    });
    // casino_spotlights: repeatable {casino_id, body} rows live in their
    // own container (data-spotlights-container / data-spotlight-row),
    // outside the generic data-section-field loop above, since each row
    // needs two paired values rather than one field = one value.
    const spotlightsContainer = row.querySelector("[data-spotlights-container]");
    if (spotlightsContainer) {
      section.spotlights = Array.from(spotlightsContainer.querySelectorAll("[data-spotlight-row]")).map((sRow) => {
        const casinoSel = sRow.querySelector("[data-spotlight-field='casino_id']");
        const bodyEl = sRow.querySelector("[data-spotlight-field='body']");
        return {
          casino_id: casinoSel && casinoSel.value ? Number(casinoSel.value) : null,
          body: bodyEl ? bodyEl.value : ""
        };
      });
    }
    return section;
  }).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function renderSeoCasinoAddOptions(prefix) {
  const state = seoPageState[prefix];
  const select = document.getElementById(prefix === "country_page" ? "countryPageCasinoAdd" : "categoryCountryCasinoAdd");
  if (!select) return;
  const selectedIds = new Set(state.selectedCasinos.map((c) => c.casino_id));
  select.innerHTML = '<option value="">Add a casino…</option>' +
    state.eligibleCasinos.filter((c) => !selectedIds.has(c.id)).map((c) =>
      '<option value="' + c.id + '" data-name="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>'
    ).join("");
}

function renderSeoCasinoSelected(prefix) {
  const state = seoPageState[prefix];
  const list = document.getElementById(prefix === "country_page" ? "countryPageCasinoSelected" : "categoryCountryCasinoSelected");
  if (!list) return;
  if (state.selectedCasinos.length === 0) {
    list.innerHTML = '<p class="muted">No casinos selected yet.</p>';
    return;
  }
  list.innerHTML = state.selectedCasinos.map((c, i) => {
    const known = state.eligibleCasinos.find((e) => e.id === c.casino_id);
    const name = known ? known.name : (c.name || ("#" + c.casino_id));
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color,#333);" data-casino-row="' + i + '">' +
      '<span style="flex:1;">' + escapeHtml(name) + '</span>' +
      '<label class="muted" style="display:flex;align-items:center;gap:4px;"><input type="checkbox" data-featured ' + (c.is_featured ? "checked" : "") + ' /> Featured</label>' +
      '<input type="text" data-custom-label placeholder="Custom label" value="' + escapeHtml(c.custom_label || "") + '" style="width:140px;" />' +
      '<button type="button" class="btn btn--ghost" data-remove-casino>✕</button>' +
      '</div>';
  }).join("");
}

async function loadSeoEligibleCasinos(prefix) {
  const state = seoPageState[prefix];
  if (!state.countryCode) return;
  let url = "/en/api/v1/seo-pages/eligible-casinos?country_code=" + encodeURIComponent(state.countryCode);
  if (prefix === "category_country" && state.categorySlug) url += "&category_slug=" + encodeURIComponent(state.categorySlug);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  state.eligibleCasinos = data.casinos || [];
  renderSeoCasinoAddOptions(prefix);
  renderSeoCasinoSelected(prefix);
  // Section-level casino pickers (casino_grid / casino_editorial) are
  // rendered before this fetch resolves when opening an existing page for
  // edit — capture whatever's already been typed, then re-render the
  // section rows now that real casino names/IDs are available to pick from.
  syncSeoSectionsFromDom(prefix);
  renderSeoSections(prefix);
}

function updateSeoUrlPreview(prefix) {
  const state = seoPageState[prefix];
  if (prefix === "country_page") {
    const preview = document.getElementById("countryPageUrlPreview");
    const slug = document.getElementById("countryPageSlug").value || "{slug}";
    if (preview) preview.textContent = "URL: /en/country/" + (state.countryCode || "{code}") + "/" + slug;
  } else {
    const preview = document.getElementById("categoryCountryUrlPreview");
    if (preview) preview.textContent = "URL: /en/category/" + (state.categorySlug || "{category}") + "/" + (state.countryCode || "{code}");
  }
}

function wireSeoCountrySearch(prefix, searchId, resultsId, hiddenId) {
  const search = document.getElementById(searchId);
  const results = document.getElementById(resultsId);
  const hidden = document.getElementById(hiddenId);
  if (!search) return;
  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    const q = search.value.trim();
    if (!q) { results.style.display = "none"; return; }
    timer = setTimeout(async () => {
      const res = await fetch("/en/api/v1/seo-pages/countries-search?q=" + encodeURIComponent(q));
      const data = await res.json().catch(() => ({}));
      const items = data.countries || [];
      if (!items.length) { results.style.display = "none"; return; }
      results.innerHTML = items.map((c) =>
        '<div data-code="' + c.code + '" data-name="' + escapeHtml(c.name) + '" style="padding:8px 12px;cursor:pointer;">' + escapeHtml(c.name) + ' (' + c.code + ')</div>'
      ).join("");
      results.style.display = "block";
    }, 250);
  });
  results.addEventListener("click", (e) => {
    const item = e.target.closest("[data-code]");
    if (!item) return;
    seoPageState[prefix].countryCode = item.dataset.code;
    hidden.value = item.dataset.code;
    search.value = item.dataset.name + " (" + item.dataset.code + ")";
    results.style.display = "none";
    updateSeoUrlPreview(prefix);
    loadSeoEligibleCasinos(prefix);
  });
}

function wireSeoCasinoPicker(prefix, addSelectId, addBtnId, selectedListId) {
  const addSelect = document.getElementById(addSelectId);
  const addBtn = document.getElementById(addBtnId);
  const selectedList = document.getElementById(selectedListId);
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const id = Number(addSelect.value);
      if (!id) return;
      const opt = addSelect.options[addSelect.selectedIndex];
      seoPageState[prefix].selectedCasinos.push({ casino_id: id, name: opt.dataset.name, is_featured: false, custom_label: null });
      renderSeoCasinoAddOptions(prefix);
      renderSeoCasinoSelected(prefix);
    });
  }
  if (selectedList) {
    selectedList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-casino]");
      if (!btn) return;
      const row = btn.closest("[data-casino-row]");
      seoPageState[prefix].selectedCasinos.splice(Number(row.dataset.casinoRow), 1);
      renderSeoCasinoAddOptions(prefix);
      renderSeoCasinoSelected(prefix);
    });
    selectedList.addEventListener("change", (e) => {
      const row = e.target.closest("[data-casino-row]");
      if (!row) return;
      const i = Number(row.dataset.casinoRow);
      if (e.target.matches("[data-featured]")) seoPageState[prefix].selectedCasinos[i].is_featured = e.target.checked;
    });
    selectedList.addEventListener("input", (e) => {
      const row = e.target.closest("[data-casino-row]");
      if (!row) return;
      const i = Number(row.dataset.casinoRow);
      if (e.target.matches("[data-custom-label]")) seoPageState[prefix].selectedCasinos[i].custom_label = e.target.value;
    });
  }
}

function wireSeoSectionBuilder(prefix, rootId, addBtnId) {
  const root = document.getElementById(rootId);
  const addBtn = document.getElementById(addBtnId);
  if (!root) return;
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      seoPageState[prefix].sections.push({ id: "s" + Date.now(), type: "rich_text", position: seoPageState[prefix].sections.length, title: "", body: "" });
      renderSeoSections(prefix);
    });
  }
  root.addEventListener("click", (e) => {
    // casino_spotlights add/remove — checked before data-remove-section
    // since a spotlight row also sits inside a [data-section-row], and
    // its own remove button must not be mistaken for removing the
    // whole section.
    const addSpotlightBtn = e.target.closest("[data-add-spotlight]");
    if (addSpotlightBtn) {
      syncSeoSectionsFromDom(prefix);
      const sectionRow = addSpotlightBtn.closest("[data-section-row]");
      const section = seoPageState[prefix].sections[Number(sectionRow.dataset.sectionRow)];
      if (!Array.isArray(section.spotlights)) section.spotlights = [];
      section.spotlights.push({ casino_id: null, body: "" });
      renderSeoSections(prefix);
      return;
    }
    const removeSpotlightBtn = e.target.closest("[data-remove-spotlight]");
    if (removeSpotlightBtn) {
      syncSeoSectionsFromDom(prefix);
      const sectionRow = removeSpotlightBtn.closest("[data-section-row]");
      const spotlightRow = removeSpotlightBtn.closest("[data-spotlight-row]");
      const section = seoPageState[prefix].sections[Number(sectionRow.dataset.sectionRow)];
      section.spotlights.splice(Number(spotlightRow.dataset.spotlightRow), 1);
      renderSeoSections(prefix);
      return;
    }
    const btn = e.target.closest("[data-remove-section]");
    if (!btn) return;
    syncSeoSectionsFromDom(prefix);
    const row = btn.closest("[data-section-row]");
    seoPageState[prefix].sections.splice(Number(row.dataset.sectionRow), 1);
    renderSeoSections(prefix);
  });
  root.addEventListener("change", (e) => {
    if (!e.target.matches("[data-section-type]")) return;
    syncSeoSectionsFromDom(prefix);
    renderSeoSections(prefix);
  });
}

async function loadSeoAuthorsInto(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await fetch("/en/api/v1/authors/list");
    const data = await res.json().catch(() => ({}));
    const authorsList = data.authors || [];
    authorsList.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      select.appendChild(opt);
    });
  } catch (e) { /* non-fatal */ }
}

/* ---------------- COUNTRY PAGES ---------------- */

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
