
// ---- Casinos table ----
async function loadCasinosTable() {
  const tbody = document.getElementById("casinosTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/en/api/v1/casinos/list");
    const data = await res.json();
    const casinos = data.casinos || [];

    if (casinos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No casinos yet.</td></tr>';
      return;
    }

    tbody.innerHTML = casinos
      .map(
        (c) => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.slug}</td>
        <td>★ ${c.rating || "N/A"}</td>
        <td>${c.featured ? "⭐ Yes" : "—"}</td>
        <td><span class="status-badge ${c.status === "published" ? "status-published" : "status-draft"}">${c.status || "draft"}</span></td>
        <td class="table-actions">
          <a href="/en/dashboard/casino/edit/${c.slug}" class="btn btn--ghost btn--sm">Edit</a>
          <a href="/en/casino/${c.slug}" class="btn btn--ghost btn--sm" target="_blank">View</a>
          <button class="btn btn--danger btn--sm" onclick="deleteCasino('${c.slug}')">Delete</button>
        </td>
      </tr>
    `
      )
      .join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load.</td></tr>';
  }
}

// ---- Delete casino ----
async function deleteCasino(slug) {
  if (!confirm(`Delete casino "${slug}"? This cannot be undone.`)) return;

  try {
    const res = await fetch("/en/api/v1/casino/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();

    if (data.success) {
      loadCasinosTable();
    } else {
      alert(data.error || "Delete failed");
    }
  } catch {
    alert("Network error. Try again.");
  }
}

// ---- Casino create form ----
async function initCasinoForm() {
  const form = document.getElementById("casinoForm");
  if (!form) return;

    // Load countries for geo targeting
  const countryBox = document.getElementById("countryCheckboxes");
  if (countryBox && !countryBox.dataset.loaded) {
    countryBox.dataset.loaded = "1";
    try {
      const res = await fetch("/en/api/v1/countries/list");
      const data = await res.json();
      const countries = data.countries || [];
      countryBox.innerHTML = countries.map(c => `
        <label style="display:block;padding:4px 0">
          <input type="checkbox" value="${c.code}"> ${c.name} (${c.code})
        </label>
      `).join("");
    } catch {
      countryBox.innerHTML = '<p class="muted">Failed to load countries</p>';
    }
  }
    // Load categories for assignment
  const categoryBox = document.getElementById("categoryCheckboxes");
  if (categoryBox && !categoryBox.dataset.loaded) {
    categoryBox.dataset.loaded = "1";
    try {
      const catRes = await fetch("/en/api/v1/categories/list");
      const catData = await catRes.json();
      const cats = catData.categories || [];
      categoryBox.innerHTML = cats.map(c => `
        <label style="display:block;padding:4px 0">
          <input type="checkbox" value="${c.id}"> ${c.name} (${c.slug})
        </label>
      `).join("");
    } catch {
      categoryBox.innerHTML = '<p class="muted">Failed to load categories</p>';
    }
  }


  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("casinoFormAlert");
    alertEl.style.display = "none";

    const formData = new FormData(form);
    const features = formData.get("features");
    const payload = {
      name: formData.get("name"),
      slug: formData.get("slug"),
      logo: formData.get("logo") || null,
      website_url: formData.get("website_url"),
      affiliate_url: formData.get("affiliate_url"),
      rating: parseFloat(formData.get("rating")) || 0,
      bonus_title: formData.get("bonus_title") || null,
      bonus_value: formData.get("bonus_value") || null,
      features: features ? features.split(",").map((f) => f.trim()).filter(Boolean) : [],
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      featured: parseInt(formData.get("featured")) || 0,
      sort_order: parseInt(formData.get("sort_order")) || 0,
      status: formData.get("status") || "draft",
      category_ids: Array.from(
        document.querySelectorAll("#categoryCheckboxes input:checked")
      ).map(c => parseInt(c.value)),
    };

    try {
      const res = await fetch("/en/api/v1/casino/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

           if (data.success) {
        alertEl.className = "alert alert--success";
        alertEl.textContent = "Casino created successfully!";
        alertEl.style.display = "block";

        // Capture geo data BEFORE form.reset()
        const geoMode = formData.get("geo_mode") || "allow";
        const selectedCountries = Array.from(
          document.querySelectorAll("#countryCheckboxes input:checked")
        ).map(c => c.value);

        // Sync geo rules FIRST
        if (selectedCountries.length > 0) {
          const rules = selectedCountries.map(code => ({
            country_code: code,
            status: geoMode === "allow" ? "allowed" : "blocked",
            bonus_override: null
          }));
          await fetch("/en/api/v1/geo/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ casino_slug: payload.slug, rules })
          });
        }

        form.reset();  // NOW safe to reset
        setTimeout(() => {
          window.location.href = "/en/dashboard/casinos";
        }, 1500);
      } else {
        alertEl.className = "alert alert--error";
        alertEl.textContent = data.error || "Failed to create casino";
        alertEl.style.display = "block";
      }
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
