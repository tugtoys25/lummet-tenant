document.addEventListener("DOMContentLoaded", () => {
  initProviderAdaptersPage();
});

async function initProviderAdaptersPage() {
  const table = document.getElementById("paTableBody");
  if (!table) return; // not on this page

  await populateProviderAdapterAccountDropdown();
  await loadProviderAdapters();
  initProviderAdapterForm();
  initPaAuthStyle();
  initPaAutoSync();
}

async function populateProviderAdapterAccountDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-accounts/list");
    const data = await res.json();
    const accounts = data.accounts || [];
    document.getElementById("paAccountSelect").innerHTML =
      accounts.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join("")
      || '<option value="">No affiliate accounts yet — create one first</option>';
  } catch { /* leave empty on failure */ }
}

async function loadProviderAdapters() {
  const tbody = document.getElementById("paTableBody");
  try {
    const res = await fetch("/en/api/v1/provider-adapters/list");
    if (res.status === 403) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted">Provider adapters are admin-only.</td></tr>';
      return;
    }
    const data = await res.json();
    const configs = data.configs || [];

    const auto = document.getElementById("paAutoSync");
    if (auto) {
      auto.checked = !!data.auto_sync;
      const note = document.getElementById("paAutoSyncNote");
      if (note) note.textContent = data.auto_sync ? "On: active integrations are pulled when their frequency has elapsed." : "Off: nothing is pulled until you press Sync now.";
    }
    const providerSelect = document.getElementById("paProviderSelect");
    if (providerSelect) {
      providerSelect.innerHTML = (data.available_providers || []).map(p => `<option value="${p}">${p}</option>`).join("")
        || '<option value="">No adapters registered</option>';
    }

    tbody.innerHTML = configs.length
      ? configs.map(c => `
        <tr>
          <td>${escapeHtml(c.label)}</td>
          <td>${escapeHtml(c.account_name)}</td>
          <td>${escapeHtml(c.provider_key)}</td>
          <td>${paKeyCell(c)}</td>
          <td>
            ${c.status === "active" ? '<span class="badge badge--success">active</span>' : '<span class="badge">disabled</span>'}
            ${c.last_sync_status === "error" ? '<span class="badge badge--danger" title="' + escapeHtml(c.last_sync_error || "") + '">sync error</span>' : ""}
          </td>
          <td>${c.last_sync_at ? escapeHtml(c.last_sync_at) : '<span class="muted">never</span>'}</td>
          <td>every ${c.sync_frequency_minutes}m</td>
          <td>
            <button class="btn btn--sm" onclick="testProviderAdapter(${c.id})">Test connection</button>
            <button class="btn btn--sm" onclick="setProviderAdapterKey(${c.id})">${c.key_source ? "New key" : "Add key"}</button>
            <button class="btn btn--sm" onclick="syncProviderAdapterNow(${c.id})">Sync Now</button>
            ${c.status === "active" ? `<button class="btn btn--sm btn--danger" onclick="archiveProviderAdapter(${c.id})">Archive</button>` : ""}
          </td>
        </tr>
      `).join("")
      : '<tr><td colspan="8" class="muted">No provider adapters yet — create one below.</td></tr>';
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="muted">Failed to load.</td></tr>';
  }
}

function initProviderAdapterForm() {
  const form = document.getElementById("paForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("paFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    const payload = {
      account_id: parseInt(formData.get("account_id")),
      label: formData.get("label"),
      provider_key: formData.get("provider_key"),
      api_base_url: formData.get("api_base_url"),
      api_key: formData.get("api_key"),
      date_format: formData.get("date_format") || "iso",
      extra_query: formData.get("extra_query") || null,
      conversions_path: formData.get("conversions_path") || null,
      ...paAuthFields(formData),
      date_param_since: formData.get("date_param_since") || null,
      date_param_until: formData.get("date_param_until") || null,
      response_array_path: formData.get("response_array_path") || null,
      sync_frequency_minutes: formData.get("sync_frequency_minutes") ? parseInt(formData.get("sync_frequency_minutes")) : 60,
      field_mapping_json: formData.get("field_mapping_json") || null,
    };

    try {
      const res = await fetch("/en/api/v1/provider-adapter/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, "Saved. Testing the connection now.", true);
        form.reset();
        await loadProviderAdapters();
        await testProviderAdapter(data.id);
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function syncProviderAdapterNow(id) {
  try {
    const res = await fetch("/en/api/v1/provider-adapter/sync-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.ok && data.error) {
      alert(`Sync failed: ${data.error}`);
    } else {
      alert(`Sync complete — ${data.importedCount} imported, ${data.duplicateCount} duplicates, ${data.unattributedCount} unattributed, ${data.errorCount} errors.`);
    }
    loadProviderAdapters();
  } catch {
    alert("Network error");
  }
}

async function archiveProviderAdapter(id) {
  if (!confirm("Archive this provider adapter? It will stop syncing.")) return;
  try {
    const res = await fetch("/en/api/v1/provider-adapter/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to archive"); return; }
    loadProviderAdapters();
  } catch { alert("Network error"); }
}


function paKeyCell(c) {
  if (c.key_source === "dashboard") return `<span class="badge badge--success">saved ${escapeHtml(c.key_hint || "")}</span>`;
  if (c.key_source === "worker_secret") return '<span class="badge">Worker secret (older setup)</span>';
  if (c.key_source === "unreadable") return '<span class="badge badge--danger" title="The site secret changed. Save the key again.">save again</span>';
  return '<span class="badge badge--danger">missing</span>';
}

function paAuthFields(formData) {
  const style = formData.get("auth_style") || "bearer";
  const name = String(formData.get("auth_name") || "").trim();
  if (style === "header") return { auth_header_name: name || "X-API-KEY", auth_scheme: "", auth_query_param: null };
  if (style === "query") return { auth_header_name: null, auth_scheme: "", auth_query_param: name || "api_key" };
  if (style === "basic") return { auth_header_name: "Authorization", auth_scheme: "Basic", auth_query_param: null };
  return { auth_header_name: "Authorization", auth_scheme: "Bearer", auth_query_param: null };
}

function initPaAuthStyle() {
  const sel = document.getElementById("paAuthStyle");
  if (!sel) return;
  const apply = () => {
    const wrap = document.getElementById("paAuthNameWrap");
    const label = document.getElementById("paAuthNameLabel");
    wrap.style.display = sel.value === "header" || sel.value === "query" ? "" : "none";
    label.textContent = sel.value === "query" ? "Parameter name" : "Header name";
    wrap.querySelector("input").placeholder = sel.value === "query" ? "api_key" : "X-API-KEY";
  };
  sel.addEventListener("change", apply);
  apply();
}

function initPaAutoSync() {
  const box = document.getElementById("paAutoSync");
  if (!box) return;
  box.addEventListener("change", async () => {
    try {
      const res = await fetch("/en/api/v1/provider-adapters/auto-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: box.checked }) });
      const data = await res.json();
      if (!data.success) { box.checked = !box.checked; alert(data.error || "Failed"); }
      await loadProviderAdapters();
    } catch { box.checked = !box.checked; alert("Network error"); }
  });
}

async function setProviderAdapterKey(id) {
  const key = prompt("Paste the API key from your affiliate program. It is stored encrypted and never shown again.");
  if (!key) return;
  try {
    const res = await fetch("/en/api/v1/provider-adapter/secret/set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, api_key: key }) });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed"); return; }
    await loadProviderAdapters();
    await testProviderAdapter(id);
  } catch { alert("Network error"); }
}

async function testProviderAdapter(id) {
  const panel = document.getElementById("paTestPanel");
  panel.style.display = "";
  panel.className = "alert";
  panel.textContent = "Testing the connection...";
  try {
    const res = await fetch("/en/api/v1/provider-adapter/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await res.json();
    const r = data.result || {};
    let html;
    if (r.ok) {
      html = `<strong>Connected.</strong> The provider returned ${r.row_count} conversion(s) for the last 24 hours.`;
      if (r.sample_keys && r.sample_keys.length) html += `<br>Fields it sends: <code>${r.sample_keys.map(escapeHtml).join("</code> <code>")}</code>`;
      if (r.row_count === 0) html += "<br>No conversions in the last 24 hours, so the field names could not be checked yet. That is normal for a quiet account.";
      else if (r.mapping_ok) html += `<br><strong>The first row is understood:</strong> ${escapeHtml(JSON.stringify(r.recognised))}`;
      else html += `<br><strong>The first row is not understood yet:</strong> ${escapeHtml((r.mapping_problems || []).join("; "))}. Add a Field Mapping below that names the matching fields.`;
    } else {
      html = `<strong>Not connected.</strong> ${escapeHtml(r.message || "Failed")}`;
      if (r.top_level_keys && r.top_level_keys.length) html += `<br>Top-level keys in the answer: <code>${r.top_level_keys.map(escapeHtml).join("</code> <code>")}</code>`;
      if (r.outline) html += `<br>Shape of the answer (names only, no values):<pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(r.outline, null, 1))}</pre>`;
    }
    panel.innerHTML = html;
    panel.className = "alert " + (r.ok ? "alert--success" : "alert--error");
  } catch {
    panel.textContent = "Network error";
  }
}
