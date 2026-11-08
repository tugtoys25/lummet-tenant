/* Live banners admin: tabs (#live in the URL), editor lifecycle, save / publish / pause / duplicate. */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin, el = LB.el;
  var KEYS = ["id", "name", "status", "template_key", "placement_mode", "anchor", "offset_x", "offset_y", "z_tier", "priority", "width", "height", "style", "motion", "trigger", "frequency", "targeting", "content", "dismissible", "start_at", "end_at", "items"];

  function blank() {
    return { name: "", status: "draft", template_key: "promo_card", placement_mode: "floating", anchor: "bottom-right", offset_x: 16, offset_y: 16, z_tier: 1, priority: 100, width: { preset: "m" }, height: {},
      style: { radius: 12, shadow: true, opacity: 1, font_scale: 1, scheme: "auto", max_per_anchor: 3 }, motion: { entrance: "slide-up", loop: "none", delay_ms: 0 }, trigger: { type: "delay", seconds: 3, scroll: 50 },
      frequency: { type: "session", days: 7 }, targeting: { countries_mode: "include", countries: [], devices: ["desktop", "tablet", "mobile"], pages_mode: "include", page_types: [], slugs: [], auth: "any" },
      content: { headline: "", text: "", cta_label: "", link: "", new_tab: false, image: "", alt: "", disclaimer: "", messages: [], chips: [], rows: [] }, dismissible: true, start_at: null, end_at: null, items: [] };
  }
  LB.payload = function () { var o = {}, d = LB.state.draft; KEYS.forEach(function (k) { if (d[k] !== undefined && d[k] !== "") o[k] = JSON.parse(JSON.stringify(d[k])); }); if (!d.start_at) o.start_at = null; if (!d.end_at) o.end_at = null; return o; };

  function visibility() {
    var key = LB.get("template_key"), allowed = LB.TPL_FIELDS[key] || [];
    document.querySelectorAll("#lbEditorForm [data-f]").forEach(function (n) { var f = n.getAttribute("data-f"); n.hidden = !(f === "" || f === "*" || allowed.indexOf(f) >= 0); });
  }
  LB.changed = function () { LB.refreshPreview(); };
  LB.onChange = function (path) {
    if (path === "template_key") { var t = LB.state.templates.filter(function (x) { return x.key === LB.get("template_key"); })[0]; if (t) { LB.state.draft.items = []; LB.rebuild(); } }
    if (path === "placement_mode") { var m = LB.get("placement_mode"), first = { floating: "bottom-right", edge: "right", bar: "top", inline: "after_header" }[m]; LB.set("anchor", first); LB.rebuild(); return; }
    visibility(); LB.refreshPreview();
  };
  LB.rebuild = function () {
    var host = document.getElementById("lbSections"); if (!host) return;
    var open = Array.prototype.map.call(host.querySelectorAll("details"), function (d) { return d.open; });
    host.textContent = "";
    LB.buildSections().forEach(function (d, i) { if (open[i]) d.open = true; host.appendChild(d); });
    visibility(); LB.refreshPreview();
  };

  function show(editor) { document.getElementById("lbListView").hidden = editor; document.getElementById("lbEditorView").hidden = !editor; LB.say(""); }
  LB.openEditor = function (draft, id) {
    LB.state.draft = draft; LB.state.editingId = id || null;
    document.getElementById("lbEditorTitle").textContent = id ? "Edit banner" : "New banner";
    document.getElementById("lbPreviewHost").textContent = ""; document.getElementById("lbPreviewHost").appendChild(LB.buildPreview());
    LB.rebuild(); show(true);
  };
  LB.edit = function (id) {
    LB.api("/en/api/v1/live-banner/get?id=" + id).then(function (d) {
      if (!d.success) { LB.say(d.error || "Could not load", true); return; }
      var b = d.banner; b.items = b.items || []; LB.openEditor(Object.assign(blank(), b), id);
    });
  };

  function precheck() {
    var d = LB.state.draft, errs = [], t = LB.state.templates.filter(function (x) { return x.key === d.template_key; })[0] || { required: [] };
    if (!String(d.name || "").trim()) errs.push("Give the banner a name.");
    (t.required || []).forEach(function (r) { var v = d.content[r]; if (!v || (Array.isArray(v) && !v.length)) errs.push("Fill in: " + r.replace(/_/g, " ") + "."); });
    if (t.maxItems && !(d.items || []).length) errs.push("Pick at least one item.");
    return errs;
  }
  function save(status) {
    var errs = precheck(); if (errs.length) { LB.say(errs.join(" "), true); return Promise.resolve(false); }
    LB.state.draft.status = status; var id = LB.state.editingId;
    return LB.api("/en/api/v1/live-banner/" + (id ? "update" : "create"), LB.payload()).then(function (d) {
      if (!d.success) { LB.say(d.error || "Not saved", true); return false; }
      LB.state.editingId = d.id || id; LB.state.draft.id = LB.state.editingId; document.getElementById("lbEditorTitle").textContent = "Edit banner"; return true;
    });
  }

  LB.hideTab = function () { var t = document.querySelector('[data-lb-tab="live"]'); if (t) t.hidden = true; select("site"); };
  function select(name) {
    document.querySelectorAll("[data-lb-tab]").forEach(function (b) { var on = b.getAttribute("data-lb-tab") === name; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll("[data-lb-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-lb-panel") !== name; });
    if (name === "live") { if (location.hash !== "#live") history.replaceState(null, "", "#live"); LB.loadList(); } else if (location.hash === "#live") history.replaceState(null, "", location.pathname + location.search);
  }

  function init() {
    var tabs = document.querySelector("[data-lb-tablist]"); if (!tabs) return;
    tabs.addEventListener("click", function (e) { var b = e.target.closest("[data-lb-tab]"); if (b) select(b.getAttribute("data-lb-tab")); });
    tabs.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { var all = Array.prototype.filter.call(tabs.querySelectorAll("[data-lb-tab]"), function (x) { return !x.hidden; }), i = all.indexOf(document.activeElement); if (i >= 0) { var n = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length]; n.focus(); select(n.getAttribute("data-lb-tab")); } } });
    LB.api("/en/api/v1/live-banners/templates").then(function (d) {
      if (d.__status === 403 || d.__status === 401) { LB.hideTab(); return; }
      LB.state.templates = d.templates || []; if (location.hash === "#live") select("live");
    });
    document.getElementById("lbEditorForm").addEventListener("submit", function (e) { e.preventDefault(); });
    document.getElementById("lbNew").addEventListener("click", function () { LB.openEditor(blank(), null); });
    document.getElementById("lbBack").addEventListener("click", function () { show(false); LB.loadList(); });
    document.getElementById("lbSaveDraft").addEventListener("click", function () { save("draft").then(function (ok) { if (ok) LB.say("Draft saved."); }); });
    document.getElementById("lbPublish").addEventListener("click", function () { save("live").then(function (ok) { if (ok) LB.say("Published. It is on the site now."); }); });
    document.getElementById("lbPause").addEventListener("click", function () { var id = LB.state.editingId; if (!id) { LB.say("Save the banner first.", true); return; } LB.api("/en/api/v1/live-banner/pause", { id: id }).then(function (d) { LB.say(d.success ? "Paused." : (d.error || "Failed"), !d.success); }); });
    document.getElementById("lbDuplicate").addEventListener("click", function () { var id = LB.state.editingId; if (!id) { LB.say("Save the banner first.", true); return; } LB.api("/en/api/v1/live-banner/duplicate", { id: id }).then(function (d) { if (d.success) { LB.edit(d.id); LB.say("Duplicated as a draft."); } else LB.say(d.error || "Failed", true); }); });
    window.addEventListener("hashchange", function () { select(location.hash === "#live" ? "live" : "site"); });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
