// Settings > General > Website address: choose where public pages live (/en/, root or a custom prefix, plus per-page rules).
// Saved through /en/api/v1/settings/url-layout (administrators only). The default /en/ changes nothing.
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function say(text, bad) { var m = $("urlLayoutMsg"); if (!m) return; m.textContent = text; m.style.color = bad ? "#b42318" : "#067647"; }
  function examples(list) {
    var box = $("urlLayoutExamples"); if (!box) return;
    box.textContent = "";
    (list || []).forEach(function (e) {
      var row = document.createElement("div");
      row.textContent = e.from + "  \u2192  " + e.to;
      box.appendChild(row);
    });
  }
  function toggle() { var c = $("urlLayoutMode").value === "custom" || /=\s*custom\s*$/im.test($("urlLayoutRules").value); $("urlLayoutPrefixRow").hidden = !c; }
  function fill(l) {
    $("urlLayoutMode").value = l.url_layout || "en";
    $("urlLayoutPrefix").value = l.url_custom_prefix || "";
    $("urlLayoutRules").value = l.url_page_overrides || "";
    $("urlLayoutLegacy").checked = l.url_legacy_redirect !== "0";
    toggle();
  }
  function load() {
    if (!$("urlLayoutPanel")) return;
    fetch("/en/api/v1/settings/url-layout", { credentials: "same-origin" }).then(function (r) {
      if (r.status === 403) { $("urlLayoutPanel").hidden = true; return null; }
      return r.json();
    }).then(function (d) { if (d && d.layout) { fill(d.layout); examples(d.examples); } }).catch(function () { say("Could not load the current choice.", true); });
  }
  function save() {
    var body = { url_layout: $("urlLayoutMode").value, url_custom_prefix: $("urlLayoutPrefix").value, url_page_overrides: $("urlLayoutRules").value, url_legacy_redirect: $("urlLayoutLegacy").checked ? "1" : "0" };
    if (body.url_layout !== "en" && !confirm("Public pages will move to the new address. Old /en/ links redirect, but check the home page afterwards. Continue?")) return;
    say("Saving...");
    fetch("/en/api/v1/settings/url-layout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (!x.ok) { say(x.d.error || x.d.message || "Could not save.", true); return; }
        fill(x.d.layout); examples(x.d.examples); say("Saved. Pages update within a minute.");
      }).catch(function () { say("Could not save. Try again.", true); });
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("urlLayoutPanel")) return;
    $("urlLayoutMode").addEventListener("change", toggle);
    $("urlLayoutRules").addEventListener("input", toggle);
    $("urlLayoutSave").addEventListener("click", save);
    load();
  });
})();
