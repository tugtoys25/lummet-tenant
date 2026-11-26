// Settings > General > Click protection for tracked links. Saved through /en/api/v1/settings/click-protection (administrators only).
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function say(text, bad) { var m = $("clickProtectionMsg"); if (!m) return; m.textContent = text; m.style.color = bad ? "#b42318" : "#067647"; }
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("clickProtectionPanel")) return;
    fetch("/en/api/v1/settings/click-protection", { credentials: "same-origin" }).then(function (r) {
      if (r.status === 403) { $("clickProtectionPanel").hidden = true; return null; }
      return r.json();
    }).then(function (d) { if (d) { $("clickProtectionMode").value = d.mode || "off"; $("clickProtectionLimit").value = d.limit || 20; } })
      .catch(function () { say("Could not load the current choice.", true); });
    $("clickProtectionSave").addEventListener("click", function () {
      var body = { mode: $("clickProtectionMode").value, limit: $("clickProtectionLimit").value };
      if (body.mode === "hold" && !confirm("Visitors showing clear signs of automation will get an error instead of the redirect. Continue?")) return;
      say("Saving...");
      fetch("/en/api/v1/settings/click-protection", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) { if (!x.ok) { say(x.d.error || x.d.message || "Could not save.", true); return; } say("Saved. Takes effect within a minute."); })
        .catch(function () { say("Could not save. Try again.", true); });
    });
  });
})();
