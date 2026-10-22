
// =====================================================
// GENERIC CONTENT ENGINE (Phase 8 — admin UI)
// Every function below no-ops if its page's elements aren't present
// on the current page, same guard style as loadCasinosTable() above
// -- safe to call unconditionally from DOMContentLoaded on every
// admin page.
// =====================================================

// ---- Content items table (sportsbook/affiliate_partner/custom) ----
async function loadContentItemsTable(contentType) {
  const tbody = document.getElementById("contentItemsTableBody");
  if (!tbody) return;

  const typeFilter = document.getElementById("contentItemTypeFilter");
  const type = contentType || (typeFilter ? typeFilter.value : "sportsbook");
  const statusFilter = document.getElementById("contentItemStatusFilter");
  const searchInput = document.getElementById("contentItemSearchInput");
  const status = statusFilter ? statusFilter.value : "";
  const search = searchInput ? searchInput.value.trim() : "";

  try {
    const params = new URLSearchParams({ content_type: type, page: String(PAGE_STATE.contentItems), per_page: String(PER_PAGE) });
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    const res = await fetch(`/en/api/v1/content-items/list?${params.toString()}`);
    const data = await res.json();
    const items = data.items || [];
    renderPagerControls("contentItemsPager", PAGE_STATE.contentItems, PER_PAGE, data.total, (p) => { PAGE_STATE.contentItems = p; loadContentItemsTable(type); });

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No items yet for this type.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map((i) => {
      const isLive = i.status === "published" && !!i.published;
      return `
      <tr>
        <td><strong>${escapeHtmlClient(i.name)}</strong></td>
        <td>${escapeHtmlClient(i.slug)}</td>
        <td>${escapeHtmlClient(i.content_type)}${i.custom_type_slug ? ` (${escapeHtmlClient(i.custom_type_slug)})` : ""}</td>
        <td>★ ${i.rating || "N/A"}</td>
        <td><span class="status-badge ${i.status === "published" ? "status-published" : "status-draft"}">${escapeHtmlClient(i.status || "draft")}</span> ${isLive ? "" : '<span class="muted" style="font-size:11px">(not public)</span>'}</td>
        <td class="table-actions">
          ${isLive ? `<a href="${contentItemPublicUrl(i)}" class="btn btn--ghost btn--sm" target="_blank">View</a>` : ""}
          <a href="/en/dashboard/content-item/edit/${encodeURIComponent(i.content_type)}/${encodeURIComponent(i.slug)}" class="btn btn--ghost btn--sm">Edit</a>
          <button class="btn btn--ghost btn--sm" onclick="togglePublishContentItem('${i.content_type}', '${i.slug}', ${isLive})">${isLive ? "Unpublish" : "Publish now"}</button>
          <button class="btn btn--danger btn--sm" onclick="deleteContentItem('${i.content_type}', '${i.slug}')">Delete</button>
        </td>
      </tr>
    `;
    }).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

// Public URL per content_type (matches routes.js). View is only offered
// for live items, since a draft's public URL is a 404 by design.
function contentItemPublicUrl(i) {
  const slug = encodeURIComponent(i.slug);
  if (i.content_type === "sportsbook") return `/en/sportsbook/${slug}`;
  if (i.content_type === "affiliate_partner") return `/en/affiliate-partner/${slug}`;
  return `/en/custom/${encodeURIComponent(i.custom_type_slug || "")}/${slug}`;
}

// Minimal client-side HTML escaper for admin table rows -- admin-entered
// name/slug/status are untrusted input the same way a custom field
// value is, so escape before interpolating into innerHTML.
function escapeHtmlClient(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

document.addEventListener("change", (e) => {
  if (e.target && (e.target.id === "contentItemTypeFilter" || e.target.id === "contentItemStatusFilter")) {
    PAGE_STATE.contentItems = 1;
    loadContentItemsTable(document.getElementById("contentItemTypeFilter")?.value);
  }
  if (e.target && e.target.id === "comparisonTypeFilter") {
    PAGE_STATE.comparisons = 1;
    loadComparisonsTable(e.target.value);
  }
});

let contentItemSearchDebounce;
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "contentItemSearchInput") {
    clearTimeout(contentItemSearchDebounce);
    contentItemSearchDebounce = setTimeout(() => { PAGE_STATE.contentItems = 1; loadContentItemsTable(); }, 300);
  }
});

async function deleteContentItem(contentType, slug) {
  if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
  try {
    const res = await fetch("/en/api/v1/content-item/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: contentType, slug }),
    });
    const data = await res.json();
    if (data.success) loadContentItemsTable(contentType);
    else alert(data.error || "Delete failed");
  } catch {
    alert("Network error. Try again.");
  }
}

// One-click publish/unpublish -- previously the only way to flip an
// item's lifecycle state was to open the full edit form, change the
// Status dropdown AND the Publicly Active checkbox, and save. This is
// a quick action for the common case; it still goes through the same
// content-item/update endpoint (same permission checks, same audit
// logging), just pre-filling the two fields that matter for "is this
// live" rather than requiring the whole form. Unpublishing sets status
// back to 'draft' (not just published=0) so the item doesn't sit in a
// confusing "status: published, but published: false" in-between state.
async function togglePublishContentItem(contentType, slug, currentlyLive) {
  const action = currentlyLive ? "unpublish" : "publish";
  if (!confirm(currentlyLive ? `Unpublish "${slug}"? It will no longer be visible on the public site.` : `Publish "${slug}" now? It will become visible on the public site immediately.`)) return;
  try {
    const res = await fetch("/en/api/v1/content-item/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: contentType, slug,
        status: currentlyLive ? "draft" : "published",
        published: !currentlyLive,
      }),
    });
    const data = await res.json();
    if (data.success) loadContentItemsTable(contentType);
    else alert(data.error || `Failed to ${action}`);
  } catch {
    alert("Network error. Try again.");
  }
}

// ---- Content item create form ----
async function initContentItemForm() {
  const form = document.getElementById("contentItemForm");
  if (!form) return;

  const typeSelect = document.getElementById("contentTypeSelect");
  const customTypeField = document.getElementById("customTypeField");
  const customTypeSelect = document.getElementById("customTypeSelect");
  const sportsbookFields = document.getElementById("sportsbookFields");
  const affiliatePartnerFields = document.getElementById("affiliatePartnerFields");
  const customFieldsContainer = document.getElementById("customFieldsContainer");
  const customFieldRows = document.getElementById("customFieldRows");

  async function loadCustomTypeOptions() {
    if (customTypeSelect.dataset.loaded) return;
    customTypeSelect.dataset.loaded = "1";
    try {
      const res = await fetch("/en/api/v1/custom-types/list");
      const data = await res.json();
      customTypeSelect.innerHTML = (data.types || [])
        .map((t) => `<option value="${t.slug}">${escapeHtmlClient(t.label)}</option>`).join("");
      if (customTypeSelect.value) loadCustomFieldInputs(customTypeSelect.value);
    } catch {
      customTypeSelect.innerHTML = '<option value="">Failed to load custom types</option>';
    }
  }

  async function loadCustomFieldInputs(typeSlug) {
    if (!typeSlug) { customFieldRows.innerHTML = "Select a custom type above to see its fields."; return; }
    try {
      const res = await fetch(`/en/api/v1/custom-type/fields?type_slug=${encodeURIComponent(typeSlug)}`);
      const data = await res.json();
      const fields = data.fields || [];
      customFieldRows.innerHTML = fields.length
        ? fields.map((def) => `
            <label>${escapeHtmlClient(def.label)}${def.required ? " *" : ""}
              <input type="text" class="custom-field-input" data-field-key="${def.field_key}">
            </label>
          `).join("")
        : "<p class='muted'>This type has no custom fields defined.</p>";
    } catch {
      customFieldRows.innerHTML = "<p class='muted'>Failed to load fields.</p>";
    }
  }

  customTypeSelect.addEventListener("change", () => loadCustomFieldInputs(customTypeSelect.value));

  function updateVisibleFields() {
    const type = typeSelect.value;
    customTypeField.style.display = type === "custom" ? "" : "none";
    sportsbookFields.style.display = type === "sportsbook" ? "" : "none";
    affiliatePartnerFields.style.display = type === "affiliate_partner" ? "" : "none";
    customFieldsContainer.style.display = type === "custom" ? "" : "none";
    if (type === "custom") loadCustomTypeOptions();
    if (type === "sportsbook") loadRelationshipCheckboxes();
  }

  typeSelect.addEventListener("change", updateVisibleFields);
  updateVisibleFields();
  loadCategoryCheckboxes();
  initGeoRuleEditor();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("contentItemFormAlert");
    alertEl.style.display = "none";

    const contentType = new FormData(form).get("content_type");
    const formData = new FormData(form);
    const payload = {
      content_type: formData.get("content_type"),
      custom_type_slug: formData.get("custom_type_slug") || null,
      name: formData.get("name"),
      slug: formData.get("slug"),
      title: formData.get("title") || null,
      description: formData.get("description") || null,
      website: formData.get("website") || null,
      rating: parseFloat(formData.get("rating")) || 0,
      license: formData.get("license") || null,
      license_country: formData.get("license_country") || null,
      live_betting: formData.get("live_betting") === "on",
      pre_match: formData.get("pre_match") === "on",
      cashout: formData.get("cashout") === "on",
      mobile_app: formData.get("mobile_app") === "on",
      linked_affiliate_partner_id: formData.get("linked_affiliate_partner_id") || null,
      tracking_url: formData.get("tracking_url") || null,
      logo_media_id: formData.get("logo_media_id") || null,
      featured_image_media_id: formData.get("featured_image_media_id") || null,
      featured: formData.get("featured") === "on" ? 1 : 0,
      sort_order: parseInt(formData.get("sort_order")) || 0,
      status: formData.get("status") || "draft",
      published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
    };
    if (document.getElementById("categoryCheckboxes")?.dataset.loaded === "1") payload.category_ids = readCheckedIds("categoryCheckboxes");
    const geoRulesToSend = readGeoRules();
    if (geoRulesToSend !== null) payload.geo_rules = geoRulesToSend;
    if (contentType === "sportsbook") {
      payload.sport_ids = readCheckedIds("sportsCheckboxes");
      payload.currency_ids = readCheckedIds("currenciesCheckboxes");
      payload.payment_method_ids = readCheckedIds("paymentMethodsCheckboxes");
    }
    if (contentType === "custom") {
      const values = {};
      customFieldRows.querySelectorAll(".custom-field-input").forEach((input) => {
        values[input.dataset.fieldKey] = input.value;
      });
      payload.custom_field_values = values;
    }

    try {
      const res = await fetch("/en/api/v1/content-item/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Content item created successfully!";
        alertEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/dashboard/content-items"; }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create content item";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
