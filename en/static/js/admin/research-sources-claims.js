// ============================================
// RESEARCH — SOURCES & CLAIMS (Phase 2)
// ============================================

let _researchSourcesCache = null;

async function fetchSourcesCached(force = false) {
  if (_researchSourcesCache && !force) return _researchSourcesCache;
  try {
    const res = await fetch("/en/api/v1/research-sources/list");
    const data = await res.json();
    _researchSourcesCache = data.sources || [];
  } catch {
    _researchSourcesCache = [];
  }
  return _researchSourcesCache;
}

async function loadSourcesTable() {
  const tbody = document.getElementById("sourcesTableBody");
  if (!tbody) return;
  try {
    const sources = await fetchSourcesCached(true);
    if (sources.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No sources yet.</td></tr>';
      return;
    }
    tbody.innerHTML = sources.map(s => `
      <tr>
        <td><strong>${s.organisation}</strong>${s.title ? `<br><span class="muted" style="font-size:12px">${s.title}</span>` : ""}</td>
        <td>${s.source_type}</td>
        <td>${s.country_name || "—"}</td>
        <td>${s.is_primary ? '<span class="badge badge-ok">Primary</span>' : "—"}</td>
        <td>${s.citation_count || 0}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editSource(${s.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteSource(${s.id}, '${(s.organisation || "").replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

async function populateCountrySelect(selectEl) {
  if (!selectEl || selectEl.dataset.loaded === "true") return;
  try {
    const res = await fetch("/en/api/v1/countries/list");
    const data = await res.json();
    (data.countries || []).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = c.name;
      selectEl.appendChild(opt);
    });
    selectEl.dataset.loaded = "true";
  } catch { /* dropdown stays with just the blank option */ }
}

async function editSource(id) {
  try {
    const res = await fetch(`/en/api/v1/research-sources/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { alert(data.error || "Could not load source"); return; }
    const s = data.source;

    await populateCountrySelect(document.getElementById("sourceCountrySelect"));

    const form = document.getElementById("sourceForm");
    if (!form) return;
    form.querySelector("[name='id']").value = s.id;
    form.querySelector("[name='organisation']").value = s.organisation || "";
    form.querySelector("[name='source_type']").value = s.source_type || "other";
    form.querySelector("[name='title']").value = s.title || "";
    form.querySelector("[name='url']").value = s.url || "";
    form.querySelector("[name='country_id']").value = s.country_id || "";
    form.querySelector("[name='is_primary']").value = String(s.is_primary || 0);
    form.querySelector("[name='publication_date']").value = (s.publication_date || "").split(" ")[0].split("T")[0] || "";
    form.querySelector("[name='accessed_at']").value = (s.accessed_at || "").split(" ")[0].split("T")[0] || "";
    form.querySelector("[name='notes']").value = s.notes || "";

    form.dataset.editMode = "true";
    document.getElementById("sourceSubmitBtn").textContent = "Update Source";
    document.getElementById("sourceCancelEdit").style.display = "";
    form.scrollIntoView({ behavior: "smooth" });
  } catch {
    alert("Network error");
  }
}

function cancelSourceEdit() {
  const form = document.getElementById("sourceForm");
  if (!form) return;
  form.reset();
  delete form.dataset.editMode;
  document.getElementById("sourceSubmitBtn").textContent = "Add Source";
  document.getElementById("sourceCancelEdit").style.display = "none";
}

async function deleteSource(id, organisation) {
  if (!confirm(`Delete source "${organisation}"? This also removes it from any claims that cite it.`)) return;
  try {
    const res = await fetch("/en/api/v1/research-sources/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) { loadSourcesTable(); fetchSourcesCached(true); }
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initSourceForm() {
  const form = document.getElementById("sourceForm");
  if (!form) return;

  populateCountrySelect(document.getElementById("sourceCountrySelect"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("sourceFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);

    const isEdit = form.dataset.editMode === "true";
    const endpoint = isEdit ? "/en/api/v1/research-sources/update" : "/en/api/v1/research-sources/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      organisation: formData.get("organisation"),
      source_type: formData.get("source_type") || "other",
      title: formData.get("title") || null,
      url: formData.get("url") || null,
      country_id: formData.get("country_id") || null,
      is_primary: formData.get("is_primary") === "1" ? 1 : 0,
      publication_date: formData.get("publication_date") || null,
      accessed_at: formData.get("accessed_at") || null,
      notes: formData.get("notes") || null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) { alertEl.className = "alert alert--success"; alertEl.textContent = isEdit ? "Source updated!" : "Source added!"; alertEl.style.display = "block"; }
        cancelSourceEdit();
        loadSourcesTable();
        fetchSourcesCached(true);
        syncResearchSectionsFromDom();
        renderResearchFormSections();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

// ---- Claims (scoped to whichever research item is being edited) ----

async function loadResearchClaimsTable(researchItemId) {
  const tbody = document.getElementById("researchClaimsTableBody");
  if (!tbody) return;
  try {
    const [claimsRes, sources] = await Promise.all([
      fetch(`/en/api/v1/research-claims/list-for-item?research_item_id=${researchItemId}`),
      fetchSourcesCached(),
    ]);
    const claimsData = await claimsRes.json();
    const claims = claimsData.claims || [];

    if (claims.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No claims yet.</td></tr>';
      return;
    }

    const sourceOptions = sources.map(s => `<option value="${s.id}">${s.organisation}${s.title ? " — " + s.title : ""}</option>`).join("");

    tbody.innerHTML = claims.map(c => `
      <tr>
        <td style="max-width:320px">${c.claim_text}</td>
        <td><span class="badge ${c.status === "verified" ? "badge-ok" : "badge-dim"}">${c.status}</span></td>
        <td>
          ${c.sources.map(s => `
            <span class="badge badge-dim" style="margin-right:4px">
              ${s.organisation}
              <a href="#" onclick="detachClaimSource(${s.id}, ${researchItemId}); return false;" title="Remove" style="margin-left:4px">&times;</a>
            </span>
          `).join("") || '<span class="muted">none</span>'}
          <div style="margin-top:6px;display:flex;gap:4px">
            <select id="attachSourceSelect-${c.id}" style="max-width:180px">
              <option value="">Attach source...</option>
              ${sourceOptions}
            </select>
            <button type="button" class="btn btn--ghost btn--sm" onclick="attachClaimSource(${c.id}, ${researchItemId})">Attach</button>
          </div>
        </td>
        <td class="table-actions">
          <button class="btn btn--danger btn--sm" onclick="deleteClaim(${c.id}, ${researchItemId})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

async function attachClaimSource(claimId, researchItemId) {
  const select = document.getElementById(`attachSourceSelect-${claimId}`);
  const sourceId = select ? select.value : "";
  if (!sourceId) return;
  try {
    const res = await fetch("/en/api/v1/research-claims/attach-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: claimId, source_id: parseInt(sourceId) }),
    });
    const data = await res.json();
    if (data.success) loadResearchClaimsTable(researchItemId);
    else alert(data.error || "Could not attach source");
  } catch { alert("Network error"); }
}

async function detachClaimSource(claimSourceId, researchItemId) {
  try {
    const res = await fetch("/en/api/v1/research-claims/detach-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: claimSourceId }),
    });
    const data = await res.json();
    if (data.success) loadResearchClaimsTable(researchItemId);
    else alert(data.error || "Could not remove source");
  } catch { alert("Network error"); }
}

async function deleteClaim(id, researchItemId) {
  if (!confirm("Delete this claim?")) return;
  try {
    const res = await fetch("/en/api/v1/research-claims/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) loadResearchClaimsTable(researchItemId);
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initResearchClaimForm() {
  const form = document.getElementById("researchClaimForm");
  if (!form) return;

  populateCountrySelect(document.getElementById("researchClaimJurisdictionSelect"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const researchItemId = parseInt(formData.get("research_item_id"));
    if (!researchItemId) { alert("Save the research item first."); return; }

    const payload = {
      research_item_id: researchItemId,
      claim_text: formData.get("claim_text"),
      status: formData.get("status") || "unverified",
      jurisdiction_id: formData.get("jurisdiction_id") || null,
      valid_from: formData.get("valid_from") || null,
      valid_until: formData.get("valid_until") || null,
    };

    try {
      const res = await fetch("/en/api/v1/research-claims/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        form.reset();
        form.querySelector("[name='research_item_id']").value = researchItemId;
        loadResearchClaimsTable(researchItemId);
      } else {
        alert(data.error || "Could not create claim");
      }
    } catch { alert("Network error"); }
  });
}

// Shows the claims/sources panel for the research item currently
// loaded into the edit form — called from editResearch() once a
// research item (which must already have an id) is loaded.
function showResearchClaimsPanel(researchItemId, title) {
  const section = document.getElementById("researchClaimsSection");
  if (!section) return;
  document.getElementById("researchClaimsItemTitle").textContent = title || "";
  document.getElementById("researchClaimItemId").value = researchItemId;
  populateCountrySelect(document.getElementById("researchClaimJurisdictionSelect"));
  fetchSourcesCached(true);
  section.style.display = "";
  loadResearchClaimsTable(researchItemId);
}

function hideResearchClaimsPanel() {
  const section = document.getElementById("researchClaimsSection");
  if (section) section.style.display = "none";
}

