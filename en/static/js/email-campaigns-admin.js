// static/js/email-campaigns-admin.js
// Powers /en/dashboard/emails: recipient-type toggling, the "selected
// users" multi-select, a recipient-count preview, sending, and the
// recent-sends log table.

document.addEventListener("DOMContentLoaded", () => {
  initEmailCampaignForm();
  initEmailCampaignsTable();
});

function escapeHtmlCampaign(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toggleRecipientGroups() {
  const select = document.getElementById("recipientType");
  if (!select) return;
  const value = select.value;
  const newGroup = document.getElementById("recipientNewGroup");
  const selectedGroup = document.getElementById("recipientSelectedGroup");
  const customGroup = document.getElementById("recipientCustomGroup");
  if (newGroup) newGroup.style.display = value === "new" ? "block" : "none";
  if (selectedGroup) selectedGroup.style.display = value === "selected" ? "block" : "none";
  if (customGroup) customGroup.style.display = value === "custom" ? "block" : "none";
}

async function populateRecipientUserSelect() {
  const select = document.getElementById("recipientUserSelect");
  if (!select) return;
  try {
    const res = await fetch("/en/api/v1/admin/users");
    const data = await res.json();
    const users = data.users || [];
    select.innerHTML = users.map(u => `<option value="${u.id}">${escapeHtmlCampaign(u.email)} (${u.role})</option>`).join("");
  } catch {
    select.innerHTML = `<option value="">Failed to load users</option>`;
  }
}

function collectCampaignPayload(form) {
  const formData = new FormData(form);
  const recipientType = formData.get("recipientType");
  const payload = {
    subject: formData.get("subject"),
    layout: formData.get("layout") || "branded",
    bodyHtml: formData.get("bodyHtml"),
    recipientType,
  };

  if (recipientType === "new") {
    payload.sinceDays = parseInt(formData.get("sinceDays"), 10) || 7;
  } else if (recipientType === "selected") {
    const select = document.getElementById("recipientUserSelect");
    payload.userIds = select ? Array.from(select.selectedOptions).map(o => parseInt(o.value, 10)) : [];
  } else if (recipientType === "custom") {
    payload.customEmails = (formData.get("customEmails") || "").split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  }

  return payload;
}

function initEmailCampaignForm() {
  const form = document.getElementById("emailCampaignForm");
  if (!form) return;

  const recipientType = document.getElementById("recipientType");
  if (recipientType) {
    recipientType.addEventListener("change", () => {
      toggleRecipientGroups();
      if (recipientType.value === "selected") populateRecipientUserSelect();
    });
  }

  const previewBtn = document.getElementById("previewRecipientsBtn");
  if (previewBtn) {
    previewBtn.addEventListener("click", async () => {
      const resultEl = document.getElementById("recipientPreviewResult");
      const payload = collectCampaignPayload(form);
      if (resultEl) resultEl.textContent = "Checking...";
      try {
        const res = await fetch("/en/api/v1/admin/email-campaigns/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (resultEl) {
          resultEl.textContent = data.success
            ? `${data.count} recipient(s)`
            : (data.error || "Could not preview recipients");
        }
      } catch {
        if (resultEl) resultEl.textContent = "Network error";
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("emailCampaignAlert");
    const submitBtn = document.getElementById("emailCampaignSubmit");
    if (alertEl) alertEl.style.display = "none";

    const payload = collectCampaignPayload(form);
    if (!payload.bodyHtml || !payload.bodyHtml.trim()) {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Message is required"; alertEl.style.display = "block"; }
      return;
    }

    if (!confirm("Send this email now? This cannot be undone.")) return;

    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch("/en/api/v1/admin/email-campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (alertEl) {
        alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
        alertEl.textContent = data.success
          ? `Sent to ${data.sentCount} of ${data.recipientCount} recipient(s)${data.failedCount ? ` (${data.failedCount} failed)` : ""}.`
          : (data.error || "Failed to send");
        alertEl.style.display = "block";
      }
      if (data.success) {
        form.reset();
        toggleRecipientGroups();
        loadEmailCampaigns();
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

const RECIPIENT_TYPE_LABELS = {
  all: "All Users",
  selected: "Selected Users",
  new: "New Users",
  custom: "Custom Emails",
  subscribed: "Subscribed Users",
  "auto:casino": "Auto: New Casino",
  "auto:review": "Auto: New Review",
  "auto:news": "Auto: New Article",
  "auto:weekly_digest": "Auto: Weekly Digest",
};

async function loadEmailCampaigns() {
  const tbody = document.getElementById("emailCampaignsTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading...</td></tr>`;
  try {
    const res = await fetch("/en/api/v1/admin/email-campaigns");
    const data = await res.json();
    const campaigns = data.campaigns || [];
    if (campaigns.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">No emails sent yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = campaigns.map(c => `
      <tr>
        <td>${escapeHtmlCampaign(c.subject)}</td>
        <td>${RECIPIENT_TYPE_LABELS[c.recipient_type] || escapeHtmlCampaign(c.recipient_type)}</td>
        <td>${c.sent_count}/${c.recipient_count}${c.failed_count ? ` (${c.failed_count} failed)` : ""}</td>
        <td><span class="status-badge ${c.status === "sent" ? "status-published" : "status-draft"}">${c.status}</span></td>
        <td>${c.sent_at ? new Date(c.sent_at).toLocaleString() : new Date(c.created_at).toLocaleString()}</td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Failed to load.</td></tr>`;
  }
}

function initEmailCampaignsTable() {
  const tbody = document.getElementById("emailCampaignsTableBody");
  if (!tbody) return;
  loadEmailCampaigns();
}
