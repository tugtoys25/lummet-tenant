// Dashboard > Design Studio. Libraries 2-5: themes, headers, heroes, sections & shapes. Separate from Configuration > Design (Library 1).
// DOM-only (no innerHTML). Previews are rendered by the server (/api/v1/design-studio/preview) into sandboxed iframes, so what you
// preview is the same markup and CSS the published site uses. Nothing is saved until "Apply to my site".
(function () {
  var root = document.querySelector(".ds-admin"); if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var API = "/en/api/v1/design-studio";
  var catalog = null, view = "themes", state = { mode: "theme", theme: "", header: "", hero: "", sections: {}, shapes: [], overrides: {} }, saved = null, device = "desktop", seq = 0, timer = 0;
  var VIEWS = { themes: "Premium Website Themes", headers: "Header Studio", heroes: "Hero Studio", sections: "Section & Shape Studio" };

  function el(tag, props, kids) { var n = document.createElement(tag); Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else if (k === "data") Object.keys(props[k]).forEach(function (d) { n.setAttribute("data-" + d, props[k][d]); }); else n[k] = props[k]; }); (kids || []).forEach(function (c) { if (c) n.appendChild(c); }); return n; }
  function status(t, bad) { var s = $("dsaStatus"); s.textContent = t || ""; s.style.color = bad ? "#b91c1c" : ""; }
  function call(path, method, body) { return fetch(API + path, { method: method || "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || b.message || ("Error " + r.status)); return b; }); }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function selection() { var s = { mode: state.mode, sections: state.sections, shapes: state.shapes, overrides: clean(state.overrides) }; if (state.theme) s.theme = state.theme; if (state.header) s.header = state.header; if (state.hero) s.hero = state.hero; return s; }
  function clean(o) { var r = {}; Object.keys(o).forEach(function (k) { if (o[k] !== "" && o[k] != null) r[k] = o[k]; }); return r; }
  function dirty() { return JSON.stringify(selection()) !== JSON.stringify(saved || {}); }

  // ---- thumbnails are fetched lazily and two at a time, so opening a library of 30 does not flood the server
  var queue = [], active = 0;
  function pump() { while (active < 2 && queue.length) { (function (job) { active++; call("/preview", "POST", { selection: job.sel }).then(function (r) { job.frame.srcdoc = r.html || ""; }).catch(function () {}).then(function () { active--; pump(); }); })(queue.shift()); } }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); queue.push(e.target._job); pump(); } }); }, { rootMargin: "200px" }) : null;
  function thumb(sel) { var f = el("iframe", { title: "", tabIndex: -1, loading: "lazy" }); f.setAttribute("sandbox", ""); f.setAttribute("aria-hidden", "true"); var box = el("div", { className: "dsa-thumb" }, [f]); f._job = box._job = { sel: sel, frame: f }; if (io) io.observe(box); else { queue.push(f._job); pump(); } box._observe = true; return box; }

  // ---- items for the shown library
  function items() {
    if (view === "themes") return catalog.themes.map(function (t) { return { id: t.id, name: t.name, group: t.category, desc: t.desc, featured: t.featured, popular: t.popular, added: t.added, pick: { theme: t.id }, sel: { mode: "theme", theme: t.id }, selected: state.theme === t.id }; });
    if (view === "headers") return catalog.headers.map(function (h) { return { id: h.id, name: h.name, group: h.group, desc: h.desc, pick: { header: h.id }, sel: { mode: "components", header: h.id, theme: state.theme || undefined, sections: {} }, selected: state.header === h.id }; });
    if (view === "heroes") return catalog.heroes.map(function (h) { return { id: h.id, name: h.name, group: h.group, desc: h.desc, pick: { hero: h.id }, sel: { mode: "components", hero: h.id, theme: state.theme || undefined, sections: {} }, selected: state.hero === h.id }; });
    var out = [];
    catalog.sections.forEach(function (t) { t.variants.forEach(function (v) { var s = {}; s[t.id] = v.id; out.push({ id: t.id + ":" + v.id, name: t.name + " - " + v.name, group: t.name, desc: t.desc, pick: { section: [t.id, v.id] }, sel: { mode: "components", theme: state.theme || undefined, sections: s }, selected: state.sections[t.id] === v.id }); }); });
    catalog.shapes.forEach(function (sh) { out.push({ id: "shape:" + sh.id, name: sh.name, group: "Shapes: " + sh.group, desc: "Reusable decorative shape.", pick: { shape: sh.id }, sel: { mode: "components", sections: {}, shapes: [sh.id] }, selected: state.shapes.indexOf(sh.id) >= 0 }); });
    return out;
  }
  function choose(it) {
    var p = it.pick;
    if (p.theme) { state.theme = p.theme; if (state.mode === "theme") { state.header = ""; state.hero = ""; state.sections = {}; state.shapes = []; } }
    if (p.header) { state.header = p.header; if (!state.theme) state.mode = "components"; }
    if (p.hero) { state.hero = p.hero; if (!state.theme) state.mode = "components"; }
    if (p.section) { if (state.sections[p.section[0]] === p.section[1]) delete state.sections[p.section[0]]; else state.sections[p.section[0]] = p.section[1]; }
    if (p.shape) { var i = state.shapes.indexOf(p.shape); if (i >= 0) state.shapes.splice(i, 1); else if (state.shapes.length < 6) state.shapes.push(p.shape); }
    syncMode(); render(); preview();
  }
  function syncMode() { Array.prototype.forEach.call(document.getElementsByName("dsaMode"), function (r) { r.checked = r.value === state.mode; }); }

  // ---- library grid
  function render() {
    var q = $("dsaSearch").value.trim().toLowerCase(), f = $("dsaFilter").value, sort = $("dsaSort").value, grid = $("dsaGrid");
    $("dsaViewTitle").textContent = VIEWS[view];
    var list = items().filter(function (i) { return (!q || (i.name + " " + i.group + " " + i.desc).toLowerCase().indexOf(q) >= 0) && (!f || i.group === f) && (sort !== "featured" || i.featured) && (sort !== "popular" || i.popular); });
    if (sort === "new") list = list.filter(function (i) { return i.added; });
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    if (!list.length) grid.appendChild(el("p", { className: "muted", text: "No designs match. Clear the search or filter." }));
    list.forEach(function (it) {
      var b = el("div", { className: "dsa-badges" }); if (it.featured) b.appendChild(el("span", { text: "Featured" })); if (it.popular) b.appendChild(el("span", { text: "Popular" })); if (it.selected) b.appendChild(el("span", { className: "is-selected", text: "Selected" }));
      var pv = el("button", { type: "button", className: "btn btn--ghost btn--sm", text: "Preview" }); pv.addEventListener("click", function () { previewOnly(it); });
      var ap = el("button", { type: "button", className: "btn btn--sm", text: it.selected ? "Selected" : (view === "sections" ? "Use" : "Select") }); ap.setAttribute("aria-pressed", it.selected ? "true" : "false"); ap.addEventListener("click", function () { choose(it); });
      var card = el("article", { className: "dsa-card", data: { selected: it.selected ? "true" : "false" } }, [thumb(it.sel), el("div", { className: "dsa-card-body" }, [el("h3", { text: it.name }), el("div", { className: "dsa-meta", text: it.group }), b, el("p", { className: "dsa-meta", text: it.desc }), el("div", { className: "dsa-card-actions" }, [pv, ap])])]);
      grid.appendChild(card);
    });
  }
  function fillFilter() {
    var f = $("dsaFilter"), groups = {}; while (f.firstChild) f.removeChild(f.firstChild); f.appendChild(el("option", { value: "", text: "All categories" }));
    items().forEach(function (i) { groups[i.group] = 1; }); Object.keys(groups).forEach(function (g) { f.appendChild(el("option", { value: g, text: g })); });
  }

  // ---- big preview: the server renders the document; the iframe is sandboxed with no scripts
  function showDoc(sel) { var n = ++seq; call("/preview", "POST", { selection: sel }).then(function (r) { if (n === seq) $("dsaPreview").srcdoc = r.html || ""; }).catch(function (e) { status(e.message, true); }); }
  function previewOnly(it) { showDoc(it.sel); $("dsaSummary").textContent = "Previewing " + it.name + ". Press Select to choose it."; }
  function preview() { clearTimeout(timer); timer = setTimeout(function () { var s = selection(); if (!s.theme && !s.header && !s.hero && !Object.keys(s.sections).length && !s.shapes.length) { $("dsaPreview").srcdoc = ""; summary(); return; } showDoc(s); summary(); }, 150); }
  function summary() {
    var parts = []; if (state.theme) parts.push("Theme: " + (catalog.themes.filter(function (t) { return t.id === state.theme; })[0] || {}).name);
    if (state.header) parts.push("Header: " + (catalog.headers.filter(function (h) { return h.id === state.header; })[0] || {}).name); if (state.hero) parts.push("Hero: " + (catalog.heroes.filter(function (h) { return h.id === state.hero; })[0] || {}).name);
    var n = Object.keys(state.sections).length; if (n) parts.push(n + " section style" + (n > 1 ? "s" : "")); if (state.shapes.length) parts.push(state.shapes.length + " shape" + (state.shapes.length > 1 ? "s" : ""));
    $("dsaSummary").textContent = parts.length ? parts.join(" | ") : "Choose a design to preview it."; $("dsaApply").disabled = !parts.length || !dirty();
  }

  // ---- customise panel (colours, radius, heights, fonts, buttons): validated again on the server
  var FIELDS = [["primary", "Brand colour", "color"], ["accent", "Accent colour", "color"], ["bg", "Page background", "color"], ["surface", "Surface", "color"], ["fg", "Text colour", "color"], ["border", "Borders", "color"],
    ["radius", "Corner radius (0-48)", "number", 0, 48], ["headerHeight", "Header height (48-140)", "number", 48, 140], ["heroOverlay", "Overlay strength (0-85)", "number", 0, 85], ["width", "Content width (900-1440)", "number", 900, 1440], ["sectionSpacing", "Section spacing (24-160)", "number", 24, 160],
    ["fontHeading", "Heading font", "select", ["system", "modern", "rounded", "serif", "elegant", "display", "mono"]], ["fontBody", "Body font", "select", ["system", "modern", "rounded", "serif", "elegant", "mono"]], ["button", "Button shape", "select", ["square", "rounded", "pill"]], ["align", "Text alignment", "select", ["left", "center", "right"]]];
  function buildCustom() {
    var box = $("dsaCustom");
    FIELDS.forEach(function (f) {
      var inp; if (f[2] === "select") { inp = el("select", { id: "dsaf_" + f[0] }); inp.appendChild(el("option", { value: "", text: "From theme" })); f[3].forEach(function (o) { inp.appendChild(el("option", { value: o, text: o })); }); }
      else { inp = el("input", { id: "dsaf_" + f[0], type: f[2] === "color" ? "text" : "number", placeholder: f[2] === "color" ? "#rrggbb (blank = theme)" : "From theme" }); if (f[2] === "number") { inp.min = f[3]; inp.max = f[4]; } if (f[2] === "color") inp.maxLength = 7; }
      inp.addEventListener("input", function () { var v = inp.value.trim(); if (f[2] === "color" && v && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) { status("Use a colour like #1d4ed8.", true); return; } status(""); if (v === "") delete state.overrides[f[0]]; else state.overrides[f[0]] = f[2] === "number" ? Number(v) : v; preview(); });
      box.appendChild(el("label", { htmlFor: "dsaf_" + f[0], text: f[1] }, [inp]));
    });
  }
  function loadCustom() { FIELDS.forEach(function (f) { var i = $("dsaf_" + f[0]); if (i) i.value = state.overrides[f[0]] != null ? state.overrides[f[0]] : ""; }); }

  // ---- actions
  function load(sel) { state = { mode: (sel && sel.mode) || "theme", theme: (sel && sel.theme) || "", header: (sel && sel.header) || "", hero: (sel && sel.hero) || "", sections: (sel && sel.sections) ? clone(sel.sections) : {}, shapes: (sel && sel.shapes) ? sel.shapes.slice() : [], overrides: (sel && sel.overrides) ? clone(sel.overrides) : {} }; saved = sel ? selection() : null; syncMode(); loadCustom(); }
  function refresh() { return call("").then(function (c) { catalog = c; $("dsaRestore").hidden = !c.hasPrevious; $("dsaReset").hidden = !c.selection; load(c.selection); fillFilter(); render(); preview(); }); }
  function apply() { var b = $("dsaApply"); b.disabled = true; status("Applying..."); call("/apply", "POST", { selection: selection() }).then(function () { status("Applied. Your site now uses this design. Use Return to previous to undo."); return refresh(); }).catch(function (e) { status(e.message, true); b.disabled = false; }); }
  function setView(v) { view = v; Array.prototype.forEach.call($("dsaTabs").querySelectorAll("[data-dsa-view]"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-dsa-view") === v ? "true" : "false"); }); $("dsaSearch").value = ""; $("dsaSort").value = ""; $("dsaSort").hidden = v !== "themes"; fillFilter(); render(); if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v); }

  Array.prototype.forEach.call($("dsaTabs").querySelectorAll("[data-dsa-view]"), function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-dsa-view")); }); });
  ["dsaSearch", "dsaFilter", "dsaSort"].forEach(function (id) { $(id).addEventListener("input", render); });
  Array.prototype.forEach.call(document.getElementsByName("dsaMode"), function (r) { r.addEventListener("change", function () { state.mode = r.value; preview(); }); });
  Array.prototype.forEach.call(root.querySelectorAll("[data-dsa-device]"), function (b) { b.addEventListener("click", function () { device = b.getAttribute("data-dsa-device"); $("dsaFrameWrap").setAttribute("data-device", device); Array.prototype.forEach.call(root.querySelectorAll("[data-dsa-device]"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); }); });
  $("dsaApply").addEventListener("click", apply);
  $("dsaCancel").addEventListener("click", function () { load(catalog && catalog.selection); render(); preview(); status("Changes discarded."); });
  $("dsaRestore").addEventListener("click", function () { call("/restore", "POST").then(function () { status("Returned to your previous design."); return refresh(); }).catch(function (e) { status(e.message, true); }); });
  $("dsaReset").addEventListener("click", function () { if (!window.confirm("Stop using the Studio design? Your site goes back to the design in Configuration > Design.")) return; call("/reset", "POST").then(function () { status("Studio design removed."); return refresh(); }).catch(function (e) { status(e.message, true); }); });
  window.addEventListener("beforeunload", function (e) { if (catalog && dirty() && !$("dsaApply").disabled) { e.preventDefault(); e.returnValue = ""; } });

  buildCustom();
  refresh().then(function () { var h = location.hash.replace("#", ""); if (VIEWS[h]) setView(h); }).catch(function (e) { status("Could not load the Design Studio: " + e.message, true); });
})();
