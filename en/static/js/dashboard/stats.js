
// ---- Stats ----
async function loadStats() {
  try {
    const res = await fetch("/en/api/v1/dashboard");
    const data = await res.json();

    const el = (id) => document.getElementById(id);
    if (el("statCasinos")) el("statCasinos").textContent = data.casinos ?? 0;
    if (el("statReviews")) el("statReviews").textContent = data.reviews ?? 0;
    if (el("statClicks")) el("statClicks").textContent = data.clicks ?? 0;
    if (el("statPages")) el("statPages").textContent = data.pages ?? 0;
  } catch {
    console.error("Failed to load stats");
  }
}

// ---- Top casinos by clicks ----
async function loadTopCasinos() {
  const container = document.getElementById("topCasinosTable");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/stats/top-casinos");
    const data = await res.json();
    const items = data.casinos || [];

    if (items.length === 0) {
      container.innerHTML = '<p class="muted">No click data yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>Casino</th><th>Clicks</th></tr></thead>
        <tbody>
          ${items.map((c) => `
            <tr><td>${c.casino_slug}</td><td>${c.clicks}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Top countries by clicks ----
async function loadTopCountries() {
  const container = document.getElementById("topCountriesTable");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/stats/countries");
    const data = await res.json();
    const items = data.countries || [];

    if (items.length === 0) {
      container.innerHTML = '<p class="muted">No country data yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="mini-table">
        <thead><tr><th>Country</th><th>Clicks</th></tr></thead>
        <tbody>
          ${items.map((c) => `
            <tr><td>${c.country_code || "Unknown"}</td><td>${c.clicks}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}
