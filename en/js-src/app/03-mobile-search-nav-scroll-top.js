// ---- Mobile search toggle ----
function initMobileSearch() {
  const btn = document.getElementById("mobileSearchBtn");
  const container = document.getElementById("mobileSearchContainer");
  const closeBtn = document.getElementById("mobileSearchClose");
  const input = document.getElementById("mobileSearchInput");
  const results = document.getElementById("mobileSearchResults");
  if (!btn || !container) return;

  btn.addEventListener("click", () => {
    container.classList.add("active");
    if (input) input.focus();
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      container.classList.remove("active");
      if (results) results.classList.remove("active");
      if (input) input.value = "";
    });
  }

  if (input && results && !window.LummetSiteSearch) {
    let debounceTimer;
    input.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();
      if (query.length < 2) { results.classList.remove("active"); return; }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch("/en/api/v1/public/casinos/list");
          const data = await res.json();
          const matches = (data.casinos || []).filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
          if (matches.length === 0) {
            results.innerHTML = '<div class="search-result-item muted">No results</div>';
          } else {
            results.innerHTML = matches.slice(0, 8).map(c => `
              <a href="/en/casino/${c.slug}" class="search-result-item">
                <img src="${c.logo || "/static/images/default.png"}" alt="${c.name}" onerror="this.src='/static/images/default.png'">
                <div><strong>${c.name}</strong><span class="muted">★ ${c.rating || "N/A"}</span></div>
              </a>`).join("");
          }
          results.classList.add("active");
        } catch { results.classList.remove("active"); }
      }, 300);
    });
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target) && !btn.contains(e.target)) {
        results.classList.remove("active");
      }
    });
  }
}

// ---- Mobile bottom nav active state ----
function initMobileNav() {
  const nav = document.getElementById("mobileBottomNav");
  if (!nav) return;

  const currentPath = window.location.pathname;
  const items = nav.querySelectorAll(".mobile-nav-item");

  let bestMatch = null;
  let bestMatchLen = 0;

  items.forEach(item => {
    const href = item.getAttribute("data-href") || item.getAttribute("href");
    if (!href) return;

    // Exact match or prefix match (longest prefix wins)
    if (href === currentPath) {
      bestMatch = item;
      bestMatchLen = href.length;
    } else if (currentPath.startsWith(href + "/") && href.length > bestMatchLen) {
      bestMatch = item;
      bestMatchLen = href.length;
    }
  });

  if (bestMatch) bestMatch.classList.add("active");
}

// ---- Scroll to top button ----
function initScrollToTop() {
  const btn = document.getElementById("scrollToTop");
  if (!btn) return;

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 400) {
          btn.classList.add("visible");
        } else {
          btn.classList.remove("visible");
        }
        ticking = false;
      });
      ticking = true;
    }
  });

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}


