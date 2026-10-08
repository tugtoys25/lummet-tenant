document.addEventListener("DOMContentLoaded", () => {
  loadAuthorsTable();
  initAuthorForm();
  populateAuthorDropdowns();
});

async function loadAuthorsTable() {
  const tbody = document.getElementById("authorsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/authors/list");
    const data = await res.json();
    const authors = data.authors || [];
    if (authors.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No authors yet.</td></tr>';
      return;
    }
    tbody.innerHTML = authors.map(a => `
      <tr>
        <td><strong>${a.name}</strong></td>
        <td><a href="/en/author/${a.slug}" target="_blank">${a.slug}</a></td>
        <td>${a.role || "Editor"}</td>
        <td>${a.published ? '<span class="status-badge status-published">Yes</span>' : '<span class="status-badge status-draft">No</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editAuthor(${a.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteAuthor(${a.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function populateAuthorDropdowns() {
  try {
    const res = await fetch("/en/api/v1/authors/list");
    const data = await res.json();
    const authors = data.authors || [];
    const options = '<option value="">No author assigned</option>' +
      authors.map(a => `<option value="${a.id}">${a.name}</option>`).join("");

    ["reviewAuthorSelect", "newsAuthorSelect", "pageAuthorSelect", "updateAuthorSelect", "genericReviewAuthorSelect", "genericReviewEditAuthorSelect"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = options;
    });
  } catch {}
}

function initAuthorForm() {
  const form = document.getElementById("authorForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("authorFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/author/update" : "/en/api/v1/author/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      slug: formData.get("slug"),
      name: formData.get("name"),
      role: formData.get("role") || "editor",
      email: formData.get("email") || null,
      avatar_url: formData.get("avatar_url") || null,
      bio: formData.get("bio") || null,
      social_links: formData.get("social_links") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      published: formData.get("published") === "1",
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
          alertEl.textContent = isEdit ? "Author updated!" : "Author created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("authorSubmitBtn").textContent = "Create Author";
        document.getElementById("authorCancelEdit").style.display = "none";
        loadAuthorsTable();
        populateAuthorDropdowns();
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

async function editAuthor(id) {
  try {
    const res = await fetch(`/en/api/v1/author/get?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const a = data.author;
    const form = document.getElementById("authorForm");
    form.querySelector("[name='id']").value = a.id;
    form.querySelector("[name='slug']").value = a.slug;
    form.querySelector("[name='name']").value = a.name;
    form.querySelector("[name='role']").value = a.role || "editor";
    form.querySelector("[name='email']").value = a.email || "";
    form.querySelector("[name='avatar_url']").value = a.avatar_url || "";
    form.querySelector("[name='bio']").value = a.bio || "";
    form.querySelector("[name='social_links']").value = a.social_links || "";
    form.querySelector("[name='seo_title']").value = a.seo_title || "";
    form.querySelector("[name='seo_description']").value = a.seo_description || "";
    form.querySelector("[name='published']").value = a.published ? "1" : "0";
    document.getElementById("authorSubmitBtn").textContent = "Update Author";
    document.getElementById("authorCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load author"); }
}

function cancelAuthorEdit() {
  const form = document.getElementById("authorForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("authorSubmitBtn").textContent = "Create Author";
  document.getElementById("authorCancelEdit").style.display = "none";
}

async function deleteAuthor(id) {
  if (!confirm("Delete this author? Their content will be unlinked but preserved.")) return;
  try {
    await fetch("/en/api/v1/author/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    loadAuthorsTable();
    populateAuthorDropdowns();
  } catch { alert("Network error"); }
}
