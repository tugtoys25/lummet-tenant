// Review page look: colour pickers, a live preview, and Save (settings keys rl_*).
(function () {
  "use strict";
  var form = document.getElementById("rlForm");
  if (!form) return;
  var FIELDS = [
    ["rl_accent", "Accent (active tab, links, icons)", "#2563eb"], ["rl_card_bg", "Card background", "#ffffff"],
    ["rl_card_text", "Card text", "#1f2937"], ["rl_heading", "Card heading", "#0f172a"], ["rl_border", "Card border", "#e5e7eb"]
  ];
  var SHADOW = { none: "none", soft: "0 1px 2px rgba(15,23,42,.05), 0 10px 30px rgba(15,23,42,.07)", strong: "0 2px 4px rgba(15,23,42,.08), 0 16px 40px rgba(15,23,42,.20)" };
  var $ = function (id) { return document.getElementById(id); };
  var inputs = {}, box = $("rlFields");
  FIELDS.forEach(function (f) {
    var lab = document.createElement("label"); lab.className = "ah-field";
    var sp = document.createElement("span"); sp.textContent = f[1];
    var i = document.createElement("input"); i.type = "color"; i.value = f[2]; i.id = "rl_" + f[0]; i.dataset.key = f[0];
    lab.appendChild(sp); lab.appendChild(i); box.appendChild(lab); inputs[f[0]] = i;
  });
  var pv = $("rlPreview");
  function paint() {
    var g = function (k) { return inputs[k].value; };
    pv.style.setProperty("--rl-accent", g("rl_accent")); pv.style.setProperty("--rl-card-bg", g("rl_card_bg"));
    pv.style.setProperty("--rl-card-text", g("rl_card_text")); pv.style.setProperty("--rl-heading", g("rl_heading"));
    pv.style.setProperty("--rl-border", g("rl_border")); pv.style.setProperty("--rl-radius", $("rlRadius").value + "px");
    pv.style.setProperty("--rl-shadow", SHADOW[$("rlShadow").value] || "none");
    $("rlRadiusVal").textContent = $("rlRadius").value + " px";
  }
  function show(kind, msg) { var a = $("rlAlert"); a.className = "alert alert--" + kind; a.textContent = msg; a.style.display = "block"; }
  form.addEventListener("input", paint);
  fetch("/en/api/v1/settings/get").then(function (r) { return r.json(); }).then(function (d) {
    var s = (d && d.settings) || {};
    FIELDS.forEach(function (f) { if (/^#[0-9a-fA-F]{6}$/.test(s[f[0]] || "")) inputs[f[0]].value = s[f[0]]; });
    if (s.rl_radius !== undefined && s.rl_radius !== "") $("rlRadius").value = parseInt(s.rl_radius, 10) || 0;
    if (s.rl_shadow) $("rlShadow").value = s.rl_shadow;
    if (s.rl_mode) $("rlMode").value = s.rl_mode;
    paint();
  }).catch(paint);
  $("rlReset").addEventListener("click", function () {
    FIELDS.forEach(function (f) { inputs[f[0]].value = f[2]; }); $("rlRadius").value = 18; $("rlShadow").value = "soft"; $("rlMode").value = "multi"; paint();
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = { rl_radius: $("rlRadius").value, rl_shadow: $("rlShadow").value, rl_mode: $("rlMode").value };
    FIELDS.forEach(function (f) { body[f[0]] = inputs[f[0]].value; });
    fetch("/en/api/v1/settings/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function (d) { if (d && d.success !== false && !d.error) show("success", "Saved. Review pages use the new look."); else show("error", (d && d.error) || "Could not save."); })
      .catch(function () { show("error", "Network error. Try again."); });
  });
  paint();
})();
