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

function filterComponents(type) {
  currentFilter = type;
  loadComponentsTable();
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


// ── Component Edit ──

async function editComponent(id) {
  try {
    const res = await fetch(`/en/api/v1/component/get?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const c = data.component;
    const form = document.getElementById("componentForm");
    form.querySelector("[name='id']").value = c.id;
    form.querySelector("[name='name']").value = c.name;
    form.querySelector("[name='slug']").value = c.slug || "";
    form.querySelector("[name='type']").value = c.type;
    form.querySelector("[name='title']").value = c.title || "";
    form.querySelector("[name='content']").value = c.content || "";
    form.querySelector("[name='settings_json']").value = c.settings_json || "";
    form.querySelector("[name='status']").value = c.status || "active";
    document.getElementById("componentSubmitBtn").textContent = "Update Component";
    document.getElementById("componentCancelEdit").style.display = "";
    form.dispatchEvent(new Event("component:loaded"));
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load component"); }
}

function cancelComponentEdit() {
  const form = document.getElementById("componentForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("componentSubmitBtn").textContent = "Create Component";
  document.getElementById("componentCancelEdit").style.display = "none";
}


// ── Assignment Edit ──

async function editAssignment(id, currentPosition, currentInjection) {
  const position = prompt("Enter new position (lower renders first):", currentPosition);
  if (position === null) return;
  const injection = prompt("Injection point (top, content_top, content_bottom, bottom, sidebar):", currentInjection || "content_bottom");
  if (injection === null) return;
  try {
    await fetch("/en/api/v1/components/update-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, position: parseInt(position) || 0, injection_point: injection })
    });
    loadAssignments();
  } catch { alert("Network error"); }
}

// ── SEO Edit ──

async function editSeoMeta(pageType, pageSlug) {
  try {
    const res = await fetch(`/en/api/v1/seo/get?page_type=${pageType}&page_slug=${pageSlug}`);
    const data = await res.json();
    if (!data.seo) return;
    const s = data.seo;
    const form = document.getElementById("seoForm");
    form.querySelector("[name='id']").value = s.id;
    form.querySelector("[name='page_type']").value = s.page_type;
    form.querySelector("[name='page_slug']").value = s.page_slug;
    form.querySelector("[name='title']").value = s.title || "";
    form.querySelector("[name='description']").value = s.description || "";
    form.querySelector("[name='keywords']").value = s.keywords || "";
    form.querySelector("[name='canonical']").value = s.canonical || "";
    form.querySelector("[name='og_image']").value = s.og_image || "";
    form.querySelector("[name='robots']").value = s.robots || "index, follow";
    form.querySelector("[name='schema_json']").value = s.schema_json || "";
    document.getElementById("seoSubmitBtn").textContent = "Update SEO Meta";
    document.getElementById("seoCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load SEO meta"); }
}

function cancelSeoEdit() {
  const form = document.getElementById("seoForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("seoSubmitBtn").textContent = "Save SEO Meta";
  document.getElementById("seoCancelEdit").style.display = "none";
}

// ── Page types for the custom content types you created (custom_<type>, custom_<type>_list,
// compare_<type>, compare_<type>_list). Built from the Custom Types list; DOM calls only.
async function populateCustomPageTypes() {
  const groups = [
    document.getElementById("assignCustomGroup"),
    document.getElementById("filterCustomGroup"),
  ].filter(Boolean);
  if (!groups.length) return;
  try {
    const res = await fetch("/en/api/v1/custom-types/list");
    const data = await res.json();
    const types = (data && data.types) || [];
    if (!types.length) { groups.forEach((g) => g.remove()); return; }
    groups.forEach((group) => {
      const filter = group.id === "filterCustomGroup";
      types.forEach((t) => {
        const slug = String(t.slug || "");
        if (!/^[a-z0-9_-]+$/i.test(slug)) return;
        const label = String(t.label || slug);
        [
          [`custom_${slug}`, `${label} (individual)`],
          [`custom_${slug}_list`, `${label} listing page`],
          [`compare_${slug}`, `Comparison: ${label} (individual)`],
          [`compare_${slug}_list`, `Comparison list: ${label}`],
        ].forEach(([value, text]) => {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = filter ? text.replace(/ \(individual\)$/, "") : text;
          group.appendChild(opt);
        });
      });
    });
  } catch {
    groups.forEach((g) => g.remove());
  }
}
