

// ---- Generic review: full edit page (gaps #3 full edit, #14 structured content) ----
async function initGenericReviewEditForm() {
  const form = document.getElementById("genericReviewEditForm");
  if (!form) return;

  const id = parseInt(form.dataset.id);
  const alertEl = document.getElementById("genericReviewEditAlert");
  const blockRowsContainer = document.getElementById("reviewBlockRows");
  const blockTemplate = document.getElementById("reviewBlockRowTemplate");

  function addBlockRow(block = { title: "", content: "" }) {
    const clone = blockTemplate.content.cloneNode(true);
    clone.querySelector(".block-title").value = block.title || "";
    clone.querySelector(".block-content").value = block.content || "";
    blockRowsContainer.appendChild(clone);
  }
  document.getElementById("addReviewBlockBtn").addEventListener("click", () => addBlockRow());
  blockRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-review-block")) e.target.closest(".review-block-row").remove();
  });

  function showAlert(kind, message) {
    alertEl.className = `alert alert--${kind}`;
    alertEl.textContent = message;
    alertEl.style.display = "block";
  }

  let review;
  try {
    const res = await fetch(`/en/api/v1/generic-review/get?id=${id}`);
    const data = await res.json();
    if (!data.success) { showAlert("error", data.error || "Review not found"); form.style.display = "none"; return; }
    review = data.review;
    document.getElementById("genericReviewEditSubtitle").textContent = `Reviewing: ${review.reviewed_content_type} #${review.reviewed_content_id}`;
    form.elements.title.value = review.title;
    form.elements.slug.value = review.slug;
    form.elements.content.value = review.content || "";
    const fromJsonArray = (raw) => { try { return (JSON.parse(raw || "[]") || []).join("\n"); } catch { return raw || ""; } };
    form.elements.pros.value = fromJsonArray(review.pros);
    form.elements.cons.value = fromJsonArray(review.cons);
    if (review.rating != null) form.elements.rating.value = review.rating;
    form.elements.verdict.value = review.verdict || "";
    form.elements.published.checked = !!review.published;
    form.elements.seo_title.value = review.seo_title || "";
    form.elements.seo_description.value = review.seo_description || "";
    form.elements.seo_keywords.value = review.seo_keywords || "";
  } catch {
    showAlert("error", "Failed to load review.");
    form.style.display = "none";
    return;
  }

  try {
    const res = await fetch(`/en/api/v1/review-blocks/list?review_slug=${encodeURIComponent(review.slug)}`);
    const data = await res.json();
    (data.blocks || []).forEach((b) => addBlockRow(b));
  } catch { /* structured blocks are optional; a load failure just leaves the section empty rather than blocking the edit form */ }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const toJsonArray = (text) => JSON.stringify((text || "").split("\n").map((s) => s.trim()).filter(Boolean));
    const payload = {
      id,
      title: formData.get("title"), content: formData.get("content"),
      pros: toJsonArray(formData.get("pros")), cons: toJsonArray(formData.get("cons")),
      rating: formData.get("rating") || null, verdict: formData.get("verdict") || null,
      author_id: formData.get("author_id") ? parseInt(formData.get("author_id")) : null,
      published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
    };
    const blocks = Array.from(blockRowsContainer.querySelectorAll(".review-block-row")).map((row) => ({
      title: row.querySelector(".block-title").value.trim(),
      content: row.querySelector(".block-content").value.trim(),
    })).filter((b) => b.title && b.content);

    try {
      const [updRes, blocksRes] = await Promise.all([
        fetch("/en/api/v1/generic-review/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
        fetch("/en/api/v1/review-blocks/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_slug: review.slug, blocks }) }),
      ]);
      const updData = await updRes.json();
      if (updData.success && blocksRes.ok) showAlert("success", "Saved.");
      else showAlert("error", updData.error || "Failed to save");
    } catch {
      showAlert("error", "Network error. Try again.");
    }
  });

  document.getElementById("deleteGenericReviewBtn").addEventListener("click", async () => {
    if (!confirm("Delete this review? This cannot be undone.")) return;
    try {
      const res = await fetch("/en/api/v1/generic-review/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (data.success) window.location.href = "/en/dashboard/reviews/generic";
      else alert(data.error || "Delete failed");
    } catch { alert("Network error. Try again."); }
  });
}
