
// ---- Generic reviews (sportsbook/affiliate_partner/custom) ----
async function loadGenericReviewsTable(reviewedContentType) {
  const tbody = document.getElementById("genericReviewsTableBody");
  if (!tbody) return;
  const typeFilter = document.getElementById("genericReviewTypeFilter");
  const type = reviewedContentType || (typeFilter ? typeFilter.value : "sportsbook");

  try {
    const res = await fetch(`/en/api/v1/generic-reviews/list?reviewed_content_type=${encodeURIComponent(type)}&page=${PAGE_STATE.genericReviews}&per_page=${PER_PAGE}${listSearchParam("genericReviewsTableBody")}`);
    const data = await res.json();
    const reviews = data.reviews || [];
    renderPagerControls("genericReviewsPager", PAGE_STATE.genericReviews, PER_PAGE, data.total, (p) => { PAGE_STATE.genericReviews = p; loadGenericReviewsTable(type); });
    if (reviews.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No reviews yet for this type.</td></tr>';
      return;
    }
    // Public review URL per reviewed type (routes.js). Custom-type reviews
    // are addressed under their custom type slug, which the review row
    // doesn't carry, so no View link is offered for those.
    const viewPrefix = { sportsbook: "/en/sportsbook/review/", affiliate_partner: "/en/affiliate-partner/review/" }[type];
    tbody.innerHTML = reviews.map((r) => `
      <tr>
        <td><a href="/en/dashboard/reviews/generic?edit=${Number(r.id)}" data-gr-edit="${Number(r.id)}"><strong>${escapeHtmlClient(r.title)}</strong></a></td>
        <td>${escapeHtmlClient(r.slug)}</td>
        <td>${r.rating != null ? "★ " + escapeHtmlClient(r.rating) : "—"}</td>
        <td>${r.published ? "Yes" : "No"}</td>
        <td class="table-actions">
          <a href="/en/dashboard/reviews/generic?edit=${Number(r.id)}" data-gr-edit="${Number(r.id)}" class="btn btn--ghost btn--sm">Edit</a>
          ${viewPrefix && r.published ? `<a href="${viewPrefix}${encodeURIComponent(r.slug)}" class="btn btn--ghost btn--sm" target="_blank">View</a>` : ""}
          <button class="btn btn--ghost btn--sm" onclick="toggleGenericReviewPublished(${Number(r.id)}, ${r.published ? "true" : "false"}, '${type}')">${r.published ? "Unpublish" : "Publish"}</button>
          <button class="btn btn--danger btn--sm" onclick="deleteGenericReview(${Number(r.id)}, '${type}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function deleteGenericReview(id, type) {
  if (!confirm("Delete this review? This cannot be undone.")) return;
  try {
    const res = await fetch("/en/api/v1/generic-review/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await res.json();
    if (data.success) loadGenericReviewsTable(type); else alert(data.error || "Delete failed");
  } catch { alert("Network error. Try again."); }
}

// Uses the existing /generic-review/update endpoint (which had no UI at all).
async function toggleGenericReviewPublished(id, currentlyPublished, type) {
  try {
    const res = await fetch("/en/api/v1/generic-review/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, published: !currentlyPublished }) });
    const data = await res.json();
    if (data.success) loadGenericReviewsTable(type); else alert(data.error || "Update failed");
  } catch { alert("Network error. Try again."); }
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "genericReviewTypeFilter") { PAGE_STATE.genericReviews = 1; loadGenericReviewsTable(e.target.value); }
});

async function initGenericReviewForm() {
  const form = document.getElementById("genericReviewForm");
  if (!form) return;

  const typeSelect = document.getElementById("reviewedContentTypeSelect");
  const itemSelect = document.getElementById("reviewedItemSelect");

  async function loadItemOptions() {
    itemSelect.innerHTML = '<option value="">Loading...</option>';
    try {
      const res = await fetch(`/en/api/v1/content-items/list?content_type=${encodeURIComponent(typeSelect.value)}`);
      const data = await res.json();
      const items = data.items || [];
      itemSelect.innerHTML = items.length
        ? items.map((i) => `<option value="${i.id}">${i.name} (${i.slug})</option>`).join("")
        : '<option value="">No items of this type yet -- create one first</option>';
    } catch {
      itemSelect.innerHTML = '<option value="">Failed to load items</option>';
    }
  }
  typeSelect.addEventListener("change", loadItemOptions);
  loadItemOptions();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("genericReviewFormAlert");
    alertEl.style.display = "none";
    const formData = new FormData(form);

    // pros/cons textareas (one per line) -> JSON array, matching the
    // storage shape reviews.pros/cons already use for casino reviews.
    const toJsonArray = (text) => JSON.stringify((text || "").split("\n").map((s) => s.trim()).filter(Boolean));

    const payload = {
      reviewed_content_type: formData.get("reviewed_content_type"),
      reviewed_content_id: parseInt(formData.get("reviewed_content_id")),
      title: formData.get("title"), slug: formData.get("slug"), content: formData.get("content"),
      pros: toJsonArray(formData.get("pros")), cons: toJsonArray(formData.get("cons")),
      rating: formData.get("rating") || null, verdict: formData.get("verdict") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
      published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
    };
    if (!payload.reviewed_content_id) {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Select an item to review -- none available for this type yet.";
      alertEl.style.display = "block";
      return;
    }
    try {
      const res = await fetch("/en/api/v1/generic-review/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Review created successfully!";
        alertEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/dashboard/reviews/generic"; }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create review";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
