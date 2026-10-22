// ---- Sidebar: load countries with search ----
async function initSidebarCountries() {
  const container = document.getElementById("sidebarCountries");
  const searchInput = document.getElementById("sidebarCountrySearch");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/public/countries/list");
    const data = await res.json();
    let countries = data.countries || [];

    // If no countries in DB, fallback to hardcoded top 5
    if (countries.length === 0) {
      countries = [
        { code: "GB", name: "United Kingdom" },
        { code: "DE", name: "Germany" },
        { code: "SG", name: "Singapore" },
        { code: "US", name: "United States" },
        { code: "CA", name: "Canada" }
      ];
    }

    const renderCountries = (list) => {
      if (list.length === 0) return '<p class="muted">No countries found.</p>';
      return list.map(c => `<a href="/en/country/${c.code}" class="chip">${c.name}</a>`).join("");
    };

    // Show top 5 initially
    let displayCountries = countries.slice(0, 5);
    container.innerHTML = renderCountries(displayCountries);

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length === 0) {
          container.innerHTML = renderCountries(countries.slice(0, 5));
        } else {
          const filtered = countries.filter(c => 
            c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)
          );
          container.innerHTML = renderCountries(filtered.slice(0, 20)); // Limit search results
        }
      });
    }
  } catch {
    container.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

// ---- Homepage: load latest news ----
// ---- Homepage: load latest news ----
async function initHomeNews() {
  const container = document.getElementById("homeNews");
  if (!container) return;

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
      container.innerHTML =
        '<p class="muted">No news articles yet.</p>';
      return;
    }

    const top3 = data.news.slice(0, 3);

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

    container.innerHTML =
      '<p class="muted">Failed to load news.</p>';
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


