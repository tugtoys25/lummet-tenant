// Dashboard > Configuration. Talks to /en/api/v1/site-profile (admin only).
(function () {
  var root = document.getElementById("cfgRoot");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var state = null, meta = null;
  var LANDINGS = { "/en/casino": "casino", "/en/news": "news", "/en/review": "reviews", "/en/updates": "updates", "/en/research": "research", "/en/sportsbook": "content" };

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n[k] = props[k]; });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function enabledMods() { return Object.keys(state.modules).filter(function (k) { return state.modules[k]; }); }

  function render() {
    var p = $("cfgPresets"); p.textContent = "";
    Object.keys(meta.presets).forEach(function (k) {
      var b = el("button", { type: "button", className: "btn btn--ghost" + (state.preset === k ? " is-active" : ""), text: meta.presets[k].label });
      b.onclick = function () { state = JSON.parse(JSON.stringify(meta.presets[k].profile)); render(); };
      p.appendChild(b);
    });
    var m = $("cfgModules"); m.textContent = "";
    Object.keys(meta.modules).forEach(function (k) {
      var cb = el("input", { type: "checkbox", checked: !!state.modules[k] });
      cb.onchange = function () { state.modules[k] = cb.checked; state.preset = "custom"; render(); };
      m.appendChild(el("label", { className: "cfg-module" }, [cb, el("strong", { text: " " + meta.modules[k].label }), el("small", { className: "muted", text: " " + meta.modules[k].desc })]));
      m.appendChild(document.createElement("br"));
    });
    $("cfgHomepage").checked = !!state.homepage;
    $("cfgLandingWrap").hidden = state.homepage;
    var opts = Object.keys(LANDINGS).filter(function (u) { return state.modules[LANDINGS[u]]; });
    var sel = $("cfgLanding"); sel.textContent = "";
    opts.forEach(function (u) { var o = el("option", { value: u, text: u }); if (state.landing === u) o.selected = true; sel.appendChild(o); });
    if (!state.homepage && opts.length && opts.indexOf(state.landing) < 0) state.landing = opts[0];
    $("cfgMode").value = state.disabled.mode;
    var r = $("cfgRedirect"); r.hidden = state.disabled.mode !== "301"; r.textContent = "";
    ["/en"].concat(opts).forEach(function (u) { var o = el("option", { value: u, text: u }); if (state.disabled.redirectTo === u) o.selected = true; r.appendChild(o); });
    $("cfgSticky").checked = !!state.header.sticky; $("cfgPrune").checked = !!state.header.autoPrune;
    var pv = $("cfgPreview"); pv.textContent = "";
    pv.appendChild(el("li", { text: "/ and /en  \u2192  " + (state.homepage ? "homepage" : "redirects to " + state.landing) }));
    Object.keys(meta.modules).forEach(function (k) { pv.appendChild(el("li", { text: meta.modules[k].label + ": " + (state.modules[k] ? "live" : "removed") })); });
  }

  $("cfgHomepage").onchange = function () { state.homepage = this.checked; state.preset = "custom"; var o = $("cfgLanding").options[0]; if (!state.homepage && o) state.landing = o.value; render(); };
  $("cfgLanding").onchange = function () { state.landing = this.value; state.preset = "custom"; render(); };
  $("cfgMode").onchange = function () { state.disabled.mode = this.value; if (this.value === "301" && !state.disabled.redirectTo) state.disabled.redirectTo = "/en"; render(); };
  $("cfgRedirect").onchange = function () { state.disabled.redirectTo = this.value; };
  $("cfgSticky").onchange = function () { state.header.sticky = this.checked; };
  $("cfgPrune").onchange = function () { state.header.autoPrune = this.checked; };

  $("cfgSave").onclick = function () {
    var msg = $("cfgMsg"); msg.textContent = "Saving\u2026";
    fetch("/en/api/v1/site-profile", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { msg.textContent = x.ok ? "Configuration applied. Reloading\u2026" : ((x.j && (x.j.error || x.j.message)) || "Could not save."); if (x.ok) setTimeout(function () { location.reload(); }, 600); })
      .catch(function () { msg.textContent = "Network error. Nothing was changed."; });
  };

  fetch("/en/api/v1/site-profile", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) { meta = j; state = j.profile; render(); });
})();
