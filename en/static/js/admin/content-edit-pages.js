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


function cancelPageEdit() {
  const form = document.getElementById("pageForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("pageSubmitBtn").textContent = "Create Page";
  document.getElementById("pageCancelEdit").style.display = "none";
  RichEditor.set("page-content", "");
}


