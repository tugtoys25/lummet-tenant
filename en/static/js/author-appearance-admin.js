// Author page look: colour pickers, a live preview, and Save (settings keys ah_*).
(function () {
  "use strict";
  var form = document.getElementById("ahForm");
  if (!form) return;
  var FIELDS = [
    ["ah_section_bg", "Section background", "#ffffff"], ["ah_heading", "Section heading", "#14181f"],
    ["ah_stat_bg", "Count tile background", "#eef2ff"], ["ah_stat_text", "Count tile text", "#1e1b4b"],
    ["ah_card_bg", "Card background", "#ffffff"], ["ah_card_text", "Card text", "#14181f"],
    ["ah_card_border", "Card border", "#d5dbe5"], ["ah_accent", "Accent (hover, badges)", "#4f46e5"]
  ];
  var $ = function (id) { return document.getElementById(id); };
  var inputs = {}, box = $("ahFields");
  FIELDS.forEach(function (f) {
    var lab = document.createElement("label"); lab.className = "ah-field";
    var sp = document.createElement("span"); sp.textContent = f[1];
    var i = document.createElement("input"); i.type = "color"; i.value = f[2]; i.id = "ah_" + f[0]; i.dataset.key = f[0]; i.dataset.def = f[2];
    lab.appendChild(sp); lab.appendChild(i); box.appendChild(lab); inputs[f[0]] = i;
  });
  var pv = $("ahPreview");
  var SHADOW = { none: "none", soft: "0 4px 14px rgba(0,0,0,.10)", strong: "0 10px 28px rgba(0,0,0,.22)" };
  function paint() {
    var g = function (k) { return inputs[k].value; };
    pv.style.setProperty("--ah-section-bg", g("ah_section_bg")); pv.style.setProperty("--ah-heading", g("ah_heading"));
    pv.style.setProperty("--ah-stat-bg", g("ah_stat_bg")); pv.style.setProperty("--ah-stat-text", g("ah_stat_text"));
    pv.style.setProperty("--ah-card-bg", g("ah_card_bg")); pv.style.setProperty("--ah-card-text", g("ah_card_text"));
    pv.style.setProperty("--ah-card-border", g("ah_card_border")); pv.style.setProperty("--ah-accent", g("ah_accent"));
    pv.style.setProperty("--ah-radius", $("ahRadius").value + "px"); pv.style.setProperty("--ah-shadow", SHADOW[$("ahShadow").value] || "none");
    $("ahRadiusVal").textContent = $("ahRadius").value + " px";
  }
  function show(kind, msg) { var a = $("ahAlert"); a.className = "alert alert--" + kind; a.textContent = msg; a.style.display = "block"; }
  form.addEventListener("input", paint);
  fetch("/en/api/v1/settings/get").then(function (r) { return r.json(); }).then(function (d) {
    var s = (d && d.settings) || {};
    FIELDS.forEach(function (f) { if (/^#[0-9a-fA-F]{6}$/.test(s[f[0]] || "")) inputs[f[0]].value = s[f[0]]; });
    if (s.ah_radius) $("ahRadius").value = parseInt(s.ah_radius, 10) || 14;
    if (s.ah_shadow) $("ahShadow").value = s.ah_shadow;
    paint();
  }).catch(paint);
  $("ahReset").addEventListener("click", function () {
    FIELDS.forEach(function (f) { inputs[f[0]].value = f[2]; }); $("ahRadius").value = 14; $("ahShadow").value = "none"; paint();
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = { ah_radius: $("ahRadius").value, ah_shadow: $("ahShadow").value };
    FIELDS.forEach(function (f) { body[f[0]] = inputs[f[0]].value; });
    fetch("/en/api/v1/settings/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function (d) { if (d && d.success !== false && !d.error) show("success", "Saved. Author pages use the new look."); else show("error", (d && d.error) || "Could not save."); })
      .catch(function () { show("error", "Network error. Try again."); });
  });
  paint();
})();
