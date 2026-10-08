document.addEventListener("DOMContentLoaded", () => {
  initAnalyticsPage();
});

function initAnalyticsPage() {
  const grid = document.getElementById("anStatsGrid");
  if (!grid) return; // not on this page

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  document.getElementById("anEndDate").value = today.toISOString().slice(0, 10);
  document.getElementById("anStartDate").value = thirtyDaysAgo.toISOString().slice(0, 10);

  document.getElementById("anDimensionType")?.addEventListener("change", (e) => {
    document.getElementById("anDimensionLabel").textContent =
      e.target.options[e.target.selectedIndex].text;
  });

  initAlertRuleForm();
  initBackfillForm();
  initManualRunButtons();
  loadCronHealth();
  loadAnalytics();
}

const CRON_STATUS_BADGE = {
  ok: '<span class="badge badge--success">ok</span>',
  disabled: '<span class="badge">disabled</span>',
  stale: '<span class="badge badge--danger">stale</span>',
  never_run: '<span class="badge badge--danger">never run</span>'
};

async function loadCronHealth() {
  const tbody = document.getElementById("anCronHealthBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/analytics/cron-health");
    const data = await res.json();
    const jobs = data.jobs || [];

    tbody.innerHTML = jobs.map(j => {
      let detail = "—";
      if (j.status === "never_run") {
        detail = "The scheduled trigger has never invoked this job — check wrangler.jsonc's triggers.crons is uncommented and deployed.";
      } else if (j.status === "disabled") {
        detail = "Runs on schedule but its feature flag is off — no data is being processed.";
      } else if (j.status === "stale") {
        detail = "Enabled, but hasn't completed recently — the trigger may have stopped firing.";
      } else if (j.lastResult) {
        const parts = [];
        if (j.lastResult.date) parts.push(`aggregated ${escapeHtmlAn(j.lastResult.date)}`);
        if (j.lastResult.synced != null) parts.push(`${j.lastResult.synced} synced`);
        if (j.lastResult.triggered != null) parts.push(`${j.lastResult.triggered} alert(s) triggered`);
        if (j.lastResult.ran != null) parts.push(`${j.lastResult.ran} report(s) run`);
        detail = parts.length ? parts.join(", ") : "ran with nothing to do";
      }
      return `
        <tr>
          <td>${escapeHtmlAn(j.label)}</td>
          <td>${CRON_STATUS_BADGE[j.status] || j.status}</td>
          <td>${j.lastRunAt ? escapeHtmlAn(j.lastRunAt) : '<span class="muted">never</span>'}</td>
          <td class="muted">${escapeHtmlAn(detail)}</td>
        </tr>
      `;
    }).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

function initBackfillForm() {
  const form = document.getElementById("anBackfillForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("anBackfillAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    try {
      const res = await fetch("/en/api/v1/analytics/aggregate-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: formData.get("start_date"), end_date: formData.get("end_date") }),
      });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, `Aggregated ${data.daysProcessed} day(s). Refresh the report above to see updated numbers.`, true);
        loadCronHealth();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    }
  });
}

function initManualRunButtons() {
  const alertsBtn = document.getElementById("anEvaluateAlertsBtn");
  const reportsBtn = document.getElementById("anRunReportsBtn");
  const alertEl = document.getElementById("anManualRunAlert");
  if (!alertsBtn || !reportsBtn) return;

  alertsBtn.addEventListener("click", async () => {
    alertsBtn.disabled = true;
    alertEl.style.display = "none";
    try {
      const res = await fetch("/en/api/v1/analytics/alerts/evaluate-now", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const triggered = (data.summary || []).filter(s => s.triggered).length;
        affShowAlert(alertEl, `Evaluated ${data.evaluated} rule(s), ${triggered} newly triggered.`, true);
        loadCronHealth();
        loadOpenAlerts();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    } finally {
      alertsBtn.disabled = false;
    }
  });

  reportsBtn.addEventListener("click", async () => {
    reportsBtn.disabled = true;
    alertEl.style.display = "none";
    try {
      const res = await fetch("/en/api/v1/analytics/reports/run-due-now", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        affShowAlert(alertEl, `${data.processed} due schedule(s) processed.`, true);
        loadCronHealth();
      } else {
        affShowAlert(alertEl, data.error || "Failed", false);
      }
    } catch {
      affShowAlert(alertEl, "Network error", false);
    } finally {
      reportsBtn.disabled = false;
    }
  });
}

function fmtMoney(n) {
  return "$" + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(n) {
  return ((Number(n) || 0) * 100).toFixed(2) + "%";
}

function fmtNum(n) {
  return (Number(n) || 0).toLocaleString();
}

async function loadAnalytics() {
  const dimensionType = document.getElementById("anDimensionType").value;
  const startDate = document.getElementById("anStartDate").value;
  const endDate = document.getElementById("anEndDate").value;
  const currency = document.getElementById("anCurrency").value;

  if (!startDate || !endDate) return;

  const params = new URLSearchParams({
    dimension_type: dimensionType, start_date: startDate, end_date: endDate
  });
  if (currency) params.set("currency", currency);

  const tbody = document.getElementById("anTableBody");
  tbody.innerHTML = `<tr><td colspan="12" class="muted">Loading...</td></tr>`;

  try {
    const res = await fetch(`/en/api/v1/analytics/overview?${params}`);
    const data = await res.json();
    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="12" class="muted">${data.error || "Failed to load"}</td></tr>`;
      return;
    }

    renderStatCards(data.rows);
    renderPerformanceTable(data.rows);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="12" class="muted">Failed to load analytics.</td></tr>`;
  }

  loadGeoPerformance(startDate, endDate, currency);
  loadOpenAlerts();
  loadAlertRules();
}

async function loadAlertRules() {
  const tbody = document.getElementById("anRulesTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/analytics/alert-rules/list");
    const data = await res.json();
    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">${data.error || "Unable to load rules"}</td></tr>`;
      return;
    }
    const rules = data.rules || [];
    if (!rules.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No alert rules yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = rules.map(r => `
      <tr>
        <td>${escapeHtmlAn(r.name)}</td>
        <td>${escapeHtmlAn(r.metric)}</td>
        <td>${escapeHtmlAn(r.scope_type)}${r.scope_id ? " #" + r.scope_id : ""}</td>
        <td>${escapeHtmlAn(r.threshold_type)}${r.threshold_value != null ? ": " + r.threshold_value : ""}</td>
        <td>${r.enabled ? "Yes" : "No"}</td>
        <td><button class="btn btn--sm" onclick="toggleAlertRule(${r.id}, ${r.enabled ? 0 : 1})">${r.enabled ? "Disable" : "Enable"}</button></td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Failed to load rules (admin only).</td></tr>`;
  }
}

async function toggleAlertRule(id, enabled) {
  try {
    const res = await fetch("/en/api/v1/analytics/alert-rule/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !!enabled }),
    });
    const data = await res.json();
    if (data.success) loadAlertRules();
    else alert(data.error || "Failed to update rule");
  } catch (e) {
    alert("Failed to update rule.");
  }
}

function initAlertRuleForm() {
  const form = document.getElementById("anRuleForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      metric: formData.get("metric"),
      scopeType: formData.get("scopeType"),
      scopeId: formData.get("scopeId") ? parseInt(formData.get("scopeId")) : null,
      thresholdType: formData.get("thresholdType"),
      thresholdValue: formData.get("thresholdValue") ? parseFloat(formData.get("thresholdValue")) : null,
      comparisonWindowDays: formData.get("comparisonWindowDays") ? parseInt(formData.get("comparisonWindowDays")) : 7,
    };
    try {
      const res = await fetch("/en/api/v1/analytics/alert-rule/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        form.reset();
        loadAlertRules();
      } else {
        alert(data.error || "Failed to create rule (admin only)");
      }
    } catch (e) {
      alert("Failed to create rule.");
    }
  });
}

async function loadOpenAlerts() {
  const tbody = document.getElementById("anAlertsTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Loading...</td></tr>`;

  try {
    const res = await fetch("/en/api/v1/analytics/alerts/list?status=open");
    const data = await res.json();
    const alerts = data.alerts || [];
    if (!alerts.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No open alerts.</td></tr>`;
      return;
    }
    tbody.innerHTML = alerts.map(a => {
      let detail = "";
      try { detail = JSON.stringify(JSON.parse(a.details_json || "{}")); } catch (e) { detail = a.details_json || ""; }
      return `
        <tr>
          <td>${escapeHtmlAn(a.rule_name)}</td>
          <td>${escapeHtmlAn(a.metric)}</td>
          <td>${escapeHtmlAn(a.scope_type)}${a.scope_id ? " #" + a.scope_id : ""}</td>
          <td>${a.triggered_at}</td>
          <td>${escapeHtmlAn(detail)}</td>
          <td><button class="btn btn--sm" onclick="acknowledgeAlert(${a.id})">Acknowledge</button></td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Failed to load alerts.</td></tr>`;
  }
}

async function acknowledgeAlert(id) {
  try {
    const res = await fetch("/en/api/v1/analytics/alert/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) {
      loadOpenAlerts();
    } else {
      alert(data.error || "Failed to acknowledge alert");
    }
  } catch (e) {
    alert("Failed to acknowledge alert.");
  }
}

function escapeHtmlAn(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderStatCards(rows) {
  const totals = rows.reduce((acc, r) => ({
    views: acc.views + (r.views || 0),
    clicks: acc.clicks + (r.clicks || 0),
    conversions: acc.conversions + (r.conversions || 0),
    revenue: acc.revenue + (r.revenue || 0),
    commission: acc.commission + (r.commission || 0)
  }), { views: 0, clicks: 0, conversions: 0, revenue: 0, commission: 0 });

  document.getElementById("anTotalViews").textContent = fmtNum(totals.views);
  document.getElementById("anTotalClicks").textContent = fmtNum(totals.clicks);
  document.getElementById("anTotalConversions").textContent = fmtNum(totals.conversions);
  document.getElementById("anTotalRevenue").textContent = fmtMoney(totals.revenue);
  document.getElementById("anTotalCommission").textContent = fmtMoney(totals.commission);
}

function renderPerformanceTable(rows) {
  const tbody = document.getElementById("anTableBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="muted">No data for this range.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.dimensionId ?? "—"}</td>
      <td>${r.currency}</td>
      <td>${fmtNum(r.views)}</td>
      <td>${fmtNum(r.clicks)}</td>
      <td>${fmtNum(r.conversions)}</td>
      <td>${fmtMoney(r.revenue)}</td>
      <td>${fmtMoney(r.commission)}</td>
      <td>${fmtPct(r.ctr)}</td>
      <td>${fmtPct(r.cvr)}</td>
      <td>${fmtMoney(r.epc)}</td>
      <td>${fmtMoney(r.rpc)}</td>
      <td>${fmtMoney(r.cpa)}</td>
    </tr>
  `).join("");
}

async function loadGeoPerformance(startDate, endDate, currency) {
  const tbody = document.getElementById("anGeoTableBody");
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  if (currency) params.set("currency", currency);

  try {
    const res = await fetch(`/en/api/v1/analytics/geo?${params}`);
    const data = await res.json();
    if (!data.success || !data.rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted">No data for this range.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.rows.map(r => `
      <tr>
        <td>${r.country || "Unknown"}</td>
        <td>${fmtNum(r.clicks)}</td>
        <td>${fmtNum(r.conversions)}</td>
        <td>${fmtMoney(r.revenue)}</td>
        <td>${fmtMoney(r.commission)}</td>
        <td>${fmtPct(r.cvr)}</td>
        <td>${fmtMoney(r.epc)}</td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Failed to load GEO data.</td></tr>`;
  }
}
