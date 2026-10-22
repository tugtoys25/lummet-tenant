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


