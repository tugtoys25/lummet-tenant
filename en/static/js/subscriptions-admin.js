// static/js/subscriptions-admin.js
// Powers /en/dashboard/subscriptions: subscriber list + filters,
// manual add, unsubscribe action, and the two automatic-email
// on/off switches (stored via the existing generic settings API).

document.addEventListener("DOMContentLoaded", () => {
  initSubscribersTable();
  initAddSubscriberForm();
  initAutoEmailSettingsForm();
});

let subscriberFilters = { status: "", search: "" };

async function loadSubscribers() {
  const tbody = document.getElementById("subscribersTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading...</td></tr>`;

  const params = new URLSearchParams();
  if (subscriberFilters.status) params.set("status", subscriberFilters.status);
  if (subscriberFilters.search) params.set("search", subscriberFilters.search);

  try {
    const res = await fetch(`/en/api/v1/admin/subscribers?${params.toString()}`);
    const data = await res.json();
    const subscribers = data.subscribers || [];
    const counts = data.counts || {};

    const countConfirmed = document.getElementById("countConfirmed");
    const countPending = document.getElementById("countPending");
    const countUnsubscribed = document.getElementById("countUnsubscribed");
    if (countConfirmed) countConfirmed.textContent = counts.confirmed ?? "0";
    if (countPending) countPending.textContent = counts.pending ?? "0";
    if (countUnsubscribed) countUnsubscribed.textContent = counts.unsubscribed ?? "0";

    if (subscribers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">No subscribers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = subscribers.map(s => `
      <tr>
        <td>${escapeHtmlSub(s.email)}</td>
        <td><span class="status-badge ${s.status === "confirmed" ? "status-published" : "status-draft"}">${s.status}</span></td>
        <td>${escapeHtmlSub(s.source || "")}</td>
        <td>${s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString() : ""}</td>
        <td>
          ${s.status !== "unsubscribed"
            ? `<button class="btn btn--ghost btn--sm" onclick="unsubscribeSubscriberRow(${s.id})">Unsubscribe</button>`
            : `<span class="muted">—</span>`}
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Failed to load subscribers.</td></tr>`;
  }
}

function escapeHtmlSub(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function unsubscribeSubscriberRow(id) {
  if (!confirm("Unsubscribe this address?")) return;
  try {
    const res = await fetch("/en/api/v1/admin/subscribers/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) loadSubscribers();
    else alert(data.error || "Failed to unsubscribe");
  } catch {
    alert("Network error");
  }
}
window.unsubscribeSubscriberRow = unsubscribeSubscriberRow;

function initSubscribersTable() {
  const tbody = document.getElementById("subscribersTableBody");
  if (!tbody) return;

  loadSubscribers();

  const filterBtn = document.getElementById("subscriberFilterBtn");
  const searchInput = document.getElementById("subscriberSearch");
  const statusSelect = document.getElementById("subscriberStatusFilter");

  const applyFilters = () => {
    subscriberFilters = {
      status: statusSelect ? statusSelect.value : "",
      search: searchInput ? searchInput.value.trim() : "",
    };
    loadSubscribers();
  };

  if (filterBtn) filterBtn.addEventListener("click", applyFilters);
  if (searchInput) searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyFilters(); } });
}

function initAddSubscriberForm() {
  const form = document.getElementById("addSubscriberForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("addSubscriberAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const email = formData.get("email");

    try {
      const res = await fetch("/en/api/v1/admin/subscribers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        form.reset();
        loadSubscribers();
      } else if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to add subscriber";
        alertEl.style.display = "block";
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

async function initAutoEmailSettingsForm() {
  const form = document.getElementById("autoEmailSettingsForm");
  if (!form) return;

  try {
    const res = await fetch("/en/api/v1/settings/get");
    const data = await res.json();
    const settings = data.settings || {};
    const contentCheckbox = document.getElementById("notifyContentUpdates");
    const weeklyCheckbox = document.getElementById("notifyWeeklyDigest");
    if (contentCheckbox) contentCheckbox.checked = settings.email_notify_content_updates === "1";
    if (weeklyCheckbox) weeklyCheckbox.checked = settings.email_weekly_digest_enabled === "1";
  } catch {
    // Leave defaults (unchecked) if settings couldn't be loaded.
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("autoEmailSettingsAlert");
    if (alertEl) alertEl.style.display = "none";

    const contentCheckbox = document.getElementById("notifyContentUpdates");
    const weeklyCheckbox = document.getElementById("notifyWeeklyDigest");
    const payload = {
      email_notify_content_updates: contentCheckbox && contentCheckbox.checked ? "1" : "0",
      email_weekly_digest_enabled: weeklyCheckbox && weeklyCheckbox.checked ? "1" : "0",
    };

    try {
      const res = await fetch("/en/api/v1/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (alertEl) {
        alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
        alertEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
        alertEl.style.display = "block";
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
