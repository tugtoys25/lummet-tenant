// =====================================================
// LIVE SEARCH (whole site)
// One box searches everything published: casinos, reviews, research, news, updates,
// sportsbooks, affiliate partners, authors and pages. Results are grouped under a title
// per type. Works for the desktop box and the mobile box.
// =====================================================

window.LummetSiteSearch = true;

document.addEventListener("DOMContentLoaded", () => {
  const boxes = [
    ["searchInput", "searchResults"],
    ["mobileSearchInput", "mobileSearchResults"]
  ];
  boxes.forEach(([inputId, resultsId]) => wire(document.getElementById(inputId), document.getElementById(resultsId)));
});

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render(data, query) {
  if (!data.groups || !data.groups.length) {
    return '<div class="search-result-item muted">No results for “' + esc(query) + '”</div>';
  }
  const groups = data.groups.map((g) => {
    const items = g.items.map((i) =>
      '<a href="' + esc(i.url) + '" class="search-result-item">' +
        (i.image ? '<img src="' + esc(i.image) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="search-result-dot" aria-hidden="true"></span>') +
        '<div><strong>' + esc(i.title) + '</strong>' + (i.meta ? '<span class="muted">' + esc(i.meta) + '</span>' : '') + '</div>' +
      '</a>').join("");
    return '<div class="search-group"><div class="search-group__title">' + esc(g.label) + '</div>' + items + '</div>';
  }).join("");
  return groups + '<a class="search-all" href="/en/search?q=' + encodeURIComponent(query) + '">See all results for “' + esc(query) + '”</a>';
}

function wire(input, results) {
  if (!input || !results) return;
  let timer;
  let seq = 0;

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) { results.classList.remove("active"); return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const res = await fetch("/en/api/v1/public/search?limit=4&q=" + encodeURIComponent(query));
        const data = await res.json();
        if (mine !== seq) return; // a newer search has started
        results.innerHTML = render(data, query);
      } catch (e) {
        if (mine !== seq) return;
        results.innerHTML = '<div class="search-result-item muted">Search is unavailable right now</div>';
      }
      results.classList.add("active");
    }, 250);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim().length >= 2) {
      location.href = "/en/search?q=" + encodeURIComponent(input.value.trim());
    } else if (e.key === "Escape") {
      results.classList.remove("active");
    }
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) results.classList.remove("active");
  });
}
