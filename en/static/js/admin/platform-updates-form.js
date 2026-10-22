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

