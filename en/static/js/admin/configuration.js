// Dashboard > Configuration. Talks to /en/api/v1/site-profile (admin only).
// Phase 6: edits autosave to a draft through window.LummetConfig (configuration-draft.js) and go live on Publish.
// If versioning is not set up (mode "direct") the older explicit "Apply configuration" save is used instead.
(function () {
  var root = document.getElementById("cfgRoot");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var state = null, meta = null, loaded = false, lastSaved = "";
  var CFG = function () { return window.LummetConfig || { mode: "direct" }; };
  function persist() {
    if (!loaded || CFG().mode !== "draft") return;
    var snap = JSON.stringify(state);
    if (snap === lastSaved) return;
    lastSaved = snap; CFG().queueProfile(state);
  }
  var LANDINGS = { "/en/casino": "casino.list", "/en/news": "news.list", "/en/review": "reviews.list", "/en/updates": "updates.list", "/en/research": "research.hub", "/en/sportsbook": "content.sportsbook" };
  function live(id) { if (id.indexOf("features.") === 0) return !(state.features && state.features[id.slice(9)] === false); var m = id.split(".")[0]; return state.modules[m] !== false && !(state.pages && state.pages[id] === false); }

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n[k] = props[k]; });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function enabledMods() { return Object.keys(state.modules).filter(function (k) { return state.modules[k]; }); }

  function render() {
    var p = $("cfgPresets"); p.textContent = "";
    (meta.wizard || []).forEach(function (w) {
      var rb = el("input", { type: "radio", name: "cfgPreset", checked: state.preset === w.id });
      rb.onchange = function () { state = JSON.parse(JSON.stringify(w.profile)); render(); };
      var card = el("label", { className: "cfg-module" }, [rb, el("strong", { text: " " + w.title }), el("small", { className: "muted", text: " \u2014 " + w.example + " " + w.learn })]);
      p.appendChild(card); p.appendChild(document.createElement("br"));
    });
    if (state.preset === "custom") p.appendChild(el("p", { className: "muted", text: "Custom setup: your own mix of the choices below." }));
    var m = $("cfgModules"); m.textContent = "";
    Object.keys(meta.modules).forEach(function (k) {
      var cb = el("input", { type: "checkbox", checked: !!state.modules[k] });
      cb.onchange = function () { state.modules[k] = cb.checked; state.preset = "custom"; render(); };
      m.appendChild(el("label", { className: "cfg-module" }, [cb, el("strong", { text: " " + meta.modules[k].label }), el("small", { className: "muted", text: " " + (meta.modules[k].help || meta.modules[k].desc) })]));
      var pages = meta.modules[k].pages || {};
      var pk = Object.keys(pages);
      if (state.modules[k] && pk.length > 1) {
        var sub = el("div", { className: "cfg-pages" });
        pk.forEach(function (id) {
          var pcb = el("input", { type: "checkbox", checked: live(id) });
          pcb.onchange = function () { if (pcb.checked) delete state.pages[id]; else state.pages[id] = false; state.preset = "custom"; render(); };
          sub.appendChild(el("label", {}, [pcb, el("span", { text: " " + pages[id].label }), el("small", { className: "muted", text: " " + pages[id].desc })]));
          sub.appendChild(document.createElement("br"));
        });
        sub.style.marginLeft = "1.6rem";
        m.appendChild(sub);
      }
      m.appendChild(document.createElement("br"));
    });
    var f = $("cfgFeatures"); f.textContent = "";
    Object.keys(meta.features || {}).forEach(function (k) {
      var fcb = el("input", { type: "checkbox", checked: live("features." + k) });
      fcb.onchange = function () { if (fcb.checked) delete state.features[k]; else state.features[k] = false; state.preset = "custom"; render(); };
      f.appendChild(el("label", { className: "cfg-module" }, [fcb, el("strong", { text: " " + meta.features[k].label }), el("small", { className: "muted", text: " " + meta.features[k].help })]));
      f.appendChild(document.createElement("br"));
    });
    $("cfgHomepage").checked = !!state.homepage;
    $("cfgLandingWrap").hidden = state.homepage;
    var opts = Object.keys(LANDINGS).filter(function (u) { return live(LANDINGS[u]); });
    var sel = $("cfgLanding"); sel.textContent = "";
    opts.forEach(function (u) { var o = el("option", { value: u, text: u }); if (state.landing === u) o.selected = true; sel.appendChild(o); });
    if (!state.homepage && opts.length && opts.indexOf(state.landing) < 0) state.landing = opts[0];
    $("cfgMode").value = state.disabled.mode;
    var r = $("cfgRedirect"); r.hidden = state.disabled.mode !== "301"; r.textContent = "";
    ["/en"].concat(opts).forEach(function (u) { var o = el("option", { value: u, text: u }); if (state.disabled.redirectTo === u) o.selected = true; r.appendChild(o); });
    $("cfgSticky").checked = !!state.header.sticky; $("cfgPrune").checked = !!state.header.autoPrune;
    var pv = $("cfgPreview"); pv.textContent = "";
    pv.appendChild(el("li", { text: "/ and /en  \u2192  " + (state.homepage ? "homepage" : "redirects to " + state.landing) }));
    Object.keys(meta.modules).forEach(function (k) {
      pv.appendChild(el("li", { text: meta.modules[k].label + ": " + (state.modules[k] ? "live" : "removed") }));
      if (state.modules[k]) Object.keys(meta.modules[k].pages || {}).forEach(function (id) { if (!live(id)) pv.appendChild(el("li", { text: "\u00a0\u00a0\u21b3 " + meta.modules[k].pages[id].label + ": removed" })); });
    });
    Object.keys(meta.features || {}).forEach(function (k) { if (!live("features." + k)) pv.appendChild(el("li", { text: meta.features[k].label + ": switched off (dashboard, API and jobs)" })); });
    if (!Object.keys(state.modules).some(function (k) { return state.modules[k]; })) pv.appendChild(el("li", { text: "Static website: only ordinary pages, legal pages, login and this dashboard remain." }));
    refreshGuide();
    persist();
  }

  var lastPreview = null, seq = 0, timer = null;
  function renderIssues(list) {
    var ul = $("cfgIssues"); ul.textContent = ""; $("cfgIssuesWrap").hidden = !list.length;
    list.forEach(function (i) {
      var li = el("li", { text: (i.level === "error" ? "Must fix: " : "Tip: ") + i.message + " " });
      if (i.fix) { var a = el("a", { href: "#", text: i.fix.label }); a.onclick = function (e) { e.preventDefault(); state = i.fix.profile; render(); }; li.appendChild(a); }
      ul.appendChild(li);
    });
  }
  function renderImpact(pv) {
    var risk = $("cfgImpactRisk"), ul = $("cfgImpact"); ul.textContent = "";
    if (!pv) { risk.textContent = ""; return; }
    var nothing = !pv.removed.length && !pv.added.length && !pv.landingChanged;
    risk.textContent = nothing ? "No changes yet. This matches what is live now." : (pv.risk === "high" ? "Careful: this removes pages that people and search engines may use." : pv.risk === "medium" ? "This removes some pages. Nothing is deleted; you can switch them back on." : "Small change, easy to undo.");
    pv.removed.forEach(function (r) { ul.appendChild(el("li", { text: "Removed: " + r.label })); });
    pv.added.forEach(function (r) { ul.appendChild(el("li", { text: "Added: " + r.label })); });
    if (pv.dashboardScreensHidden) ul.appendChild(el("li", { text: pv.dashboardScreensHidden + " dashboard screens will be hidden." }));
    if (pv.sitemapFilesRemoved) ul.appendChild(el("li", { text: pv.sitemapFilesRemoved + " sitemap files will be removed." }));
    pv.notes.forEach(function (n) { ul.appendChild(el("li", { text: n })); });
  }
  function refreshGuide() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var mine = ++seq;
      fetch("/en/api/v1/site-profile/preview", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (mine !== seq || !j || !j.preview) return; lastPreview = j; renderImpact(j.preview); renderIssues((j.errors || []).map(function (e) { return { level: "error", message: e, fix: null }; }).concat(j.issues || [])); })
        .catch(function () { /* guidance is optional; saving still works */ });
    }, 250);
  }
  function loadNext() {
    fetch("/en/api/v1/site-profile/next-steps", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) {
      var ul = $("cfgNext"); ul.textContent = ""; $("cfgNextWrap").hidden = !(j.steps && j.steps.length);
      (j.steps || []).forEach(function (st) { var li = el("li", {}, [el("a", { href: st.href, text: st.title }), el("small", { className: "muted", text: " \u2014 " + st.why })]); ul.appendChild(li); });
    }).catch(function () {});
  }

  $("cfgHomepage").onchange = function () { state.homepage = this.checked; state.preset = "custom"; var o = $("cfgLanding").options[0]; if (!state.homepage && o) state.landing = o.value; render(); };
  $("cfgLanding").onchange = function () { state.landing = this.value; state.preset = "custom"; render(); };
  $("cfgMode").onchange = function () { state.disabled.mode = this.value; if (this.value === "301" && !state.disabled.redirectTo) state.disabled.redirectTo = "/en"; render(); };
  $("cfgRedirect").onchange = function () { state.disabled.redirectTo = this.value; persist(); };
  $("cfgSticky").onchange = function () { state.header.sticky = this.checked; persist(); };
  $("cfgPrune").onchange = function () { state.header.autoPrune = this.checked; persist(); };

  function applyDirect() {
    var msg = $("cfgMsg");
    if (lastPreview && lastPreview.preview && lastPreview.preview.confirm && !window.confirm(lastPreview.preview.confirm + "\n\nApply anyway?")) { msg.textContent = "Nothing was changed."; return; } msg.textContent = "Saving\u2026";
    fetch("/en/api/v1/site-profile", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { msg.textContent = x.ok ? "Configuration applied. Reloading\u2026" : ((x.j && (x.j.error || x.j.message)) || "Could not save."); if (x.ok) setTimeout(function () { location.reload(); }, 600); })
      .catch(function () { msg.textContent = "Network error. Nothing was changed."; });
  }
  $("cfgSave").onclick = function () { if (CFG().mode === "draft") CFG().openPublish(); else applyDirect(); };

  // Look and feel may change stickiness too (the server keeps both in step): follow it here.
  if (window.LummetConfig) window.LummetConfig.onSaved(function (cs) {
    var eff = cs && cs.draft && cs.draft.effective;
    if (eff && state && eff.profile.header.sticky !== state.header.sticky && !document.activeElement.matches("#cfgSticky")) { state.header.sticky = eff.profile.header.sticky; lastSaved = JSON.stringify(state); $("cfgSticky").checked = !!state.header.sticky; }
  });

  Promise.all([
    fetch("/en/api/v1/site-profile", { credentials: "same-origin" }).then(function (r) { return r.json(); }),
    window.LummetConfig ? window.LummetConfig.ready : Promise.resolve(null)
  ]).then(function (a) {
    var j = a[0], cs = a[1];
    meta = j;
    state = cs && cs.ready && cs.draft ? JSON.parse(JSON.stringify(cs.draft.effective.profile)) : j.profile;
    lastSaved = JSON.stringify(state);
    render(); loaded = true; loadNext();
    if (CFG().mode === "draft") { $("cfgSave").textContent = "Review and publish"; $("cfgMsg").textContent = "Changes on this page are saved to your draft automatically. Publish to make them live."; }
  });
})();
