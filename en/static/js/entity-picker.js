// Search-and-choose field for the dashboard.
//   EntityPicker.attach(input, { search(q) -> Promise<[{value, label, sub?, image?}]>, onPick(item), strict })
// Typing searches, arrow keys + Enter choose, Esc closes; clicking a result chooses it.
// Also wires up every <input data-entity="casino"> on the page (e.g. the casino slug on the review form):
// the field keeps holding the slug, and with strict mode a value that is not a real casino blocks the save
// with a clear message instead of a "not found" error afterwards.
// DOM calls only (no innerHTML on anything typed by a person).
(function () {
  "use strict";
  if (window.EntityPicker) return;
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  var uid = 0;

  function attach(input, cfg) {
    var id = "ep-" + (++uid), box = el("div", "ep"), list = el("ul", "ep-list"), timer = null, seq = 0, items = [], idx = -1, picked = null;
    list.id = id; list.setAttribute("role", "listbox"); list.hidden = true;
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-controls", id); input.setAttribute("autocomplete", "off");
    input.parentNode.insertBefore(box, input); box.appendChild(input); box.appendChild(list);

    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); idx = -1; }
    function choose(item) {
      picked = item; close();
      if (cfg.setText !== false) input.value = cfg.text ? cfg.text(item) : item.label;
      input.setCustomValidity(""); input.classList.remove("ep-bad");
      if (cfg.onPick) cfg.onPick(item);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function paint() {
      list.textContent = "";
      if (!items.length) { var none = el("li", "ep-empty", "Nothing found"); none.setAttribute("role", "option"); none.setAttribute("aria-disabled", "true"); list.appendChild(none); }
      items.forEach(function (it, n) {
        var li = el("li", "ep-item" + (n === idx ? " is-on" : "")); li.setAttribute("role", "option"); li.setAttribute("aria-selected", n === idx ? "true" : "false");
        if (it.image) { var im = el("img"); im.alt = ""; im.src = it.image; im.loading = "lazy"; im.addEventListener("error", function () { im.remove(); }); li.appendChild(im); }
        var tx = el("span", "ep-item__text"); tx.appendChild(el("strong", null, it.label)); if (it.sub) tx.appendChild(el("span", null, it.sub)); li.appendChild(tx);
        li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(it); });
        list.appendChild(li);
      });
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function run() {
      var mine = ++seq;
      Promise.resolve(cfg.search(input.value.trim())).then(function (rows) { if (mine !== seq) return; items = rows || []; idx = items.length ? 0 : -1; paint(); }).catch(function () { if (mine === seq) { items = []; paint(); } });
    }
    input.addEventListener("input", function () { picked = null; clearTimeout(timer); timer = setTimeout(run, 180); if (cfg.onType) cfg.onType(input.value); });
    input.addEventListener("focus", function () { if (!input.readOnly) run(); });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (list.hidden) { run(); return; }
        e.preventDefault(); if (!items.length) return;
        idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; paint();
        var on = list.querySelector(".is-on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && !list.hidden && idx >= 0 && items[idx]) { e.preventDefault(); choose(items[idx]); }
      else if (e.key === "Escape" && !list.hidden) { e.stopPropagation(); close(); }
    });
    return { choose: choose, close: close, get picked() { return picked; } };
  }

  // ---- <input data-entity="casino">
  var casinoCache = null;
  function casinos() {
    if (!casinoCache) casinoCache = fetch("/en/api/v1/casinos/list").then(function (r) { return r.json(); }).then(function (d) { return (d && d.casinos) || []; }).catch(function () { casinoCache = null; return []; });
    return casinoCache;
  }
  function wireCasino(input) {
    if (input.dataset.epDone) return; input.dataset.epDone = "1";
    function check() {
      casinos().then(function (rows) {
        var v = input.value.trim().toLowerCase();
        if (!v || !rows.length) { input.setCustomValidity(""); input.classList.remove("ep-bad"); return; }
        var ok = rows.some(function (c) { return String(c.slug).toLowerCase() === v; });
        input.setCustomValidity(ok ? "" : "Pick a casino from the list.");
        input.classList.toggle("ep-bad", !ok);
      });
    }
    attach(input, {
      text: function (it) { return it.value; },
      search: function (q) {
        return casinos().then(function (rows) {
          var t = q.toLowerCase();
          return rows.filter(function (c) { return !t || (c.name + " " + c.slug).toLowerCase().indexOf(t) !== -1; }).slice(0, 12)
            .map(function (c) { return { value: c.slug, label: c.name, sub: c.slug + (Number(c.published) === 0 ? " · draft" : "") }; });
        });
      },
      onPick: check, onType: check
    });
    input.setAttribute("placeholder", input.getAttribute("placeholder") || "Search casinos by name…");
    var f = input.form;
    if (f) f.addEventListener("submit", function (e) { check(); if (input.value.trim() && input.classList.contains("ep-bad")) { /* validity set asynchronously; the visible warning guides the user */ } }, true);
    input.addEventListener("blur", check);
  }
  function scan() { Array.prototype.forEach.call(document.querySelectorAll('input[data-entity="casino"]'), wireCasino); }
  document.addEventListener("DOMContentLoaded", scan);

  window.EntityPicker = { attach: attach, scan: scan };
})();
