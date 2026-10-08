// =====================================================
// ADMIN TOOLS: Users, Inquiries, Submissions, Notifications
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadUsersTable();
  loadAdminInquiries();
  loadAdminSubmissions();
  initNotifForm();
  populateNotifUserSelect();
});

// ============================================
// USER MANAGEMENT
// ============================================

let editingUserId = null;

async function loadUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/admin/users");
    const data = await res.json();
    const users = data.users || [];

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No users yet.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.email}</strong></td>
        <td><span class="status-badge ${u.role === 'admin' ? 'status-published' : 'status-draft'}">${u.role}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="openRoleModal(${u.id}, '${u.email}', '${u.role}')">Change Role</button>
          <button class="btn btn--danger btn--sm" onclick="deleteUser(${u.id}, '${u.email}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

function openRoleModal(id, email, currentRole) {
  editingUserId = id;
  document.getElementById("roleModalEmail").textContent = email;
  document.getElementById("roleModalSelect").value = currentRole;
  document.getElementById("roleModal").style.display = "flex";
}

async function confirmRoleChange() {
  if (!editingUserId) return;
  const newRole = document.getElementById("roleModalSelect").value;

  try {
    const res = await fetch("/en/api/v1/admin/user/update-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingUserId, role: newRole })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("roleModal").style.display = "none";
      loadUsersTable();
    } else {
      alert(data.error || "Failed");
    }
  } catch { alert("Network error"); }
}

async function deleteUser(id, email) {
  if (!confirm(`Delete user "${email}"? This removes all their bookmarks, inquiries, and notifications.`)) return;
  try {
    const res = await fetch("/en/api/v1/admin/user/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      loadUsersTable();
    } else {
      alert(data.error || "Failed");
    }
  } catch { alert("Network error"); }
}

// ============================================
// INQUIRIES MANAGEMENT
// ============================================

let allInquiries = [];
let inquiryFilter = "";
let replyingToId = null;

async function loadAdminInquiries() {
  const container = document.getElementById("inquiriesContainer");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/admin/inquiries");
    const data = await res.json();
    allInquiries = data.inquiries || [];

    renderInquiries();
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

function filterInquiries(status) {
  inquiryFilter = status;
  renderInquiries();
}

function renderInquiries() {
  const container = document.getElementById("inquiriesContainer");
  if (!container) return;

  let inquiries = allInquiries;
  if (inquiryFilter) {
    inquiries = inquiries.filter(i => i.status === inquiryFilter);
  }

  if (inquiries.length === 0) {
    container.innerHTML = '<p class="muted">No inquiries found.</p>';
    return;
  }

  container.innerHTML = inquiries.map(i => `
    <div class="admin-section" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
        <div>
          <strong style="font-size:16px">${i.subject}</strong>
          <p class="muted" style="font-size:12px;margin-top:4px">From: ${i.user_email || 'Unknown'} • ${new Date(i.created_at).toLocaleDateString()}</p>
        </div>
        <span class="status-badge ${i.status === 'answered' ? 'status-published' : 'status-draft'}">${i.status}</span>
      </div>
      <p style="color:var(--gray);font-size:14px;margin-bottom:12px">${i.message}</p>
      ${i.admin_reply ? `
        <div style="background:var(--bg);border-radius:8px;padding:12px;border-left:3px solid var(--primary)">
          <strong style="font-size:13px">Your Reply:</strong>
          <p style="font-size:14px;margin-top:4px">${i.admin_reply}</p>
        </div>
      ` : `
        <button class="btn btn--primary btn--sm" onclick="openReplyModal(${i.id}, '${i.subject}', '${i.message.replace(/'/g, "\\'")}')">Reply</button>
      `}
    </div>
  `).join("");
}

function openReplyModal(id, subject, message) {
  replyingToId = id;
  document.getElementById("replyModalOriginal").innerHTML = `
    <strong>${subject}</strong>
    <p style="color:var(--gray);font-size:14px;margin-top:8px">${message}</p>
  `;
  document.getElementById("replyModalText").value = "";
  document.getElementById("replyModal").style.display = "flex";
}

async function sendReply() {
  if (!replyingToId) return;
  const reply = document.getElementById("replyModalText").value.trim();
  if (!reply) { alert("Reply cannot be empty"); return; }

  try {
    const res = await fetch("/en/api/v1/admin/inquiry/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: replyingToId, reply })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("replyModal").style.display = "none";
      loadAdminInquiries();
    } else {
      alert(data.error || "Failed");
    }
  } catch { alert("Network error"); }
}

// ============================================
// SUBMISSIONS MANAGEMENT
// ============================================

let allSubmissions = [];
let submissionFilter = "";
let reviewingSubmissionId = null;

async function loadAdminSubmissions() {
  const container = document.getElementById("submissionsContainer");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/admin/submissions");
    const data = await res.json();
    allSubmissions = data.submissions || [];

    renderSubmissions();
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

function filterSubmissions(status) {
  submissionFilter = status;
  renderSubmissions();
}

function renderSubmissions() {
  const container = document.getElementById("submissionsContainer");
  if (!container) return;

  let submissions = allSubmissions;
  if (submissionFilter) {
    submissions = submissions.filter(s => s.status === submissionFilter);
  }

  if (submissions.length === 0) {
    container.innerHTML = '<p class="muted">No submissions found.</p>';
    return;
  }

  container.innerHTML = submissions.map(s => `
    <div class="admin-section" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
        <div>
          <strong style="font-size:16px">${s.name}</strong>
          <p class="muted" style="font-size:12px;margin-top:4px">From: ${s.user_email || 'Unknown'} • ${new Date(s.created_at).toLocaleDateString()}</p>
        </div>
        <span class="status-badge ${s.status === 'approved' ? 'status-published' : s.status === 'rejected' ? 'status-draft' : ''}">${s.status}</span>
      </div>
      <div style="font-size:14px;margin-bottom:12px">
        <p><strong>Website:</strong> <a href="${s.website_url}" target="_blank">${s.website_url}</a></p>
        ${s.affiliate_url ? `<p><strong>Affiliate:</strong> ${s.affiliate_url}</p>` : ""}
        ${s.bonus_value ? `<p><strong>Bonus:</strong> ${s.bonus_value}</p>` : ""}
        ${s.notes ? `<p><strong>Notes:</strong> ${s.notes}</p>` : ""}
        ${s.admin_notes ? `<p style="margin-top:8px;background:var(--bg);padding:8px;border-radius:6px"><strong>Admin notes:</strong> ${s.admin_notes}</p>` : ""}
      </div>
      ${s.status === 'pending' ? `
        <button class="btn btn--primary btn--sm" onclick="openSubmissionModal(${s.id}, '${s.name.replace(/'/g, "\\'")}', '${s.website_url}', '${(s.notes || '').replace(/'/g, "\\'")}')">Review</button>
      ` : ""}
    </div>
  `).join("");
}

function openSubmissionModal(id, name, url, notes) {
  reviewingSubmissionId = id;
  document.getElementById("submissionModalDetails").innerHTML = `
    <p><strong>${name}</strong></p>
    <p>URL: ${url}</p>
    <p>Notes: ${notes || 'None'}</p>
  `;
  document.getElementById("submissionModalNotes").value = "";
  document.getElementById("submissionModal").style.display = "flex";
}

async function updateSubmission(status) {
  if (!reviewingSubmissionId) return;
  const notes = document.getElementById("submissionModalNotes").value.trim();

  try {
    const res = await fetch("/en/api/v1/admin/submission/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reviewingSubmissionId, status, admin_notes: notes })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("submissionModal").style.display = "none";
      loadAdminSubmissions();
    } else {
      alert(data.error || "Failed");
    }
  } catch { alert("Network error"); }
}

// ============================================
// NOTIFICATIONS MANAGEMENT
// ============================================

function toggleNotifTarget() {
  const target = document.getElementById("notifTarget").value;
  document.getElementById("notifRoleGroup").style.display = target === "role" ? "block" : "none";
  document.getElementById("notifUserGroup").style.display = target === "user" ? "block" : "none";
}

async function populateNotifUserSelect() {
  const select = document.getElementById("notifUserSelect");
  if (!select) return;
  try {
    const res = await fetch("/en/api/v1/admin/users");
    const data = await res.json();
    const users = data.users || [];
    select.innerHTML = '<option value="">Select user...</option>' +
      users.map(u => `<option value="${u.id}">${u.email} (${u.role})</option>`).join("");
  } catch {}
}

function initNotifForm() {
  const form = document.getElementById("notifForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("notifFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const target = formData.get("target");
    const payload = {
      title: formData.get("title"),
      message: formData.get("message"),
      link: formData.get("link") || null,
      target: target,
    };

    if (target === "role") {
      payload.role = formData.get("role");
    } else if (target === "user") {
      payload.user_id = parseInt(formData.get("user_id"));
      if (!payload.user_id) {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Select a user"; alertEl.style.display = "block"; }
        return;
      }
    }

    try {
      const res = await fetch("/en/api/v1/admin/notification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = `Notification sent to ${data.sent} user(s)!`;
          alertEl.style.display = "block";
        }
        form.reset();
        toggleNotifTarget();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}
