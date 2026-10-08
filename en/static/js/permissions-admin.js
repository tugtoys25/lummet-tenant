// =====================================================
// PERMISSIONS ADMIN
// =====================================================

const RESOURCES = [
  "casinos", "reviews", "news", "platform-updates", "pages", "categories",
  "countries", "authors", "components", "seo", "settings",
  "media", "nav", "permissions", "users"
];

const ACTIONS = ["create", "read", "update", "delete"];

// Newsroom editorial actions (resource "news"). Stored in the same
// permissions table; shown as extra rows so they can be granted per role.
const NEWSROOM_ACTIONS = [
  ["review", "Review / approve"], ["factcheck", "Fact-check"], ["publish", "Publish / unpublish workflow articles"],
  ["schedule", "Schedule"], ["correct", "Corrections & clarifications"], ["retract", "Retract"],
  ["manage_authors", "Manage author profiles"], ["manage_taxonomy", "Manage sections, topics, entities, series"],
  ["manage_sources", "Manage sources"], ["manage_settings", "Newsroom settings"], ["view_analytics", "View newsroom analytics"]
];

function newsroomPermissionRows(rolePerms) {
  const newsPerms = (rolePerms && rolePerms.news) || {};
  const head = '<tr><td colspan="5" style="background:#f6f7f9"><strong>Newsroom editorial permissions</strong> <span class="muted">(admin-only by default)</span></td></tr>';
  const rows = NEWSROOM_ACTIONS.map(([action, label]) => `
        <tr>
          <td>${label}</td>
          <td colspan="4" style="text-align:center">
            <input type="checkbox" data-resource="news" data-action="${action}" ${newsPerms[action] === true ? "checked" : ""}
              style="width:20px;height:20px;cursor:pointer">
          </td>
        </tr>`).join("");
  return head + rows;
}
const RESOURCE_LABELS = {
  casinos: "Casinos", reviews: "Reviews", news: "News",   "platform-updates": "Platform Updates", pages: "Pages",
  categories: "Categories", countries: "Countries", authors: "Authors",
  components: "Components", seo: "SEO Meta", settings: "Settings",
  media: "Media", nav: "Navigation", permissions: "Permissions", users: "Users"
};

let currentMatrix = {};
let currentRole = "editor";

document.addEventListener("DOMContentLoaded", () => {
  loadPermissionMatrix();
});

async function loadPermissionMatrix() {
  currentRole = document.getElementById("permRoleSelect")?.value || "editor";
  const tbody = document.getElementById("permTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/permissions/list");
    const data = await res.json();
    currentMatrix = data.permissions || {};

    const rolePerms = currentMatrix[currentRole] || {};

    tbody.innerHTML = RESOURCES.map(resource => {
      const resourcePerms = rolePerms[resource] || {};
      const cells = ACTIONS.map(action => {
        const allowed = resourcePerms[action] === true;
        const disabled = (resource === "permissions" && action === "create") || 
                         (resource === "settings" && (action === "create" || action === "delete")) ||
                         (resource === "users" && (action === "create" || action === "delete")) ? "disabled" : "";
        return `
          <td style="text-align:center">
            <input type="checkbox" 
              data-resource="${resource}" 
              data-action="${action}" 
              ${allowed ? "checked" : ""} 
              ${disabled}
              style="width:20px;height:20px;cursor:pointer">
          </td>`;
      }).join("");

      return `
        <tr>
          <td><strong>${RESOURCE_LABELS[resource] || resource}</strong></td>
          ${cells}
        </tr>`;
    }).join("") + newsroomPermissionRows(rolePerms);
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function savePermissions() {
  const alertEl = document.getElementById("permAlert");
  if (alertEl) alertEl.style.display = "none";

  const checkboxes = document.querySelectorAll("#permTableBody input[type=checkbox]");
  const permissions = [];
  for (const cb of checkboxes) {
    permissions.push({
      resource: cb.dataset.resource,
      action: cb.dataset.action,
      allowed: cb.checked
    });
  }

  try {
    const res = await fetch("/en/api/v1/permissions/bulk-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: currentRole,
        permissions
      })
    });
    const data = await res.json();
    if (data.success) {
      if (alertEl) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = `Permissions saved for ${currentRole}!`;
        alertEl.style.display = "block";
      }
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
}
