// ---- Sidebar: load countries with search ----
async function initSidebarCountries() {
  const container = document.getElementById("sidebarCountries");
  const searchInput = document.getElementById("sidebarCountrySearch");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/countries/list");
    const data = await res.json();
    let countries = data.countries || [];

    const emptyText = (container.dataset && container.dataset.empty) || "No countries found.";
    const firstCount = (function () { const n = parseInt(container.dataset ? container.dataset.count : "", 10); return Number.isFinite(n) && n > 0 ? n : 5; })();
    const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const renderCountries = (list) => {
      if (list.length === 0) return '<p class="muted">' + esc(emptyText) + '</p>';
      return list.map(c => `<a href="/en/country/${c.code}" class="chip">${c.name}</a>`).join("");
    };

    // Show top 5 initially
    let displayCountries = countries.slice(0, firstCount);
    container.innerHTML = renderCountries(displayCountries);

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length === 0) {
          container.innerHTML = renderCountries(countries.slice(0, firstCount));
        } else {
          const filtered = countries.filter(c => 
            c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)
          );
          container.innerHTML = renderCountries(filtered.slice(0, 20)); // Limit search results
        }
      });
    }
  } catch {
    const aside = container.closest ? container.closest(".sidebar") : null;
    container.innerHTML = '<p class="muted"></p>';
    container.firstChild.textContent = (aside && aside.dataset && aside.dataset.sbError) || "Failed to load.";
  }
}

// ---- Homepage: load latest news ----
// ---- Homepage: load latest news ----
async function initHomeNews() {
  const container = document.getElementById("homeNews");
  if (!container) return;
  // The server already drew the list (count and wording come from Configuration > Homepage sections): leave it alone.
  if (container.children.length) return;
  const emptyText = container.dataset.empty || "";
  const errorText = container.dataset.error || "";
  const limit = parseInt(container.dataset.count, 10) || 4;

  try {
    const res = await fetch("/en/api/v1/public/news/list", {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error("Failed to load news");
    }

    const data = await res.json();

    if (!data.news || data.news.length === 0) {
      if (emptyText) container.textContent = emptyText;
      return;
    }

    const top3 = data.news.slice(0, limit);

    container.innerHTML = top3.map(n => {
      const image =
        n.featured_image_url ||
        n.featured_image_thumbnail ||
        "";

      const imageAlt =
        n.featured_image_alt ||
        n.title ||
        "News article";

      const excerpt =
        n.excerpt ||
        "";

      const publishedDate =
        n.published_at ||
        n.created_at;

      return `
        <article class="news-card">
          <a
            href="/en/news/${n.slug}"
            class="news-card__link"
          >
            ${
              image
                ? `
                  <div class="news-card__image">
                    <img
                      src="${image}"
                      alt="${imageAlt}"
                      loading="lazy"
                      decoding="async"
                    >
                  </div>
                `
                : ""
            }

            <div class="news-card__body">
              <h3>${n.title}</h3>

              ${
                excerpt
                  ? `<p>${excerpt}</p>`
                  : ""
              }

              <span class="news-date">
                ${new Date(publishedDate).toLocaleDateString()}
              </span>
            </div>
          </a>
        </article>
      `;
    }).join("");

  } catch (error) {
    console.error("Homepage news error:", error);

    if (errorText) container.textContent = errorText;
  }
}


async function initHeaderAuth() {
  try {
    const res = await fetch("/en/api/v1/user/profile");
    if (res.ok) {
      const loginBtn = document.getElementById("headerLoginBtn");
      const logoutBtn = document.getElementById("headerLogoutBtn");
      const dashBtn = document.getElementById("headerDashboardBtn");
      if (loginBtn) loginBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "";
      if (dashBtn) dashBtn.style.display = "";
    }
  } catch {
    // Not logged in — keep login button visible
  }
}


