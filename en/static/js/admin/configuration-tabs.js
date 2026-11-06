// Dashboard > Configuration > tabs. Groups the screen into eight guided tabs; changes nothing about what is saved.
// Loads before configuration-draft.js so the other configuration scripts can use window.LummetConfigTabs:
//   open(id, sub)        show a tab (and scroll to a control inside it)     current()   id of the shown tab
//   setBadge(id, b)      b = { count: n, warn: n } small marks on a tab      onFirstOpen(id, fn)   run fn once, when the tab first opens
//   isOpened(id)         true once the tab has been shown                    ids         the tab ids in order
// Everything is DOM-only (no innerHTML). The chosen tab lives in the URL hash: #tab-design or #tab-design/header.
(function () {
  var list = document.getElementById("cfgTabs");
  if (!list) return;
  var $ = function (id) { return document.getElementById(id); };
  var buttons = Array.prototype.slice.call(list.querySelectorAll("[data-cfg-tab]"));
  var ids = buttons.map(function (b) { return b.getAttribute("data-cfg-tab"); });
  if (!ids.length) return;
  var first = {}, opened = {}, cur = ids[0], badges = {};
  var SETUP_SLOT = "cfgSetupSlot";

  function panel(id) { return $("tab-" + id); }
  function button(id) { return $("tabbtn-" + id); }
  function announce(text) { var a = $("cfgAnnounce"); if (a) a.textContent = text || ""; }
  function label(id) { var b = button(id); var s = b && b.querySelector(".cfg-tab-label"); return s ? s.textContent : id; }
  function el(tag, props) { var n = document.createElement(tag); Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n[k] = props[k]; }); return n; }

  // ----- badges: a count of unpublished changes and a warning mark, with a text for screen readers -----
  function paintBadge(id) {
    var b = button(id); if (!b) return;
    var old = b.querySelector(".cfg-tab-badge"); if (old) b.removeChild(old);
    var d = badges[id] || {}, count = d.count || 0, warn = d.warn || 0;
    if (!count && !warn) return;
    var wrap = el("span", { className: "cfg-tab-badge" });
    if (warn) { var w = el("span", { className: "cfg-badge cfg-badge--warn", text: "!" }); w.setAttribute("aria-hidden", "true"); wrap.appendChild(w); }
    if (count) { var c = el("span", { className: "cfg-badge cfg-badge--count", text: String(count) }); c.setAttribute("aria-hidden", "true"); wrap.appendChild(c); }
    var sr = [];
    if (warn) sr.push(warn + (warn === 1 ? " setup problem" : " setup problems"));
    if (count) sr.push(count + (count === 1 ? " unpublished change" : " unpublished changes"));
    wrap.appendChild(el("span", { className: "cfg-sr", text: ", " + sr.join(", ") }));
    b.appendChild(wrap);
  }
  function setBadge(id, data) { if (ids.indexOf(id) < 0) return; badges[id] = data || {}; paintBadge(id); }

  // ----- showing a tab -----
  function show(id, opts) {
    opts = opts || {};
    if (ids.indexOf(id) < 0) id = ids[0];
    var changed = id !== cur || !opened[id];
    cur = id;
    ids.forEach(function (t) {
      var on = t === id, p = panel(t), b = button(t);
      if (p) p.hidden = !on;
      if (b) { b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; }
    });
    // The welcome panel sits above the tabs in the page, so it is only shown with the Overview.
    var slot = $(SETUP_SLOT); if (slot) slot.hidden = id !== ids[0];
    if (!opened[id]) { opened[id] = true; (first[id] || []).forEach(function (fn) { try { fn(); } catch (e) { /* a lazy part never breaks the tabs */ } }); first[id] = []; }
    if (opts.focus) { var h = $("cfgTitle-" + id); if (h && h.focus) h.focus(); }
    if (changed && opts.announce !== false) announce(label(id) + " tab, " + (ids.indexOf(id) + 1) + " of " + ids.length + ".");
    var btn = button(id); if (opts.scrollTab !== false && btn && btn.scrollIntoView) btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function setHash(id, sub) {
    var h = "#tab-" + id + (sub ? "/" + sub : "");
    if (location.hash === h) return;
    if (window.history && history.pushState) history.pushState(null, "", h); else location.hash = h;
  }
  function scrollToSub(id, sub) {
    var p = panel(id); if (!p || !sub) return;
    var target = $("look-" + sub) || $("cfg-" + sub) || p.querySelector('[data-cfg-anchor="' + sub + '"]');
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "start" });
  }
  function open(id, sub, opts) {
    opts = opts || {};
    show(id, { focus: opts.focus !== false && !sub });
    if (opts.history !== false) setHash(id, sub);
    if (sub) scrollToSub(id, sub);
  }

  // Which tab owns a hash. #tab-x, #tab-x/sub, the old ids (#cfgPresets, #look-header, #rows-seo) and #cfgSetup all work.
  function route(hash) {
    var h = String(hash || "").replace(/^#/, ""); if (!h) return null;
    var m = h.match(/^tab-([a-z]+)(?:\/([\w-]+))?$/);
    if (m && ids.indexOf(m[1]) >= 0) return { id: m[1], sub: m[2] || "" };
    if (h === "cfgSetup") return { id: ids[0], sub: "" };
    if (h.indexOf("look-") === 0) return { id: "design", sub: h.slice(5) };
    if (h.indexOf("rows-") === 0) return { id: "menus", sub: "" };
    var node = $(h), p = node && node.closest ? node.closest("[data-cfg-panel]") : null;
    return p ? { id: p.getAttribute("data-cfg-panel"), sub: "", node: node } : null;
  }
  function fromHash(initial) {
    var r = route(location.hash);
    if (!r) { if (initial) show(ids[0], { announce: false, scrollTab: false }); return; }
    show(r.id, { announce: !initial, scrollTab: !initial });
    if (r.sub) scrollToSub(r.id, r.sub); else if (r.node && r.node.scrollIntoView && !initial) r.node.scrollIntoView({ block: "nearest" });
  }

  // ----- keyboard: roving tabindex, Left/Right/Home/End -----
  function onKey(e) {
    var i = ids.indexOf(e.target && e.target.getAttribute && e.target.getAttribute("data-cfg-tab"));
    if (i < 0) return;
    var n = e.key === "ArrowRight" ? (i + 1) % ids.length : e.key === "ArrowLeft" ? (i + ids.length - 1) % ids.length : e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : -1;
    if (n < 0) return;
    if (e.preventDefault) e.preventDefault();
    open(ids[n], "", { focus: false });
    button(ids[n]).focus();
  }
  buttons.forEach(function (b) { b.onclick = function () { open(b.getAttribute("data-cfg-tab")); }; });
  list.onkeydown = onKey;

  // ----- Next / Back at the bottom of every tab (the recommended order for a new site) -----
  ids.forEach(function (id, i) {
    var p = panel(id); if (!p) return;
    var nav = el("div", { className: "cfg-step-nav" });
    if (i > 0) { var back = el("button", { type: "button", className: "btn", text: "Back: " + label(ids[i - 1]) }); back.onclick = function () { open(ids[i - 1]); }; nav.appendChild(back); }
    if (i < ids.length - 1) { var next = el("button", { type: "button", className: "btn btn--primary", text: "Next: " + label(ids[i + 1]) }); next.onclick = function () { open(ids[i + 1]); }; nav.appendChild(next); }
    p.appendChild(nav);
  });

  // The progress list, check results and next steps link to tabs with ordinary links; follow them without a page jump.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null; if (!a || !$("cfgRoot") || !$("cfgRoot").contains(a)) return;
    var href = a.getAttribute("href") || "", at = href.indexOf("#"); if (at < 0) return;
    var path = href.slice(0, at); if (path && path !== location.pathname) return;
    var r = route(href.slice(at)); if (!r) return;
    if (e.preventDefault) e.preventDefault();
    open(r.id, r.sub, { focus: !r.sub });
    if (r.node && r.node.scrollIntoView) r.node.scrollIntoView({ block: "nearest" });
  });
  window.addEventListener("hashchange", function () { fromHash(false); });
  window.addEventListener("popstate", function () { fromHash(false); });

  window.LummetConfigTabs = {
    ids: ids,
    open: function (id, sub) { open(id, sub); },
    show: function (id) { show(id, { announce: false }); },
    current: function () { return cur; },
    setBadge: setBadge,
    isOpened: function (id) { return !!opened[id]; },
    onFirstOpen: function (id, fn) { if (opened[id]) fn(); else (first[id] = first[id] || []).push(fn); },
    route: route
  };
  fromHash(true);
})();
