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
  // A feature that needs a module (meta.features[k].requires = "a|b": any of them) is live only while that module is live.
  function reqMet(k) { var r = typeof meta !== "undefined" && meta && meta.features && meta.features[k] && meta.features[k].requires; return !r || r.split("|").some(function (c) { return live(c); }); }
  function reqNames(k) { return meta.features[k].requires.split("|").map(function (c) { return (meta.modules[c] && meta.modules[c].label) || c; }).join(" or "); }
  function live(id) { if (id.indexOf("features.") === 0) { var fk = id.slice(9); return !(state.features && state.features[fk] === false) && reqMet(fk); } var m = id.split(".")[0]; if (id.indexOf("content.custom.") === 0 && state.pages && state.pages["content.custom"] === false) return false; return state.modules[m] !== false && !(state.pages && state.pages[id] === false); }

  // Phase 11: one switch per custom content type, shown under "Custom content types" while that page family is on.
  function customTypeRows(sub) {
    var types = (meta && meta.customTypes) || [];
    if (!types.length || !live("content.custom")) return;
    var box = el("div", { className: "cfg-pages" }); box.style.marginLeft = "1.6rem";
    types.forEach(function (t) {
      var tcb = keyed(el("input", { type: "checkbox", checked: live(t.id) }), "g:" + t.id);
      tcb.onchange = function () { if (tcb.checked) delete state.pages[t.id]; else state.pages[t.id] = false; state.preset = "custom"; render(); };
      box.appendChild(el("label", {}, [tcb, el("span", { text: " " + t.label }), el("small", { className: "muted", text: " /en/custom/" + t.slug })]));
      box.appendChild(document.createElement("br"));
    });
    sub.appendChild(box);
  }

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n[k] = props[k]; });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  // Accessibility (Phase 10): screen reader messages, and keeping the keyboard focus where it was when the screen redraws.
  function announce(text) { var a = $("cfgAnnounce"); if (a) a.textContent = text || ""; }
  function alertMsg(text) { var a = $("cfgAlert"); if (a) a.textContent = text || ""; }
  function focusEl(n) { if (n && typeof n.focus === "function") n.focus(); }
  var fmap = {};
  function keyed(node, key) { node.fkey = key; fmap[key] = node; return node; }
  function enabledMods() { return Object.keys(state.modules).filter(function (k) { return state.modules[k]; }); }

  function render() {
    var ak = document.activeElement && document.activeElement.fkey; fmap = {};
    var p = $("cfgPresets"); p.textContent = "";
    (meta.wizard || []).forEach(function (w) {
      var rb = keyed(el("input", { type: "radio", name: "cfgPreset", checked: state.preset === w.id }), "p:" + w.id);
      rb.onchange = function () { state = JSON.parse(JSON.stringify(w.profile)); render(); };
      var card = el("label", { className: "cfg-module" }, [rb, el("strong", { text: " " + w.title }), el("small", { className: "muted", text: " \u2014 " + w.example + " " + w.learn })]);
      p.appendChild(card); p.appendChild(document.createElement("br"));
    });
    if (state.preset === "custom") p.appendChild(el("p", { className: "muted", text: "Custom setup: your own mix of the choices below." }));
    var m = $("cfgModules"); m.textContent = "";
    Object.keys(meta.modules).forEach(function (k) {
      var cb = keyed(el("input", { type: "checkbox", checked: !!state.modules[k] }), "m:" + k);
      cb.onchange = function () { state.modules[k] = cb.checked; state.preset = "custom"; render(); };
      m.appendChild(el("label", { className: "cfg-module" }, [cb, el("strong", { text: " " + meta.modules[k].label }), el("small", { className: "muted", text: " " + (meta.modules[k].help || meta.modules[k].desc) })]));
      var pages = meta.modules[k].pages || {};
      var pk = Object.keys(pages);
      if (state.modules[k] && pk.length > 1) {
        var sub = el("div", { className: "cfg-pages" });
        pk.forEach(function (id) {
          var pcb = keyed(el("input", { type: "checkbox", checked: live(id) }), "g:" + id);
          pcb.onchange = function () { if (pcb.checked) delete state.pages[id]; else state.pages[id] = false; state.preset = "custom"; render(); };
          sub.appendChild(el("label", {}, [pcb, el("span", { text: " " + pages[id].label }), el("small", { className: "muted", text: " " + pages[id].desc })]));
          sub.appendChild(document.createElement("br"));
          if (id === "content.custom") customTypeRows(sub);
        });
        sub.style.marginLeft = "1.6rem";
        m.appendChild(sub);
      }
      m.appendChild(document.createElement("br"));
    });
    var f = $("cfgFeatures"); f.textContent = "";
    Object.keys(meta.features || {}).forEach(function (k) {
      var fcb = keyed(el("input", { type: "checkbox", checked: live("features." + k) }), "f:" + k);
      fcb.onchange = function () { if (fcb.checked) delete state.features[k]; else state.features[k] = false; state.preset = "custom"; render(); };
      var unmet = !reqMet(k); if (unmet) fcb.disabled = true;
      f.appendChild(el("label", { className: "cfg-module" }, [fcb, el("strong", { text: " " + meta.features[k].label }), el("small", { className: "muted", text: " " + meta.features[k].help + (unmet ? " Needs " + reqNames(k) + ", which is off." : "") })]));
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
    if (state.modules.content && live("content.custom")) ((meta && meta.customTypes) || []).forEach(function (t) { if (!live(t.id)) pv.appendChild(el("li", { text: "\u00a0\u00a0\u21b3 Custom type " + t.label + ": removed" })); });
    Object.keys(meta.features || {}).forEach(function (k) { if (!live("features." + k)) pv.appendChild(el("li", { text: meta.features[k].label + ": switched off (dashboard, API and jobs)" })); });
    if (!Object.keys(state.modules).some(function (k) { return state.modules[k]; })) pv.appendChild(el("li", { text: "Static website: only ordinary pages, legal pages, login and this dashboard remain." }));
    refreshGuide();
    persist();
    // The lists above are rebuilt on every change; put the focus back on the control the person was using.
    if (ak && fmap[ak]) focusEl(fmap[ak]);
  }

  var lastPreview = null, seq = 0, timer = null;
  function renderIssues(list) {
    var ul = $("cfgIssues"); ul.textContent = ""; $("cfgIssuesWrap").hidden = !list.length;
    list.forEach(function (i) {
      var li = el("li", { text: (i.level === "error" ? "Must fix: " : "Tip: ") + i.message + " " });
      if (i.fix) { var a = el("a", { href: "#", text: i.fix.label }); a.setAttribute && a.setAttribute("role", "button"); a.onclick = function (e) { e.preventDefault(); state = i.fix.profile; render(); announce("Fix applied: " + i.fix.label); }; li.appendChild(a); }
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
  // Phase 9: a site that was created with a setup type (or as a copy of another site) asks its owner to confirm it once.
  function loadSetup() {
    var box = $("cfgSetup"); if (!box) return;
    fetch("/en/api/v1/site-profile/setup", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) {
      var st = j && j.setup;
      if (!st || !st.pending) { box.hidden = true; return; }
      var label = "";
      var want = st.preset || j.livePreset; (j.presets || []).forEach(function (p) { if (p.id === want) label = p.label; });
      $("cfgSetupText").textContent = st.source === "clone" ? "This site was created as a copy of " + (st.from || "another site") + ". Look through the choices below and confirm when it suits you."
        : "This site was created with the setup type \u201c" + (label || "Full platform") + "\u201d. Look through the choices below and confirm when it suits you.";
      var btn = $("cfgSetupConfirm"); btn.hidden = !j.canConfirm; box.hidden = false;
      // Do not steal focus on load; but when the person arrived through the "next steps" link (#cfgSetup) start at the panel heading.
      if (typeof location !== "undefined" && location.hash === "#cfgSetup") focusEl($("cfgSetupTitle"));
      var change = $("cfgSetupChange");
      if (change) change.onclick = function (e) { if (e && e.preventDefault) e.preventDefault(); var first = null; Object.keys(fmap).forEach(function (k) { if (!first && k.indexOf("p:") === 0) first = fmap[k]; }); var pr = $("cfgPresets"); if (pr && pr.scrollIntoView) pr.scrollIntoView({ block: "nearest" }); focusEl(first); };
      btn.onclick = function () {
        var msg = $("cfgSetupMsg"); msg.textContent = "Saving\u2026"; btn.disabled = true; box.setAttribute && box.setAttribute("aria-busy", "true");
        fetch("/en/api/v1/site-profile/setup/complete", { method: "POST", credentials: "same-origin" }).then(function (r) { return r.json().then(function (x) { return { ok: r.ok, x: x }; }); })
          .then(function (res) {
            box.setAttribute && box.setAttribute("aria-busy", "false");
            if (res.ok) { box.hidden = true; announce("Setup confirmed. The welcome panel is closed."); focusEl($("cfgTitle")); loadNext(); }
            else { btn.disabled = false; msg.textContent = (res.x && (res.x.error || res.x.message)) || "Could not save."; alertMsg(msg.textContent); focusEl(btn); }
          })
          .catch(function () { box.setAttribute && box.setAttribute("aria-busy", "false"); btn.disabled = false; msg.textContent = "Network error. Nothing was changed."; alertMsg(msg.textContent); focusEl(btn); });
      };
    }).catch(function () { /* the welcome panel is optional */ });
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
      .then(function (x) { msg.textContent = x.ok ? "Configuration applied. Reloading\u2026" : ((x.j && (x.j.error || x.j.message)) || "Could not save."); if (!x.ok) alertMsg(msg.textContent); if (x.ok) setTimeout(function () { location.reload(); }, 600); })
      .catch(function () { msg.textContent = "Network error. Nothing was changed."; alertMsg(msg.textContent); });
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
    render(); loaded = true; loadNext(); loadSetup();
    if (CFG().mode === "draft") { $("cfgSave").textContent = "Review and publish"; $("cfgMsg").textContent = "Changes on this page are saved to your draft automatically. Publish to make them live."; }
  });
})();
