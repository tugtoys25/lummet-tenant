// =====================================================
// Tenant FRONTEND APP
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  initNavToggle();
  initSidebar();
  initSidebarNews();
  initSidebarCategories();
  initSidebarCountries();
  initHomeNews();
  initHeaderAuth();
  initMobileSearch();
  initMobileNav();
  initScrollToTop();
});


// ---- Mobile nav toggle ----

function initNavToggle() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("mainNav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("active");

    toggle.innerHTML = isOpen ? "&times;" : "&#9776;";
    toggle.setAttribute(
      "aria-label",
      isOpen ? "Close menu" : "Open menu"
    );
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("active");
      toggle.innerHTML = "&#9776;";
      toggle.setAttribute("aria-label", "Open menu");
    });
  });
}

// ---- Sidebar: load top casinos (geo-aware) ----
async function initSidebar() {
  const container = document.getElementById("sidebarTopCasinos");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/casinos/geo");
    const data = await res.json();

    if (!data.casinos || data.casinos.length === 0) {
      container.innerHTML = '<p class="muted">No casinos yet.</p>';
      return;
    }

    // Sort: available first, then by rating
    data.casinos.sort((a, b) => {
      const aAvail = a.geo_status === "allowed" ? 1 : 0;
      const bAvail = b.geo_status === "allowed" ? 1 : 0;
      if (aAvail !== bAvail) return bAvail - aAvail;
      return (b.rating || 0) - (a.rating || 0);
    });

    const top5 = data.casinos.slice(0, 5);
    const countryCode = data.country || "RW";
    const flag = countryCode.replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt()));

    container.innerHTML = top5.map(c => {
      const geoIcon = c.geo_status === "allowed" ? "✓" : "✕";
      const geoClass = c.geo_status === "allowed" ? "geo-allowed" : "geo-blocked";
      return `
      <a href="/en/casino/${c.slug}" class="sidebar-casino">
        <img src="${c.logo || "/static/images/default.png"}" alt="${c.name}" onerror="this.src='/static/images/default.png'">
        <div>
          <strong>${c.name}</strong>
          <span class="rating">★ ${c.rating || "N/A"} <span class="${geoClass}" style="font-size:10px;margin-left:4px">${flag} ${geoIcon}</span></span>
        </div>
      </a>`;
    }).join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Sidebar: load latest news ----
async function initSidebarNews() {
  const container = document.getElementById("sidebarNews");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/news/list");
    const data = await res.json();

    if (!data.news || data.news.length === 0) {
      container.innerHTML = '<p class="muted">No news yet.</p>';
      return;
    }

    const top3 = data.news.slice(0, 3);
    container.innerHTML = top3.map(n => `
      <a href="/en/news/${n.slug}" class="sidebar-news-item">
        <strong>${n.title}</strong>
        <span class="news-date">${new Date(n.created_at).toLocaleDateString()}</span>
      </a>
    `).join("");
  } catch {
    container.innerHTML = '<p class="muted">Failed to load news.</p>';
  }
}

// ---- Sidebar: load categories ----
async function initSidebarCategories() {
  const container = document.getElementById("sidebarCategories");
  const moreBtn = document.getElementById("sidebarCategoriesMore");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/categories/list");
    const data = await res.json();
    const cats = data.categories || [];

    if (cats.length === 0) {
      container.innerHTML = '<p class="muted">No categories yet.</p>';
      return;
    }

    const renderCats = (list) => list.map(c => `<a href="/en/category/${c.slug}" class="chip">${c.name}</a>`).join("");
    
    // Show first 5
    container.innerHTML = renderCats(cats.slice(0, 5));

    if (cats.length > 5) {
      moreBtn.style.display = "block";
      let expanded = false;
      moreBtn.addEventListener("click", () => {
        if (expanded) {
          container.innerHTML = renderCats(cats.slice(0, 5));
          moreBtn.textContent = "Load More";
          expanded = false;
        } else {
          container.innerHTML = renderCats(cats);
          moreBtn.textContent = "Show Less";
          expanded = true;
        }
      });
    }
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

