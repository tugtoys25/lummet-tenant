// ============================================
// RESEARCH VERSION HISTORY (Phase 4)
// ============================================

const FIELD_LABELS = {
  type: "Type", slug: "Slug", title: "Title", subtitle: "Subtitle", excerpt: "Excerpt",
  content_json: "Content sections", country_id: "Country", author_id: "Author",
  status: "Status", published: "Published", robots: "Robots", seo_title: "SEO title",
  seo_description: "SEO description", seo_keywords: "SEO keywords",
  canonical_url: "Canonical URL", og_image: "OG image", featured: "Featured"
};

function truncateForDiff(value) {
  const str = value === null || value === undefined ? "(empty)" : String(value);
  return str.length > 140 ? str.slice(0, 140) + "…" : str;
}

async function loadResearchVersionsTable(researchItemId) {
  const tbody = document.getElementById("researchVersionsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch(`/en/api/v1/research-versions/list-for-item?research_item_id=${researchItemId}`);
    const data = await res.json();
    const versions = data.versions || [];

    if (versions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No versions yet — versions are saved once this item is published.</td></tr>';
      return;
    }

    tbody.innerHTML = versions.map(v => `
      <tr>
        <td>v${v.version_number}</td>
        <td>${(v.created_at || "").replace("T", " ").slice(0, 16)}</td>
        <td>${v.changed_by || "—"}</td>
        <td>${v.restored_from_version ? `<span class="badge badge-dim">Restored from v${v.restored_from_version}</span>` : (v.change_summary || "—")}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="viewResearchVersionDiff(${v.id})">View changes</button>
          <button class="btn btn--danger btn--sm" onclick="restoreResearchVersion(${v.id}, ${researchItemId}, ${v.version_number})">Restore</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Failed to load.</td></tr>';
  }
}

async function viewResearchVersionDiff(versionId) {
  const box = document.getElementById("researchVersionDiffBox");
  const content = document.getElementById("researchVersionDiffContent");
  if (!box || !content) return;
  content.innerHTML = "Loading...";
  box.style.display = "";
  try {
    const res = await fetch(`/en/api/v1/research-versions/diff?id=${versionId}&compare_to=current`);
    const data = await res.json();
    const changes = data.changes || [];
    if (changes.length === 0) {
      content.innerHTML = '<p class="muted">No differences from the current version.</p>';
      return;
    }
    content.innerHTML = changes.map(c => `
      <div style="margin-bottom:10px">
        <strong>${FIELD_LABELS[c.field] || c.field}</strong>
        <div style="display:flex;gap:12px;margin-top:4px">
          <div style="flex:1;color:#d97676"><span class="muted" style="font-size:11px">This version</span><br>${truncateForDiff(c.before)}</div>
          <div style="flex:1;color:#7fbf7f"><span class="muted" style="font-size:11px">Current</span><br>${truncateForDiff(c.after)}</div>
        </div>
      </div>
    `).join("");
  } catch {
    content.innerHTML = '<p class="muted">Failed to load diff.</p>';
  }
}

async function restoreResearchVersion(versionId, researchItemId, versionNumber) {
  if (!confirm(`Restore version ${versionNumber}? This overwrites the current content (a new version recording this restore will be saved).`)) return;
  try {
    const res = await fetch("/en/api/v1/research-versions/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: versionId }),
    });
    const data = await res.json();
    if (data.success) {
      alert("Restored. Reloading the form with the restored content...");
      await editResearch(researchItemId);
    } else {
      alert(data.error || "Could not restore version");
    }
  } catch { alert("Network error"); }
}

function showResearchVersionsPanel(researchItemId, title) {
  const section = document.getElementById("researchVersionsSection");
  if (!section) return;
  document.getElementById("researchVersionsItemTitle").textContent = title || "";
  document.getElementById("researchVersionDiffBox").style.display = "none";
  section.style.display = "";
  loadResearchVersionsTable(researchItemId);
}

function hideResearchVersionsPanel() {
  const section = document.getElementById("researchVersionsSection");
  if (section) section.style.display = "none";
}

