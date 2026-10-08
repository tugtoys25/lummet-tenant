// =====================================================
// REVIEW BLOCK ADMIN
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  populateReviewSelect();
  initReviewBlockForm();
});

async function populateReviewSelect() {
  const select = document.getElementById("reviewBlockReviewSelect");
  if (!select) return;
  try {
    const res = await fetch("/en/api/v1/reviews/list");
    const data = await res.json();
    const reviews = data.reviews || [];
    select.innerHTML = '<option value="">Choose a review...</option>' +
      reviews.map(r => `<option value="${r.slug}">${r.title} (${r.slug})</option>`).join("");
  } catch {}
}

async function loadReviewBlocksForReview() {
  const select = document.getElementById("reviewBlockReviewSelect");
  const container = document.getElementById("reviewBlocksContainer");
  const tbody = document.getElementById("reviewBlocksTableBody");
  if (!select || !select.value) {
    if (container) container.style.display = "none";
    return;
  }

  if (container) container.style.display = "block";

  try {
    const res = await fetch(`/en/api/v1/review-blocks/list?review_slug=${select.value}`);
    const data = await res.json();
    const blocks = data.blocks || [];

    if (blocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No blocks yet. Add one below.</td></tr>';
      return;
    }

    tbody.innerHTML = blocks.map(b => `
      <tr>
        <td>${b.position}</td>
        <td><strong>${b.title}</strong></td>
        <td>${(b.content || "").substring(0, 100)}...</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editReviewBlock(${b.id}, '${b.title}', ${b.position})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deleteReviewBlock(${b.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Failed to load.</td></tr>';
  }
}

function initReviewBlockForm() {
  const form = document.getElementById("reviewBlockForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("reviewBlockFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const reviewSlug = document.getElementById("reviewBlockReviewSelect").value;
    if (!reviewSlug) {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Select a review first."; alertEl.style.display = "block"; }
      return;
    }

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/review-blocks/update" : "/en/api/v1/review-blocks/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      review_slug: reviewSlug,
      title: formData.get("title"),
      content: formData.get("content"),
      position: parseInt(formData.get("position")) || 0,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) { alertEl.className = "alert alert--success"; alertEl.textContent = isEdit ? "Block updated!" : "Block added!"; alertEl.style.display = "block"; }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("reviewBlockSubmitBtn").textContent = "Add Block";
        document.getElementById("reviewBlockCancelEdit").style.display = "none";
        loadReviewBlocksForReview();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

async function editReviewBlock(id, title, position) {
  // Fetch full block data
  try {
    const reviewSlug = document.getElementById("reviewBlockReviewSelect").value;
    const res = await fetch(`/en/api/v1/review-blocks/list?review_slug=${reviewSlug}`);
    const data = await res.json();
    const block = (data.blocks || []).find(b => b.id === id);
    if (!block) return;

    const form = document.getElementById("reviewBlockForm");
    form.querySelector("[name='id']").value = block.id;
    form.querySelector("[name='title']").value = block.title;
    form.querySelector("[name='content']").value = block.content || "";
    setTimeout(() => {
      RichEditor.set("reviewblock-content", block.content || "");
    }, 300);
    form.querySelector("[name='position']").value = block.position || 0;
    document.getElementById("reviewBlockSubmitBtn").textContent = "Update Block";
    document.getElementById("reviewBlockCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load block"); }
}

function cancelReviewBlockEdit() {
  const form = document.getElementById("reviewBlockForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("reviewBlockSubmitBtn").textContent = "Add Block";
  document.getElementById("reviewBlockCancelEdit").style.display = "none";
  RichEditor.set("reviewblock-content", "");
}

async function deleteReviewBlock(id) {
  if (!confirm("Delete this block?")) return;
  try {
    await fetch("/en/api/v1/review-blocks/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    loadReviewBlocksForReview();
  } catch { alert("Network error"); }
}
