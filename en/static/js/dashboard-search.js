// =====================================================
// DASHBOARD SEARCH (Phase 8): one box for screens, settings, tools and content.
// Open it with the Search button, Ctrl+K (Cmd+K on a Mac) or "/".
// The server decides what a person may find (api/routes/dashboard-search.js); this file only ranks and shows it.
// No markup is ever built from text: every piece of text is set as plain text.
// =====================================================
(function () {
  "use strict";

  var API = "/en/api/v1/dashboard/search";
  var RECENT_KEY = "lummet.dash.recent.v1";
  var MAX_RECENT = 6, MAX_TOKENS = 4, PER_GROUP = 6, DEBOUNCE_MS = 220;
  var GROUPS = [["screen", "Screens"], ["setting", "Settings"], ["capability", "Modules and tools"], ["content", "Content"]];
  var BOOST = { screen: 6, setting: 3, capability: 2, content: 0 };

  // ---------- pure helpers (also used by the tests) ----------
  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    if (s.normalize) s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    return s.replace(/[^a-z0-9]+/g, " ").replace(/^ +| +$/g, "");
  }
  function tokensOf(q) { return norm(q).split(" ").filter(Boolean).slice(0, MAX_TOKENS); }
  function variants(t) { return t.length > 3 && /s$/.test(t) ? [t, t.slice(0, -1)] : [t]; }

  // 0 = no match. Every word typed must be found somewhere (label, hidden keywords, description).
  function score(item, toks, ctx) {
    if (!toks.length) return 0;
    var label = norm(item.label), words = label.split(" "), kw = " " + (item.keywords || "") + " ", sub = norm(item.sub);
    var total = 0;
    for (var i = 0; i < toks.length; i++) {
      var best = 0, vs = variants(toks[i]);
      for (var v = 0; v < vs.length && best < 120; v++) {
        var t = vs[v], s = 0;
        if (label === t) s = 120;
        else if (words.indexOf(t) >= 0) s = 100;
        else if (words.some(function (w) { return w.indexOf(t) === 0; })) s = 80;
        else if (label.indexOf(t) >= 0) s = 55;
        else if (kw.indexOf(" " + t) >= 0) s = 40;
        else if (kw.indexOf(t) >= 0) s = 25;
        else if (sub.indexOf(t) >= 0) s = 12;
        if (s > best) best = s;
      }
      if (!best) return 0;
      total += best;
    }
    total += BOOST[item.kind] || 0;
    if (label.indexOf(toks[0]) === 0) total += 10;
    if (ctx && ctx.pinned && ctx.pinned[item.href]) total += 20;
    if (ctx && ctx.recent && ctx.recent[item.href]) total += 8;
    return total - Math.min(label.length, 90) / 100;
  }
  function rank(items, q, ctx) {
    var toks = tokensOf(q), out = [];
    for (var i = 0; i < items.length; i++) { var s = score(items[i], toks, ctx); if (s > 0) out.push({ item: items[i], score: s }); }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }
  // Split text into [{text, hit}] so matches can be shown as <mark> without touching HTML.
  function highlightParts(text, toks) {
    text = String(text == null ? "" : text);
    var low = text.toLowerCase(), marks = new Array(text.length), any = false, i, j;
    for (i = 0; i < toks.length; i++) {
      var vs = variants(toks[i]);
      for (var v = 0; v < vs.length; v++) {
        var at = low.indexOf(vs[v]);
        if (at >= 0) { for (j = at; j < at + vs[v].length; j++) marks[j] = true; any = true; break; }
      }
    }
    if (!any) return [{ text: text, hit: false }];
    var parts = [], cur = "", hit = false;
    for (i = 0; i < text.length; i++) {
      var h = !!marks[i];
      if (i && h !== hit) { parts.push({ text: cur, hit: hit }); cur = ""; }
      hit = h; cur += text.charAt(i);
    }
    parts.push({ text: cur, hit: hit });
    return parts;
  }
  function safeHref(h) { return typeof h === "string" && /^\/en\/dashboard(\/[A-Za-z0-9._~%\-\/]*)?(#[A-Za-z0-9_\-]*)?$/.test(h) && h.indexOf("//") < 0 && h.indexOf("..") < 0; }

  window.LummetDashSearch = { norm: norm, tokensOf: tokensOf, score: score, rank: rank, highlightParts: highlightParts, safeHref: safeHref };

  // ---------- the dialog ----------
  function init() {
    var openBtn = document.getElementById("dashSearchOpen");
    if (!openBtn || document.getElementById("dashSearch")) return;

    var index = null, indexError = "", favs = [], favMsg = "", recents = readRecents();
    var results = [], active = -1, seq = 0, timer = 0, ctl = null, lastFocus = null, contentState = "idle", contentItems = [], loading = null;

    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function svgSearch() {
      var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
      s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "18"); s.setAttribute("height", "18"); s.setAttribute("fill", "none");
      s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
      var c = document.createElementNS(ns, "circle"); c.setAttribute("cx", "11"); c.setAttribute("cy", "11"); c.setAttribute("r", "7");
      var p = document.createElementNS(ns, "path"); p.setAttribute("d", "M20 20l-3.5-3.5");
      s.appendChild(c); s.appendChild(p); return s;
    }

    var root = el("div", "dsearch"); root.id = "dashSearch"; root.hidden = true;
    var backdrop = el("div", "dsearch-backdrop");
    var box = el("div", "dsearch-box"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Search the dashboard");
    var field = el("div", "dsearch-field");
    var input = el("input", "dsearch-input"); input.id = "dashSearchInput"; input.type = "text"; input.maxLength = 80; input.autocomplete = "off"; input.spellcheck = false;
    input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "true"); input.setAttribute("aria-controls", "dashSearchList"); input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-label", "Search screens, settings, tools and content"); input.placeholder = "Search screens, settings, tools and content";
    var closeBtn = el("button", "dsearch-close", "Esc"); closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "Close search");
    field.appendChild(svgSearch()); field.appendChild(input); field.appendChild(closeBtn);
    var body = el("div", "dsearch-body"), list = el("ul", "dsearch-list"); list.id = "dashSearchList"; list.setAttribute("role", "listbox"); list.setAttribute("aria-label", "Results");
    body.appendChild(list);
    var status = el("p", "dsearch-status"); status.id = "dashSearchStatus"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    var foot = el("p", "dsearch-foot", "Up and Down to move, Enter to open, Ctrl+Enter for a new tab, Alt+S to pin or unpin, Esc to close.");
    box.appendChild(field); box.appendChild(body); box.appendChild(status); box.appendChild(foot);
    root.appendChild(backdrop); root.appendChild(box); document.body.appendChild(root);

    // ----- storage of recents (this browser only) -----
    function readRecents() {
      try {
        var a = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
        return Array.isArray(a) ? a.filter(function (r) { return r && safeHref(r.href) && typeof r.label === "string"; }).slice(0, MAX_RECENT) : [];
      } catch (e) { return []; }
    }
    function addRecent(it) {
      if (!it || !safeHref(it.href)) return;
      recents = [{ href: it.href, label: String(it.label).slice(0, 90), kind: it.kind || "screen", sub: String(it.sub || "").slice(0, 120) }]
        .concat(recents.filter(function (r) { return r.href !== it.href; })).slice(0, MAX_RECENT);
      try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); } catch (e) { /* storage may be blocked */ }
    }
    var navEl = document.getElementById("dashNav");
    if (navEl) navEl.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) addRecent({ href: a.getAttribute("href"), label: (a.textContent || "").replace(/\s+/g, " ").trim(), kind: "screen" });
    });

    // ----- loading -----
    function getJson(url, opts) {
      return fetch(url, Object.assign({ credentials: "same-origin" }, opts || {})).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
      });
    }
    function load() {
      if (loading) return loading;
      loading = Promise.all([getJson(API + "/index"), getJson(API + "/favourites")]).then(function (a) {
        if (a[0].ok && a[0].j && a[0].j.success) index = [].concat(a[0].j.screens || [], a[0].j.settings || [], a[0].j.capabilities || []);
        else { indexError = a[0].status === 401 || a[0].status === 403 ? "You are signed out or your role cannot search the dashboard." : "The search list could not be loaded."; loading = null; }
        favs = a[1].ok && a[1].j && a[1].j.favourites ? a[1].j.favourites : [];
        favMsg = a[1].j && a[1].j.code === "needs_migration" ? a[1].j.error : "";
      }).catch(function () { indexError = "The search list could not be loaded. Check your connection."; loading = null; });
      return loading;
    }
    openBtn.addEventListener("pointerenter", load);
    openBtn.addEventListener("focus", load);

    // ----- building the result list -----
    function pinnedMap() { var m = {}; favs.forEach(function (f) { m[f.href] = true; }); return m; }
    function recentMap() { var m = {}; recents.forEach(function (r) { m[r.href] = true; }); return m; }

    function build() {
      var q = input.value, toks = tokensOf(q), sections = [];
      if (!toks.length) {
        if (favs.length) sections.push({ title: "Pinned", items: favs.map(function (f) { return { href: f.href, label: f.label, kind: f.kind, sub: "", pinned: true }; }) });
        var pin = pinnedMap(), rec = recents.filter(function (r) { return !pin[r.href]; });
        if (rec.length) sections.push({ title: "Recent", items: rec });
        var shown = {}; favs.concat(recents).forEach(function (x) { shown[x.href] = true; });
        var sug = (index || []).filter(function (i) { return i.kind === "screen" && !shown[i.href]; }).slice(0, 6);
        if (sug.length) sections.push({ title: "Go to", items: sug });
      } else {
        var ranked = rank(index || [], q, { pinned: pinnedMap(), recent: recentMap() });
        GROUPS.forEach(function (g) {
          var items = g[0] === "content" ? contentItems.slice(0, PER_GROUP * 2) : ranked.filter(function (r) { return r.item.kind === g[0]; }).slice(0, PER_GROUP).map(function (r) { return r.item; });
          if (items.length) sections.push({ title: g[1], items: items });
        });
      }
      return sections;
    }

    function render() {
      var sections = build(), toks = tokensOf(input.value);
      list.textContent = ""; results = [];
      sections.forEach(function (sec) {
        var h = el("li", "dsearch-group", sec.title); h.setAttribute("role", "presentation"); list.appendChild(h);
        sec.items.forEach(function (it) {
          var i = results.length; results.push(it);
          var li = el("li", "dsearch-opt dsearch-" + (it.kind || "screen")); li.id = "dsr-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false"); li.setAttribute("data-i", String(i));
          var a = el("a", "dsearch-link"); a.href = it.href; a.tabIndex = -1;
          var main = el("span", "dsearch-main");
          highlightParts(it.label, toks).forEach(function (p) { main.appendChild(p.hit ? el("mark", null, p.text) : document.createTextNode(p.text)); });
          a.appendChild(main);
          if (it.sub) a.appendChild(el("span", "dsearch-sub", it.sub));
          if (it.state) a.appendChild(el("span", "dsearch-chip dsearch-chip--" + it.state, it.state === "on" ? "On" : "Off"));
          a.appendChild(el("span", "dsearch-kind", kindLabel(it)));
          li.appendChild(a);
          var pinned = !!pinnedMap()[it.href];
          var pb = el("button", "dsearch-pin", pinned ? "Pinned" : "Pin"); pb.type = "button"; pb.tabIndex = -1; pb.setAttribute("aria-pressed", String(pinned)); pb.setAttribute("aria-label", (pinned ? "Unpin " : "Pin ") + it.label);
          li.appendChild(pb);
          list.appendChild(li);
        });
      });
      if (!results.length) {
        var msg = indexError || (loading && !index ? "Loading…" : toks.length ? (contentState === "loading" ? "Searching content…" : "Nothing found for “" + input.value.trim() + "”. Try fewer or simpler words, for example “menu”, “colours”, “casino” or “publish”.") : "Start typing. Try “menu”, “colours”, “add casino” or “publish”.");
        var e = el("li", "dsearch-empty", msg); e.setAttribute("role", "presentation"); list.appendChild(e);
      }
      setActive(results.length ? 0 : -1);
      var say = favMsg && !toks.length ? favMsg : results.length ? results.length + (results.length === 1 ? " result" : " results") + (contentState === "loading" ? ", searching content" : "") : "";
      status.textContent = say;
    }
    function kindLabel(it) { return { screen: "Screen", setting: "Setting", capability: "Module", content: "Content" }[it.kind] || ""; }

    function setActive(i) {
      var prev = list.querySelector(".is-active");
      if (prev) { prev.classList.remove("is-active"); prev.setAttribute("aria-selected", "false"); }
      active = i;
      if (i < 0) { input.removeAttribute("aria-activedescendant"); return; }
      var n = document.getElementById("dsr-" + i);
      if (!n) return;
      n.classList.add("is-active"); n.setAttribute("aria-selected", "true"); input.setAttribute("aria-activedescendant", n.id);
      if (n.scrollIntoView) n.scrollIntoView({ block: "nearest" });
    }

    // ----- content (typed, debounced, stale answers ignored) -----
    function fetchContent() {
      var q = input.value.trim(), toks = tokensOf(q);
      if (ctl) { try { ctl.abort(); } catch (e) { /* already done */ } ctl = null; }
      seq++;
      if (!toks.length || toks.join("").length < 2) { contentState = "idle"; contentItems = []; return; }
      var mine = seq; contentState = "loading";
      ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      getJson(API + "/content?q=" + encodeURIComponent(q), ctl ? { signal: ctl.signal } : {}).then(function (r) {
        if (mine !== seq) return;
        contentState = r.ok ? "done" : "error"; contentItems = r.ok && r.j.results ? r.j.results : [];
        render();
        if (!r.ok) status.textContent = "Content search is not available right now. Screens and settings still work.";
      }).catch(function (err) {
        if (mine !== seq || (err && err.name === "AbortError")) return;
        contentState = "error"; contentItems = []; render(); status.textContent = "Content search is not available right now. Screens and settings still work.";
      });
    }
    function onInput() {
      contentItems = []; contentState = tokensOf(input.value).join("").length >= 2 ? "loading" : "idle";
      render(); window.clearTimeout(timer); timer = window.setTimeout(fetchContent, DEBOUNCE_MS);
    }

    // ----- actions -----
    function go(it, newTab) {
      if (!it || !safeHref(it.href)) return;
      addRecent(it);
      if (newTab) { window.open(it.href, "_blank", "noopener"); return; }
      var a = document.createElement("a"); a.href = it.href;
      var hash = a.hash;
      close(false);
      if (a.pathname === window.location.pathname) {
        if (/^#(look|rows)-/.test(hash)) { window.location.hash = hash; window.location.reload(); return; }
        if (hash) { window.location.hash = hash; return; }
        return;
      }
      window.location.assign(it.href);
    }
    function togglePin(it) {
      if (!it || !safeHref(it.href)) return;
      var was = !!pinnedMap()[it.href], before = favs.slice();
      favs = was ? favs.filter(function (f) { return f.href !== it.href; }) : [{ href: it.href, label: it.label, kind: it.kind === "capability" || it.kind === "setting" || it.kind === "content" ? it.kind : "screen" }].concat(favs);
      render();
      var req = was ? getJson(API + "/favourites?href=" + encodeURIComponent(it.href), { method: "DELETE" })
        : getJson(API + "/favourites", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ href: it.href, label: it.label, kind: favs[0].kind }) });
      req.then(function (r) {
        if (r.ok && r.j && r.j.favourites) { favs = r.j.favourites; render(); status.textContent = was ? "Unpinned." : "Pinned."; }
        else { favs = before; render(); status.textContent = (r.j && r.j.error) || "That could not be saved."; }
      }).catch(function () { favs = before; render(); status.textContent = "That could not be saved. Check your connection."; });
    }

    function open() {
      if (!root.hidden) return;
      lastFocus = document.activeElement;
      root.hidden = false; document.body.classList.add("dsearch-lock"); openBtn.setAttribute("aria-expanded", "true");
      input.value = ""; contentItems = []; contentState = "idle"; recents = readRecents();
      render(); input.focus();
      load().then(function () { if (!root.hidden) render(); });
    }
    function close(restore) {
      if (root.hidden) return;
      root.hidden = true; document.body.classList.remove("dsearch-lock"); openBtn.setAttribute("aria-expanded", "false");
      window.clearTimeout(timer); seq++; if (ctl) { try { ctl.abort(); } catch (e) { /* done */ } ctl = null; }
      if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus();
    }

    // ----- events -----
    openBtn.addEventListener("click", open);
    backdrop.addEventListener("click", function () { close(); });
    closeBtn.addEventListener("click", function () { close(); });
    input.addEventListener("input", onInput);
    list.addEventListener("mousemove", function (e) { var li = e.target.closest ? e.target.closest(".dsearch-opt") : null; if (li) { var i = parseInt(li.getAttribute("data-i"), 10); if (i !== active) setActive(i); } });
    list.addEventListener("click", function (e) {
      var pb = e.target.closest ? e.target.closest(".dsearch-pin") : null, li = e.target.closest ? e.target.closest(".dsearch-opt") : null;
      if (!li) return;
      var it = results[parseInt(li.getAttribute("data-i"), 10)];
      if (pb) { e.preventDefault(); togglePin(it); return; }
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) { addRecent(it); return; }
      e.preventDefault(); go(it, false);
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) setActive((active + 1) % results.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); if (results.length) setActive((active - 1 + results.length) % results.length); return; }
      if (e.key === "Enter") { e.preventDefault(); if (active >= 0) go(results[active], e.ctrlKey || e.metaKey); return; }
      if ((e.altKey && (e.key === "s" || e.key === "S")) && active >= 0) { e.preventDefault(); togglePin(results[active]); return; }
      if (e.key === "Tab") { e.preventDefault(); (document.activeElement === input ? closeBtn : input).focus(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.defaultPrevented) return;
      var k = (e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === "k") { e.preventDefault(); if (root.hidden) open(); else close(); return; }
      if (k === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && root.hidden) {
        var t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
        e.preventDefault(); open();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
