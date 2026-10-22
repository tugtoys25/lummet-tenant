
// ---- Custom content types table ----
async function loadCustomTypesTable() {
  const tbody = document.getElementById("customTypesTableBody");
  if (!tbody) return;

  try {
    const res = await fetch(`/en/api/v1/custom-types/list?page=${PAGE_STATE.customTypes}&per_page=${PER_PAGE}`);
    const data = await res.json();
    const types = data.types || [];
    renderPagerControls("customTypesPager", PAGE_STATE.customTypes, PER_PAGE, data.total, (p) => { PAGE_STATE.customTypes = p; loadCustomTypesTable(); });

    if (types.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No custom types yet.</td></tr>';
      return;
    }

    tbody.innerHTML = types.map((t) => `
      <tr>
        <td><strong>${escapeHtmlClient(t.label)}</strong></td>
        <td>${escapeHtmlClient(t.slug)}</td>
        <td>${escapeHtmlClient(t.plural_label)}</td>
        <td>${t.review_enabled ? "Yes" : "No"}</td>
        <td>${t.comparison_enabled ? "Yes" : "No"}</td>
        <td class="table-actions">
          <a href="/en/custom/${encodeURIComponent(t.slug)}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <a href="/en/dashboard/custom-type/edit/${encodeURIComponent(t.slug)}" class="btn btn--ghost btn--sm">Edit</a>
          <button class="btn btn--danger btn--sm" onclick="deleteCustomType('${t.slug}')">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

// ---- Custom type create form (with dynamic field-definition rows) ----
function initCustomTypeForm() {
  const form = document.getElementById("customTypeForm");
  if (!form) return;

  const fieldRowsContainer = document.getElementById("fieldRows");
  const template = document.getElementById("fieldRowTemplate");

  document.getElementById("addFieldRowBtn").addEventListener("click", () => {
    const clone = template.content.cloneNode(true);
    fieldRowsContainer.appendChild(clone);
  });

  fieldRowsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-field-row")) {
      e.target.closest(".field-row").remove();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("customTypeFormAlert");
    alertEl.style.display = "none";

    const formData = new FormData(form);
    const fields = Array.from(fieldRowsContainer.querySelectorAll(".field-row")).map((row) => ({
      field_key: row.querySelector(".field-key").value.trim(),
      label: row.querySelector(".field-label").value.trim(),
      field_type: row.querySelector(".field-type").value,
      required: row.querySelector(".field-required").checked,
    })).filter((f) => f.field_key && f.label);

    const payload = {
      label: formData.get("label"),
      plural_label: formData.get("plural_label"),
      slug: formData.get("slug"),
      icon: formData.get("icon") || null,
      review_enabled: formData.get("review_enabled") === "on",
      comparison_enabled: formData.get("comparison_enabled") === "on",
      fields,
    };

    try {
      const res = await fetch("/en/api/v1/custom-type/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Custom type created successfully!";
        alertEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/dashboard/custom-types"; }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create custom type";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
