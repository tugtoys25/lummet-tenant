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


