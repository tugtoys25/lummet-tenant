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

