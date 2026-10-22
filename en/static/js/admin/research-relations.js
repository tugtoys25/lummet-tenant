// ============================================
// RESEARCH RELATIONSHIPS (Phase 3)
// ============================================

const RESEARCH_RELATION_TYPES = [
  "covers", "located_in", "operates_in", "regulated_by", "regulates",
  "licensed_by", "requires", "uses", "related_to", "part_of", "contains",
  "updates", "supersedes", "superseded_by", "cites", "supports",
  "contradicts", "derived_from", "mentions", "affects", "affected_by",
  "applies_to", "available_in", "restricted_in"
];

function populateRelationTypeSelect() {
  const select = document.getElementById("researchRelationTypeSelect");
  if (!select || select.dataset.loaded === "true") return;
  select.innerHTML = RESEARCH_RELATION_TYPES.map(t => `<option value="${t}">${t.replace(/_/g, " ")}</option>`).join("");
  select.dataset.loaded = "true";
}

async function loadResearchRelationsTable(researchItemId) {
  const tbody = document.getElementById("researchRelationsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch(`/en/api/v1/research-relations/list-for-entity?type=research_item&id=${researchItemId}`);
    const data = await res.json();
    const relations = (data.relations || []).filter(r => r.target && r.target.exists);

    if (relations.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="muted">No relationships yet.</td></tr>';
      return;
    }

    tbody.innerHTML = relations.map(r => `
      <tr>
        <td>${r.relation_type.replace(/_/g, " ")}</td>
        <td>${r.target.label || "—"} <span class="muted" style="font-size:12px">(${r.target.type})</span></td>
        <td class="table-actions">
          <button class="btn btn--danger btn--sm" onclick="deleteResearchRelation(${r.id}, ${researchItemId})">Remove</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteResearchRelation(id, researchItemId) {
  if (!confirm("Remove this relationship?")) return;
  try {
    const res = await fetch("/en/api/v1/research-relations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) loadResearchRelationsTable(researchItemId);
    else alert(data.error || "Could not remove relationship");
  } catch { alert("Network error"); }
}

let _relationEntitySearchTimer = null;

function initResearchRelationEntitySearch() {
  const input = document.getElementById("researchRelationEntitySearch");
  const resultsBox = document.getElementById("researchRelationEntityResults");
  if (!input || !resultsBox || input.dataset.wired === "true") return;
  input.dataset.wired = "true";

  input.addEventListener("input", () => {
    clearTimeout(_relationEntitySearchTimer);
    const q = input.value.trim();
    document.getElementById("researchRelationSubmitBtn").disabled = true;
    document.getElementById("researchRelationToType").value = "";
    document.getElementById("researchRelationToId").value = "";
    document.getElementById("researchRelationEntitySelected").textContent = "";

    if (q.length < 2) { resultsBox.style.display = "none"; resultsBox.innerHTML = ""; return; }

    _relationEntitySearchTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/en/api/v1/research-relations/search-entities?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const results = data.results || [];
        if (results.length === 0) {
          resultsBox.innerHTML = '<div class="admin-autocomplete-empty muted">No matches</div>';
          resultsBox.style.display = "";
          return;
        }
        resultsBox.innerHTML = results.map((r, i) => `
          <div class="admin-autocomplete-item" data-idx="${i}" style="cursor:pointer;padding:6px 8px">
            ${r.label} <span class="muted" style="font-size:12px">(${r.type})</span>
          </div>
        `).join("");
        resultsBox.style.display = "";
        resultsBox.querySelectorAll("[data-idx]").forEach(el => {
          el.addEventListener("click", () => {
            const picked = results[parseInt(el.dataset.idx)];
            document.getElementById("researchRelationToType").value = picked.type;
            document.getElementById("researchRelationToId").value = picked.id;
            document.getElementById("researchRelationEntitySelected").textContent = `Selected: ${picked.label} (${picked.type})`;
            input.value = picked.label;
            resultsBox.style.display = "none";
            document.getElementById("researchRelationSubmitBtn").disabled = false;
          });
        });
      } catch { resultsBox.style.display = "none"; }
    }, 300);
  });
}

function initResearchRelationForm() {
  const form = document.getElementById("researchRelationForm");
  if (!form) return;

  populateRelationTypeSelect();
  initResearchRelationEntitySearch();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fromId = parseInt(document.getElementById("researchRelationFromId").value);
    const toType = document.getElementById("researchRelationToType").value;
    const toId = document.getElementById("researchRelationToId").value;
    const relationType = document.getElementById("researchRelationTypeSelect").value;
    if (!fromId || !toType || !toId || !relationType) return;

    try {
      const res = await fetch("/en/api/v1/research-relations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_type: "research_item", from_id: fromId, to_type: toType, to_id: toId, relation_type: relationType }),
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById("researchRelationEntitySearch").value = "";
        document.getElementById("researchRelationEntitySelected").textContent = "";
        document.getElementById("researchRelationToType").value = "";
        document.getElementById("researchRelationToId").value = "";
        document.getElementById("researchRelationSubmitBtn").disabled = true;
        loadResearchRelationsTable(fromId);
      } else {
        alert(data.error || "Could not add relationship");
      }
    } catch { alert("Network error"); }
  });
}

function showResearchRelationsPanel(researchItemId, title) {
  const section = document.getElementById("researchRelationsSection");
  if (!section) return;
  document.getElementById("researchRelationsItemTitle").textContent = title || "";
  document.getElementById("researchRelationFromId").value = researchItemId;
  populateRelationTypeSelect();
  section.style.display = "";
  loadResearchRelationsTable(researchItemId);
}

function hideResearchRelationsPanel() {
  const section = document.getElementById("researchRelationsSection");
  if (section) section.style.display = "none";
}

