// ── SEO Meta Admin ──

async function initSeoAdmin() {
  const tableBody = document.getElementById("seoTableBody");
  const form = document.getElementById("seoForm");

  if (tableBody) {
    try {
      const res = await fetch("/en/api/v1/seo/list");
      const data = await res.json();
      const items = data.seo || [];
      if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="muted">No SEO meta yet.</td></tr>';
      } else {
        tableBody.innerHTML = items.map(s => `
          <tr>
            <td>${s.page_type}</td>
            <td>${s.page_slug}</td>
            <td>${(s.title || "").substring(0, 60)}</td>
            <td>${s.robots || "index, follow"}</td>
            <td class="table-actions">
              <button class="btn btn--ghost btn--sm" onclick="editSeoMeta('${s.page_type}','${s.page_slug}')">Edit</button>
              <button class="btn btn--danger btn--sm" onclick="deleteSeoMeta('${s.page_type}','${s.page_slug}')">Delete</button>
            </td>

          </tr>
        `).join("");
      }
    } catch {
      tableBody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
    }
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById("seoFormAlert");
      if (alertEl) alertEl.style.display = "none";

      const formData = new FormData(form);
          const isEdit = formData.get("id") ? true : false;
    const endpoint = "/en/api/v1/seo/save";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      page_type: formData.get("page_type"),
      page_slug: formData.get("page_slug"),
      title: formData.get("title") || null,
      description: formData.get("description") || null,
      keywords: formData.get("keywords") || null,
      canonical: formData.get("canonical") || null,
      og_image: formData.get("og_image") || null,
      robots: formData.get("robots") || "index, follow",
      schema_json: formData.get("schema_json") || null,
    };

      try {
        const res = await fetch("/en/api/v1/seo/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = isEdit ? "SEO meta updated!" : "SEO meta saved!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("seoSubmitBtn").textContent = "Save SEO Meta";
        document.getElementById("seoCancelEdit").style.display = "none";
        initSeoAdmin();
      }   else {
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
}
async function deleteSeoMeta(pageType, pageSlug) {
  if (!confirm(`Delete SEO meta for ${pageType}/${pageSlug}?`)) return;
  try {
    await fetch("/en/api/v1/seo/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_type: pageType, page_slug: pageSlug })
    });
    initSeoAdmin();
  } catch { alert("Network error"); }
}


