// Sticky "on this page" bar for reviews and author pages.
// The server writes <nav class="sn-nav" data-sn> with one link per section; this adds:
//   - it stays under the site header while scrolling (also on phones)
//   - the section you are reading is highlighted, and the bar scrolls sideways to keep it in view
//   - smooth scrolling to a section, without hiding its heading under the bars
//   - a thin reading-progress line, and edge fades when the bar scrolls sideways
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var jumpTimer = null;

  function stickyHeaderHeight() {
    var h = document.querySelector(".site-header");
    if (!h) return 0;
    var pos = getComputedStyle(h).position;
    if (pos !== "sticky" && pos !== "fixed") return 0;
    return Math.max(0, Math.round(h.getBoundingClientRect().height));
  }
  // Space the sticky bars take at the top of the screen (site header + the section bar when there is one).
  function offsetNow() {
    var bar = document.querySelector("nav.sn-nav[data-sn]:not([hidden])");
    return stickyHeaderHeight() + (bar ? Math.round(bar.getBoundingClientRect().height) : 0) + 14;
  }
  // Go to a heading and STAY there: one clean scroll, then a few corrections while pictures above finish loading.
  function jumpTo(el) {
    window.clearInterval(jumpTimer);
    var root = document.documentElement;
    function place(instant) {
      var y = Math.max(0, Math.round(el.getBoundingClientRect().top + window.pageYOffset - offsetNow()));
      if (instant || reduce) { var prev = root.style.scrollBehavior; root.style.scrollBehavior = "auto"; window.scrollTo(0, y); root.style.scrollBehavior = prev; }
      else window.scrollTo({ top: y, behavior: "smooth" });
    }
    place(false);
    var stop = Date.now() + 2200, settleFrom = Date.now() + 700;
    function release() { window.clearInterval(jumpTimer); ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { window.removeEventListener(t, release, true); }); }
    jumpTimer = window.setInterval(function () {
      if (Date.now() > stop) { release(); return; }
      if (Date.now() < settleFrom) return; // let the smooth scroll finish first
      if (Math.abs(el.getBoundingClientRect().top - offsetNow()) > 3) {
        var atEnd = window.innerHeight + window.pageYOffset >= root.scrollHeight - 2;
        if (!atEnd) place(true);
      }
    }, 150);
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { window.addEventListener(t, release, { capture: true, passive: true }); });
  }
  window.LummetJump = jumpTo;

  // Count tiles (author page) and any other in-page link that asks for it
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a.ah-stat[href^='#'], a[data-jump]");
    if (!a) return;
    var id = decodeURIComponent((a.getAttribute("href") || "").slice(1));
    var el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    var det = el.querySelector && el.querySelector("details.ah-more");
    jumpTo(el);
    try { history.replaceState(null, "", "#" + encodeURIComponent(id)); } catch (err) {}
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try { el.focus({ preventScroll: true }); } catch (err) {}
  });

  var navs = document.querySelectorAll("nav.sn-nav[data-sn]");
  if (!navs.length) return;

  function headerHeight() { return stickyHeaderHeight(); }

  navs.forEach(function (nav) {
    var track = nav.querySelector(".sn-nav__track");
    var links = Array.prototype.slice.call(nav.querySelectorAll("a[data-sn-id]"));
    var items = links.map(function (a) { return { a: a, el: document.getElementById(a.getAttribute("data-sn-id")) }; }).filter(function (x) { return x.el; });
    if (items.length < 2) { nav.hidden = true; return; }
    items.forEach(function (x) { x.el.classList.add("sn-target"); });
    var bar = document.createElement("span"); bar.className = "sn-nav__progress"; bar.setAttribute("aria-hidden", "true"); nav.appendChild(bar);
    var active = null, ticking = false, top = 0, pinned = null;

    function metrics() {
      top = headerHeight();
      nav.style.setProperty("--sn-top", top + "px");
      document.documentElement.style.setProperty("--sn-top", top + "px");
      document.documentElement.style.setProperty("--sn-h", Math.round(nav.getBoundingClientRect().height) + "px");
    }
    function edges() {
      nav.classList.toggle("has-left", track.scrollLeft > 4);
      nav.classList.toggle("has-right", track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
    }
    function setActive(x) {
      if (x === active) return;
      if (active) { active.a.classList.remove("is-active"); active.a.removeAttribute("aria-current"); }
      active = x;
      if (!x) return;
      x.a.classList.add("is-active"); x.a.setAttribute("aria-current", "location");
      var left = x.a.offsetLeft - (track.clientWidth - x.a.offsetWidth) / 2;
      if (track.scrollWidth > track.clientWidth) track.scrollTo({ left: left, behavior: reduce ? "auto" : "smooth" });
    }
    function update() {
      ticking = false;
      var line = top + nav.getBoundingClientRect().height + 24;
      var cur = null;
      for (var i = 0; i < items.length; i++) { if (items[i].el.getBoundingClientRect().top <= line) cur = items[i]; }
      var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) cur = items[items.length - 1];
      // a tab you clicked stays lit even when its heading cannot reach the top (end of page) until you scroll yourself
      setActive(pinned || cur);
      var first = items[0].el.getBoundingClientRect().top + window.scrollY;
      var last = items[items.length - 1].el;
      var end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
      var p = end > first ? (window.scrollY - first) / (end - first) : 0;
      bar.style.width = Math.max(0, Math.min(1, p)) * 100 + "%";
      nav.classList.toggle("is-stuck", nav.getBoundingClientRect().top <= top + 1);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var el = document.getElementById(a.getAttribute("data-sn-id"));
        if (!el) return;
        e.preventDefault();
        pinned = items.filter(function (x) { return x.a === a; })[0] || null; setActive(pinned);
        jumpTo(el);
        try { history.replaceState(null, "", "#" + el.id); } catch (err) {}
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        try { el.focus({ preventScroll: true }); } catch (err) {}
      });
    });
    ["wheel", "touchmove", "keydown", "mousedown"].forEach(function (ev) { window.addEventListener(ev, function (e) { if (ev === "mousedown" && e.target.closest && e.target.closest("nav.sn-nav")) return; pinned = null; }, { passive: true }); });
    track.addEventListener("scroll", edges, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { metrics(); edges(); onScroll(); });
    window.addEventListener("load", function () { metrics(); edges(); update(); });
    metrics(); edges(); update();
  });
})();
