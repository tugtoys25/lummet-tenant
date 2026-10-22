async function deleteReview(slug) {
  if (!confirm(`Delete review "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/review/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadReviewsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}


async function deletePage(slug) {
  if (!confirm(`Delete page "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/page/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadPagesTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

async function deleteNewsArticle(slug) {
  if (!confirm(`Delete news article "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/news/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadNewsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}


// ── Review Edit ──

async function editReview(slug) {
  try {
    const res = await fetch("/en/api/v1/reviews/list");
    const data = await res.json();
    const review = (data.reviews || []).find(r => r.slug === slug);
    if (!review) return;
    const form = document.getElementById("reviewForm");
    form.querySelector("[name='id']").value = review.id || review.slug;
    form.querySelector("[name='slug']").value = review.slug;
    form.querySelector("[name='casino_slug']").value = review.casino_slug || "";
    form.querySelector("[name='country_code']").value = review.country_code || "";
    form.querySelector("[name='rating']").value = review.rating || 0;
    form.querySelector("[name='title']").value = review.title;
    form.querySelector("[name='overview']").value = review.overview || "";
    form.querySelector("[name='games']").value = review.games || "";
    form.querySelector("[name='bonuses']").value = review.bonuses || "";
    form.querySelector("[name='payments']").value = review.payments || "";
    form.querySelector("[name='licenses']").value = review.licenses || "";
    form.querySelector("[name='verdict']").value = review.verdict || "";

    form.querySelector("[name='content']").value = review.content || "";
   // setTimeout(() => {
     // RichEditor.set("review-overview", review.content || "");
   // }, 300); 
setTimeout(() => {

  RichEditor.set(
    "review-overview",
    review.overview || ""
  );

  RichEditor.set(
    "review-games",
    review.games || ""
  );

  RichEditor.set(
    "review-bonuses",
    review.bonuses || ""
  );

  RichEditor.set(
    "review-payments",
    review.payments || ""
  );

  RichEditor.set(
    "review-licenses",
    review.licenses || ""
  );

  RichEditor.set(
    "review-verdict",
    review.verdict || ""
  );

  RichEditor.set(
    "review-content",
    review.content || ""
  );

}, 300);

    let pros = [];
    try { pros = JSON.parse(review.pros || "[]"); } catch {}
    form.querySelector("[name='pros']").value = pros.join("\n");
    let cons = [];
    try { cons = JSON.parse(review.cons || "[]"); } catch {}
    form.querySelector("[name='cons']").value = cons.join("\n");
    form.querySelector("[name='faq_json']").value = review.faq_json || "[]";
    form.querySelector("[name='seo_title']").value = review.seo_title || "";
    form.querySelector("[name='seo_description']").value = review.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = review.seo_keywords || "";
        // Set author dropdown
    const authorSelect = form.querySelector("[name='author_id']");
    if (authorSelect) authorSelect.value = review.author_id || "";

    document.getElementById("reviewSubmitBtn").textContent = "Update Review";
    document.getElementById("reviewCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load review"); }
}

function cancelReviewEdit() {
  const form = document.getElementById("reviewForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("reviewSubmitBtn").textContent = "Create Review";
  document.getElementById("reviewCancelEdit").style.display = "none";
  RichEditor.set("review-overview", "");
}


