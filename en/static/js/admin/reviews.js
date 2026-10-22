// ============================================
// REVIEWS
// ============================================

async function loadReviewsTable() {
  const tbody = document.getElementById("reviewsTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/reviews/list");
    const data = await res.json();
    const reviews = data.reviews || [];

    if (reviews.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No reviews yet.</td></tr>';
      return;
    }

    tbody.innerHTML = reviews
      .map(
        (r) => `
      <tr>
        <td><strong>${r.title}</strong></td>
        <td>${r.casino_slug || "—"}</td>
        <td>${r.country_code || "Global"}</td>
        <td>★ ${r.rating || "N/A"}</td>
        <td class="table-actions">
 <button class="btn btn--ghost btn--sm" onclick="editReview('${r.slug}')">Edit</button>
          <button class="btn btn--ghost btn--sm" onclick="window.ReviewTabs && ReviewTabs.sections('${r.slug}')">Sections</button>
          <a href="/en/review/${r.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteReview('${r.slug}')">Delete</button>
        </td>

      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

function initReviewForm() {
  const form = document.getElementById("reviewForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("reviewFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/review/update" : "/en/api/v1/review/create";

const payload = {
  slug: formData.get("slug"),
  casino_slug: formData.get("casino_slug"),
  country_code: formData.get("country_code") || null,

  title: formData.get("title"),

  overview: formData.get("overview") || "",
  games: formData.get("games") || "",
  bonuses: formData.get("bonuses") || "",
  payments: formData.get("payments") || "",
  licenses: formData.get("licenses") || "",
  verdict: formData.get("verdict") || "",

  content: formData.get("content") || "",

  pros: formData.get("pros")
    ? formData.get("pros")
        .split("\n")
        .map(p => p.trim())
        .filter(Boolean)
    : [],

  cons: formData.get("cons")
    ? formData.get("cons")
        .split("\n")
        .map(c => c.trim())
        .filter(Boolean)
    : [],

  faq_json: formData.get("faq_json") || "[]",
  rating: parseFloat(formData.get("rating")) || 0,

  seo_title: formData.get("seo_title") || null,

  seo_description: formData.get("seo_description") || null,

  seo_keywords: formData.get("seo_keywords") || null,

  author_id: formData.get("author_id")
    ? parseInt(formData.get("author_id"))
    : null
};

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = isEdit ? "Review updated!" : "Review created!";
          alertEl.style.display = "block";
        }
        form.reset();
        form.querySelector("[name='id']").value = "";
        document.getElementById("reviewSubmitBtn").textContent = "Create Review";
        document.getElementById("reviewCancelEdit").style.display = "none";
        loadReviewsTable();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
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

