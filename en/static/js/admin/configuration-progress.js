// Dashboard > Configuration > setup progress and tab badges.
// Uses only data the screen already loads: the profile, the setup check results, the welcome-panel state and the draft's
// list of changes (window.LummetConfig). It makes no request of its own. configuration.js hands data over through
//   window.LummetConfigProgress.state(profile, meta)   .issues(list)   .setup(pending)
// Needs configuration-tabs.js (badges, links); without it the checklist still shows, as plain text.
(function () {
  var list = document.getElementById("cfgProgressList");
  if (!list) return;
  var $ = function (id) { return document.getElementById(id); };
  var T = function () { return window.LummetConfigTabs || null; };
  var C = function () { return window.LummetConfig || null; };
  var profile = null, issues = [], setupPending = null, previewed = false;
  var LABEL = { overview: "Overview", business: "Business type", modules: "Modules and tools", pages: "Homepage and pages", design: "Design", menus: "Menus, SEO and components", backup: "Backup and transfer", history: "History" };

  function el(tag, props, kids) { var n = document.createElement(tag); Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n[k] = props[k]; }); (kids || []).forEach(function (c) { n.appendChild(c); }); return n; }
  function store(k, v) { try { if (v === undefined) return window.sessionStorage.getItem("cfg." + k); window.sessionStorage.setItem("cfg." + k, v); } catch (e) { /* storage can be blocked; the list still works */ } return null; }

  // Which tab a draft change or a setup problem belongs to.
  function tabForArea(area) {
    if (area === "Modules" || area === "Tools & features") return "modules";
    if (area === "Pages" || area === "Structure") return "pages";
    if (area === "Navigation" || area === "SEO" || area === "Components") return "menus";
    return "design";
  }
  function tabForIssue(i) {
    var id = i && i.id, msg = (i && i.message) || "";
    if (id === "landing-off" || id === "redirect-bad" || (!id && /Landing|Redirect/.test(msg))) return "pages";
    if (id === "invalid" || !id) return "overview";
    return "modules";
  }

  function draftChanges() { var s = C() && C().getState && C().getState(); return (s && s.ready && s.draft && s.draft.changes) || []; }
  function visited(id) { var t = T(); return !!(t && t.isOpened(id)) || store("seen." + id) === "1"; }

  function badges() {
    var t = T(); if (!t) return;
    var count = {}, warn = {};
    draftChanges().forEach(function (c) { var k = tabForArea(c.area); count[k] = (count[k] || 0) + 1; });
    issues.forEach(function (i) { var k = tabForIssue(i); warn[k] = (warn[k] || 0) + 1; });
    t.ids.forEach(function (id) { t.setBadge(id, { count: count[id] || 0, warn: warn[id] || 0 }); });
  }

  // Ticks come from the profile and the draft. "Reviewed" parts count once the welcome panel is confirmed or the tab has been opened.
  function steps() {
    var s = C() && C().getState && C().getState(), changes = draftChanges();
    var designChanged = changes.some(function (c) { return tabForArea(c.area) === "design"; });
    var reviewed = function (id) { return setupPending === false || visited(id); };
    var live = s && s.ready && Number(s.version) > 1, clean = s && s.ready && !changes.length;
    return [
      { title: "Pick a type", tab: "business", done: !!(profile && profile.preset) },
      { title: "Review modules", tab: "modules", done: reviewed("modules") },
      { title: "Check homepage", tab: "pages", done: reviewed("pages") },
      { title: "Choose design", tab: "design", done: designChanged || visited("design") },
      { title: "Preview", href: "#cfgPreviewBtn", done: previewed },
      { title: "Publish", href: "#cfgReviewBtn", done: !!(live && clean) }
    ];
  }
  function render() {
    list.textContent = "";
    var all = steps(), done = all.filter(function (x) { return x.done; }).length;
    all.forEach(function (x) {
      var a = el("a", { href: x.href || "#tab-" + x.tab, text: x.title });
      var mark = el("span", { className: "cfg-tick" + (x.done ? " is-done" : ""), text: x.done ? "\u2713" : "\u25CB" }); mark.setAttribute("aria-hidden", "true");
      var li = el("li", { className: x.done ? "is-done" : "" }, [mark, document.createTextNode(" "), a, el("span", { className: "cfg-sr", text: x.done ? " (done)" : " (not done yet)" })]);
      if (x.href) a.onclick = function (e) { if (e.preventDefault) e.preventDefault(); var n = $(x.href.slice(1)); if (n && n.scrollIntoView) n.scrollIntoView({ block: "nearest" }); if (n && !n.disabled && n.focus) n.focus(); };
      list.appendChild(li);
    });
    var msg = $("cfgProgressMsg"); if (msg) msg.textContent = done === all.length ? "All steps are done." : done + " of " + all.length + " steps done. Use Next at the bottom of each tab to go in order.";
    badges();
  }

  // A link from each setup problem to the tab where it can be fixed (the list is rebuilt by configuration.js on every change).
  function decorateIssues() {
    var ul = $("cfgIssues"); if (!ul) return;
    Array.prototype.slice.call(ul.children).forEach(function (li, i) {
      var tab = tabForIssue(issues[i]); if (tab === "overview") return;
      li.appendChild(document.createTextNode(" "));
      li.appendChild(el("a", { className: "cfg-issue-link", href: "#tab-" + tab, text: "Open " + LABEL[tab] }));
    });
  }

  window.LummetConfigProgress = {
    state: function (p) { profile = p; render(); },
    issues: function (l) { issues = l || []; decorateIssues(); badges(); },
    setup: function (pending) { setupPending = !!pending; render(); },
    refresh: render
  };

  if (T()) ["modules", "pages", "design"].forEach(function (id) { T().onFirstOpen(id, function () { store("seen." + id, "1"); render(); }); });
  var pv = $("cfgPreviewBtn"); if (pv) pv.addEventListener("click", function () { previewed = true; store("previewed", "1"); render(); });
  previewed = store("previewed") === "1";
  if (C()) { if (C().onSaved) C().onSaved(render); if (C().ready) C().ready.then(render); }
  render();
})();
