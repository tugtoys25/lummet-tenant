// =====================================================
// CASINO ADMIN: Edit form pre-fill + category management
// Used on /en/dashboard/casino/edit/:slug (future)
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  initCasinoEditForm();
  initCasinoEditSubmit();
});

async function initCasinoEditForm() {
  const form = document.getElementById("casinoEditForm");
  if (!form) return;

  const slug = form.dataset.slug;
  if (!slug) return;

  try {
    //const res = await fetch("/en/api/v1/casinos/list");
    //const data = await res.json();
    //const casino = (data.casinos || []).find((c) => c.slug === slug);
    const res = await fetch(`/en/api/v1/casino/get?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();

    if (!data.success) {
      form.innerHTML = '<div class="alert alert--error">Casino not found.</div>';
      return;
    }

    const casino = data.casino;

    if (!casino) {
      form.innerHTML = '<div class="alert alert--error">Casino not found.</div>';
      return;
    }

    // Pre-fill form fields
    const fields = ["name", "slug", "logo", "website_url", "affiliate_url", "rating", "bonus_title", "bonus_value", "seo_title", "seo_description", "seo_keywords", "featured", "sort_order", "status"];
    for (const field of fields) {
      const input = form.querySelector(`[name="${field}"]`);
      if (input && casino[field] !== undefined) {
        input.value = casino[field];
      }
    }
    
    const featuresInput = form.querySelector('[name="features"]');

    if (featuresInput) {
      let features = casino.features;

      if (typeof features === "string") {
        try {
          features = JSON.parse(features);
        } catch (_) {}
      }

      if (Array.isArray(features)) {
        featuresInput.value = features.join(", ");
      } else {
        featuresInput.value = features || "";
      }
    }

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

        // Load existing geo rules
        const geoRes = await fetch(`/en/api/v1/geo/list?casino_slug=${slug}`);
        const geoData = await geoRes.json();
        const rules = geoData.rules || [];
        rules.forEach(r => {
          const cb = countryBox.querySelector(`input[value="${r.country_code}"]`);
          if (cb) {
            cb.checked = true;
            if (r.status === "blocked") {
              document.getElementById("geoMode").value = "block";
            }
          }
        });
      } catch {
        countryBox.innerHTML = '<p class="muted">Failed to load countries</p>';
      }
    }
        // Load categories and pre-check existing
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
        const selectedCategories = casino.category_ids || [];

        categoryBox.querySelectorAll("input").forEach(cb => {
        if (selectedCategories.includes(parseInt(cb.value))) {
          cb.checked = true;
        }
      });
      } catch {
        categoryBox.innerHTML = '<p class="muted">Failed to load categories</p>';
      }
    }

    // Load payment methods and pre-check ones already linked to this casino
    form.dataset.casinoId = casino.id;
    const paymentMethodBox = document.getElementById("paymentMethodCheckboxes");
    if (paymentMethodBox && !paymentMethodBox.dataset.loaded) {
      paymentMethodBox.dataset.loaded = "1";
      try {
        const pmRes = await fetch("/en/api/v1/payment-methods/list");
        const pmData = await pmRes.json();
        const methods = pmData.payment_methods || [];
        paymentMethodBox.innerHTML = methods.map(m => `
          <label style="display:block;padding:4px 0">
            <input type="checkbox" value="${m.id}"> ${m.name}
          </label>
        `).join("");

        const linkedRes = await fetch(`/en/api/v1/casino/payment-methods?casino_id=${casino.id}`);
        const linkedData = await linkedRes.json();
        const linkedIds = linkedData.payment_method_ids || [];
        paymentMethodBox.querySelectorAll("input").forEach(cb => {
          if (linkedIds.includes(parseInt(cb.value))) cb.checked = true;
        });
      } catch {
        paymentMethodBox.innerHTML = '<p class="muted">Failed to load payment methods</p>';
      }
    }

  } catch {
    form.innerHTML = '<div class="alert alert--error">Failed to load casino data.</div>';
  }
}

function initCasinoEditSubmit() {
  const form = document.getElementById("casinoEditForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("casinoEditAlert");
    if (alertEl) alertEl.style.display = "none";

    const formData = new FormData(form);
    const features = formData.get("features");
    const oldSlug = form.dataset.slug;
    const payload = {
      old_slug: oldSlug,
      slug: formData.get("slug"),
      name: formData.get("name"),
      logo: formData.get("logo") || null,
      website_url: formData.get("website_url"),
      affiliate_url: formData.get("affiliate_url"),
      rating: parseFloat(formData.get("rating")) || 0,
      bonus_title: formData.get("bonus_title") || null,
      bonus_value: formData.get("bonus_value") || null,
      features: features ? features.split(",").map(f => f.trim()).filter(Boolean) : [],
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
      const res = await fetch("/en/api/v1/casino/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        form.dataset.slug = payload.slug;
        if (alertEl) { alertEl.className = "alert alert--success"; alertEl.textContent = "Casino updated!"; alertEl.style.display = "block"; }

        // Sync geo rules — always run, even if empty (to allow clearing)
        const geoMode = formData.get("geo_mode") || "allow";
        const selectedCountries = Array.from(
          document.querySelectorAll("#countryCheckboxes input:checked")
        ).map(c => c.value);
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

        // Sync payment methods — same "always run, even if empty"
        // rule as geo rules above, so unchecking every box actually
        // clears the list instead of leaving stale links behind.
        const casinoId = form.dataset.casinoId;
        if (casinoId) {
          const selectedPaymentMethods = Array.from(
            document.querySelectorAll("#paymentMethodCheckboxes input:checked")
          ).map(c => parseInt(c.value));
          await fetch("/en/api/v1/casino/set-payment-methods", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ casino_id: parseInt(casinoId), payment_method_ids: selectedPaymentMethods })
          });
        }

        setTimeout(() => { window.location.href = "/en/dashboard/casinos"; }, 1500);
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}
