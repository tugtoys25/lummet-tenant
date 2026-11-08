/* Live banners: browser side. Triggers, frequency, dismissal, stacking queue, carousel, countdown, modal focus trap, beacons.
   No dependencies, no inline handlers. Pages are cached, so everything per-visitor is decided here. */
(function () {
  "use strict";
  var root = document.getElementById("live-banners");
  var all = Array.prototype.slice.call(document.querySelectorAll(".lb[data-lb-id]"));
  if (!all.length) return;
  var cfg = {};
  try { cfg = JSON.parse((root && root.getAttribute("data-lb")) || "{}"); } catch (e) { cfg = {}; }
  var EVENT = cfg.event || "/en/api/v1/live-banner/event";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mem = {}; // used when storage is blocked: remembers for this page view only

  // ---- storage (always in try/catch) ----
  function store(kind) { try { var s = window[kind]; var k = "__lb"; s.setItem(k, "1"); s.removeItem(k); return s; } catch (e) { return null; } }
  var local = store("localStorage"), session = store("sessionStorage");
  function get(s, k) { try { return s ? s.getItem(k) : mem[k] || null; } catch (e) { return mem[k] || null; } }
  function set(s, k, v) { mem[k] = v; try { if (s) s.setItem(k, v); } catch (e) { /* blocked */ } }
  function ttlMs(el) { return Math.max(1, +el.getAttribute("data-days") || 1) * 86400000; }
  function backend(el) { return el.getAttribute("data-freq") === "days" ? local : session; }
  function seenKey(el) { return "lb:seen:" + el.getAttribute("data-lb-id"); }
  function doneKey(el) { return "lb:done:" + el.getAttribute("data-lb-id"); }

  // Should this banner show now? every = each page; session = once per session; days = once per N days.
  function allowed(el) {
    var f = el.getAttribute("data-freq");
    var done = get(backend(el), doneKey(el));
    if (done && (f === "days" ? Date.now() - +done < ttlMs(el) : true)) return false;
    if (f === "every") return !mem["page:" + doneKey(el)];
    var seen = get(backend(el), seenKey(el));
    return !(seen && (f === "days" ? Date.now() - +seen < ttlMs(el) : true));
  }
  function markSeen(el) { if (el.getAttribute("data-freq") !== "every") set(backend(el), seenKey(el), String(Date.now())); }
  function markDone(el) { // dismissed: every = this page only; session/days = for that window
    if (el.getAttribute("data-freq") === "every") mem["page:" + doneKey(el)] = "1"; else set(backend(el), doneKey(el), String(Date.now()));
  }

  // ---- beacons (aggregated on the server; batched here) ----
  var queue = [], timer = null, viewed = {};
  function flush() {
    timer = null; if (!queue.length) return;
    var body = JSON.stringify({ events: queue.splice(0, 20) });
    try { if (navigator.sendBeacon && navigator.sendBeacon(EVENT, new Blob([body], { type: "application/json" }))) return; } catch (e) { /* fall through */ }
    try { fetch(EVENT, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }); } catch (e) { /* ignore */ }
  }
  function track(id, type) { queue.push({ id: +id, type: type }); if (!timer) timer = setTimeout(flush, 1500); }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var id = e.target.getAttribute("data-lb-id");
      if (e.isIntersecting && !viewed[id]) { viewed[id] = 1; track(id, "view"); io.unobserve(e.target); }
    });
  }, { threshold: 0.5 }) : null;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-lb-click]"); var b = a && a.closest(".lb[data-lb-id]");
    if (b) track(b.getAttribute("data-lb-id"), "click");
  });

  // ---- visibility helpers ----
  function device() { var w = window.innerWidth; return w <= 640 ? "mobile" : w <= 1024 ? "tablet" : "desktop"; } // same breakpoints as the CSS
  function deviceOk(el) { return (el.getAttribute("data-hide") || "").split(" ").indexOf(device()) < 0; }
  function phone() { return window.matchMedia && window.matchMedia("(max-width: 640px)").matches; }
  function groupKey(el) {
    var m = el.getAttribute("data-mode"), a = el.getAttribute("data-anchor");
    if (m === "floating" && phone() && a.indexOf("bottom") === 0) return "floating:bottom-phone"; // one floating banner per bottom edge on phones
    return m + ":" + a;
  }
  var stacks = {}; // group key -> { box, cap, on: [], waiting: [] }
  function stackFor(el) {
    var k = groupKey(el);
    if (!stacks[k]) {
      var box = document.createElement("div"); box.className = "lb-stack lb-stack--" + el.getAttribute("data-mode") + "-" + el.getAttribute("data-anchor"); box.setAttribute("data-stack", k);
      (root || document.body).appendChild(box);
      stacks[k] = { box: box, cap: k.indexOf("phone") > 0 ? 1 : Math.min(3, +el.getAttribute("data-max") || 3), on: [], waiting: [] };
    }
    return stacks[k];
  }

  // ---- show / hide ----
  var openModal = null;
  function reveal(el) {
    el.classList.add("is-on"); markSeen(el);
    if (io) io.observe(el);
    if (el.getAttribute("data-mode") === "floating" && el.getAttribute("data-anchor") === "center") modal(el);
  }
  function admit(el) {
    var s = stackFor(el);
    if (s.box !== el.parentNode) s.box.appendChild(el);
    if (s.on.length < s.cap) { s.on.push(el); reveal(el); } else s.waiting.push(el);
  }
  function close(el) {
    markDone(el); el.classList.remove("is-on"); el.classList.add("is-gone");
    if (el === openModal) closeModal();
    var s = stacks[groupKey(el)];
    if (s) { s.on = s.on.filter(function (x) { return x !== el; }); var next = s.waiting.shift(); if (next) { s.on.push(next); reveal(next); } }
  }

  // ---- modal: backdrop, focus trap, Esc ----
  var lastFocus = null, back = null;
  function focusables(el) { return Array.prototype.slice.call(el.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')); }
  function onKey(e) {
    if (!openModal) return;
    if (e.key === "Escape") { close(openModal); return; }
    if (e.key !== "Tab") return;
    var f = focusables(openModal); if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function modal(el) {
    if (openModal) return;
    openModal = el; lastFocus = document.activeElement;
    back = document.createElement("div"); back.className = "lb-backdrop"; document.body.appendChild(back);
    back.addEventListener("click", function () { if (openModal) close(openModal); });
    document.addEventListener("keydown", onKey);
    var f = focusables(el); (f[0] || el).focus && (f[0] || el).focus();
  }
  function closeModal() {
    openModal = null; document.removeEventListener("keydown", onKey);
    if (back && back.parentNode) back.parentNode.removeChild(back); back = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---- triggers ----
  function arm(el) {
    var t = el.getAttribute("data-trigger"), go = function () { if (!el.__armed) { el.__armed = 1; if (deviceOk(el) && allowed(el)) admit(el); } };
    if (t === "delay") setTimeout(go, Math.max(0, +el.getAttribute("data-secs") || 0) * 1000);
    else if (t === "scroll") {
      var need = +el.getAttribute("data-scroll") || 0;
      var on = function () { var h = document.documentElement.scrollHeight - window.innerHeight; if (h <= 0 || (window.scrollY / h) * 100 >= need) { window.removeEventListener("scroll", on); go(); } };
      window.addEventListener("scroll", on, { passive: true }); on();
    } else if (t === "exit") {
      if (window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return; // desktop only
      document.addEventListener("mouseout", function h(e) { if (!e.relatedTarget && e.clientY <= 0) { document.removeEventListener("mouseout", h); go(); } });
    } else go();
  }

  // ---- widgets ----
  function carousel(c) {
    var slides = Array.prototype.slice.call(c.querySelectorAll("[data-lb-slide]")), dots = Array.prototype.slice.call(c.querySelectorAll("[data-lb-dot]")), i = 0, paused = false;
    function show(n) { i = (n + slides.length) % slides.length; slides.forEach(function (s, k) { s.hidden = k !== i; }); dots.forEach(function (d, k) { d.setAttribute("aria-current", k === i ? "true" : "false"); }); }
    var p = c.querySelector("[data-lb-prev]"), n = c.querySelector("[data-lb-next]");
    if (p) p.addEventListener("click", function () { show(i - 1); }); if (n) n.addEventListener("click", function () { show(i + 1); });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { show(k); }); });
    ["mouseenter", "focusin"].forEach(function (ev) { c.addEventListener(ev, function () { paused = true; }); });
    ["mouseleave", "focusout"].forEach(function (ev) { c.addEventListener(ev, function () { paused = false; }); });
    var ms = +c.getAttribute("data-lb-auto") || 0;
    if (ms && !reduce && slides.length > 1) setInterval(function () { if (!paused && !document.hidden) show(i + 1); }, ms);
    show(0);
  }
  function countdown(c) {
    var end = +c.getAttribute("data-lb-countdown"); if (!end) return;
    var q = function (s) { return c.querySelector(s); };
    function tick() {
      var left = end - Date.now();
      if (left <= 0) { var o = q(".lb-over"), k = q(".lb-clock"); if (o) o.hidden = false; if (k) k.hidden = true; var a = q(".lb-cta"); if (a) a.hidden = true; return true; }
      var d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60, s = Math.floor(left / 1e3) % 60, p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      q("[data-lb-d]").textContent = d; q("[data-lb-h]").textContent = p2(h); q("[data-lb-m]").textContent = p2(m); q("[data-lb-s]").textContent = p2(s);
      return false;
    }
    if (!tick()) { var t = setInterval(function () { if (tick()) clearInterval(t); }, 1000); }
  }
  function edge(el) {
    var tab = el.querySelector("[data-lb-tab]"); if (!tab) return;
    tab.addEventListener("click", function () { var open = el.classList.toggle("is-open"); tab.setAttribute("aria-expanded", open ? "true" : "false"); });
  }

  // ---- start ----
  all.sort(function (a, b) { return (+a.getAttribute("data-prio") - +b.getAttribute("data-prio")) || (+a.getAttribute("data-lb-id") - +b.getAttribute("data-lb-id")); });
  all.forEach(function (el) {
    Array.prototype.forEach.call(el.querySelectorAll("[data-lb-carousel]"), carousel);
    Array.prototype.forEach.call(el.querySelectorAll("[data-lb-countdown]"), countdown);
    edge(el);
    var x = el.querySelector("[data-lb-close]"); if (x) x.addEventListener("click", function () { close(el); });
    if (el.getAttribute("data-mode") === "inline") { if (!allowed(el) || !deviceOk(el)) el.classList.add("is-gone"); else { markSeen(el); if (io) io.observe(el); } return; }
    arm(el);
  });
})();
