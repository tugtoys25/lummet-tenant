// =====================================================
// RESEARCH HUB — client-side filter & search
// Operates entirely on the already-rendered .research-card
// elements (data-type/data-country/data-related/data-search
// attributes set server-side in controllers.js) — no fetch, no
// second data source to keep in sync, and the page works
// identically with JS disabled (every card is just visible).
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("researchSearchInput");
  const typeFilter = document.getElementById("researchTypeFilter");
  const countryFilter = document.getElementById("researchCountryFilter");
  const relatedFilter = document.getElementById("researchRelatedFilter");
  const clearBtn = document.getElementById("researchFilterClearBtn");
  const countEl = document.getElementById("researchFilterCount");
  const emptyEl = document.getElementById("researchFilterEmpty");
  const featuredBlock = document.getElementById("researchFeaturedBlock");
  const sortSelect = document.getElementById("researchSortSelect");

  if (!searchInput) return; // not on a research directory page

  const allCards = () => Array.from(document.querySelectorAll(".research-card"));
  // Featured cards are repeated in the full list; count each item once.
  const countedCards = () => {
    const grid = document.getElementById("researchAllGrid");
    return grid ? Array.from(grid.querySelectorAll(".research-card")) : allCards();
  };

  function sortGrid() {
    const grid = document.getElementById("researchAllGrid");
    if (!grid || !sortSelect) return;
    const key = sortSelect.value;
    const cards = Array.from(grid.querySelectorAll(".research-card"));
    const date = (c) => c.dataset.published || "";
    const upd = (c) => c.dataset.updated || "";
    const title = (c) => c.dataset.title || "";
    const by = {
      newest: (a, b) => date(b).localeCompare(date(a)),
      oldest: (a, b) => date(a).localeCompare(date(b)),
      updated: (a, b) => upd(b).localeCompare(upd(a)),
      title_asc: (a, b) => title(a).localeCompare(title(b)),
      title_desc: (a, b) => title(b).localeCompare(title(a))
    }[key] || (() => 0);
    cards.sort(by).forEach((c) => grid.appendChild(c));
    try {
      const u = new URL(location.href);
      if (key === "newest") u.searchParams.delete("sort"); else u.searchParams.set("sort", key);
      history.replaceState(null, "", u);
    } catch (e) { /* ignore */ }
  }

  function cardMatches(card) {
    const query = searchInput.value.trim().toLowerCase();
    if (query && !(card.dataset.search || "").includes(query)) return false;

    const type = typeFilter ? typeFilter.value : "";
    if (type && card.dataset.type !== type) return false;

    const country = countryFilter ? countryFilter.value : "";
    if (country && card.dataset.country !== country) return false;

    const related = relatedFilter ? relatedFilter.value : "";
    if (related) {
      const relatedList = (card.dataset.related || "").split("|").filter(Boolean);
      if (!relatedList.includes(related)) return false;
    }

    return true;
  }

  function anyFilterActive() {
    return !!(
      searchInput.value.trim() ||
      (typeFilter && typeFilter.value) ||
      (countryFilter && countryFilter.value) ||
      (relatedFilter && relatedFilter.value)
    );
  }

  function applyFilters() {
    const cards = allCards();
    let visibleCount = 0;
    let visibleInAllGrid = 0;
    const allGrid = document.getElementById("researchAllGrid");

    const counted = new Set(countedCards());
    cards.forEach((card) => {
      const matches = cardMatches(card);
      card.style.display = matches ? "" : "none";
      if (matches) {
        if (counted.has(card)) visibleCount++;
        if (allGrid && allGrid.contains(card)) visibleInAllGrid++;
      }
    });

    if (featuredBlock) {
      const featuredHasVisible = Array.from(featuredBlock.querySelectorAll(".research-card")).some((c) => c.style.display !== "none");
      featuredBlock.style.display = (anyFilterActive() && !featuredHasVisible) ? "none" : "";
    }

    if (emptyEl) emptyEl.style.display = visibleInAllGrid === 0 && (!featuredBlock || featuredBlock.style.display === "none") ? "" : "none";
    if (clearBtn) clearBtn.style.display = anyFilterActive() ? "" : "none";
    if (countEl) {
      countEl.textContent = anyFilterActive()
        ? `Showing ${visibleCount} of ${counted.size}`
        : "";
    }
  }

  let debounceTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 150);
  });
  [typeFilter, countryFilter, relatedFilter].forEach((el) => {
    if (el) el.addEventListener("change", applyFilters);
  });
  if (sortSelect) sortSelect.addEventListener("change", sortGrid);
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      [typeFilter, countryFilter, relatedFilter].forEach((el) => { if (el) el.value = ""; });
      applyFilters();
    });
  }
});
