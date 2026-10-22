async function loadPaymentMethodsTable() {
  const tbody = document.getElementById("paymentMethodsTableBody");
  if (!tbody) return;
  try {
    const res = await fetch("/en/api/v1/payment-methods/list");
    const data = await res.json();
    const methods = data.payment_methods || [];
    if (methods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No payment methods yet.</td></tr>';
      return;
    }
    tbody.innerHTML = methods.map(m => `
      <tr>
        <td>${m.icon_url ? `<img src="${m.icon_url}" alt="${m.name}" style="width:32px;height:32px;object-fit:contain">` : '<span class="muted">—</span>'}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.slug}</td>
        <td>${m.method_type || "card"}</td>
        <td>${m.status === "draft" || m.published === 0 ? '<span class="badge-dim">Draft</span>' : '<span class="badge-ok">Published</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--ghost btn--sm" onclick="editPaymentMethod(${m.id})">Edit</button>
          <button class="btn btn--danger btn--sm" onclick="deletePaymentMethod('${m.slug}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

async function deletePaymentMethod(slug) {
  if (!confirm(`Delete payment method "${slug}"?`)) return;
  try {
    const res = await fetch("/en/api/v1/payment-method/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.success) loadPaymentMethodsTable();
    else alert(data.error || "Delete failed");
  } catch { alert("Network error"); }
}

function initPaymentMethodForm() {
  const form = document.getElementById("paymentMethodForm");
  if (!form) return;

  wireSeoSectionBuilder("payment_method", "pmFormSections", "pmFormAddSectionBtn");

  const selectBtn = document.getElementById("pmSelectIcon");
  const changeBtn = document.getElementById("pmChangeIcon");
  const removeBtn = document.getElementById("pmRemoveIcon");
  if (selectBtn) selectBtn.addEventListener("click", openPaymentMethodIconPicker);
  if (changeBtn) changeBtn.addEventListener("click", openPaymentMethodIconPicker);
  if (removeBtn) removeBtn.addEventListener("click", clearPaymentMethodIcon);

  const saveCasinosBtn = document.getElementById("pmSaveCasinosBtn");
  if (saveCasinosBtn) saveCasinosBtn.addEventListener("click", savePaymentMethodCasinos);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("paymentMethodFormAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    syncSeoSectionsFromDom("payment_method");
    const isEdit = formData.get("id") ? true : false;
    const endpoint = isEdit ? "/en/api/v1/payment-method/update" : "/en/api/v1/payment-method/create";

    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : null,
      slug: formData.get("slug"),
      name: formData.get("name"),
      icon_url: formData.get("icon_url") || null,
      method_type: formData.get("method_type") || "card",
      description: formData.get("description") || null,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      content_json: { sections: seoPageState.payment_method.sections },
      sort_order: parseInt(formData.get("sort_order") || "0"),
      status: formData.get("status") || "published",
      published: formData.get("published") === "0" ? 0 : 1,
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
          alertEl.textContent = isEdit ? "Payment method updated!" : "Payment method created!";
          alertEl.style.display = "block";
        }
        const wasNew = !isEdit;
        const newSlug = payload.slug;
        form.reset();
        form.querySelector("[name='id']").value = "";
        clearPaymentMethodIcon();
        document.getElementById("paymentMethodSubmitBtn").textContent = "Create Payment Method";
        document.getElementById("paymentMethodCancelEdit").style.display = "none";
        document.getElementById("paymentMethodFormTitle").textContent = "Add Payment Method";
        document.getElementById("pmCasinosGroup").style.display = "none";
        seoPageState.payment_method.sections = [];
        renderSeoSections("payment_method");
        loadPaymentMethodsTable();
        // A brand-new method has nothing to link yet on this same
        // load (its id wasn't known to the form) -- jump straight
        // into editing it so the casino checklist becomes available
        // immediately instead of requiring a second click.
        if (wasNew && newSlug) {
          setTimeout(() => {
            fetch(`/en/api/v1/payment-methods/list`).then(r => r.json()).then(d => {
              const created = (d.payment_methods || []).find(m => m.slug === newSlug);
              if (created) editPaymentMethod(created.id);
            });
          }, 200);
        }
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

function openPaymentMethodIconPicker() {
  if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") {
    alert("Media Library is not available. Make sure media-picker.js is loaded.");
    return;
  }
  window.MediaPicker.openImagePicker(function(media) {
    if (!media) return;
    setPaymentMethodIcon(media.url || media.thumbnail_url || "", media.alt_text || "Payment method icon");
  }, "payments");
}

function setPaymentMethodIcon(url, alt) {
  const urlInput = document.getElementById("pmIconUrl");
  const imgEl = document.getElementById("pmIconImg");
  const preview = document.getElementById("pmIconPreview");
  const selectBtn = document.getElementById("pmSelectIcon");

  if (urlInput) urlInput.value = url || "";
  if (imgEl) { imgEl.src = url || ""; imgEl.alt = alt || ""; }
  if (preview) preview.style.display = url ? "block" : "none";
  if (selectBtn) selectBtn.style.display = url ? "none" : "";
}

function clearPaymentMethodIcon() {
  setPaymentMethodIcon("", "");
}

async function editPaymentMethod(id) {
  try {
    const res = await fetch(`/en/api/v1/payment-method/get-by-id?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const m = data.payment_method;
    const form = document.getElementById("paymentMethodForm");
    form.querySelector("[name='id']").value = m.id;
    form.querySelector("[name='slug']").value = m.slug;
    form.querySelector("[name='name']").value = m.name;
    form.querySelector("[name='method_type']").value = m.method_type || "card";
    form.querySelector("[name='sort_order']").value = m.sort_order || 0;
    form.querySelector("[name='seo_title']").value = m.seo_title || "";
    form.querySelector("[name='seo_description']").value = m.seo_description || "";
    form.querySelector("[name='seo_keywords']").value = m.seo_keywords || "";
    form.querySelector("[name='status']").value = m.status || "published";
    form.querySelector("[name='published']").value = m.published === 0 ? "0" : "1";
    setPaymentMethodIcon(m.icon_url || "", m.name);
    setTimeout(() => {
      if (window.RichEditor && typeof RichEditor.set === "function") {
        RichEditor.set("payment-method-description", m.description || "");
      }
    }, 300);

    document.getElementById("paymentMethodSubmitBtn").textContent = "Update Payment Method";
    document.getElementById("paymentMethodCancelEdit").style.display = "";
    document.getElementById("paymentMethodFormTitle").textContent = `Edit — ${m.name}`;

    let content = {};
    try { content = typeof m.content_json === "string" ? JSON.parse(m.content_json) : (m.content_json || {}); } catch (e) {}
    seoPageState.payment_method.sections = Array.isArray(content.sections) ? content.sections : [];
    renderSeoSections("payment_method");
    loadPaymentMethodFormEligibleCasinos(m.slug);

    await loadPaymentMethodCasinoCheckboxes(m.id, m.slug);

    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load payment method"); }
}

async function loadPaymentMethodFormEligibleCasinos(slug) {
  if (!slug) return;
  try {
    const res = await fetch("/en/api/v1/payment-method/eligible-casinos?slug=" + encodeURIComponent(slug));
    const data = await res.json().catch(() => ({}));
    seoPageState.payment_method.eligibleCasinos = data.casinos || [];
  } catch (e) {
    seoPageState.payment_method.eligibleCasinos = [];
  }
  syncSeoSectionsFromDom("payment_method");
  renderSeoSections("payment_method");
}

function cancelPaymentMethodEdit() {
  const form = document.getElementById("paymentMethodForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  clearPaymentMethodIcon();
  document.getElementById("paymentMethodSubmitBtn").textContent = "Create Payment Method";
  document.getElementById("paymentMethodCancelEdit").style.display = "none";
  document.getElementById("paymentMethodFormTitle").textContent = "Add Payment Method";
  document.getElementById("pmCasinosGroup").style.display = "none";
  seoPageState.payment_method.sections = [];
  renderSeoSections("payment_method");
  if (window.RichEditor && typeof RichEditor.set === "function") {
    RichEditor.set("payment-method-description", "");
  }
}

async function loadPaymentMethodCasinoCheckboxes(paymentMethodId, slug) {
  const group = document.getElementById("pmCasinosGroup");
  const list = document.getElementById("pmCasinosList");
  if (!group || !list) return;
  group.style.display = "";
  group.dataset.paymentMethodId = paymentMethodId;
  list.innerHTML = '<span class="muted">Loading casinos...</span>';

  try {
    const [allRes, linkedRes] = await Promise.all([
      fetch("/en/api/v1/casinos/list"),
      fetch(`/en/api/v1/payment-method/casinos?slug=${encodeURIComponent(slug)}`),
    ]);
    const allData = await allRes.json();
    const linkedData = await linkedRes.json();
    const casinos = allData.casinos || [];
    const linkedIds = new Set(linkedData.casino_ids || []);

    if (casinos.length === 0) {
      list.innerHTML = '<span class="muted">No casinos yet.</span>';
      return;
    }

    list.innerHTML = casinos.map(c => `
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400">
        <input type="checkbox" class="pm-casino-checkbox" value="${c.id}" ${linkedIds.has(c.id) ? "checked" : ""}>
        ${c.name}
      </label>
    `).join("");
  } catch {
    list.innerHTML = '<span class="muted">Failed to load casinos.</span>';
  }
}

async function savePaymentMethodCasinos() {
  const group = document.getElementById("pmCasinosGroup");
  const statusEl = document.getElementById("pmCasinosSaveStatus");
  const paymentMethodId = group ? parseInt(group.dataset.paymentMethodId) : null;
  if (!paymentMethodId) return;

  const checked = Array.from(document.querySelectorAll(".pm-casino-checkbox:checked")).map(cb => parseInt(cb.value));

  if (statusEl) statusEl.textContent = "Saving...";
  try {
    const res = await fetch("/en/api/v1/payment-method/set-casinos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_method_id: paymentMethodId, casino_ids: checked }),
    });
    const data = await res.json();
    if (statusEl) statusEl.textContent = data.success ? "Saved." : (data.error || "Failed to save");
  } catch {
    if (statusEl) statusEl.textContent = "Network error";
  }
}


/* =========================================================
PLATFORM UPDATES
========================================================= */

