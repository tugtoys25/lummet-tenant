
// ---- Shared: sports/currencies/payment-methods checkbox groups ----
// Used by both the create form and the edit form.
async function loadRelationshipCheckboxes(selected = {}) {
  const { sportIds = [], currencyIds = [], paymentMethodIds = [] } = selected;

  async function fill(containerId, url, listKey, selectedIds) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const rows = data[listKey] || [];
      if (rows.length === 0) {
        container.innerHTML = '<span class="muted">None configured yet.</span>';
        return;
      }
      container.innerHTML = rows.map((row) => `
        <label style="display:block;font-weight:normal">
          <input type="checkbox" value="${row.id}" ${selectedIds.includes(row.id) ? "checked" : ""}>
          ${escapeHtmlClient(row.name || row.code)}
        </label>
      `).join("");
    } catch {
      container.innerHTML = '<span class="muted">Failed to load.</span>';
    }
  }

  await Promise.all([
    fill("sportsCheckboxes", "/en/api/v1/sports/list", "sports", sportIds),
    fill("currenciesCheckboxes", "/en/api/v1/currencies/list", "currencies", currencyIds),
    fill("paymentMethodsCheckboxes", "/en/api/v1/payment-methods/list", "payment_methods", paymentMethodIds),
  ]);
}


// ---- Shared: categories checkboxes + GEO rule rows (content_categories / content_geo) ----
async function loadCategoryCheckboxes(selectedIds = []) {
  const container = document.getElementById("categoryCheckboxes");
  if (!container) return;
  try {
    const res = await fetch("/en/api/v1/categories/list");
    const data = await res.json();
    const rows = data.categories || [];
    container.dataset.loaded = "1"; // only then is an empty selection meaningful (vs. "failed to load")
    container.innerHTML = rows.length ? rows.map((c) => `
      <label style="display:block;font-weight:normal">
        <input type="checkbox" value="${c.id}" ${selectedIds.includes(c.id) ? "checked" : ""}> ${escapeHtmlClient(c.name)}
      </label>`).join("") : '<span class="muted">No categories configured yet.</span>';
  } catch {
    container.innerHTML = '<span class="muted">Failed to load categories.</span>';
  }
}

let geoCountryOptionsHtml = null;
async function getGeoCountryOptionsHtml() {
  if (geoCountryOptionsHtml !== null) return geoCountryOptionsHtml;
  try {
    const res = await fetch("/en/api/v1/countries/list");
    const data = await res.json();
    geoCountryOptionsHtml = (data.countries || []).map((c) => `<option value="${escapeHtmlClient(c.code)}">${escapeHtmlClient(c.name)} (${escapeHtmlClient(c.code)})</option>`).join("");
  } catch {
    geoCountryOptionsHtml = null; // failed: don't cache, and readGeoRules() will refuse to send anything
    return "";
  }
  return geoCountryOptionsHtml;
}

async function addGeoRuleRow(rule = { country_code: "", status: "allowed" }) {
  const container = document.getElementById("geoRuleRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "geo-rule-row";
  row.style.cssText = "display:flex;gap:8px;margin-bottom:6px;align-items:center";
  row.innerHTML = `
    <select class="geo-rule-country" style="flex:2">${await getGeoCountryOptionsHtml()}</select>
    <select class="geo-rule-status" style="flex:1">
      <option value="allowed">Allowed</option>
      <option value="blocked">Blocked</option>
    </select>
    <button type="button" class="btn btn--ghost btn--sm remove-geo-rule">✕</button>`;
  row.querySelector(".geo-rule-country").value = rule.country_code;
  row.querySelector(".geo-rule-status").value = rule.status;
  container.appendChild(row);
}

function initGeoRuleEditor(initialRules = []) {
  const container = document.getElementById("geoRuleRows");
  const addBtn = document.getElementById("addGeoRuleBtn");
  if (!container || !addBtn) return;
  addBtn.addEventListener("click", () => addGeoRuleRow());
  container.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-geo-rule")) e.target.closest(".geo-rule-row").remove();
  });
  initialRules.forEach((r) => addGeoRuleRow(r));
}

// Returns null (=> omit geo_rules from the payload, leaving stored rules
// untouched) if the country list never loaded -- otherwise a failed load
// would render rows with no matching <option>, read back as empty, and a
// save would silently wipe the item's existing rules.
function readGeoRules() {
  if (geoCountryOptionsHtml === null || geoCountryOptionsHtml === "") {
    return document.querySelector("#geoRuleRows .geo-rule-row") ? null : [];
  }
  return Array.from(document.querySelectorAll("#geoRuleRows .geo-rule-row")).map((row) => ({
    country_code: row.querySelector(".geo-rule-country").value,
    status: row.querySelector(".geo-rule-status").value,
  })).filter((r) => r.country_code);
}


// ---- Shared: logo/hero media picker for content-item forms (gap #5/#6) ----
// Same MediaPicker.openImagePicker() API news/admin.js already uses.
function openContentItemMediaPicker(which) {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function (media) {
    if (!media || !media.id) return;
    setContentItemMedia(which, media.id, media.url || media.thumbnail_url || "");
  }, "content-items");
}

function setContentItemMedia(which, id, url) {
  const idInput = document.getElementById(which === "logo" ? "logoMediaId" : "heroMediaId");
  const img = document.getElementById(which === "logo" ? "logoImg" : "heroImg");
  const preview = document.getElementById(which === "logo" ? "logoPreview" : "heroPreview");
  const selectBtn = document.getElementById(which === "logo" ? "selectLogo" : "selectHero");
  const clearBtn = document.getElementById(which === "logo" ? "clearLogo" : "clearHero");
  if (idInput) idInput.value = id ? String(id) : "";
  if (img) img.src = url || "";
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
  if (clearBtn) clearBtn.style.display = url ? "" : "none";
}

function clearContentItemMedia(which) {
  setContentItemMedia(which, "", "");
}

function readCheckedIds(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((el) => parseInt(el.value)).filter((n) => !Number.isNaN(n));
}
