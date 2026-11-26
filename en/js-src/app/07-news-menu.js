// News menu polish: close an open dropdown on outside tap or Escape, and add a filter box to long lists.
(function () {
  function menus() { return document.querySelectorAll(".nr-nav__dd[open]"); }
  document.addEventListener("click", function (e) {
    menus().forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute("open"); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    menus().forEach(function (d) { d.removeAttribute("open"); var s = d.querySelector("summary"); if (s) s.focus(); });
  });
  function addFilters() {
    document.querySelectorAll(".nr-nav__panel").forEach(function (panel) {
      if (panel.tagName !== "UL" || panel.__nrFilter) return;
      var items = panel.querySelectorAll("li");
      if (items.length < 12) return;
      panel.__nrFilter = true;
      var li = document.createElement("li"), input = document.createElement("input");
      input.type = "search"; input.className = "nr-nav__filter"; input.placeholder = "Filter\u2026"; input.setAttribute("aria-label", "Filter this list");
      input.addEventListener("input", function () {
        var q = input.value.trim().toLowerCase();
        items.forEach(function (it) { it.style.display = !q || it.textContent.toLowerCase().indexOf(q) !== -1 ? "" : "none"; });
      });
      li.appendChild(input); li.style.listStyle = "none"; panel.insertBefore(li, panel.firstChild);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addFilters); else addFilters();
})();
