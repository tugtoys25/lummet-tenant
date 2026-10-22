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

