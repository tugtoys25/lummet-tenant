document.addEventListener("DOMContentLoaded", () => {
  initPostbackConfigsPage();
});

async function initPostbackConfigsPage() {
  const table = document.getElementById("pbTableBody");
  if (!table) return; // not on this page

  initHubTabs();
  await populateAccountDropdown();
  await loadHubSummary();
  await loadPostbackConfigs();
  initPostbackForm();
  initPostbackTestForm();
  initPostbackLiveTest();
  initPostbackLog();
  await initConnectWizard();
  pbOpenInitialTab();
}

function postbackUrl(token) {
  return location.origin + "/en/api/v1/conversions/postback/" + token;
}

async function copyPostbackUrl(token) {
  const url = postbackUrl(token);
  try { await navigator.clipboard.writeText(url); pbToast("Address copied. Use Setup links for the finished URLs with the program's macros and your secret."); }
  catch { pbModal("Postback address", `<input type="text" readonly value="${escapeHtml(url)}" onfocus="this.select()">`); }
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
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Postback integrations are admin-only.</td></tr>';
      return;
    }
    const data = await res.json();
    const configs = data.configs || [];
    window.__pbConfigs = configs;
    const per = (window.__pbSummary && window.__pbSummary.per_config) || {};

    if (!configs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No integrations yet. Use <strong>Connect a program</strong> to create your first one.</td></tr>';
    } else {
      tbody.innerHTML = configs.map(c => {
        const n = per[c.id] || { ok: 0, bad: 0 };
        const acc = (window.__pbAccounts || []).find((a) => a.id === c.account_id);
        return `
        <tr>
          <td><strong>${escapeHtml(c.label)}</strong></td>
          <td>${escapeHtml(c.account_name)}${acc && acc.program_name ? `<div class="muted">${escapeHtml(acc.program_name)}</div>` : ""}</td>
          <td>${c.status === "active" ? '<span class="badge badge--success">active</span>' : '<span class="badge">disabled</span>'}</td>
          <td>${n.ok} ok${n.bad ? `, <span style="color:#e5534b">${n.bad} problem${n.bad === 1 ? "" : "s"}</span>` : ""}</td>
          <td><span data-health-for="${c.id}" class="muted">loading…</span></td>
          <td><div class="pbh-actions">
            <button class="btn btn--sm btn--primary" onclick="showSetupLinks(${c.id})">Setup links</button>
            <button class="btn btn--sm" onclick="pbTestIntegration(${c.id})">Test</button>
            <details><summary class="btn btn--sm">More ▾</summary><div>
              <button class="btn btn--sm" onclick="copyPostbackUrl('${c.endpoint_token}')">Copy address</button>
              <button class="btn btn--sm" onclick="showPostbackSecret(${c.id}, '${c.endpoint_token}')">Show secret</button>
              <button class="btn btn--sm" onclick="newPostbackSecret(${c.id}, '${c.endpoint_token}')">New secret</button>
              <button class="btn btn--sm" onclick="rotatePostbackToken(${c.id})">Rotate address</button>
              ${c.status === "active" ? `<button class="btn btn--sm btn--danger" onclick="archivePostbackConfig(${c.id})">Archive</button>` : ""}
            </div></details>
          </div></td>
        </tr>`; }).join("");
      configs.forEach(c => loadConversionHealthBadge(c.id));
    }

    if (testSelect) {
      testSelect.innerHTML = configs
        .filter(c => c.status === "active")
        .map(c => `<option value="${c.id}">${escapeHtml(c.label)} (${escapeHtml(c.account_name)})</option>`).join("")
        || '<option value="">No active integrations</option>';
    }
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
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
    pbModal("New postback address", `<p>The old address no longer works. Update it in the program, or open Setup links for the finished URLs.</p><input type="text" readonly value="${escapeHtml(postbackUrl(data.endpoint_token))}" onfocus="this.select()">`);
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

// ───────────────────────── Postback Hub: tabs, summary, helpers ─────────────────────────

const PB_TABS = ["overview", "connect", "integrations", "test", "forwarding", "activity", "advanced"];

function pbShowTab(name, updateHash = true) {
  if (!PB_TABS.includes(name)) name = "overview";
  document.querySelectorAll("[data-pb-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.pbTab === name)));
  document.querySelectorAll("[data-pb-panel]").forEach((p) => { p.hidden = p.dataset.pbPanel !== name; });
  if (updateHash) { try { history.replaceState(null, "", "#" + name); } catch { /* ignore */ } }
}

function initHubTabs() {
  document.querySelectorAll("[data-pb-tab]").forEach((b) => b.addEventListener("click", () => pbShowTab(b.dataset.pbTab)));
  document.querySelectorAll("[data-pb-go]").forEach((b) => b.addEventListener("click", () => pbShowTab(b.dataset.pbGo)));
  // "Done reading, close" shuts the guide box it sits in.
  document.querySelectorAll("[data-pb-guide-close]").forEach((b) => b.addEventListener("click", () => { const d = b.closest("details"); if (d) { d.open = false; d.scrollIntoView({ block: "nearest" }); } }));
  window.addEventListener("hashchange", () => pbShowTab(location.hash.slice(1), false));
  pbShowTab("overview", false);
}

// New users land on Connect; everyone else on the overview. A link such as #activity always wins.
function pbOpenInitialTab() {
  const h = location.hash.slice(1);
  if (PB_TABS.includes(h)) return pbShowTab(h, false);
  const none = !(window.__pbConfigs || []).length;
  pbShowTab(none ? "connect" : "overview", false);
}

function pbToast(msg) {
  let t = document.getElementById("pbToast");
  if (!t) { t = document.createElement("div"); t.id = "pbToast"; t.setAttribute("role", "status"); t.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 16px;border-radius:8px;z-index:1100;max-width:90vw"; document.body.appendChild(t); }
  t.textContent = msg; t.style.display = "block";
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = "none"; }, 4500);
}

// A small dialog used instead of the browser's built-in popups, which can't be selected on every phone.
function pbModal(title, bodyHtml) {
  const wrap = document.createElement("div");
  wrap.className = "pbh-modal";
  wrap.innerHTML = `<div role="dialog" aria-modal="true"><h3 style="margin-top:0">${escapeHtml(title)}</h3>${bodyHtml}<p style="text-align:right;margin-bottom:0"><button type="button" class="btn" data-pb-close>Close</button></p></div>`;
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.hasAttribute("data-pb-close")) close(); });
  document.body.appendChild(wrap);
  const first = wrap.querySelector("input,select,button"); if (first) first.focus();
  return { el: wrap, close };
}

function pbAgo(ts) {
  if (!ts) return "never";
  const t = Date.parse(String(ts).replace(" ", "T") + (String(ts).includes("Z") || String(ts).includes("+") ? "" : "Z"));
  if (isNaN(t)) return String(ts);
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  if (m < 1440) return Math.round(m / 60) + " h ago";
  return Math.round(m / 1440) + " d ago";
}

async function loadHubSummary() {
  const cards = document.getElementById("pbsCards");
  if (!cards) return;
  try {
    const res = await fetch("/en/api/v1/postback-config/summary");
    const d = await res.json();
    if (!d.success) throw new Error("x");
    const s = d.summary;
    window.__pbSummary = s;
    const card = (n, label, cls = "") => `<div class="pbh-card ${cls}"><b>${n}</b><small>${label}</small></div>`;
    const l = s.last_24h;
    cards.innerHTML = card(s.integrations_active, "active integrations")
      + card(l.accepted, "accepted, last 24 h", l.accepted ? "pbh-card--good" : "")
      + card(l.unattributed, "not matched to a click", l.unattributed ? "pbh-card--warn" : "")
      + card(l.rejected, "rejected", l.rejected ? "pbh-card--bad" : "")
      + card(escapeHtml(pbAgo(s.last_accepted_at)), "last accepted postback");
    const items = [];
    if (!s.integrations_total) items.push('No integration yet. <a href="#connect" data-pb-go="connect">Connect a program</a>.');
    (s.never_received || []).forEach((c) => items.push(`<strong>${escapeHtml(c.label)}</strong> has not received a postback yet. Paste its URLs into the program (<a href="#integrations" data-pb-go="integrations">Setup links</a>) and send a test.`));
    if (l.rejected) items.push(`${l.rejected} postback(s) were rejected in the last 24 h, usually a wrong or missing secret. <a href="#activity" data-pb-go="activity">See why</a>.`);
    if (l.unattributed) items.push(`${l.unattributed} conversion(s) could not be matched to a click. The click-ID name on your tracking links must match what the program sends back. <a href="#activity" data-pb-go="activity">Details</a>.`);
    document.getElementById("pbsAttention").innerHTML = items.length ? items.map((i) => `<li>${i}</li>`).join("") : '<li class="done">Nothing needs attention.</li>';
    const hasProgram = (window.__pbAccounts || []).length > 0;
    const steps = [
      [hasProgram, "A program and account exist"],
      [s.integrations_total > 0, "An integration is created for it"],
      [!!s.last_accepted_at, "A real postback has been accepted"],
      [s.forwards_active > 0, "(Optional) conversions are forwarded to your tracker or ad platform"],
    ];
    document.getElementById("pbsSteps").innerHTML = steps.map(([ok, t]) => `<li class="${ok ? "done" : ""}">${t}</li>`).join("");
    document.querySelectorAll("#pbsAttention [data-pb-go]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); pbShowTab(a.dataset.pbGo); }));
  } catch { cards.innerHTML = '<div class="pbh-card"><small>Could not load the summary.</small></div>'; }
}

function pbTestIntegration(id) {
  const sel = document.getElementById("pbTestConfigSelect");
  if (sel) sel.value = String(id);
  pbShowTab("test");
  const el = document.getElementById("pbTestForm"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ───────────────────────── Connect a program ─────────────────────────

let pbMode = "existing";

function pbwRandomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const pbNorm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Which known program type a program name most likely belongs to ("Pin-Up Partners (EN)" -> Pin-Up).
function pbGuessPreset(name) {
  const n = pbNorm(name);
  if (!n) return null;
  let best = null;
  for (const p of pbwPresets) {
    if (p.id === "custom") continue;
    const full = pbNorm(String(p.name).replace(/\(.*$/, ""));
    const short = full.replace(/partners?$/, "");
    const key = short.length >= 3 ? short : full;
    if (key && (n.includes(key) || key.includes(n)) && (!best || key.length > best.len)) best = { p, len: key.length };
  }
  return best ? best.p : null;
}

function pbSetMode(mode) {
  pbMode = mode;
  document.querySelectorAll("[data-pb-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pbMode === mode)));
  document.getElementById("pbwModeExisting").style.display = mode === "existing" ? "" : "none";
  document.getElementById("pbwModeNew").style.display = mode === "new" ? "" : "none";
  const ge = document.getElementById("pbGuideExisting"), gn = document.getElementById("pbGuideNew");
  if (ge) ge.style.display = mode === "existing" ? "" : "none";
  if (gn) gn.style.display = mode === "new" ? "" : "none";
  pbwPrefillNew();
}

async function pbwReloadData() {
  await populateAccountDropdown();
  await pbwLoadOverview();
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
  html += '<option value="custom">Something else (describe what it sends)…</option>';
  sel.innerHTML = html;

  document.getElementById("pbwcRows").innerHTML = PBW_FIELDS.map(([f, label, p]) =>
    `<tr><td>${label}</td><td><input type="text" data-pbwc-param="${f}" placeholder="${p}"></td><td><input type="text" data-pbwc-macro="${f}" placeholder="macro"></td></tr>`).join("");

  document.querySelectorAll("[data-pb-mode]").forEach((b) => b.addEventListener("click", () => pbSetMode(b.dataset.pbMode)));
  document.getElementById("pbwProgram").addEventListener("change", () => { pbwFilterAccounts(); const g = pbGuessPreset((pbwProgramRow() || {}).name); if (g) { sel.value = g.id; pbwShowInfo(); } });
  sel.addEventListener("change", () => { pbwShowInfo(); pbwPrefillNew(); });
  document.getElementById("pbnPartner").addEventListener("change", pbnTogglePartner);
  document.getElementById("pbwCreate").addEventListener("click", pbwCreate);
  document.getElementById("pbwCasinoSearch").addEventListener("input", pbwFilterCasinos);
  document.getElementById("pbwCasinoAll").addEventListener("click", () => { document.querySelectorAll("[data-pbw-casino]").forEach((c) => { if (!c.closest("[hidden]")) c.checked = true; }); pbwCountCasinos(); });
  document.getElementById("pbwCasinoNone").addEventListener("click", () => { document.querySelectorAll("[data-pbw-casino], [data-pbw-group]").forEach((c) => { c.checked = false; }); pbwCountCasinos(); });
  document.getElementById("pbwApplyHandoff").addEventListener("click", pbwApplyHandoffClick);

  await pbwLoadOverview();
  pbwShowInfo();
}

const pbwProgramRow = () => (window.__pbPrograms || []).find((p) => String(p.id) === String(document.getElementById("pbwProgram").value));

async function pbwLoadOverview() {
  const grp = document.getElementById("pbwCasinoGroups");
  const progSel = document.getElementById("pbwProgram");
  const keepProgram = progSel.value;
  const keepCasinos = new Set(Array.from(document.querySelectorAll("[data-pbw-casino]:checked")).map((c) => c.value));
  try {
    const res = await fetch("/en/api/v1/postback-config/program-overview");
    const d = await res.json();
    if (!d.success) throw new Error("x");
    window.__pbPrograms = d.programs || [];
    window.__pbPartners = d.partners || [];
    progSel.innerHTML = (d.programs || []).length
      ? d.programs.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}${p.partner_name ? " (" + escapeHtml(p.partner_name) + ")" : ""}</option>`).join("")
      : '<option value="">No programs yet. Use "Set up something new".</option>';
    if (keepProgram && Array.from(progSel.options).some((o) => o.value === keepProgram)) progSel.value = keepProgram;
    document.getElementById("pbnPartner").innerHTML = '<option value="">+ New partner…</option>' + (d.partners || []).map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${p.programs} program${p.programs === 1 ? "" : "s"})</option>`).join("");
    pbnTogglePartner();
    grp.innerHTML = (d.casino_groups || []).map((g, gi) => `<div data-pbw-groupbox style="margin:6px 0"><label><input type="checkbox" data-pbw-group="${gi}"> <strong>${escapeHtml(g.host)}</strong> <span class="muted">(${g.casinos.length})</span></label><div style="margin-left:22px">`
      + g.casinos.map((c) => `<label data-pbw-row data-name="${escapeHtml((c.name + " " + g.host).toLowerCase())}" style="display:block"><input type="checkbox" data-pbw-casino data-pbw-ingroup="${gi}" value="${c.id}"${keepCasinos.has(String(c.id)) ? " checked" : ""}> ${escapeHtml(c.name)} <span class="muted">${c.programs ? "linked to " + escapeHtml(c.programs) : (c.links ? "has a link, no program yet" : "no link yet")}</span></label>`).join("")
      + "</div></div>").join("") || "No casinos yet. Add casinos first, then come back.";
    grp.querySelectorAll("[data-pbw-group]").forEach((g) => g.addEventListener("change", () => {
      grp.querySelectorAll(`[data-pbw-ingroup="${g.dataset.pbwGroup}"]`).forEach((c) => { if (!c.closest("[hidden]")) c.checked = g.checked; });
      pbwCountCasinos();
    }));
    grp.querySelectorAll("[data-pbw-casino]").forEach((c) => c.addEventListener("change", pbwCountCasinos));
    pbwCountCasinos();
  } catch { grp.textContent = "Could not load casinos and programs. Reload the page."; }
  pbwFilterAccounts();
  // Nothing exists yet: go straight to the form that creates everything.
  if (!(window.__pbPrograms || []).length && pbMode === "existing") pbSetMode("new");
}

function pbwFilterCasinos() {
  const q = document.getElementById("pbwCasinoSearch").value.trim().toLowerCase();
  document.querySelectorAll("[data-pbw-row]").forEach((r) => { r.hidden = !!q && !r.dataset.name.includes(q); });
  document.querySelectorAll("[data-pbw-groupbox]").forEach((b) => { b.hidden = !!q && !b.querySelector("[data-pbw-row]:not([hidden])"); });
}

function pbwCountCasinos() {
  const n = document.querySelectorAll("[data-pbw-casino]:checked").length;
  document.getElementById("pbwCasinoCount").textContent = n ? `${n} selected` : "";
}

function pbnTogglePartner() {
  const isNew = !document.getElementById("pbnPartner").value;
  document.querySelectorAll("[data-pbn-newpartner]").forEach((e) => { e.style.display = isNew ? "" : "none"; });
}

// Pre-fill the "new" form from the program type chosen in step 2, but never overwrite what the user typed.
function pbwPrefillNew() {
  if (pbMode !== "new") return;
  const p = pbwPresets.find((x) => x.id === document.getElementById("pbwPreset").value);
  if (!p) return;
  const base = String(p.name).replace(/\s*\(.*$/, "").trim();
  const set = (id, v) => { const el = document.getElementById(id); if (el && !el.dataset.touched && !el.value) el.value = v; };
  set("pbnPartnerName", base); set("pbnProgram", base); set("pbnAccount", "Main account");
}

function pbwFilterAccounts() {
  const accounts = window.__pbAccounts || [];
  const pid = document.getElementById("pbwProgram").value;
  const mine = accounts.filter((a) => String(a.program_id) === String(pid));
  const accSel = document.getElementById("pbwAccount");
  accSel.innerHTML = mine.length
    ? mine.map((a) => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join("")
    : '<option value="">None yet. One is created for you.</option>';
  const row = pbwProgramRow();
  document.getElementById("pbwProgramHint").textContent = row ? `${row.accounts} account(s), ${row.casinos} casino(s), ${row.links} tracking link(s), ${row.integrations} integration(s) already use this program.` : "";
  document.getElementById("pbwHandoffRow").style.display = row ? "" : "none";
}

function pbwShowInfo() {
  const id = document.getElementById("pbwPreset").value;
  const info = document.getElementById("pbwInfo");
  document.getElementById("pbwCustom").style.display = id === "custom" ? "block" : "none";
  const p = pbwPresets.find((x) => x.id === id);
  if (!p) { info.textContent = ""; return; }
  const conf = { documented: "Macros from the program's public documentation", partial: "Click-ID name and event style known; macro names are the usual ones", typical: "Typical setup; confirm the macro names in your manager's panel" }[p.confidence] || "";
  info.innerHTML = `<span class="badge">${escapeHtml(p.confidence)}</span> ${escapeHtml(conf)}. Click-ID name on your links: <code>${escapeHtml(p.click_id_param || "")}</code>.`
    + (p.notes.length ? "<ul>" + p.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("") + "</ul>" : "");
  const label = document.getElementById("pbwLabel");
  if (!label.dataset.touched && (!label.value || label.dataset.auto)) { label.value = p.name + " postback"; label.dataset.auto = "1"; }
}

async function pbwApplyHandoffClick() {
  const preset = pbwPresets.find((x) => x.id === document.getElementById("pbwPreset").value);
  const name = (preset && preset.click_id_param) || document.getElementById("pbwcLinkParam").value.trim();
  if (!name) { pbToast("Choose the program type first (or fill in the click-ID name under Something else)."); return; }
  if (!confirm(`Set the click-ID name "${name}" on every active tracking link of this program?`)) return;
  const res = await fetch("/en/api/v1/postback-config/apply-handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ program_id: parseInt(document.getElementById("pbwProgram").value), click_id_param: name }) });
  const d = await res.json();
  pbToast(d.success ? `Updated ${d.links_updated} link(s).` : (d.error || "Failed"));
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
  const fail = (m) => affShowAlert(alertEl, m, false);
  const presetId = document.getElementById("pbwPreset").value;
  const label = document.getElementById("pbwLabel").value.trim();
  const casinoIds = Array.from(document.querySelectorAll("[data-pbw-casino]:checked")).map((c) => parseInt(c.value));
  if (!label) return fail("Give the integration a name (step 2).");
  const custom = presetId === "custom" ? pbwCustomDefinition() : null;
  const buildBody = custom ? { custom } : { preset_id: presetId };
  const q = { preset_id: presetId, casino_ids: casinoIds, click_id_param: custom ? custom.click_id_param : null };
  let accountId = null;
  let needsSetup = true;

  if (pbMode === "existing") {
    const programId = parseInt(document.getElementById("pbwProgram").value);
    if (!programId) return fail("Choose an affiliate program, or switch to \"Set up something new\".");
    accountId = parseInt(document.getElementById("pbwAccount").value) || null;
    q.program_id = programId; q.account_id = accountId;
    needsSetup = !accountId || casinoIds.length > 0;
  } else {
    const partnerId = document.getElementById("pbnPartner").value;
    const partnerName = document.getElementById("pbnPartnerName").value.trim();
    const program = document.getElementById("pbnProgram").value.trim();
    const account = document.getElementById("pbnAccount").value.trim();
    if (!partnerId && !partnerName) return fail("Choose a partner or type the new partner's name.");
    if (!program) return fail("Type the program name.");
    if (!account) return fail("Type a name for your account.");
    Object.assign(q, { exact_names: true, partner_id: partnerId ? parseInt(partnerId) : null, partner_name: partnerName, partner_type: document.getElementById("pbnPartnerType").value,
      program_name: program, portal_url: document.getElementById("pbnPortal").value.trim() || null, account_name: account, external_account_id: document.getElementById("pbnExternal").value.trim() || null });
  }
  const btn = document.getElementById("pbwCreate");
  btn.disabled = true;
  let setupNote = "";
  try {
    if (custom) {
      const chk = await (await fetch("/en/api/v1/postback-config/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody) })).json();
      if (!chk.success) return fail(chk.error || "Could not build the setup");
    }
    if (needsSetup) {
      const qres = await fetch("/en/api/v1/postback-config/quick-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) });
      const r = await qres.json();
      if (!r.success) return fail(r.error || "Could not set up the program");
      accountId = r.account_id;
      const made = (r.created || []).map((x) => x.replace("_", " "));
      const labels = { created: "link created", adopted: "existing link now belongs to this program", reused: "link already in this program", kept_other_program: "left alone: already linked to another program", skipped_no_url: "skipped: no https affiliate URL" };
      setupNote = (made.length ? "Created: " + made.join(", ") + ". " : "Everything needed already existed. ")
        + (r.links && r.links.length ? "Casinos: " + r.links.map((l) => `${l.casino} (${labels[l.action] || l.action})`).join("; ") + "." : "");
    }
    let res = await fetch("/en/api/v1/postback-config/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody) });
    let data = await res.json();
    if (!data.success) return fail(data.error || "Could not build the setup");
    res = await fetch("/en/api/v1/postback-config/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      account_id: accountId, label, auth_method: "shared_secret", signature_param: "secret", field_mapping_json: data.setup.field_mapping_json,
    }) });
    const created = await res.json();
    if (!created.success) return fail(created.error || "Could not create the integration");
    res = await fetch("/en/api/v1/postback-config/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...buildBody, config_id: created.id }) });
    data = await res.json();
    pbwRenderResult(data.setup, created.secret);
    if (setupNote) { const n = document.createElement("p"); n.className = "muted"; n.textContent = setupNote; document.getElementById("pbwResult").prepend(n); }
    await pbwReloadData();
    await loadHubSummary();
    await loadPostbackConfigs();
  } catch { fail("Network error"); }
  finally { btn.disabled = false; }
}

function pbwRenderResult(setup, secretValue) {
  const el = document.getElementById("pbwResult");
  el.style.display = "block";
  const urls = setup.urls.map((u) => ({ ...u, url: u.url.replace("YOUR_SECRET", secretValue) }));
  el.className = "pbh-step";
  el.innerHTML = `
    <button type="button" class="btn btn--sm" style="float:right" id="pbwResultClose">Hide</button>
    <h3>1. Integration ready</h3>
    <p>The secret was generated and saved by this site and is already inside the URLs below. You can show it again any time from Integrations → More → Show secret.</p>
    <h3>2. Paste these URLs into ${escapeHtml(setup.name)}</h3>
    ${urls.map((u, i) => `<div class="form-group"><label>${escapeHtml(u.label)}</label><input type="text" readonly value="${escapeHtml(u.url)}" id="pbwUrl${i}" onfocus="this.select()"><button type="button" class="btn btn--sm" data-pbw-copy="${i}">Copy</button></div>`).join("")}
    ${setup.notes.length ? "<ul>" + setup.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("") + "</ul>" : ""}
    <h3>3. Tell your tracking links which click-ID name to use</h3>
    <div id="pbwLinks" class="muted">Loading links…</div>
    <h3>4. Check it works</h3>
    <p>Open <a href="#test" data-pb-go="test">Test</a> to run a signed live test, then watch <a href="#activity" data-pb-go="activity">Activity</a> for the program's first real postback.</p>`;
  el.querySelectorAll("[data-pbw-copy]").forEach((b) => b.addEventListener("click", async () => {
    const v = document.getElementById("pbwUrl" + b.dataset.pbwCopy).value;
    try { await navigator.clipboard.writeText(v); b.textContent = "Copied"; } catch { document.getElementById("pbwUrl" + b.dataset.pbwCopy).select(); }
  }));
  el.querySelectorAll("[data-pb-go]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); pbShowTab(a.dataset.pbGo); }));
  document.getElementById("pbwResultClose").addEventListener("click", () => { el.style.display = "none"; });
  pbwRenderLinks(setup.tracking_link.click_id_param);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
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

// Remember that the user edited a field so later program-type changes never overwrite it.
document.addEventListener("input", (e) => { if (e.target && e.target.id && /^(pbwLabel|pbnPartnerName|pbnProgram|pbnAccount)$/.test(e.target.id)) { e.target.dataset.touched = "1"; delete e.target.dataset.auto; } });

// ───────────────────────── Secrets and setup links ─────────────────────────

async function showPostbackSecret(id, token) {
  const res = await fetch("/en/api/v1/postback-config/secret/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  const data = await res.json();
  if (!data.success) {
    if (confirm((data.error || "No secret yet.") + "\n\nGenerate one now?")) return newPostbackSecret(id, token, true);
    return;
  }
  pbSecretDialog("Secret", postbackUrl(token), data.secret);
}

async function newPostbackSecret(id, token, skipConfirm) {
  if (!skipConfirm && !confirm("Generate a new secret? The old one stops working immediately, so update the URL in the affiliate program.")) return;
  const res = await fetch("/en/api/v1/postback-config/secret/set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  const data = await res.json();
  if (!data.success) { pbToast(data.error || "Failed"); return; }
  pbSecretDialog("New secret", postbackUrl(token), data.secret, true);
}

function pbSecretDialog(title, base, secret, isNew) {
  const full = base + "?secret=" + secret;
  const m = pbModal(title, `${isNew ? "<p>The old secret no longer works. Update the URLs in the program, or open Setup links.</p>" : ""}
    <label>Secret</label><input type="text" readonly value="${escapeHtml(secret)}" onfocus="this.select()">
    <label style="margin-top:10px;display:block">Address with the secret (add the program's macros after it, starting with &amp;)</label><input type="text" readonly value="${escapeHtml(full)}" onfocus="this.select()">
    <p class="pbh-hint">For the finished URLs with every macro filled in, use <strong>Setup links</strong>.</p>`);
  return m;
}

// The finished links for an integration that already exists: its own address and secret plus the program's macros.
async function showSetupLinks(id) {
  const list = (pbwPresets || []).filter((p) => p.id !== "custom");
  if (!list.length) { pbToast("The program list is not loaded yet. Reload the page."); return; }
  const cfg = (window.__pbConfigs || []).find((c) => c.id === id) || {};
  const acc = (window.__pbAccounts || []).find((a) => a.id === cfg.account_id) || {};
  const guess = pbGuessPreset(acc.program_name) || pbGuessPreset(cfg.label);
  const go = async (presetId) => {
    try {
      const sres = await fetch("/en/api/v1/postback-config/secret/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const sdata = await sres.json();
      if (!sdata.success) { pbToast(sdata.error || "This integration has no secret yet. Use More → New secret first."); return; }
      const res = await fetch("/en/api/v1/postback-config/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset_id: presetId, config_id: id }) });
      const data = await res.json();
      if (!data.success) { pbToast(data.error || "Could not build the links"); return; }
      pbwRenderResult(data.setup, sdata.secret);
      const el = document.getElementById("pbwResult");
      el.querySelector("h3").textContent = "Your finished links";
      el.querySelector("p").textContent = "These use this integration's own address and secret. Paste each one into the matching postback in the program.";
    } catch { pbToast("Network error"); }
  };
  if (guess) return go(guess.id);
  const m = pbModal("Which program is this integration for?", `<select id="pbSetupPreset">${list.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}</select><p style="margin-top:10px"><button type="button" class="btn btn--primary" id="pbSetupGo">Show links</button></p>`);
  m.el.querySelector("#pbSetupGo").addEventListener("click", () => { const v = m.el.querySelector("#pbSetupPreset").value; m.close(); go(v); });
}
