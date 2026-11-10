// Dashboard > Configuration > Look and feel (Phase 5; autosaves to the draft since Phase 6).
// Renders every settings group from /en/api/v1/site-profile/settings, so a new setting added to the
// manifest on the server shows up here with no change to this file.
(function () {
  // Starts when its tab first opens (immediately if the tabs script is missing or the tab is already showing).
  var T = window.LummetConfigTabs;
  if (T && T.onFirstOpen) T.onFirstOpen("design", boot); else boot();
  function boot() {
  var host = document.getElementById("lookRoot");
  if (!host) return;
  var groups = [], values = {}, saved = {}, current = null, designs = [], templates = [];
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
    var lastSection = null;
    g.fields.forEach(function (f) {
      if (f.section && f.section !== lastSection) { lastSection = f.section; form.appendChild(el("h3", { className: "cfg-section", text: f.section })); }
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

  // ---- Ready-made designs (the look) and templates (the page layout): one tap replaces a whole tested set of values.
  var KIND = {
    designs: { noun: "design", what: "colours, fonts and shapes", tweak: "Want to tweak a design afterwards? Open the Colours and Fonts tabs and change anything you like." },
    templates: { noun: "template", what: "casino list layout, sidebar position and page width", tweak: "Want to tweak a template afterwards? Open the Layout tab and change anything you like." }
  };

  function sameDesign(d) { return Object.keys(d.settings).every(function (k) { return String(values[k] == null ? "" : values[k]) === String(d.settings[k]); }); }

  function applyDesign(d, kind) {
    var K = KIND[kind];
    if (!window.confirm("Apply \u201C" + d.label + "\u201D? This replaces your current " + K.what + ". Your logo, texts and pages are not changed. You can undo it from History.")) return;
    var s = d.settings, msg = $("lookMsg");
    if (draftMode()) {
      Object.keys(s).forEach(function (k) { values[k] = s[k]; });
      window.LummetConfig.queueSettings(s);
      msg.textContent = "\u201C" + d.label + "\u201D is in your draft. Publish it from the bar at the top.";
      render(); return;
    }
    msg.textContent = "Applying\u2026";
    fetch("/en/api/v1/site-profile/settings", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { msg.textContent = (x.j && (x.j.error || x.j.message)) || "Could not apply the " + K.noun + ". Nothing was changed."; return; }
        Object.keys(s).forEach(function (k) { values[k] = s[k]; saved[k] = s[k]; });
        msg.textContent = "\u201C" + d.label + "\u201D is applied. Your site shows it within a minute."; render();
      })
      .catch(function () { msg.textContent = "Network error. Nothing was changed."; });
  }

  function box(css) { var b = el("div"); b.style.cssText = css; return b; }

  // A small wireframe of the page: casino list as cards, rows or compact rows, with the sidebar left, right or below.
  function layoutPreview(s) {
    var wrap = box("border-radius:8px;padding:8px;margin-bottom:10px;background:#f1f5f9;border:1px solid #cbd5e1");
    var widthPct = { "1080px": 76, "1200px": 88, "1440px": 100 }[s.theme_container_width] || 88;
    var page = box("margin:0 auto;display:flex;gap:6px;width:" + widthPct + "%;flex-direction:" + (s.theme_review_layout === "stacked" ? "column" : "row"));
    var main = box("flex:1;display:flex;flex-direction:column;gap:" + (s.theme_list_layout === "compact" ? 3 : 5) + "px;min-width:0");
    var list = s.theme_list_layout, n = list === "compact" ? 6 : list === "rows" ? 3 : 0;
    if (n) {
      for (var i = 0; i < n; i++) {
        var h = list === "compact" ? 9 : 20, row = box("height:" + h + "px;border-radius:3px;background:#fff;border:1px solid #94a3b8;display:flex;gap:4px;padding:2px");
        row.appendChild(box("width:" + (h - 6) + "px;border-radius:2px;background:#94a3b8")); row.appendChild(box("flex:1;border-radius:2px;background:#e2e8f0")); row.appendChild(box("width:16px;border-radius:2px;background:#475569"));
        main.appendChild(row);
      }
    } else {
      var grid = box("display:grid;grid-template-columns:repeat(3,1fr);gap:4px");
      for (var j = 0; j < 6; j++) grid.appendChild(box("height:22px;border-radius:3px;background:#fff;border:1px solid #94a3b8"));
      main.appendChild(grid);
    }
    var side = box((s.theme_review_layout === "stacked" ? "height:16px" : "width:22%;min-height:50px") + ";border-radius:3px;background:#cbd5e1");
    if (s.theme_review_layout === "left") page.appendChild(side);
    page.appendChild(main);
    if (s.theme_review_layout !== "left") page.appendChild(side);
    wrap.appendChild(page);
    return wrap;
  }

  // A small preview of the look: page colour, heading font, button shape, colour dots.
  function lookPreview(d) {
    var s = d.settings, body = FONTS[s.theme_font_body] || "inherit", head = FONTS[s.theme_font_heading] || "inherit";
    var pv = box("border-radius:8px;padding:14px;margin-bottom:10px;border:1px solid " + s.theme_border + ";background:" + s.theme_background + ";color:" + s.theme_text + ";font-family:" + body);
    var t = el("div", { text: d.label }); t.style.cssText = "font-weight:700;font-size:17px;margin-bottom:4px;font-family:" + head;
    var line = el("div", { text: "Expert reviews and bonuses" }); line.style.cssText = "font-size:12px;margin-bottom:10px;color:" + s.theme_text_muted;
    var row = box("display:flex;gap:6px;align-items:center");
    var radius = s.theme_button_style === "pill" ? "999px" : s.theme_button_style === "square" ? "0" : (s.theme_button_radius || "8px");
    var btn = el("span", { text: "Button" }); btn.style.cssText = "padding:5px 12px;font-size:12px;font-weight:600;background:" + s.theme_primary + ";color:" + s.theme_button_text + ";border-radius:" + radius;
    row.appendChild(btn);
    [s.theme_secondary, s.theme_accent, s.theme_surface].forEach(function (c) { row.appendChild(box("width:18px;height:18px;border-radius:50%;border:1px solid " + s.theme_border + ";background:" + c)); });
    pv.appendChild(t); pv.appendChild(line); pv.appendChild(row);
    return pv;
  }

  function packCard(d, kind) {
    var now = sameDesign(d), K = KIND[kind];
    var card = el("div", { className: "cfg-design" });
    card.style.cssText = "border:" + (now ? "2px solid #16a34a" : "1px solid #cbd5e1") + ";border-radius:12px;padding:12px;background:#fff;color:#0f172a";
    if (kind === "templates") {
      card.appendChild(layoutPreview(d.settings));
      var name = el("div", { text: d.label }); name.style.cssText = "font-weight:700;font-size:15px;margin:0 0 4px";
      card.appendChild(name);
    } else card.appendChild(lookPreview(d));
    var help = el("p", { text: d.help }); help.style.cssText = "font-size:13px;margin:0 0 10px;color:#475569";
    var go = el("button", { type: "button", text: now ? "Current " + K.noun : "Use this " + K.noun, disabled: now });
    go.onclick = function () { applyDesign(d, kind); };
    card.appendChild(help); card.appendChild(go);
    return card;
  }

  function renderPacks(g) {
    var form = $("lookForm"); form.textContent = "";
    form.appendChild(el("p", { className: "muted", text: g.help }));
    var kind = g.pack, list = kind === "templates" ? templates : designs;
    var grid = box("display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:12px");
    list.forEach(function (d) { grid.appendChild(packCard(d, kind)); });
    form.appendChild(grid);
    form.appendChild(el("p", { className: "muted", text: KIND[kind].tweak }));
  }

  function renderPreview() {
    var p = $("lookPreview"); if (!p) return;
    var v = function (k, d) { var x = values[k]; return x ? x : d; };
    var heading = FONTS[v("site_hero_heading_font", "default")] || FONTS[v("theme_font_heading", "default")] || "", body = FONTS[v("site_hero_body_font", "default")] || FONTS[v("theme_font_body", "default")] || "";
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
    var band = $("lookPvCard") && $("lookPvCard").parentNode; if (band && band !== p) band.style.background = v("theme_section_background", "");
    p.style.fontSize = ({ small: "93.75%", large: "106.25%" })[v("theme_font_size", "")] || "";
  }

  function renderSave() {
    var g = groupById(current), n = g ? dirtyKeys(g).length : 0;
    if (g && g.pack) { $("lookSave").hidden = true; return; }
    if (draftMode()) { $("lookSave").hidden = true; return; }
    $("lookSave").hidden = false; $("lookSave").disabled = !n; $("lookSave").textContent = n ? "Save " + n + " change" + (n === 1 ? "" : "s") : "No changes to save";
  }

  function render() { var g = groupById(current) || groups[0]; current = g.id; renderTabs(); if (g.pack) renderPacks(g); else renderForm(g); renderPreview(); renderSave(); }

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
    designs = j.designs || []; templates = j.templates || [];
    if (templates.length) groups.unshift({ id: "templates", pack: "templates", label: "Ready-made templates", help: "Pick a page layout: how the casino list and sidebar are arranged, and how wide the page is. Colours and fonts stay as they are. Your content is never changed.", available: true, fields: [], elsewhere: [], screen: "/en/dashboard/configuration#look-templates" });
    if (designs.length) groups.unshift({ id: "designs", pack: "designs", label: "Ready-made designs", help: "Pick a finished look. One tap sets colours, fonts and shapes together. Page layout stays as it is. Your content is never changed.", available: true, fields: [], elsewhere: [], screen: "/en/dashboard/configuration#look-designs" });
    // Show the draft's changed values on top of what is live.
    if (cs && cs.ready && cs.draft) Object.keys(cs.draft.effective.settings).forEach(function (k) { values[k] = cs.draft.effective.settings[k]; });
    var h = (location.hash || "").replace("#look-", ""); current = groupById(h) ? h : groups[0] && groups[0].id; render();
    if (groupById(h)) host.scrollIntoView();
  }).catch(function () { $("lookMsg").textContent = "Could not load the look-and-feel settings."; });
  }
})();
