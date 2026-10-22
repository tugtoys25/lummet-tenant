// ── Assign Form ──

async function populateComponentDropdown() {
  const select = document.getElementById("assignComponentSelect");
  if (!select) return;

  try {
    const res = await fetch("/en/api/v1/components/list");
    const data = await res.json();
    const components = data.components || [];
    select.innerHTML = '<option value="">Select component...</option>' +
      components.map(c => `<option value="${c.id}">${c.name} (${c.type})</option>`).join("");
  } catch {}
}

function initAssignForm() {
  const form = document.getElementById("assignForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("assignFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const payload = {
      component_id: parseInt(formData.get("component_id")),
      page_type: formData.get("page_type"),
      page_slug: formData.get("page_slug"),
      position: parseInt(formData.get("position")) || 0,
      injection_point: formData.get("injection_point") || "content_bottom"
    };

    // Check if bulk assign is requested (slug is "*")
    const isBulk = payload.page_slug === "*";
    const endpoint = isBulk ? "/en/api/v1/components/bulk-assign" : "/en/api/v1/components/assign";

    if (isBulk) {
      payload.page_slugs = ["*"];
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
          alertEl.textContent = isBulk ? "Component assigned to ALL pages of this type!" : "Component assigned to page!";
          alertEl.style.display = "block";
        }
        form.reset();
        loadAssignments();
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

// ── Assignments Table ──

async function loadAssignments() {
  const tbody = document.getElementById("assignmentsTableBody");
  if (!tbody) return;

  const pageType = document.getElementById("filterPageType")?.value || "";
  const pageSlug = document.getElementById("filterPageSlug")?.value || "";

  let url = "/en/api/v1/components/page?";
  if (pageType) url += `page_type=${pageType}&`;
  if (pageSlug) url += `page_slug=${pageSlug}&`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const assignments = data.assignments || [];

    if (assignments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No assignments found.</td></tr>';
      return;
    }

    tbody.innerHTML = assignments.map(a => `
      <tr>
        <td>${a.page_type} / ${a.page_slug}</td>
        <td><strong>${a.name}</strong></td>
        <td>${a.type}</td>
        <td>${a.position}</td>
        <td>${a.injection_point || 'content_bottom'}</td>
        <td>${a.enabled ? '<span class="status-badge status-published">Yes</span>' : '<span class="status-badge status-draft">No</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editAssignment(${a.id}, ${a.position}, '${a.injection_point || 'content_bottom'}')">Edit</button>
          <button class="btn btn--ghost btn--sm" onclick="toggleAssignment(${a.id}, ${a.enabled ? 0 : 1})">${a.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn--danger btn--sm" onclick="removeAssignment(${a.id})">Remove</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
  }
}

async function toggleAssignment(id, enabled) {
  try {
    await fetch("/en/api/v1/components/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !!enabled })
    });
    loadAssignments();
  } catch { alert("Network error"); }
}

async function removeAssignment(id) {
  if (!confirm("Remove this component from this page?")) return;
  try {
    await fetch("/en/api/v1/components/unassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    loadAssignments();
  } catch { alert("Network error"); }
}

