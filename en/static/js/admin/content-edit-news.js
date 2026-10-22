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


