// ============================================
// RESEARCH REVIEW QUEUE (Phase 5)
// ============================================

const REVIEW_QUEUE_CATEGORIES = [
  { key: "overdue_verification", label: "Overdue verification", countKey: "overdueVerification" },
  { key: "broken_sources", label: "Broken sources", countKey: "brokenSources" },
  { key: "stale_sources", label: "Stale sources", countKey: "staleSources" },
  { key: "missing_citations", label: "Missing citations", countKey: "missingCitations" },
  { key: "missing_seo", label: "Missing SEO", countKey: "missingSeo" },
  { key: "orphan_relations", label: "Broken relationships", countKey: "orphanRelations" },
];

async function loadReviewQueueSummary() {
  const cardsEl = document.getElementById("reviewQueueCards");
  if (!cardsEl) return;
  try {
    const res = await fetch("/en/api/v1/research-review-queue/summary");
    const data = await res.json();
    const counts = data.counts || {};
    cardsEl.innerHTML = REVIEW_QUEUE_CATEGORIES.map(cat => `
      <div class="admin-card" style="cursor:pointer;padding:16px;border:1px solid var(--border,#333);border-radius:6px" onclick="loadReviewQueueDetail('${cat.key}', '${cat.label}')">
        <div style="font-size:28px;font-weight:600">${counts[cat.countKey] ?? 0}</div>
        <div class="muted">${cat.label}</div>
      </div>
    `).join("");
  } catch {
    cardsEl.innerHTML = '<div class="muted">Failed to load.</div>';
  }
}

function reviewQueueItemLink(item) {
  if (item.type && item.slug) return `/en/research/${item.type}/${item.slug}`;
  return null;
}

async function loadReviewQueueDetail(category, label) {
  const detailEl = document.getElementById("reviewQueueDetail");
  if (!detailEl) return;
  detailEl.innerHTML = `<h2>${label}</h2><p class="muted">Loading...</p>`;
  try {
    const res = await fetch(`/en/api/v1/research-review-queue/list?category=${category}`);
    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      detailEl.innerHTML = `<h2>${label}</h2><p class="muted">Nothing here — all clear.</p>`;
      return;
    }

    let rows = "";
    if (category === "broken_sources" || category === "stale_sources") {
      rows = items.map(s => `
        <tr>
          <td><strong>${s.organisation}</strong>${s.title ? `<br><span class="muted" style="font-size:12px">${s.title}</span>` : ""}</td>
          <td>${s.url ? `<a href="${s.url}" target="_blank" rel="nofollow noopener">${s.url}</a>` : "—"}</td>
          <td>${(s.accessed_at || "never").toString().replace("T", " ").slice(0, 16)}</td>
          <td class="table-actions"><button class="btn btn--ghost btn--sm" onclick="checkSourceHealthNow(${s.id}, '${category}', '${label.replace(/'/g, "\\'")}')">Check now</button></td>
        </tr>
      `).join("");
      detailEl.innerHTML = `
        <h2>${label}</h2>
        <table class="admin-table">
          <thead><tr><th>Source</th><th>URL</th><th>Last checked</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      return;
    }

    if (category === "orphan_relations") {
      rows = items.map(r => `
        <tr>
          <td>${r.from_type}:${r.from_id}</td>
          <td>${r.relation_type.replace(/_/g, " ")}</td>
          <td>${r.unresolved_target} <span class="muted" style="font-size:12px">(no longer exists)</span></td>
          <td class="table-actions"><button class="btn btn--danger btn--sm" onclick="deleteOrphanRelation(${r.id})">Remove</button></td>
        </tr>
      `).join("");
      detailEl.innerHTML = `
        <h2>${label}</h2>
        <table class="admin-table">
          <thead><tr><th>From</th><th>Relation</th><th>Missing target</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      return;
    }

    // overdue_verification, missing_citations, missing_seo — all research_items rows
    rows = items.map(item => {
      const link = reviewQueueItemLink(item);
      return `
        <tr>
          <td>${link ? `<a href="${link}" target="_blank">${item.title}</a>` : item.title}</td>
          <td>${item.type || "—"}</td>
          <td>${(item.next_review_at || "").toString().replace("T", " ").slice(0, 16) || "—"}</td>
        </tr>
      `;
    }).join("");
    detailEl.innerHTML = `
      <h2>${label}</h2>
      <table class="admin-table">
        <thead><tr><th>Title</th><th>Type</th><th>Next review</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch {
    detailEl.innerHTML = `<h2>${label}</h2><p class="muted">Failed to load.</p>`;
  }
}

async function checkSourceHealthNow(sourceId, category, label) {
  try {
    const res = await fetch("/en/api/v1/research-sources/check-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sourceId }),
    });
    const data = await res.json();
    if (data.success) {
      loadReviewQueueDetail(category, label);
      loadReviewQueueSummary();
    } else {
      alert(data.error || "Health check failed");
    }
  } catch { alert("Network error"); }
}

async function deleteOrphanRelation(id) {
  if (!confirm("Remove this broken relationship?")) return;
  try {
    const res = await fetch("/en/api/v1/research-relations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) {
      loadReviewQueueDetail("orphan_relations", "Broken relationships");
      loadReviewQueueSummary();
    } else {
      alert(data.error || "Could not remove");
    }
  } catch { alert("Network error"); }
}

