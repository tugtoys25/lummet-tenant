/* Live banners: slider / home banner. Motion, controls, swipe, keyboard, per-slide beacons. No dependencies, no inline handlers.
   Follows the W3C carousel pattern: pause on hover and focus, visible play/pause button, reduced motion = no auto-rotation,
   only transform/opacity animate (no layout shift). The server markup already shows slide 1, so nothing here is needed to paint. */
(function () {
  "use strict";
  var LB = window.LiveBanners || { track: function () {}, reduce: false };
  var reduce = LB.reduce || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var $$ = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };

  function init(root) {
    var banner = root.closest(".lb[data-lb-id]"), bid = banner ? banner.getAttribute("data-lb-id") : "0";
    var now = Date.now(), slides = $$(root, "[data-lb-slide]"), dots = $$(root, "[data-lb-dot]");
    // pages can be cached for a while: hide slides whose own start/end window is not open right now
    slides = slides.filter(function (s, k) {
      var a = +s.getAttribute("data-start") || 0, z = +s.getAttribute("data-end") || 0;
      if ((!a || a <= now) && (!z || z >= now)) return true;
      s.parentNode.removeChild(s); if (dots[k]) dots[k].parentNode.removeChild(dots[k]); dots[k] = null; return false;
    });
    dots = dots.filter(Boolean);
    if (!slides.length) { (banner || root).classList.add("is-gone"); return; }
    var n = slides.length, i = 0, speed = +root.getAttribute("data-speed") || 600, interval = +root.getAttribute("data-interval") || 6000;
    var loop = root.getAttribute("data-loop") !== "0", auto = root.getAttribute("data-auto") === "1" && n > 1 && !reduce;
    var bar = root.querySelector("[data-lb-bar]"), play = root.querySelector("[data-lb-play]"), count = root.querySelector("[data-lb-count]"), list = root.querySelector(".lb-slides");
    var st = { user: false, hover: false, focus: false, seen: false, tab: !document.hidden }, viewed = {}, due = false;

    slides.forEach(function (s, k) {
      s.hidden = false; s.setAttribute("data-pos", k === 0 ? "active" : "after"); s.classList.toggle("is-active", k === 0);
      s.setAttribute("aria-label", (k + 1) + " of " + n + ": " + (s.getAttribute("data-title") || ""));
    });
    dots.forEach(function (d, k) { d.setAttribute("data-lb-dot", k); var t = slides[k].getAttribute("data-title"); d.setAttribute("aria-label", "Slide " + (k + 1) + (t ? ": " + t : "")); });
    root.classList.add("is-ready");

    function paused() { return !auto || st.user || (st.hover && root.getAttribute("data-hover") === "1") || st.focus || !st.seen || !st.tab; }
    function sync() {
      root.classList.toggle("is-paused", paused());
      if (list) list.setAttribute("aria-live", auto && !st.user ? "off" : "polite"); // announce changes only when the visitor drives the slider
      if (due && !paused()) { due = false; go(i + 1, 1); return; }
      if (play) { var on = auto && !st.user; play.classList.toggle("is-playing", on); play.setAttribute("aria-label", on ? "Pause automatic slide show" : "Start automatic slide show"); }
    }
    function restart() {
      if (!bar || !auto) return;
      bar.classList.remove("is-run"); bar.style.animationDuration = (+slides[i].getAttribute("data-dur") || interval) + "ms"; void bar.offsetWidth; bar.classList.add("is-run");
    }
    function view() { var sid = slides[i].getAttribute("data-sid"); if (st.seen && sid && !viewed[sid]) { viewed[sid] = 1; LB.track(bid, "view", sid); } }
    function paint() {
      dots.forEach(function (d, k) { d.setAttribute("aria-current", k === i ? "true" : "false"); });
      if (count) count.textContent = (i + 1) + " / " + n;
    }
    function go(k, dir) {
      if (n < 2) return;
      if (!loop && (k < 0 || k >= n)) return;
      k = (k + n) % n; if (k === i) return;
      dir = dir || (k > i ? 1 : -1);
      var from = slides[i], to = slides[k];
      to.classList.add("no-t"); to.setAttribute("data-pos", dir > 0 ? "after" : "before"); void to.offsetWidth; to.classList.remove("no-t"); // park it on the entry side without animating
      from.classList.remove("is-active"); from.classList.add("is-leaving"); from.setAttribute("data-pos", dir > 0 ? "before" : "after");
      setTimeout(function () { from.classList.remove("is-leaving"); }, speed + 60);
      to.setAttribute("data-pos", "active"); to.classList.add("is-active");
      i = k; paint(); restart(); view();
    }

    if (bar) bar.addEventListener("animationend", function (e) { if (e.target !== bar) return; if (paused()) due = true; else go(i + 1, 1); });
    var prev = root.querySelector("[data-lb-prev]"), next = root.querySelector("[data-lb-next]");
    if (prev) prev.addEventListener("click", function () { go(i - 1, -1); });
    if (next) next.addEventListener("click", function () { go(i + 1, 1); });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k); }); });
    if (play) { if (!auto) play.hidden = true; else play.addEventListener("click", function () { st.user = !st.user; sync(); }); }

    if (fine) { root.addEventListener("mouseenter", function () { st.hover = true; sync(); }); root.addEventListener("mouseleave", function () { st.hover = false; sync(); }); }
    root.addEventListener("focusin", function (e) { try { st.focus = e.target.matches(":focus-visible"); } catch (x) { st.focus = true; } sync(); });
    root.addEventListener("focusout", function (e) { if (!e.relatedTarget || !root.contains(e.relatedTarget)) { st.focus = false; sync(); } });
    document.addEventListener("visibilitychange", function () { st.tab = !document.hidden; sync(); });

    if (root.getAttribute("data-keys") === "1") root.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest("input,textarea,select")) return;
      if (e.key === "ArrowLeft") { go(i - 1, -1); e.preventDefault(); } else if (e.key === "ArrowRight") { go(i + 1, 1); e.preventDefault(); }
      else if (e.key === "Home") { go(0, -1); e.preventDefault(); } else if (e.key === "End") { go(n - 1, 1); e.preventDefault(); }
    });

    // swipe (touch and pen only, so a mouse drag never turns into a slide change); vertical scrolling is left to the browser
    var stage = root.querySelector(".lb-sl__stage"), sx = 0, sy = 0, down = false, swiped = false;
    if (stage && root.getAttribute("data-swipe") === "1" && n > 1) {
      stage.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") return; down = true; swiped = false; sx = e.clientX; sy = e.clientY; });
      stage.addEventListener("pointerup", function (e) {
        if (!down) return; down = false;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; setTimeout(function () { swiped = false; }, 350); go(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); }
      });
      stage.addEventListener("pointercancel", function () { down = false; });
      stage.addEventListener("click", function (e) { if (swiped) { swiped = false; e.preventDefault(); e.stopPropagation(); } }, true);
    }

    // per-slide click beacon (the banner-level click is counted by live-banners.js)
    root.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-lb-click]"), s = a && a.closest("[data-lb-slide]");
      if (s) LB.track(bid, "click", s.getAttribute("data-sid"));
    });

    // run only while at least 40 % of the slider is on screen; the first slide's view is recorded at that moment
    function seen(v) { st.seen = v; sync(); if (v) { view(); if (bar && !bar.classList.contains("is-run")) restart(); } }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { es.forEach(function (e) { seen(e.isIntersecting); }); }, { threshold: 0.4 }).observe(root); else seen(true);
    paint(); sync();
  }

  $$(document, "[data-lb-slider]").forEach(init);
})();
