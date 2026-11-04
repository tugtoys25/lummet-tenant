// Dashboard > Configuration > Look and feel (Phase 5; autosaves to the draft since Phase 6).
// Renders every settings group from /en/api/v1/site-profile/settings, so a new setting added to the
// manifest on the server shows up here with no change to this file.
(function () {
  var host = document.getElementById("lookRoot");
  if (!host) return;
  var groups = [], values = {}, saved = {}, current = null;
  var FONTS = {
    default: "", system: "system-ui, sans-serif", modern: "'Helvetica Neue', Arial, sans-serif", rounded: "ui-rounded, 'Trebuchet MS', sans-serif",
    serif: "Georgia, serif", elegant: "'Palatino Linotype', Palatino, serif", display: "Impact, 'Arial Narrow Bold', sans-serif", mono: "ui-monospace, Menlo, monospace"
  };

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n[k] = props[k]; });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function groupById(id) { return groups.filter(function (g) { return g.id === id; })[0]; }
  function dirtyKeys(g) { return g.fields.filter(function (f) { return String(values[f.key] == null ? "" : values[f.key]) !== String(saved[f.key] == null ? "" : saved[f.key]); }).map(function (f) { return f.key; }); }

  function draftMode() { return !!window.LummetConfig && window.LummetConfig.mode === "draft"; }
  function queue(key, val) { if (draftMode()) window.LummetConfig.queueSettings(Object.fromEntries ? Object.fromEntries([[key, val]]) : (function () { var o = {}; o[key] = val; return o; })()); }

  function renderTabs() {
    var nav = $("lookTabs"); nav.textContent = "";
    groups.forEach(function (g) {
      var n = dirtyKeys(g).length;
      var a = el("a", { href: "#look-" + g.id, className: "cfg-tab" + (current === g.id ? " is-active" : ""), text: g.label + (n ? (draftMode() ? " (" + n + " in draft)" : " (" + n + " unsaved)") : "") });
      a.onclick = function (e) { e.preventDefault(); current = g.id; history.replaceState(null, "", "#look-" + g.id); render(); };
      nav.appendChild(a); nav.appendChild(document.createTextNode(" "));
    });
  }

  function inputFor(f) {
    var key = f.key, v = values[key] == null ? "" : String(values[key]), inp;
    function set(val) { values[key] = val; queue(key, val); renderTabs(); renderPreview(); renderSave(); }
    if (f.type === "bool") {
      inp = el("input", { type: "checkbox", checked: v === "1" || v === "true" });
      inp.onchange = function () { set(inp.checked ? "1" : "0"); };
    } else if (f.type === "enum") {
      inp = el("select", {}, (f.values || []).map(function (o) { return el("option", { value: o, text: o, selected: o === v }); }));
      inp.onchange = function () { set(inp.value); };
    } else if (f.type === "color") {
      var pick = el("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000" });
      var txt = el("input", { type: "text", value: v, placeholder: "#1a73e8", size: 12 });
      pick.oninput = function () { txt.value = pick.value; set(pick.value); };
      txt.oninput = function () { if (/^#[0-9a-f]{6}$/i.test(txt.value)) pick.value = txt.value; set(txt.value); };
      return el("span", {}, [pick, document.createTextNode(" "), txt]);
    } else if (f.type === "slides" || f.type === "cards") {
      return el("a", { href: "/en/dashboard/header-hero", text: "Edit on the Header & Hero screen" });
    } else if (f.type === "lines" || (f.max && f.max > 160)) {
      inp = el("textarea", { rows: 3, value: v, maxLength: f.max || 600 });
      inp.oninput = function () { set(inp.value); };
    } else if (f.type === "int") {
      inp = el("input", { type: "number", value: v, min: f.min, max: f.max });
      inp.oninput = function () { set(inp.value); };
    } else {
      inp = el("input", { type: "text", value: v, maxLength: f.max || 300, size: 40 });
      inp.oninput = function () { set(inp.value); };
    }
    return inp;
  }

  function renderForm(g) {
    var form = $("lookForm"); form.textContent = "";
    form.appendChild(el("p", { className: "muted", text: g.help }));
    if (!g.available) form.appendChild(el("p", { className: "muted", role: "note", text: "This area is switched off in your modules, so these settings have no effect on your site right now. Your values are kept." }));
    g.fields.forEach(function (f) {
      var row = el("div", { className: "form-group" + (f.available ? "" : " is-dim") });
      var lab = el("label", {}, [el("strong", { text: f.label })]);
      row.appendChild(lab); row.appendChild(document.createElement("br"));
      row.appendChild(inputFor(f));
      if (f.help) row.appendChild(el("small", { className: "muted", text: " " + f.help }));
      if (!f.available) row.appendChild(el("small", { className: "muted", text: " Not used while the " + f.needs + " module is off." }));
      form.appendChild(row);
    });
    (g.elsewhere || []).forEach(function (o) { form.appendChild(el("p", { className: "muted" }, [document.createTextNode(o.key + " (" + o.why + "): "), el("a", { href: o.screen, text: "edit here" })])); });
    form.appendChild(el("p", { className: "muted" }, [document.createTextNode("Open the classic screen: "), el("a", { href: g.screen, text: g.label })]));
  }

  function renderPreview() {
    var p = $("lookPreview"); if (!p) return;
    var v = function (k, d) { var x = values[k]; return x ? x : d; };
    var heading = FONTS[v("site_hero_heading_font", "default")] || "", body = FONTS[v("site_hero_body_font", "default")] || "";
    p.style.background = v("theme_background", "#ffffff"); p.style.color = v("theme_text", "#1f2937");
    p.style.fontFamily = body; p.style.border = "1px solid " + v("theme_border", "#e5e7eb"); p.style.borderRadius = v("theme_card_radius", "12px");
    $("lookPvHeader").style.background = v("theme_header_background", v("theme_surface", "#f3f4f6"));
    $("lookPvHeader").style.color = v("site_header_text_color", v("theme_text", "#1f2937"));
    $("lookPvHeader").style.fontFamily = FONTS[v("site_header_font", "default")] || "";
    $("lookPvName").textContent = v("site_name", "Your site");
    $("lookPvHero").style.background = v("site_hero_bg_color", v("theme_primary", "#2563eb"));
    $("lookPvHero").style.color = v("site_hero_text_color", "#ffffff");
    var h = $("lookPvTitle"); h.textContent = v("site_hero_title", "Your headline"); h.style.fontFamily = heading; h.style.color = v("site_hero_title_color", "") || "inherit";
    $("lookPvBtn").style.background = v("theme_secondary", "#111827"); $("lookPvBtn").style.color = v("theme_button_text", "#ffffff"); $("lookPvBtn").style.borderRadius = v("theme_button_radius", "8px");
    $("lookPvBtn").textContent = v("site_hero_button_text", "Main button");
    $("lookPvCard").style.background = v("theme_surface", "#f9fafb"); $("lookPvCard").style.borderRadius = v("theme_card_radius", "12px");
    $("lookPvMuted").style.color = v("theme_text_muted", "#6b7280");
  }

  function renderSave() {
    var g = groupById(current), n = g ? dirtyKeys(g).length : 0;
    if (draftMode()) { $("lookSave").hidden = true; return; }
    $("lookSave").hidden = false; $("lookSave").disabled = !n; $("lookSave").textContent = n ? "Save " + n + " change" + (n === 1 ? "" : "s") : "No changes to save";
  }

  function render() { var g = groupById(current) || groups[0]; current = g.id; renderTabs(); renderForm(g); renderPreview(); renderSave(); }

  $("lookSave").onclick = function () {
    var g = groupById(current), msg = $("lookMsg"), body = {};
    dirtyKeys(g).forEach(function (k) { body[k] = values[k]; });
    msg.textContent = "Saving\u2026";
    fetch("/en/api/v1/site-profile/settings", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: body }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { msg.textContent = (x.j && (x.j.error || x.j.message)) || "Could not save. Nothing was changed."; return; }
        Object.keys(body).forEach(function (k) { saved[k] = body[k]; }); msg.textContent = "Saved. Your site shows the change within a minute."; render();
      })
      .catch(function () { msg.textContent = "Network error. Nothing was changed."; });
  };

  if (window.LummetConfig) window.LummetConfig.onSaved(function (cs) {
    // The server keeps header stickiness in step with the profile: follow it if the profile switch changed it.
    var eff = cs && cs.draft && cs.draft.effective;
    if (eff && eff.settings.site_header_sticky !== undefined && values.site_header_sticky !== eff.settings.site_header_sticky && !document.activeElement.matches("#lookForm *")) { values.site_header_sticky = eff.settings.site_header_sticky; render(); }
  });

  Promise.all([
    fetch("/en/api/v1/site-profile/settings", { credentials: "same-origin" }).then(function (r) { return r.json(); }),
    window.LummetConfig ? window.LummetConfig.ready : Promise.resolve(null)
  ]).then(function (a) {
    var j = a[0], cs = a[1];
    groups = j.groups || []; values = j.values || {}; saved = JSON.parse(JSON.stringify(values));
    // Show the draft's changed values on top of what is live.
    if (cs && cs.ready && cs.draft) Object.keys(cs.draft.effective.settings).forEach(function (k) { values[k] = cs.draft.effective.settings[k]; });
    var h = (location.hash || "").replace("#look-", ""); current = groupById(h) ? h : groups[0] && groups[0].id; render();
    if (groupById(h)) host.scrollIntoView();
  }).catch(function () { $("lookMsg").textContent = "Could not load the look-and-feel settings."; });
})();
