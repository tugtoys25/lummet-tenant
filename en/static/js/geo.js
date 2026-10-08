// =====================================================
// GEO: Client-side geo detection + display
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  initGeoDisplay();
});

async function initGeoDisplay() {
  const geoCard = document.getElementById("geoCard");
  if (!geoCard) return;

  const slug = window.location.pathname.split("/").pop();

  try {
    const res = await fetch(`/en/api/v1/geo/check?slug=${slug}`);
    if (!res.ok) throw new Error("Geo check failed");
    const data = await res.json();

    if (data.status === "allowed") {
      geoCard.innerHTML = `
        <h4>Your Region</h4>
        <p class="geo-allowed">✓ Available in ${data.countryName || data.country}</p>
        ${data.bonusOverride ? `<span class="bonus-override">${data.bonusOverride}</span>` : ""}
      `;
    } else if (data.status === "blocked") {
      geoCard.innerHTML = `
        <h4>Your Region</h4>
        <p class="geo-blocked">✕ Not available in ${data.countryName || data.country}</p>
      `;
    } else {
      geoCard.innerHTML = `
        <h4>Your Region</h4>
        <p class="geo-restricted">⚠ Restricted in ${data.countryName || data.country}</p>
      `;
    }
  } catch {
    geoCard.innerHTML = `
      <h4>Your Region</h4>
      <p class="muted">Geo data unavailable.</p>
    `;
  }
}
