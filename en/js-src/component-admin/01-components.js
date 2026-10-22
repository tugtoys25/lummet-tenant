// =====================================================
// COMPONENT ENGINE ADMIN JS
// Handles: components CRUD, page assignments, SEO meta
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadComponentsTable();
  initComponentForm();
  initAssignForm();
  loadAssignments();
  populateComponentDropdown();
  initSeoAdmin();
  populateCustomPageTypes();
});

// ── Components Table ──

let currentFilter = "";

async function loadComponentsTable() {
  const tbody = document.getElementById("componentsTableBody");
  if (!tbody) return;

  try {
    const url = currentFilter
      ? `/en/api/v1/components/list?type=${currentFilter}`
      : "/en/api/v1/components/list";
    const res = await fetch(url);
    const data = await res.json();
    const components = data.components || [];

    if (components.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No components yet.</td></tr>';
      return;
    }

    tbody.innerHTML = components.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td><span class="status-badge status-${c.status === 'active' ? 'published' : 'draft'}">${c.type}</span></td>
        <td><span class="status-badge status-${c.status === 'active' ? 'published' : 'draft'}">${c.status}</span></td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editComponent(${c.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteComponent(${c.id})">Delete</button>
        </td>

      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}


async function deleteComponent(id) {
  if (!confirm("Delete this component? This also removes all page assignments.")) return;
  try {
    await fetch("/en/api/v1/component/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    loadComponentsTable();
    populateComponentDropdown();
  } catch { alert("Network error"); }
}

// ── Component Form ──

function initComponentForm() {
  const form = document.getElementById("componentForm");
  if (!form) return;

  const typeSelect = document.getElementById("componentType");
  const contentHint = document.getElementById("contentHint");

  typeSelect.addEventListener("change", () => {
    const hints = {
      author: 'JSON: {"name":"...","title":"...","bio":"...","avatar":"https://..."}',
      faq_group: 'JSON array: [{"q":"Question?","a":"Answer"}]',
      text: "Raw text or HTML",
      html: "Raw HTML",
      cta: 'Text content. Settings: {"link":"https://...","button_text":"Click Here"}',
      hero: 'Hero subtitle (plain text). Use the Hero options below for buttons, pictures, video, colours and fonts.',
      casino_grid: 'Optional heading. Settings: {"limit":5}',
      banner: 'Banner text. Settings: {"link":"...","button_text":"..."}',
      content_grid: "Use the options below to pick items.",
      data_table: "Use the options below to fill the table.",
      section: "Use the options below to build the section.",
    };
    contentHint.textContent = hints[typeSelect.value] || "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("componentFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/component/update" : "/en/api/v1/component/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      name: formData.get("name"),
      slug: formData.get("slug") || null,
      type: formData.get("type"),
      title: formData.get("title") || null,
      content: formData.get("content") || null,
      settings_json: formData.get("settings_json") || null,
      status: formData.get("status") || "active",
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
          alertEl.textContent = isEdit ? "Component updated!" : "Component created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("componentSubmitBtn").textContent = "Create Component";
        document.getElementById("componentCancelEdit").style.display = "none";
        loadComponentsTable();
        populateComponentDropdown();
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

