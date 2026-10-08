document.addEventListener("DOMContentLoaded", () => {
  loadBannersTable();
  initBannerForm();
});

async function loadBannersTable() {
  const tbody = document.getElementById("bannersTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/banners/list");
    const data = await res.json();
    const banners = data.banners || [];
    if (banners.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No banners yet.</td></tr>';
      return;
    }
    tbody.innerHTML = banners.map(b => `
      <tr>
        <td><strong>${b.title}</strong></td>
        <td>${b.type}</td>
        <td>${b.position}</td>
        <td>${b.geo_countries || "All"}</td>
        <td>${b.enabled ? '<span class="status-badge status-published">Yes</span>' : '<span class="status-badge status-draft">No</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editBanner(${b.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteBanner(${b.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

function initBannerForm() {
  const form = document.getElementById("bannerForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("bannerFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/banner/update" : "/en/api/v1/banner/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      title: formData.get("title"),
      type: formData.get("type"),
      content: formData.get("content") || null,
      link: formData.get("link") || null,
      button_text: formData.get("button_text") || null,
      bg_color: formData.get("bg_color"),
      text_color: formData.get("text_color"),
      position: formData.get("position"),
      dismissible: formData.get("dismissible") === "1",
      geo_countries: formData.get("geo_countries") || null,
      start_date: formData.get("start_date")
        ? formData.get("start_date").replace('T', ' ').substring(0, 19)
        : null,
      end_date: formData.get("end_date")
        ? formData.get("end_date").replace('T', ' ').substring(0, 19)
        : null,
      enabled: formData.get("enabled") === "1",
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) { alertEl.className = "alert alert--success"; alertEl.textContent = isEdit ? "Banner updated!" : "Banner created!"; alertEl.style.display = "block"; }
        form.reset();
        form.querySelector("[name='id']").value = "";
        form.querySelector("[name='bg_color']").value = "#6c5ce7";
        form.querySelector("[name='text_color']").value = "#ffffff";
        document.getElementById("bannerSubmitBtn").textContent = "Create Banner";
        document.getElementById("bannerCancelEdit").style.display = "none";
        loadBannersTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

async function editBanner(id) {
  try {
    const res = await fetch("/en/api/v1/banners/list");
    const data = await res.json();
    const b = (data.banners || []).find(x => x.id === id);
    if (!b) return;
    const form = document.getElementById("bannerForm");
    form.querySelector("[name='id']").value = b.id;
    form.querySelector("[name='title']").value = b.title;
    form.querySelector("[name='type']").value = b.type;
    form.querySelector("[name='content']").value = b.content || "";
    form.querySelector("[name='link']").value = b.link || "";
    form.querySelector("[name='button_text']").value = b.button_text || "";
    form.querySelector("[name='bg_color']").value = b.bg_color || "#6c5ce7";
    form.querySelector("[name='text_color']").value = b.text_color || "#ffffff";
    form.querySelector("[name='position']").value = b.position || "top";
    form.querySelector("[name='dismissible']").value = b.dismissible ? "1" : "0";
    form.querySelector("[name='geo_countries']").value = b.geo_countries || "";
    if (b.start_date) form.querySelector("[name='start_date']").value = new Date(b.start_date).toISOString().slice(0,16);
    if (b.end_date) form.querySelector("[name='end_date']").value = new Date(b.end_date).toISOString().slice(0,16);
    form.querySelector("[name='enabled']").value = b.enabled ? "1" : "0";
    document.getElementById("bannerSubmitBtn").textContent = "Update Banner";
    document.getElementById("bannerCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load banner"); }
}

function cancelBannerEdit() {
  const form = document.getElementById("bannerForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  form.querySelector("[name='bg_color']").value = "#6c5ce7";
  form.querySelector("[name='text_color']").value = "#ffffff";
  document.getElementById("bannerSubmitBtn").textContent = "Create Banner";
  document.getElementById("bannerCancelEdit").style.display = "none";
}

async function deleteBanner(id) {
  if (!confirm("Delete this banner?")) return;
  try {
    await fetch("/en/api/v1/banner/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    loadBannersTable();
  } catch { alert("Network error"); }
}
