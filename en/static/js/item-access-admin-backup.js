// =====================================================
// item-access-admin.js — Admin UI for item-level access
// Loaded on /en/dashboard/item-access
// =====================================================

const ITEM_ACCESS_RESOURCES = [
  { key: 'casinos',          label: 'Casinos' },
  { key: 'reviews',          label: 'Reviews' },
  { key: 'news',             label: 'News' },
  { key: 'pages',            label: 'Pages' },
  { key: 'platform-updates', label: 'Platform Updates' },
  { key: 'media',            label: 'Media' }
];

const ITEM_ACCESS_ACTIONS = [
  { key: 'read',   label: 'Read' },
  { key: 'create', label: 'Create' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' }
];

const SCOPE_OPTIONS = [
  { value: 'all',      label: 'All' },
  { value: 'own',      label: 'Own' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'none',     label: 'None' }
];

let itemAccessUsers = [];
let itemAccessCurrentUser = null;
let itemAccessMatrix = {};
let systemDefaultScope = 'all';

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('itemAccessContent')) return;
  initItemAccess();
});

async function initItemAccess() {
  await loadItemAccessUsers();
  await loadSystemDefaultScope();
  setupUserSelector();
  renderSystemDefaultBanner();
}

async function loadItemAccessUsers() {
  try {
    const res = await fetch('/en/api/v1/admin/users');
    const data = await res.json();
    itemAccessUsers = data.users || [];
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

async function loadSystemDefaultScope() {
  try {
    const res = await fetch('/en/api/v1/admin/item-access/default-scope');
    const data = await res.json();
    if (data.success) systemDefaultScope = data.scope;
  } catch (e) {
    console.error('Failed to load default scope:', e);
  }
}

function renderSystemDefaultBanner() {
  const banner = document.getElementById('itemAccessDefaultBanner');
  if (!banner) return;
  const color = systemDefaultScope === 'none' ? '#e74c3c' : '#27ae60';
  banner.innerHTML = `
    <div style="padding:0.75rem 1rem;border-radius:6px;background:#f8f9fa;border-left:4px solid ${color};margin-bottom:1.5rem;">
      <strong>System Default Scope:</strong> ${systemDefaultScope.toUpperCase()}
      <span class="muted" style="margin-left:0.5rem;">
        — When no explicit rule exists for a user, this scope is used.
      </span>
      <button onclick="changeDefaultScope()" style="float:right;" class="btn btn--sm">Change</button>
    </div>
  `;
}

async function changeDefaultScope() {
  const newScope = prompt(
    `Set system default scope.\n\nCurrent: ${systemDefaultScope}\n\nOptions: all, own, assigned, none\n\nRecommended after configuring all users: none`,
    systemDefaultScope
  );
  if (!newScope || !['all', 'own', 'assigned', 'none'].includes(newScope)) return;

  try {
    await fetch('/en/api/v1/admin/item-access/default-scope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: newScope })
    });
    systemDefaultScope = newScope;
    renderSystemDefaultBanner();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

function setupUserSelector() {
  const select = document.getElementById('itemAccessUserSelect');
  if (!select) return;

  select.innerHTML = '<option value="">Select a user…</option>' +
    itemAccessUsers
      .filter(u => u.role !== 'admin')
      .map(u => `<option value="${u.id}">${u.email} (${u.role})</option>`)
      .join('');

  select.addEventListener('change', (e) => {
    const userId = parseInt(e.target.value, 10);
    if (userId) {
      loadUserItemAccess(userId);
    } else {
      document.getElementById('itemAccessContent').innerHTML = '';
    }
  });
}

async function loadUserItemAccess(userId) {
  itemAccessCurrentUser = userId;

  try {
    const res = await fetch(`/en/api/v1/admin/item-access/user?user_id=${userId}`);
    const data = await res.json();
    itemAccessMatrix = {};
    for (const rule of (data.access || [])) {
      itemAccessMatrix[`${rule.resource}|${rule.action}`] = rule.scope;
    }
    renderItemAccessMatrix();
  } catch (e) {
    document.getElementById('itemAccessContent').innerHTML =
      '<p class="alert alert--error">Failed to load access rules.</p>';
  }
}

function renderItemAccessMatrix() {
  const container = document.getElementById('itemAccessContent');
  if (!container) return;

  const userEmail = itemAccessUsers.find(u => u.id === itemAccessCurrentUser)?.email || '';

  let html = `
    <div class="card">
      <div class="card__header">
        <h3>Item-Level Access — ${userEmail}</h3>
        <p class="muted">Controls <strong>which records</strong> this user can access.
        Blank cells use the system default (${systemDefaultScope.toUpperCase()}).</p>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Resource</th>
            ${ITEM_ACCESS_ACTIONS.map(a => `<th style="text-align:center">${a.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;

  for (const resource of ITEM_ACCESS_RESOURCES) {
    html += `<tr><td><strong>${resource.label}</strong></td>`;
    for (const action of ITEM_ACCESS_ACTIONS) {
      const key = `${resource.key}|${action.key}`;
      const currentScope = itemAccessMatrix[key];
      const isExplicit = currentScope !== undefined;
      const displayScope = currentScope || systemDefaultScope;

      html += `<td style="text-align:center">
        <select
          data-resource="${resource.key}"
          data-action="${action.key}"
          class="scope-select"
          onchange="saveItemAccessScope(this)"
        >
          <option value="" ${!isExplicit ? 'selected' : ''}>
            Default (${systemDefaultScope})
          </option>
          ${SCOPE_OPTIONS.map(opt =>
            `<option value="${opt.value}" ${isExplicit && currentScope === opt.value ? 'selected' : ''}>${opt.label}</option>`
          ).join('')}
        </select>
      </td>`;
    }
    html += '</tr>';
  }

  html += `
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:1.5rem">
      <div class="card__header">
        <h3>Item Assignments</h3>
        <p class="muted">Assign specific records to this user (used when scope = "Assigned").</p>
      </div>
      <div id="assignmentPanel">
        ${renderAssignmentPanel()}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function renderAssignmentPanel() {
  let html = '<div class="form-row"><label>Resource:</label><select id="assignResourceSelect" onchange="loadAssignmentList()">';
  for (const r of ITEM_ACCESS_RESOURCES) {
    html += `<option value="${r.key}">${r.label}</option>`;
  }
  html += '</select></div><div id="assignmentList"></div>';
  return html;
}

async function saveItemAccessScope(selectEl) {
  const resource = selectEl.dataset.resource;
  const action = selectEl.dataset.action;
  const scope = selectEl.value;

  try {
    if (scope === '') {
      // Revert to default — delete the explicit row
      await fetch('/en/api/v1/admin/item-access/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: itemAccessCurrentUser,
          resource,
          action
        })
      });
    } else {
      await fetch('/en/api/v1/admin/item-access/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: itemAccessCurrentUser,
          resource,
          action,
          scope
        })
      });
    }
    selectEl.style.borderColor = '#27ae60';
    setTimeout(() => { selectEl.style.borderColor = ''; }, 1000);
  } catch (e) {
    alert('Failed to save: ' + e.message);
    loadUserItemAccess(itemAccessCurrentUser);
  }
}

async function loadAssignmentList() {
  const resource = document.getElementById('assignResourceSelect')?.value;
  const listEl = document.getElementById('assignmentList');
  if (!resource || !listEl) return;

  listEl.innerHTML = '<p class="muted">Loading…</p>';

  try {
    const assignRes = await fetch(
      `/en/api/v1/admin/item-access/assignments?user_id=${itemAccessCurrentUser}&resource=${resource}`
    );
    const assignData = await assignRes.json();
    const assignedIds = new Set(assignData.item_ids || []);

    const endpointMap = {
      'casinos': '/en/api/v1/casinos/list',
      'reviews': '/en/api/v1/reviews/list',
      'news': '/en/api/v1/news/list',
      'pages': '/en/api/v1/pages/list',
      'platform-updates': '/en/api/v1/platform-updates/list',
      'media': '/en/api/v1/media/browse'
    };

    const listRes = await fetch(endpointMap[resource] || '');
    const listData = await listRes.json();

    let items = [];
    let idKey = 'id';
    let labelKey = 'name';

    if (resource === 'casinos') { items = listData.casinos || []; }
    else if (resource === 'reviews') { items = listData.reviews || []; labelKey = 'title'; }
    else if (resource === 'news') { items = listData.news || []; labelKey = 'title'; }
    else if (resource === 'pages') { items = listData.pages || []; labelKey = 'title'; }
    else if (resource === 'platform-updates') { items = listData.updates || []; labelKey = 'title'; }
    else if (resource === 'media') { items = listData.items || []; labelKey = 'filename'; }

    if (items.length === 0) {
      listEl.innerHTML = '<p class="muted">No items found.</p>';
      return;
    }

    let html = '<table class="table"><thead><tr><th>Item</th><th style="text-align:center">Assigned</th></tr></thead><tbody>';
    for (const item of items) {
      const itemId = item[idKey];
      const isAssigned = assignedIds.has(itemId);
      html += `<tr>
        <td>${item[labelKey] || item.slug || itemId}</td>
        <td style="text-align:center">
          <input type="checkbox"
            ${isAssigned ? 'checked' : ''}
            onchange="toggleItemAccessAssignment(${itemId}, this.checked, '${resource}')"
          />
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = `<p class="alert alert--error">Failed to load: ${e.message}</p>`;
  }
}

async function toggleItemAccessAssignment(itemId, checked, resource) {
  const endpoint = checked ? 'assign' : 'unassign';

  try {
    const res = await fetch(
      `/en/api/v1/admin/item-access/${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: itemAccessCurrentUser,
          resource,
          item_id: itemId
        })
      }
    );

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

  } catch (e) {
    alert('Failed: ' + e.message);
    loadAssignmentList();
  }
}

async function toggleItemAccessAssignmentbackup(itemId, checked, resource) {
  const endpoint = checked ? 'assign' : 'unassign';
  try {
    await fetch(`/en/api/v1/admin/item-access/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: itemAccessCurrentUser,
        resource,
        item_id: itemId
      })
    });
  } catch (e) {
    alert('Failed: ' + e.message);
    loadAssignmentList();
  }
}

// Expose for inline handlers
window.saveItemAccessScope = saveItemAccessScope;
window.loadAssignmentList = loadAssignmentList;
window.toggleItemAccessAssignment = toggleItemAccessAssignment;
window.changeDefaultScope = changeDefaultScope;
