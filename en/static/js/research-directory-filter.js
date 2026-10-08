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

  if (!searchInput) return; // not on a research directory page

  const allCards = () => Array.from(document.querySelectorAll(".research-card"));

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

    cards.forEach((card) => {
      const matches = cardMatches(card);
      card.style.display = matches ? "" : "none";
      if (matches) {
        visibleCount++;
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
        ? `Showing ${visibleCount} of ${cards.length}`
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
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      [typeFilter, countryFilter, relatedFilter].forEach((el) => { if (el) el.value = ""; });
      applyFilters();
    });
  }
});
