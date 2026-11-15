document.addEventListener("DOMContentLoaded", () => {
  initPostbackConfigsPage();
});

async function initPostbackConfigsPage() {
  const table = document.getElementById("pbTableBody");
  if (!table) return; // not on this page

  await populateAccountDropdown();
  await loadPostbackConfigs();
  initPostbackForm();
  initPostbackTestForm();
  initPostbackLiveTest();
  initPostbackLog();
  initConnectWizard();
}

function postbackUrl(token) {
  return location.origin + "/en/api/v1/conversions/postback/" + token;
}

async function copyPostbackUrl(token) {
  const url = postbackUrl(token);
  try { await navigator.clipboard.writeText(url); alert("Copied:\n" + url + "\n\nAdd the program's macros as query parameters, e.g. ?click_id={clickId}&event=ftd&amount={sum}&currency={currency}&transaction_id={txid}"); }
  catch { prompt("Copy this postback URL:", url); }
}

function initPostbackLiveTest() {
  const btn = document.getElementById("pbLiveTestBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const id = parseInt(document.getElementById("pbTestConfigSelect").value);
    if (!id) return;
    const resultEl = document.getElementById("pbTestResult");
    const listEl = document.getElementById("pbTestChecklist");
    const rawEl = document.getElementById("pbTestRaw");
    resultEl.style.display = "block";
    try {
      const res = await fetch("/en/api/v1/postback-config/live-test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, click_id: document.getElementById("pbTestClickId").value || undefined }),
      });
      const data = await res.json();
      if (!data.success) { listEl.innerHTML = `<li class="checklist-fail">✗ ${escapeHtml(data.error || "Failed")}</li>`; rawEl.textContent = JSON.stringify(data, null, 2); return; }
      const st = data.steps || {};
      const row = (ok, t) => `<li class="${ok ? "checklist-pass" : "checklist-fail"}">${ok ? "✓" : "✗"} ${t}</li>`;
      listEl.innerHTML = row(st.secret_binding_present, "Secret is bound to this site")
        + row(st.auth_passes, "Authentication passes")
        + (data.hint ? `<li class="checklist-fail">${escapeHtml(data.hint)}</li>` : "");
      rawEl.textContent = JSON.stringify(data, null, 2);
    } catch { listEl.innerHTML = '<li class="checklist-fail">Network error</li>'; }
  });
}

function initPostbackLog() {
  const body = document.getElementById("pbLogBody");
  if (!body) return;
  const load = async () => {
    const outcome = document.getElementById("pbLogOutcome").value;
    try {
      const res = await fetch("/en/api/v1/postback-logs/list?limit=50" + (outcome ? "&outcome=" + encodeURIComponent(outcome) : ""));
      const data = await res.json();
      const logs = data.logs || [];
      body.innerHTML = logs.length ? logs.map(l => `<tr>
        <td>${escapeHtml(String(l.received_at || ""))}</td>
        <td>${escapeHtml(l.config_label || "—")}</td>
        <td><span class="badge">${escapeHtml(l.outcome || "")}</span></td>
        <td class="muted">${escapeHtml(l.reason || "")}</td></tr>`).join("")
        : '<tr><td colspan="4" class="muted">No postbacks received yet.</td></tr>';
    } catch { body.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>'; }
  };
  document.getElementById("pbLogOutcome").addEventListener("change", load);
  document.getElementById("pbLogRefresh").addEventListener("click", load);
  load();
}

async function populateAccountDropdown() {
  try {
    const res = await fetch("/en/api/v1/affiliate-accounts/list");
    const data = await res.json();
    const accounts = data.accounts || [];
    window.__pbAccounts = accounts;
    const options = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}${a.program_name ? " — " + escapeHtml(a.program_name) : ""}</option>`).join("");
    document.getElementById("pbAccountSelect").innerHTML = options || '<option value="">No affiliate accounts yet — create one first</option>';
  } catch { /* leave empty on failure */ }
}

async function loadPostbackConfigs() {
  const tbody = document.getElementById("pbTableBody");
  const testSelect = document.getElementById("pbTestConfigSelect");
  try {
    const res = await fetch("/en/api/v1/postback-configs/list");
    if (res.status === 403) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Postback integrations are admin-only.</td></tr>';
      return;
    }
    const data = await res.json();
    const configs = data.configs || [];

    if (!configs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No postback integrations yet — create one below.</td></tr>';
    } else {
      tbody.innerHTML = configs.map(c => `
        <tr>
          <td>${escapeHtml(c.label)}</td>
          <td>${escapeHtml(c.account_name)}</td>
          <td>${escapeHtml(c.auth_method)}</td>
          <td>${c.status === "active" ? '<span class="badge badge--success">active</span>' : '<span class="badge">disabled</span>'}</td>
          <td><span data-health-for="${c.id}" class="muted">loading…</span></td>
          <td><code style="font-size:11px">/en/api/v1/conversions/postback/${c.endpoint_token.slice(0, 8)}…</code></td>
          <td>
            <button class="btn btn--sm" onclick="copyPostbackUrl('${c.endpoint_token}')">Copy URL</button>
            <button class="btn btn--sm" onclick="rotatePostbackToken(${c.id})">Rotate URL</button>
            <button class="btn btn--sm btn--primary" onclick="showSetupLinks(${c.id})">Setup links</button>
            <button class="btn btn--sm" onclick="showPostbackSecret(${c.id}, '${c.endpoint_token}')">Show secret</button>
            <button class="btn btn--sm" onclick="newPostbackSecret(${c.id}, '${c.endpoint_token}')">New secret</button>
            ${c.status === "active" ? `<button class="btn btn--sm btn--danger" onclick="archivePostbackConfig(${c.id})">Archive</button>` : ""}
          </td>
        </tr>
      `).join("");
      configs.forEach(c => loadConversionHealthBadge(c.id));
    }

    if (testSelect) {
      testSelect.innerHTML = configs
        .filter(c => c.status === "active")
        .map(c => `<option value="${c.id}">${escapeHtml(c.label)} (${escapeHtml(c.account_name)})</option>`).join("")
        || '<option value="">No active integrations</option>';
    }
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load.</td></tr>';
  }
}

async function loadConversionHealthBadge(configId) {
  const el = document.querySelector(`[data-health-for="${configId}"]`);
  if (!el) return;
  try {
    const res = await fetch(`/en/api/v1/postback-config/health?id=${configId}`);
    const data = await res.json();
    const h = data.health;
    if (!h || !h.has_data) {
      el.textContent = "no data yet";
      return;
    }
    const pct = Math.round((h.attributed_rate || 0) * 100);
    el.innerHTML = `${h.accepted} accepted, ${pct}% attributed${h.unattributed ? `, ${h.unattributed} unattributed` : ""}`;
  } catch {
    el.textContent = "—";
  }
}

function initPostbackForm() {
  const form = document.getElementById("pbForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("pbFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    const payload = {
      account_id: parseInt(formData.get("account_id")),
      label: formData.get("label"),
      auth_method: formData.get("auth_method"),
      credential_reference: formData.get("credential_reference") || null,
      signature_param: formData.get("signature_param") || null,
      timestamp_param: formData.get("timestamp_param") || null,
      timestamp_tolerance_seconds: formData.get("timestamp_tolerance_seconds") ? parseInt(formData.get("timestamp_tolerance_seconds")) : 300,
      allowed_ips: formData.get("allowed_ips") || null,
      field_mapping_json: formData.get("field_mapping_json") || null,
    };

    try {
      const res = await fetch("/en/api/v1/postback-config/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, `Integration created. Postback URL: ${postbackUrl(data.endpoint_token)}` + (data.secret ? ` — secret: ${data.secret} (add it to the URL as &secret=...; you can show it again later with Show secret).` : ""), true);
        form.reset();
        await loadPostbackConfigs();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

async function rotatePostbackToken(id) {
  if (!confirm("Rotate this integration's postback URL? The old URL will stop working immediately — update it with the provider afterward.")) return;
  try {
    const res = await fetch("/en/api/v1/postback-config/rotate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to rotate"); return; }
    alert(`New postback URL: /en/api/v1/conversions/postback/${data.endpoint_token}`);
    loadPostbackConfigs();
  } catch { alert("Network error"); }
}

async function archivePostbackConfig(id) {
  if (!confirm("Archive this integration? Its postback URL will stop accepting requests.")) return;
  try {
    const res = await fetch("/en/api/v1/postback-config/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Failed to archive"); return; }
    loadPostbackConfigs();
  } catch { alert("Network error"); }
}

function initPostbackTestForm() {
  const form = document.getElementById("pbTestForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById("pbTestConfigSelect").value);
    if (!id) return;

    const payload = {
      id,
      payload: {
        click_id: document.getElementById("pbTestClickId").value || undefined,
        conversion_type: document.getElementById("pbTestType").value,
        status: "confirmed",
        reported_value: parseFloat(document.getElementById("pbTestValue").value) || 0,
        currency: document.getElementById("pbTestCurrency").value || "USD",
      },
    };

    try {
      const res = await fetch("/en/api/v1/postback-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      renderTestResult(data);
    } catch {
      document.getElementById("pbTestResult").style.display = "block";
      document.getElementById("pbTestChecklist").innerHTML = '<li class="checklist-fail">Network error</li>';
    }
  });
}

// Ordered checklist matching the brief's postback-testing UI example
// (click found → tracking link → casino → partner → account →
// commercial term → commission → stored).
const PB_TEST_STEP_LABELS = [
  ["click_found", "Click found"],
  ["tracking_link_resolved", "Tracking link resolved"],
  ["casino_resolved", "Casino resolved"],
  ["partner_resolved", "Partner resolved"],
  ["account_resolved", "Account resolved"],
  ["commercial_term_resolved", "Commercial term resolved"],
  ["commission_calculated", "Commission calculated"],
];

function renderTestResult(data) {
  const resultEl = document.getElementById("pbTestResult");
  const listEl = document.getElementById("pbTestChecklist");
  const rawEl = document.getElementById("pbTestRaw");
  resultEl.style.display = "block";

  if (!data.success) {
    listEl.innerHTML = `<li class="checklist-fail">✗ ${escapeHtml(data.error || "Test failed")}</li>`;
    rawEl.textContent = JSON.stringify(data, null, 2);
    return;
  }

  const steps = data.steps || {};
  let html = PB_TEST_STEP_LABELS.map(([key, label]) => {
    const pass = !!steps[key];
    return `<li class="${pass ? "checklist-pass" : "checklist-fail"}">${pass ? "✓" : "✗"} ${label}</li>`;
  }).join("");

  if (steps.program_mismatch) {
    html += `<li class="checklist-fail">✗ Click belongs to a different program — rejected for this account's protection</li>`;
  }

  const outcomeLabel = { would_accept: "Would be ACCEPTED", would_be_unattributed: "Would be recorded UNATTRIBUTED" }[data.outcome] || data.outcome;
  html += `<li><strong>Result: ${escapeHtml(outcomeLabel)}</strong>${data.calculated_commission != null ? ` — commission: ${data.calculated_commission}` : ""}</li>`;

  listEl.innerHTML = html;
  rawEl.textContent = JSON.stringify(data, null, 2);
}


// ── Connect-a-program wizard ──────────────────────────────────────────
const PBW_FIELDS = [
  ["click_id", "Click ID (required)", "click_id", ""],
  ["conversion_type", "Event name", "event", ""],
  ["status", "Status", "status", ""],
  ["reported_value", "Amount (deposit)", "amount", ""],
  ["currency", "Currency", "currency", ""],
  ["country_code", "Country", "country", ""],
  ["external_reference", "Transaction ID", "transaction_id", ""],
  ["reported_commission", "Payout / commission", "payout", ""],
  ["external_player_id", "Player ID", "player_id", ""],
  ["occurred_at", "Time", "timestamp", ""],
  ["promo_code", "Promo code", "promo", ""],
];
let pbwPresets = [];

function pbwRandomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function initConnectWizard() {
  const sel = document.getElementById("pbwPreset");
  if (!sel) return;
  try {
    const res = await fetch("/en/api/v1/postback-config/presets");
    const data = await res.json();
    pbwPresets = data.presets || [];
  } catch { pbwPresets = []; }
  const groups = { operator: "Casino and betting programs", platform: "Affiliate platforms", tracker: "Tracker-style postbacks" };
  let html = "";
  for (const fam of Object.keys(groups)) {
    const items = pbwPresets.filter((p) => p.family === fam);
    if (items.length) html += `<optgroup label="${groups[fam]}">${items.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}</optgroup>`;
  }
  html += '<option value="custom">Custom program…</option>';
  sel.innerHTML = html;
  // The account list is filled by populateAccountDropdown() for the other form; copy it once it is there.
  const acc = document.getElementById("pbAccountSelect");
  const fillPrograms = () => {
    const accounts = window.__pbAccounts || [];
    const programs = new Map();
    accounts.forEach((a) => { if (a.program_id != null && !programs.has(a.program_id)) programs.set(a.program_id, a.program_name || ("Program " + a.program_id)); });
    const progSel = document.getElementById("pbwProgram");
    progSel.innerHTML = programs.size
      ? Array.from(programs, ([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join("")
      : '<option value="">No affiliate programs yet — create one under Programs first</option>';
    pbwPickProgramFor(document.getElementById("pbwPreset").value);
    pbwFilterAccounts();
  };
  fillPrograms(); setTimeout(fillPrograms, 600); setTimeout(fillPrograms, 1500);
  document.getElementById("pbwProgram").addEventListener("change", pbwFilterAccounts);

  document.getElementById("pbwcRows").innerHTML = PBW_FIELDS.map(([f, label, p]) =>
    `<tr><td>${label}</td><td><input type="text" data-pbwc-param="${f}" placeholder="${p}"></td><td><input type="text" data-pbwc-macro="${f}" placeholder="macro"></td></tr>`).join("");

  sel.addEventListener("change", () => { pbwPickProgramFor(sel.value); pbwFilterAccounts(); pbwShowInfo(); });
  document.getElementById("pbwCreate").addEventListener("click", pbwCreate);
  pbwShowInfo();
}

// The program list is the site's own affiliate programs. Choosing a known program such as Pin-Up picks the one with a matching name.
function pbwPickProgramFor(presetId) {
  const p = pbwPresets.find((x) => x.id === presetId);
  const progSel = document.getElementById("pbwProgram");
  if (!p || !progSel) return;
  const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const full = norm(String(p.name).replace(/\(.*$/, ""));
  const short = full.replace(/partners?$/, "");
  const key = short.length >= 3 ? short : full;
  if (!key) return;
  const hit = Array.from(progSel.options).find((o) => o.value && (norm(o.textContent).includes(key) || key.includes(norm(o.textContent))));
  if (hit) progSel.value = hit.value;
}

function pbwFilterAccounts() {
  const accounts = window.__pbAccounts || [];
  const pid = document.getElementById("pbwProgram").value;
  const mine = accounts.filter((a) => String(a.program_id) === String(pid));
  const accSel = document.getElementById("pbwAccount");
  accSel.innerHTML = mine.length
    ? mine.map((a) => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join("")
    : '<option value="">This program has no account yet — create one first</option>';
}

function pbwShowInfo() {
  const id = document.getElementById("pbwPreset").value;
  const info = document.getElementById("pbwInfo");
  const custom = document.getElementById("pbwCustom");
  custom.style.display = id === "custom" ? "block" : "none";
  const p = pbwPresets.find((x) => x.id === id);
  if (!p) { info.textContent = ""; return; }
  const conf = { documented: "Macros from the program's public documentation", partial: "Click-ID name and event style known; macro names are the usual ones", typical: "Typical setup; confirm the macro names in your manager's panel" }[p.confidence] || "";
  info.innerHTML = `<span class="badge">${escapeHtml(p.confidence)}</span> ${escapeHtml(conf)}. Click-ID name on your links: <code>${escapeHtml(p.click_id_param || "")}</code>.`
    + (p.notes.length ? "<ul>" + p.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("") + "</ul>" : "");
  const label = document.getElementById("pbwLabel");
  if (!label.value) label.value = p.name + " postback";
}

function pbwCustomDefinition() {
  const rows = PBW_FIELDS.map(([f]) => ({
    field: f,
    param: document.querySelector(`[data-pbwc-param="${f}"]`).value.trim(),
    macro: document.querySelector(`[data-pbwc-macro="${f}"]`).value.trim(),
  }));
  return {
    name: document.getElementById("pbwcName").value || "Custom program",
    syntax: document.getElementById("pbwcSyntax").value,
    event_mode: document.getElementById("pbwcMode").value,
    click_id_param: document.getElementById("pbwcLinkParam").value.trim() || null,
    rows,
    events: ["registration", "ftd", "deposit"],
  };
}

async function pbwCreate() {
  const alertEl = document.getElementById("pbwAlert");
  alertEl.style.display = "none";
  const presetId = document.getElementById("pbwPreset").value;
  const accountId = parseInt(document.getElementById("pbwAccount").value);
  const label = document.getElementById("pbwLabel").value.trim();
  if (!accountId || !label) { affShowAlert(alertEl, "Choose an affiliate account and give the integration a label.", false); return; }
  const buildBody = presetId === "custom" ? { custom: pbwCustomDefinition() } : { preset_id: presetId };

  try {
    // 1. Work out the mapping (this also validates a custom definition before anything is created).
    let res = await fetch("/en/api/v1/postback-config/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody) });
    let data = await res.json();
    if (!data.success) { affShowAlert(alertEl, data.error || "Could not build the setup", false); return; }
    // 2. Create the integration.
    res = await fetch("/en/api/v1/postback-config/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      account_id: accountId, label, auth_method: "shared_secret", signature_param: "secret",
      field_mapping_json: data.setup.field_mapping_json,
    }) });
    const created = await res.json();
    if (!created.success) { affShowAlert(alertEl, created.error || "Could not create the integration", false); return; }

    // 3. Rebuild with the real token so the URLs are final.
    res = await fetch("/en/api/v1/postback-config/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...buildBody, config_id: created.id }) });
    data = await res.json();
    pbwRenderResult(data.setup, created.secret);
    loadPostbackConfigs();
  } catch { affShowAlert(alertEl, "Network error", false); }
}

function pbwRenderResult(setup, secretValue) {
  const el = document.getElementById("pbwResult");
  el.style.display = "block";
  const urls = setup.urls.map((u) => ({ ...u, url: u.url.replace("YOUR_SECRET", secretValue) }));
  el.innerHTML = `
    <h3>1. Integration created</h3>
    <p>The secret was generated and saved by this site. It is already in the URLs below. You can show it again at any time with <strong>Show secret</strong> in the table.</p>
    <h3>2. Paste these URLs into ${escapeHtml(setup.name)}</h3>
    ${urls.map((u, i) => `<div class="form-group"><label>${escapeHtml(u.label)}</label><input type="text" readonly value="${escapeHtml(u.url)}" id="pbwUrl${i}"><button type="button" class="btn btn--sm" data-pbw-copy="${i}">Copy</button></div>`).join("")}
    ${setup.notes.length ? "<ul>" + setup.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("") + "</ul>" : ""}
    <h3>3. Tell your tracking links which click-ID name to use</h3>
    <div id="pbwLinks" class="muted">Loading links…</div>`;
  el.querySelectorAll("[data-pbw-copy]").forEach((b) => b.addEventListener("click", async () => {
    const v = document.getElementById("pbwUrl" + b.dataset.pbwCopy).value;
    try { await navigator.clipboard.writeText(v); b.textContent = "Copied"; } catch { prompt("Copy this URL:", v); }
  }));
  pbwRenderLinks(setup.tracking_link.click_id_param);
}

async function pbwRenderLinks(clickIdParam) {
  const box = document.getElementById("pbwLinks");
  if (!clickIdParam) { box.textContent = "This program needs no change on your links."; return; }
  try {
    const res = await fetch("/en/api/v1/tracking-links/list");
    const data = await res.json();
    const links = data.tracking_links || [];
    if (!links.length) { box.textContent = "You have no tracking links yet. When you create one, set its click-ID name to " + clickIdParam + "."; return; }
    box.innerHTML = `<p>Links that send traffic to this program should hand over the click ID as <code>${escapeHtml(clickIdParam)}</code>. Tick the links to update:</p>`
      + links.map((l) => `<label style="display:block"><input type="checkbox" data-pbw-link="${l.id}"> ${escapeHtml(l.internal_name || l.tracking_code)}</label>`).join("")
      + '<button type="button" class="btn btn--secondary" id="pbwApply">Apply to ticked links</button> <span id="pbwApplyMsg" class="muted"></span>';
    document.getElementById("pbwApply").addEventListener("click", async () => {
      const ids = Array.from(box.querySelectorAll("[data-pbw-link]:checked")).map((c) => parseInt(c.dataset.pbwLink));
      if (!ids.length) return;
      const r = await fetch("/en/api/v1/tracking-link/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, click_id_param: clickIdParam }) });
      const d = await r.json();
      document.getElementById("pbwApplyMsg").textContent = d.success ? `Updated ${d.updated} link(s).` : (d.error || "Failed");
    });
  } catch { box.textContent = "Could not load tracking links."; }
}


async function showPostbackSecret(id, token) {
  const res = await fetch("/en/api/v1/postback-config/secret/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  const data = await res.json();
  if (!data.success) {
    if (confirm((data.error || "No secret yet.") + "\n\nGenerate one now?")) return newPostbackSecret(id, token, true);
    return;
  }
  prompt("Secret (the URL carries it as &secret=...). Full URL base:\n" + postbackUrl(token), data.secret);
}

async function newPostbackSecret(id, token, skipConfirm) {
  if (!skipConfirm && !confirm("Generate a new secret? The old one stops working immediately, so update the URL in the affiliate program.")) return;
  const res = await fetch("/en/api/v1/postback-config/secret/set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  const data = await res.json();
  if (!data.success) { alert(data.error || "Failed"); return; }
  prompt("New secret. Add it to the URL as &secret=...\n" + postbackUrl(token), data.secret);
}


// The finished links for an integration that already exists: its own address and secret plus the chosen program's macros.
async function showSetupLinks(id) {
  const list = (pbwPresets || []).filter((p) => p.id !== "custom");
  if (!list.length) { alert("The program list is not loaded yet. Reload the page."); return; }
  const answer = prompt("Which program is this integration for? Type its number:\n" + list.map((p, i) => `${i + 1}. ${p.name}`).join("\n"));
  const preset = list[parseInt(answer, 10) - 1];
  if (!preset) return;
  try {
    const sres = await fetch("/en/api/v1/postback-config/secret/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const sdata = await sres.json();
    if (!sdata.success) { alert(sdata.error || "This integration has no secret yet. Use New secret first."); return; }
    const res = await fetch("/en/api/v1/postback-config/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset_id: preset.id, config_id: id }) });
    const data = await res.json();
    if (!data.success) { alert(data.error || "Could not build the links"); return; }
    pbwRenderResult(data.setup, sdata.secret);
    const el = document.getElementById("pbwResult");
    el.querySelector("h3").textContent = "Your finished links";
    el.querySelector("p").textContent = "These use this integration's own address and secret. Paste each one into the matching postback in the program.";
    el.scrollIntoView({ behavior: "smooth" });
  } catch { alert("Network error"); }
}
