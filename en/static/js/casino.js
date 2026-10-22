// =====================================================
// CASINO DETAIL PAGE
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  loadCasinoReviews();
  // The "Your Region" card is filled in by geo.js (same request, same markup).
});

// ---- Load reviews for this casino ----
async function loadCasinoReviews() {
  const container = document.getElementById("reviewsContainer");
  if (!container) return;

  const slug = window.location.pathname.split("/").pop();

  try {
    const res = await fetch(`/en/api/v1/public/casino-reviews?casino_slug=${encodeURIComponent(slug)}`);
    const data = await res.json();

    const casinoReviews = (data.reviews || []).filter(
      (r) => r.casino_slug === slug
    );

    if (casinoReviews.length === 0) {
      container.innerHTML = '<p class="muted">No reviews yet.</p>';
      return;
    }

    container.innerHTML = casinoReviews
      .map(
        (r) => `
      <div class="review-item">
        <h4><a href="/en/review/${r.slug}">${r.title}</a></h4>
        <span class="review-rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</span>
        <p class="review-excerpt">${(r.content || "").substring(0, 200)}...</p>
      </div>
    `
      )
      .join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load reviews.</p>';
  }
}

