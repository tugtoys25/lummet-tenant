

// ---- Shared: admin list pagination (audit #15) ----
// Renders Prev/Next + "showing X-Y of N" into a container, and calls
// onPageChange(newPage) when clicked. A list whose API call omitted
// page/per_page (no `total` in the response) renders nothing here --
// pagination is opt-in per list via PAGE_STATE below, existing callers
// of these loaders with no page argument are unaffected.
// The shared list search (admin-list-search.js) keeps what was typed here; server-paged lists add it to their request.
function listSearchParam(tbodyId) {
  const q = window.ADMIN_LIST_QUERY && window.ADMIN_LIST_QUERY[tbodyId];
  return q ? `&search=${encodeURIComponent(q)}` : "";
}
window.addEventListener("admin-list-search", (e) => {
  const id = e.detail && e.detail.id;
  if (id === "comparisonsTableBody") { PAGE_STATE.comparisons = 1; loadComparisonsTable(); }
  else if (id === "genericReviewsTableBody") { PAGE_STATE.genericReviews = 1; loadGenericReviewsTable(); }
});

function renderPagerControls(containerId, page, perPage, total, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (total == null) { el.innerHTML = ""; return; }
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  el.innerHTML = `
    <button type="button" class="btn btn--ghost btn--sm" id="${containerId}PrevBtn" ${page <= 1 ? "disabled" : ""}>&laquo; Prev</button>
    <span class="muted">Showing ${from}-${to} of ${total}</span>
    <button type="button" class="btn btn--ghost btn--sm" id="${containerId}NextBtn" ${page >= totalPages ? "disabled" : ""}>Next &raquo;</button>
  `;
  document.getElementById(`${containerId}PrevBtn`)?.addEventListener("click", () => page > 1 && onPageChange(page - 1));
  document.getElementById(`${containerId}NextBtn`)?.addEventListener("click", () => page < totalPages && onPageChange(page + 1));
}

const PAGE_STATE = { contentItems: 1, customTypes: 1, comparisons: 1, genericReviews: 1 };
const PER_PAGE = 25;
