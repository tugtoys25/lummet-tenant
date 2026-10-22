
// =====================================================
// EDIT FORMS + SETTINGS + GENERIC REVIEWS (production-readiness pass)
// Same no-op-if-absent guard style as every function above.
// =====================================================

// ---- Content item edit ----
async function initContentItemEditForm() {
  const form = document.getElementById("contentItemEditForm");
  if (!form) return;

  const contentType = form.dataset.contentType;
  const slug = form.dataset.slug;
  const alertEl = document.getElementById("contentItemEditAlert");
  const sportsbookFields = document.getElementById("sportsbookFields");
  const affiliatePartnerFields = document.getElementById("affiliatePartnerFields");
  const customFieldsContainer = document.getElementById("customFieldsContainer");
  const customFieldRows = document.getElementById("customFieldRows");

  if (contentType === "sportsbook") sportsbookFields.style.display = "";
  if (contentType === "affiliate_partner") affiliatePartnerFields.style.display = "";

  // Load current values and pre-fill the form
  try {
    const res = await fetch(`/en/api/v1/content-item/get?content_type=${encodeURIComponent(contentType)}&slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to load");
    const item = data.item;
    setContentItemMedia("logo", item.logo_media_id, item.logo);
    setContentItemMedia("hero", item.featured_image_media_id, item.hero_image);
    for (const [key, val] of Object.entries({
      name: item.name, title: item.title, description: item.description, website: item.website, tracking_url: item.tracking_url,
      rating: item.rating, license: item.license, license_country: item.license_country,
      linked_affiliate_partner_id: item.linked_affiliate_partner_id, sort_order: item.sort_order,
      status: item.status, seo_title: item.seo_title, seo_description: item.seo_description, seo_keywords: item.seo_keywords,
    })) {
      const el = form.elements[key];
      if (el && val !== null && val !== undefined) el.value = val;
    }
    for (const key of ["live_betting", "pre_match", "cashout", "mobile_app", "featured", "published"]) {
      const el = form.elements[key];
      if (el) el.checked = !!item[key];
    }

    await loadCategoryCheckboxes(data.category_ids || []);
    initGeoRuleEditor(data.geo_rules || []);

    if (contentType === "sportsbook") {
      await loadRelationshipCheckboxes({
        sportIds: data.sport_ids || [], currencyIds: data.currency_ids || [], paymentMethodIds: data.payment_method_ids || [],
      });
    }

    if (contentType === "custom") {
      customFieldsContainer.style.display = "";
      const cfRes = await fetch(`/en/api/v1/content-item/custom-field-values?content_type=custom&slug=${encodeURIComponent(slug)}`);
      const cfData = await cfRes.json();
      if (cfData.success) {
        customFieldRows.innerHTML = (cfData.definitions || []).map((def) => `
          <label>${def.label}
            <input type="text" class="custom-field-input" data-field-key="${def.field_key}" value="${(cfData.values[def.field_key] || "").toString().replace(/"/g, "&quot;")}">
          </label>
        `).join("") || "<p class='muted'>This type has no custom fields defined.</p>";
      }
    }
  } catch (e) {
    alertEl.className = "alert alert--error";
    alertEl.textContent = "Failed to load current values: " + e.message;
    alertEl.style.display = "block";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const payload = {
      content_type: contentType, slug,
      name: formData.get("name"), title: formData.get("title") || null, description: formData.get("description") || null,
      website: formData.get("website") || null, rating: formData.get("rating"),
      license: formData.get("license") || null, license_country: formData.get("license_country") || null,
      live_betting: formData.get("live_betting") === "on", pre_match: formData.get("pre_match") === "on",
      cashout: formData.get("cashout") === "on", mobile_app: formData.get("mobile_app") === "on",
      linked_affiliate_partner_id: formData.get("linked_affiliate_partner_id") || null,
      tracking_url: formData.get("tracking_url") || null,
      logo_media_id: formData.get("logo_media_id") || null,
      featured_image_media_id: formData.get("featured_image_media_id") || null,
      featured: formData.get("featured") === "on", sort_order: formData.get("sort_order"),
      status: formData.get("status"), published: formData.get("published") === "on",
      seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null, seo_keywords: formData.get("seo_keywords") || null,
    };
    if (contentType === "custom") {
      const values = {};
      customFieldRows.querySelectorAll(".custom-field-input").forEach((input) => {
        values[input.dataset.fieldKey] = input.value;
      });
      payload.custom_field_values = values;
    }
    if (document.getElementById("categoryCheckboxes")?.dataset.loaded === "1") payload.category_ids = readCheckedIds("categoryCheckboxes");
    const geoRulesToSend = readGeoRules();
    if (geoRulesToSend !== null) payload.geo_rules = geoRulesToSend;
    if (contentType === "sportsbook") {
      payload.sport_ids = readCheckedIds("sportsCheckboxes");
      payload.currency_ids = readCheckedIds("currenciesCheckboxes");
      payload.payment_method_ids = readCheckedIds("paymentMethodsCheckboxes");
    }
    try {
      const res = await fetch("/en/api/v1/content-item/update", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

// ---- Custom type edit ----
async function initCustomTypeEditForm() {
  const form = document.getElementById("customTypeEditForm");
  if (!form) return;

  const typeSlug = form.dataset.typeSlug;
  const alertEl = document.getElementById("customTypeEditAlert");
  const fieldRowsContainer = document.getElementById("fieldRows");
  const template = document.getElementById("fieldRowTemplate");

  document.getElementById("addFieldRowBtn").addEventListener("click", () => {
    fieldRowsContainer.appendChild(template.content.cloneNode(true));
  });
  fieldRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-field-row")) e.target.closest(".field-row").remove();
  });

  function addFieldRow(field) {
    const clone = template.content.cloneNode(true);
    clone.querySelector(".field-key").value = field.field_key;
    clone.querySelector(".field-label").value = field.label;
    clone.querySelector(".field-type").value = field.field_type;
    clone.querySelector(".field-required").checked = !!field.required;
    fieldRowsContainer.appendChild(clone);
  }

  try {
    const [typesRes, fieldsRes] = await Promise.all([
      fetch("/en/api/v1/custom-types/list"),
      fetch(`/en/api/v1/custom-type/fields?type_slug=${encodeURIComponent(typeSlug)}`),
    ]);
    const typesData = await typesRes.json();
    const type = (typesData.types || []).find((t) => t.slug === typeSlug);
    if (type) {
      form.elements.label.value = type.label;
      form.elements.plural_label.value = type.plural_label;
      form.elements.icon.value = type.icon || "";
      form.elements.review_enabled.checked = !!type.review_enabled;
      form.elements.comparison_enabled.checked = !!type.comparison_enabled;
    }
    const fieldsData = await fieldsRes.json();
    // Existing fields are now pre-populated as the SAME editable rows
    // the create form uses -- previously this was a static read-only
    // <ul>, and an admin could only append new fields, never edit,
    // remove, or reorder one that already existed.
    (fieldsData.fields || []).forEach((f) => addFieldRow(f));
  } catch (e) {
    alertEl.className = "alert alert--error";
    alertEl.textContent = "Failed to load current values.";
    alertEl.style.display = "block";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const fields = Array.from(fieldRowsContainer.querySelectorAll(".field-row")).map((row) => ({
      field_key: row.querySelector(".field-key").value.trim(),
      label: row.querySelector(".field-label").value.trim(),
      field_type: row.querySelector(".field-type").value,
      required: row.querySelector(".field-required").checked,
    })).filter((f) => f.field_key && f.label);

    try {
      // Sends the full replacement set as `fields` (updateCustomFieldDefinitions())
      // rather than the old append-only `new_fields` -- this is what
      // lets removing/reordering/relabeling an existing field actually work.
      const res = await fetch("/en/api/v1/custom-type/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: typeSlug, label: formData.get("label"), plural_label: formData.get("plural_label"),
          icon: formData.get("icon") || null, review_enabled: formData.get("review_enabled") === "on",
          comparison_enabled: formData.get("comparison_enabled") === "on", fields,
        }),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}

async function deleteCustomType(slug) {
  if (!confirm(`Delete custom type "${slug}"? This only works if no content items use it.`)) return;
  try {
    const res = await fetch("/en/api/v1/custom-type/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadCustomTypesTable();
    else alert(data.error || "Delete failed");
  } catch {
    alert("Network error. Try again.");
  }
}

// ---- Comparison edit ----
async function initComparisonEditForm() {
  const form = document.getElementById("comparisonEditForm");
  if (!form) return;

  const compareType = form.dataset.compareType;
  const slug = form.dataset.slug;
  const alertEl = document.getElementById("comparisonEditAlert");
  const criterionRowsContainer = document.getElementById("criterionRows");
  const criterionTemplate = document.getElementById("criterionRowTemplate");
  const criteriaEditor = initCriterionRowEditor(criterionRowsContainer, document.getElementById("addCriterionRowBtn"), criterionTemplate, () => compareType);

  const itemSearchContentType = document.getElementById("itemSearchContentType");
  itemSearchContentType.value = compareType; // default the picker to the comparison's own type; still changeable for cross-type comparisons
  const picker = initComparisonItemPicker({
    contentTypeSelectEl: itemSearchContentType,
    searchInputId: "itemSearchInput", resultsId: "itemSearchResults",
    selectedRowsId: "selectedItemRows", rowTemplateId: "selectedItemRowTemplate",
  });
  const designEditor = mountComparisonDesign(picker, criterionRowsContainer, criteriaEditor);

  try {
    const res = await fetch(`/en/api/v1/comparison/get?content_type=${encodeURIComponent(compareType)}&slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const c = data.comparison;
    form.elements.title.value = c.title;
    form.elements.description.value = c.description || "";
    form.elements.status.value = c.status;
    form.elements.seo_title.value = c.seo_title || "";
    form.elements.seo_description.value = c.seo_description || "";
    let editorialPreset = null;
    if (c.editorial_selection_item_type) {
      form.elements.editorial_selection_item_type.value = c.editorial_selection_item_type;
      try {
        const r = await fetch(`/en/api/v1/content-item/search?content_type=${encodeURIComponent(c.editorial_selection_item_type)}&id=${c.editorial_selection_item_id}`);
        const rd = await r.json();
        editorialPreset = (rd.items || [])[0] || { id: c.editorial_selection_item_id, content_type: c.editorial_selection_item_type, name: `#${c.editorial_selection_item_id}` };
      } catch {
        editorialPreset = { id: c.editorial_selection_item_id, content_type: c.editorial_selection_item_type, name: `#${c.editorial_selection_item_id}` };
      }
    }
    initEditorialPickPicker(editorialPreset);
    // comparison_items only stores (item_content_type, item_id), no
    // name -- resolve each already-selected item's label via the exact
    // -id lookup on content-item/search so the picker can show
    // something readable instead of a bare number.
    await Promise.all((data.items || []).map(async (item) => {
      try {
        const r = await fetch(`/en/api/v1/content-item/search?content_type=${encodeURIComponent(item.item_content_type)}&id=${item.item_id}`);
        const rd = await r.json();
        const resolved = (rd.items || [])[0];
        picker.addPreset(resolved || { id: item.item_id, content_type: item.item_content_type, name: `#${item.item_id}`, status: "" });
      } catch {
        picker.addPreset({ id: item.item_id, content_type: item.item_content_type, name: `#${item.item_id}`, status: "" });
      }
    }));
    let criteria = [];
    try { criteria = JSON.parse(c.criteria_json || "[]"); } catch {}
    criteria.forEach((crit) => criteriaEditor.addRow(crit.key, crit.label));
    if (designEditor) designEditor.load(data.design);
  } catch (e) {
    alertEl.className = "alert alert--error";
    alertEl.textContent = "Failed to load current values.";
    alertEl.style.display = "block";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    const formData = new FormData(form);
    const items = picker.getSelected().map((it, idx) => ({ item_content_type: it.itemContentType, item_id: it.itemId, position: idx }));
    const criteria = readCriterionRows(criterionRowsContainer);
    const editorialType = formData.get("editorial_selection_item_type");

    try {
      const res = await fetch("/en/api/v1/comparison/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: compareType, slug, title: formData.get("title"), description: formData.get("description") || null,
          status: formData.get("status"), items, criteria,
          design: designEditor ? designEditor.read() : undefined,
          editorial_selection_item_type: editorialType || null,
          editorial_selection_item_id: editorialType ? (parseInt(formData.get("editorial_selection_item_id")) || null) : null,
          seo_title: formData.get("seo_title") || null, seo_description: formData.get("seo_description") || null,
        }),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
