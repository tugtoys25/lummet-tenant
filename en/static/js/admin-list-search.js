// =====================================================
// DASHBOARD LIST SEARCH
// Every list (table) in the dashboard gets a search box above it, a "showing X of Y" count and
// click-to-sort column headings, so a row can be found without scrolling.
//   - Words are matched anywhere in the row; every word must match.
//   - Press "/" to jump to the search box, Esc to clear it.
//   - Lists that load their rows later (or reload after a save) are handled automatically.
//   - Lists that load one page at a time from the server (comparisons, generic reviews) send the
//     search to the server instead, so it covers every page.
//   - A table can opt out with data-no-search. The content items list keeps its own search.
// Presentation only: it never changes or removes a row.
// =====================================================

(function () {
  "use strict";

  var SERVER = { comparisonsTableBody: true, genericReviewsTableBody: true };
  var SKIP = { contentItemsTableBody: true };
  var MIN_ROWS = 1;
  // lists made of cards instead of a table
  var CARD_LISTS = ["inquiriesContainer", "submissionsContainer"];

  window.ADMIN_LIST_QUERY = window.ADMIN_LIST_QUERY || {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function dataRows(tbody) {
    return Array.prototype.filter.call(tbody.children, function (tr) {
      if (tr.tagName !== "TR" || tr.classList.contains("als-empty")) return false;
      var first = tr.children[0];
      // "Loading...", "No items yet" and error rows are one wide cell, not data
      return !(tr.children.length === 1 && first && first.colSpan > 1);
    });
  }

  function cellText(tr, index) {
    var c = tr.children[index];
    return c ? (c.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function enhance(table) {
    var tbody = table.tBodies[0];
    if (!tbody || table.dataset.alsDone) return;
    if (table.hasAttribute("data-no-search") || (tbody.id && SKIP[tbody.id])) return;
    if (table.closest(".ap-panel, .cd-section, template")) return;
    table.dataset.alsDone = "1";

    var server = !!(tbody.id && SERVER[tbody.id]);
    var bar = el("div", "als-bar");
    var input = document.createElement("input");
    input.type = "search";
    input.className = "als-input";
    input.placeholder = "Search this list...  ( / )";
    input.setAttribute("aria-label", "Search this list");
    input.autocomplete = "off";
    var count = el("span", "als-count");
    count.setAttribute("aria-live", "polite");
    bar.appendChild(input);
    bar.appendChild(count);
    var anchor = table.closest(".table-wrap") || table;
    anchor.parentNode.insertBefore(bar, anchor);
    bar.hidden = !server;

    var sort = { index: -1, dir: 1 };
    var busy = false;
    var timer;

    function apply() {
      if (busy) return;
      busy = true;
      try {
        var rows = dataRows(tbody);
        if (!server) bar.hidden = rows.length < MIN_ROWS && !input.value.trim();

        if (sort.index >= 0) {
          rows.sort(function (a, b) {
            var x = cellText(a, sort.index), y = cellText(b, sort.index);
            var nx = parseFloat(x.replace(/[, ]/g, "")), ny = parseFloat(y.replace(/[, ]/g, ""));
            var r = (!isNaN(nx) && !isNaN(ny) && /^[-\d.,\s%]+$/.test(x) && /^[-\d.,\s%]+$/.test(y)) ? nx - ny : x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
            return r * sort.dir;
          });
          rows.forEach(function (tr) { tbody.appendChild(tr); });
        }

        var empty = tbody.querySelector(".als-empty");
        if (empty) empty.remove();
        if (server) { count.textContent = ""; return; }

        var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        var shown = 0;
        rows.forEach(function (tr) {
          var hay = Array.prototype.filter.call(tr.children, function (c) { return !c.classList.contains("table-actions"); }).map(function (c) { return c.textContent || ""; }).join(" ").toLowerCase();
          var ok = words.every(function (w) { return hay.indexOf(w) !== -1; });
          tr.hidden = !ok;
          if (ok) shown++;
        });
        count.textContent = words.length ? "Showing " + shown + " of " + rows.length : rows.length + " items";
        if (words.length && rows.length && !shown) {
          var tr = el("tr", "als-empty");
          var td = el("td", "muted", "No rows match “" + input.value.trim() + "”.");
          td.colSpan = Math.max(1, table.tHead ? table.tHead.rows[0].cells.length : 1);
          tr.appendChild(td);
          tbody.appendChild(tr);
        }
      } finally {
        // let our own changes settle before watching again
        setTimeout(function () { busy = false; }, 0);
      }
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      if (server) {
        window.ADMIN_LIST_QUERY[tbody.id] = input.value.trim();
        timer = setTimeout(function () { window.dispatchEvent(new CustomEvent("admin-list-search", { detail: { id: tbody.id, q: input.value.trim() } })); }, 300);
      } else {
        timer = setTimeout(apply, 80);
      }
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && input.value) { input.value = ""; input.dispatchEvent(new Event("input")); e.stopPropagation(); }
    });

    // click a heading to sort by it
    if (table.tHead && table.tHead.rows[0]) {
      Array.prototype.forEach.call(table.tHead.rows[0].cells, function (th, i) {
        var label = (th.textContent || "").trim();
        if (!label || /^actions?$/i.test(label) || server) return;
        th.classList.add("als-sortable");
        th.tabIndex = 0;
        var go = function () {
          sort = sort.index === i ? { index: i, dir: -sort.dir } : { index: i, dir: 1 };
          Array.prototype.forEach.call(table.tHead.rows[0].cells, function (c) { c.removeAttribute("aria-sort"); });
          th.setAttribute("aria-sort", sort.dir === 1 ? "ascending" : "descending");
          apply();
        };
        th.addEventListener("click", go);
        th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
    }

    new MutationObserver(function () { if (!busy) apply(); }).observe(tbody, { childList: true });
    apply();
  }

  function enhanceCards(box) {
    if (!box || box.dataset.alsDone) return;
    box.dataset.alsDone = "1";
    var bar = el("div", "als-bar");
    var input = document.createElement("input");
    input.type = "search";
    input.className = "als-input";
    input.placeholder = "Search this list...  ( / )";
    input.setAttribute("aria-label", "Search this list");
    input.autocomplete = "off";
    var count = el("span", "als-count");
    count.setAttribute("aria-live", "polite");
    bar.appendChild(input);
    bar.appendChild(count);
    box.parentNode.insertBefore(bar, box);
    var busy = false, timer;

    function apply() {
      if (busy) return;
      busy = true;
      try {
        var cards = Array.prototype.filter.call(box.children, function (c) { return c.tagName === "DIV" && !c.classList.contains("als-empty"); });
        bar.hidden = cards.length < MIN_ROWS && !input.value.trim();
        var old = box.querySelector(".als-empty");
        if (old) old.remove();
        var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        var shown = 0;
        cards.forEach(function (c) {
          var ok = words.every(function (w) { return (c.textContent || "").toLowerCase().indexOf(w) !== -1; });
          c.hidden = !ok;
          if (ok) shown++;
        });
        count.textContent = words.length ? "Showing " + shown + " of " + cards.length : cards.length + " items";
        if (words.length && cards.length && !shown) box.appendChild(el("p", "muted als-empty", "Nothing matches \u201c" + input.value.trim() + "\u201d."));
      } finally {
        setTimeout(function () { busy = false; }, 0);
      }
    }
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(apply, 80); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && input.value) { input.value = ""; input.dispatchEvent(new Event("input")); e.stopPropagation(); }
    });
    new MutationObserver(function () { if (!busy) apply(); }).observe(box, { childList: true });
    apply();
  }

  function scan() {
    var root = document.querySelector(".admin-content");
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll("table.admin-table"), enhance);
    CARD_LISTS.forEach(function (id) { var b = document.getElementById(id); if (b && root.contains(b)) enhanceCards(b); });
  }

  function init() {
    scan();
    // tables built after load
    var root = document.querySelector(".admin-content");
    if (root) new MutationObserver(function () { scan(); }).observe(root, { childList: true, subtree: true });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      var box = document.querySelector(".als-bar:not([hidden]) .als-input");
      if (box) { e.preventDefault(); box.focus(); box.select(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
