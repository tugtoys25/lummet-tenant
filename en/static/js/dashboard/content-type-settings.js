
// ---- Content type enablement settings ----
async function initContentTypeSettingsForm() {
  const form = document.getElementById("contentTypeSettingsForm");
  if (!form) return;

  const alertEl = document.getElementById("settingsAlert");
  const loadingEl = document.getElementById("settingsLoading");

  try {
    const res = await fetch("/en/api/v1/content-types-enabled");
    const data = await res.json();
    if (data.success) {
      document.getElementById("toggleSportsbook").checked = !!data.enablement.sportsbook;
      document.getElementById("toggleAffiliatePartner").checked = !!data.enablement.affiliate_partner;
      document.getElementById("toggleCustom").checked = !!data.enablement.custom;
    }
    loadingEl.style.display = "none";
    form.style.display = "";
  } catch {
    loadingEl.textContent = "Failed to load settings.";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.style.display = "none";
    try {
      const res = await fetch("/en/api/v1/content-types-enabled/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportsbook: document.getElementById("toggleSportsbook").checked,
          affiliate_partner: document.getElementById("toggleAffiliatePartner").checked,
          custom: document.getElementById("toggleCustom").checked,
        }),
      });
      const data = await res.json();
      alertEl.className = data.success ? "alert alert--success" : "alert alert--error";
      alertEl.textContent = data.success ? "Settings saved. Changes are live immediately." : (data.error || "Failed to save");
      alertEl.style.display = "block";
    } catch {
      alertEl.className = "alert alert--error";
      alertEl.textContent = "Network error. Try again.";
      alertEl.style.display = "block";
    }
  });
}
