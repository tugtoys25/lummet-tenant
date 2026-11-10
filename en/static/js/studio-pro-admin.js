// Design Studio admin (Libraries 2-5): gallery filters, live preview dialog, customise panel, Apply / Cancel / Return to previous.
// Preview HTML comes from the server renderer that the public site also uses, shown in a script-less sandboxed iframe.
(function () {
  "use strict";
  var API = "/en/api/v1/studio-pro";
  var root = document.querySelector(".dsp-admin");
  if (!root) return;
  var lib = root.getAttribute("data-dsp-lib");
  var $ = function (s, c) { return (c || root).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || root).querySelectorAll(s)); };
  var applied = { mode: "off", theme: "", header: "", hero: "", sections: null, custom: {} };
  var hasPrev = false, working = null, timer = null, order = [];
  var FONTS = ["default", "system", "modern", "rounded", "serif", "elegant", "display", "mono"];

  $$(".dsp-sub a[data-lib]").forEach(function (a) { if (a.getAttribute("data-lib") === lib) a.setAttribute("aria-current", "page"); });

  function api(path, body) {
    return fetch(API + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); });
  }
  function say(t) { var m = $("#dsMsg"); if (m) m.textContent = t || ""; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---- current design bar + selected markers
  function label(kind, id) { var el = $('.dsp-card[data-kind="' + kind + '"][data-id="' + id + '"] h3'); return el ? el.textContent : id; }
  function renderCurrent() {
    var c = $("#dsCurrent"), a = applied;
    if (a.mode === "off") c.innerHTML = "Studio is <strong>off</strong>. Your site uses the existing Design and Templates settings.";
    else c.innerHTML = "Studio is <strong>on</strong> (" + (a.mode === "theme" ? "complete theme" : "individual components") + "). " + (a.theme ? "Theme: " + a.theme + ". " : "") + (a.header ? "Header: " + a.header + ". " : "") + (a.hero ? "Hero: " + a.hero + "." : "");
    if (a.mode !== "off") { var off = document.createElement("button"); off.type = "button"; off.className = "btn btn--sm"; off.textContent = "Turn studio off"; off.onclick = function () { if (confirm("Return to your existing Design settings?")) api("/off", {}).then(function (r) { say(r.ok ? "" : (r.body.error || "Could not turn off.")); load(); }); }; c.appendChild(off); }
    if (hasPrev) { var rv = document.createElement("button"); rv.type = "button"; rv.className = "btn btn--sm"; rv.textContent = "Return to previous design"; rv.onclick = function () { if (confirm("Restore the design you had before the last change?")) api("/revert", {}).then(load); }; c.appendChild(rv); }
    $$(".dsp-card").forEach(function (card) {
      var k = card.getAttribute("data-kind"), id = card.getAttribute("data-id");
      var on = (k === "theme" && a.mode === "theme" && a.theme === id) || (k === "header" && a.header === id) || (k === "hero" && a.hero === id);
      card.classList.toggle("is-selected", on); var s = $(".dsp-selected", card); if (s) s.hidden = !on;
    });
  }
  function load() { return api("/state").then(function (r) { if (r.ok && r.body.state) { applied = r.body.state; hasPrev = !!r.body.hasPrevious; order = (applied.sections || []).map(function (x) { return x.slice(); }); renderCurrent(); renderOrder(); } else $("#dsCurrent").textContent = "Could not load the current design."; }); }

  // ---- gallery filters
  function filter() {
    var q = ($("#dsSearch") || {}).value || "", cat = ($("#dsCat") || {}).value || "", st = ($("#dsStyle") || {}).value || "", so = ($("#dsSort") || {}).value || "";
    q = q.toLowerCase();
    $$(".dsp-card").forEach(function (c) {
      var ok = (!q || (c.getAttribute("data-search") || "").indexOf(q) > -1) && (!cat || c.getAttribute("data-category") === cat) && (!st || c.getAttribute("data-style") === st);
      if (so === "featured") ok = ok && c.getAttribute("data-featured") === "1";
      if (so === "popular") ok = ok && c.getAttribute("data-popular") === "1";
      if (so === "new") ok = ok && Number(c.getAttribute("data-added")) >= 15;
      if (so === "recommended") ok = ok && (c.getAttribute("data-featured") === "1" || c.getAttribute("data-popular") === "1");
      c.hidden = !ok;
    });
  }
  ["#dsSearch", "#dsCat", "#dsStyle", "#dsSort"].forEach(function (s) { var e = $(s); if (e) e.addEventListener("input", filter); });

  // ---- preview dialog
  function openDialog(state, title) {
    working = state; $("#dsModalTitle").textContent = title; say(""); $("#dsModal").hidden = false; buildPanel(); refresh(); $("#dsApply").focus();
  }
  function closeDialog() { $("#dsModal").hidden = true; working = null; }
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      api("/preview", working).then(function (r) { if (r.ok && r.body.html) $("#dsFrame").srcdoc = r.body.html; else say(r.body.error || "Preview failed."); });
    }, 180);
  }
  $$(".dsp-dev button").forEach(function (b) { b.addEventListener("click", function () { $$(".dsp-dev button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); }); b.setAttribute("aria-pressed", "true"); $("#dsFrame").setAttribute("data-dev", b.getAttribute("data-dev")); }); });
  $("#dsCancel").addEventListener("click", closeDialog);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#dsModal").hidden) closeDialog(); });
  $("#dsApply").addEventListener("click", function () {
    if (!working) return; var btn = this; btn.disabled = true; say("Applying...");
    api("/apply", working).then(function (r) { btn.disabled = false; if (r.ok) { say("Applied. Your site now uses this design."); load().then(function () { setTimeout(closeDialog, 700); }); } else say(r.body.error || "Could not apply."); });
  });

  // ---- customise panel (accordions)
  function ctl(key, text, type, extra) {
    var v = working.custom[key]; var id = "dsc_" + key;
    var opts = extra && extra.options ? extra.options.map(function (o) { return '<option value="' + o + '"' + (String(v) === o ? " selected" : "") + ">" + o + "</option>"; }).join("") : "";
    if (type === "range") return '<label for="' + id + '">' + text + ' <output>' + (v == null ? extra.def : v) + '</output><input id="' + id + '" type="range" data-k="' + key + '" min="' + extra.min + '" max="' + extra.max + '" step="' + (extra.step || 1) + '" value="' + (v == null ? extra.def : v) + '"></label>';
    if (type === "color") return '<label for="' + id + '">' + text + '<input id="' + id + '" type="color" data-k="' + key + '" value="' + (v || extra.def) + '"></label>';
    return '<label for="' + id + '">' + text + '<select id="' + id + '" data-k="' + key + '"><option value="">Theme default</option>' + opts + "</select></label>";
  }
  var TEXTS = [["t_name", "Site name", 60], ["t_tagline", "Tagline", 120], ["t_badge", "Small label above the title", 60], ["t_title", "Main title", 140], ["t_sub", "Sub-title", 320], ["t_cta", "Main button text", 40], ["t_cta2", "Second button text", 40]];
  function txt(t) { var v = String(working.custom[t[0]] || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); return '<label for="dsc_' + t[0] + '">' + t[1] + '<input id="dsc_' + t[0] + '" type="text" maxlength="' + t[2] + '" data-k="' + t[0] + '" value="' + v + '" placeholder="Leave empty to use the theme wording"></label>'; }
  function buildPanel() {
    var p = $("#dsPanel");
    p.innerHTML = '<details open><summary>Text (edit the wording)</summary>' + TEXTS.map(txt).join('') + '</details>' +
      '<details><summary>Colours</summary>' + ctl("p", "Primary", "color", { def: "#2563eb" }) + ctl("p2", "Secondary", "color", { def: "#0ea5e9" }) + ctl("bg", "Background", "color", { def: "#ffffff" }) + '<button type="button" class="btn btn--sm" data-reset="colors">Reset colours</button></details>' +
      '<details><summary>Layout</summary>' + ctl("hh", "Header height", "range", { min: 40, max: 140, def: 68 }) + ctl("heroH", "Hero height", "range", { min: 320, max: 900, step: 10, def: 520 }) + ctl("sp", "Section spacing", "range", { min: 24, max: 140, def: 72 }) + ctl("w", "Content width", "range", { min: 960, max: 1440, step: 20, def: 1180 }) + ctl("align", "Text alignment", "select", { options: ["left", "center", "right"] }) + '</details>' +
      '<details><summary>Typography</summary>' + ctl("hf", "Heading font", "select", { options: FONTS }) + ctl("bf", "Body font", "select", { options: FONTS }) + ctl("fs", "Font size %", "range", { min: 85, max: 125, def: 100 }) + '</details>' +
      '<details><summary>Shapes and effects</summary>' + ctl("br", "Button radius", "range", { min: 0, max: 40, def: 8 }) + ctl("cr", "Card radius", "range", { min: 0, max: 40, def: 12 }) + ctl("shadow", "Shadow", "select", { options: ["none", "soft", "deep"] }) + ctl("ov", "Image overlay %", "range", { min: 0, max: 90, def: 70 }) + '</details>' +
      '<details><summary>Hero picture</summary><label for="dsc_image">Picture address (https:// or /media/...)<input id="dsc_image" type="text" data-k="image" value="' + (working.custom.image || "").replace(/"/g, "&quot;") + '" placeholder="Leave empty to use the built-in artwork"></label></details>';
    $$("[data-k]", p).forEach(function (el) {
      el.addEventListener("input", function () {
        var k = el.getAttribute("data-k"), v = el.value; if (el.type === "range") { var o = el.parentNode.querySelector("output"); if (o) o.textContent = v; v = Number(v); }
        if (v === "") delete working.custom[k]; else working.custom[k] = v; refresh();
      });
    });
    var rs = $('[data-reset="colors"]', p); if (rs) rs.onclick = function () { ["p", "p2", "bg"].forEach(function (k) { delete working.custom[k]; }); buildPanel(); refresh(); };
  }

  // ---- card actions
  function base() { return { mode: applied.mode === "off" ? "components" : applied.mode, theme: applied.theme, header: applied.header, hero: applied.hero, sections: applied.sections, custom: clone(applied.custom || {}) }; }
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ds]"); if (!b) return; var card = b.closest(".dsp-card") || b; var kind = card.getAttribute("data-kind") || b.getAttribute("data-ds"), id = card.getAttribute("data-id"), act = b.getAttribute("data-ds");
    var s;
    if (act === "preview" || act === "apply") {
      if (kind === "theme") s = { mode: "theme", theme: id, header: "", hero: "", sections: null, custom: {} };
      else { s = base(); s.mode = "components"; if (!s.theme) s.theme = "dsp-corporate"; if (kind === "header") s.header = id; if (kind === "hero") s.hero = id; }
      openDialog(s, (card.querySelector("h3") || {}).textContent || "Preview");
      if (act === "apply") say("Check the preview, then press Apply to my site.");
    } else if (act === "add-section") {
      var pr = id.split(":"); order.push([pr[0], pr[1]]); renderOrder();
    } else if (act === "shape" || act === "surface") {
      s = base(); s.custom[act] = id; if (!s.theme) s.theme = "dsp-saas"; openDialog(s, "Shape / surface");
    }
  });
  function renderOrder() {
    var ol = $("#dsOrder"); if (!ol) return; ol.innerHTML = ""; ol.className = "dsp-order";
    order.forEach(function (row, i) {
      var li = document.createElement("li"); li.textContent = row[0] + " (" + row[1] + ")";
      [["Up", -1], ["Down", 1], ["Remove", 0]].forEach(function (a) { var x = document.createElement("button"); x.type = "button"; x.className = "btn btn--sm"; x.textContent = a[0]; x.onclick = function () { if (a[1] === 0) order.splice(i, 1); else { var j = i + a[1]; if (j < 0 || j >= order.length) return; var t = order[i]; order[i] = order[j]; order[j] = t; } renderOrder(); }; li.appendChild(x); });
      ol.appendChild(li);
    });
    var host = $("#dsSecList"); var go = $("#dsOrderGo");
    if (!go && host) { go = document.createElement("button"); go.id = "dsOrderGo"; go.type = "button"; go.className = "btn btn--primary"; go.textContent = "Preview this layout"; go.onclick = function () { var s = base(); s.mode = "components"; if (!s.theme) s.theme = "dsp-saas"; s.sections = order.map(function (x) { return x.slice(); }); openDialog(s, "Homepage section layout"); }; host.appendChild(go); }
  }
  load();
})();
