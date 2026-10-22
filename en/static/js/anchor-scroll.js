// Citation numbers and other in-page links on research pages: go straight to the target and stay there.
// The browser's own jump is smooth-animated on phones and the page above the target can still be
// growing (pictures loading), which made the page move, then bounce back or stop in the wrong place.
// Here the jump is instant, and it is repeated while the page settles, so the target ends up just
// below the sticky bars.
(function () {
  "use strict";
  var SELECTOR = 'a[href^="#research-source-"], a.research-citation__footnote';

  function offsetTop() {
    var pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    return pad || 84;
  }
  function place(target) {
    var top = target.getBoundingClientRect().top + window.pageYOffset - offsetTop();
    var root = document.documentElement;
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto"; // never animate, an animation is what gets interrupted
    window.scrollTo(0, Math.max(0, top));
    root.style.scrollBehavior = prev;
  }
  function go(target) {
    place(target);
    // keep it in place while pictures above it finish loading (about 1.5 s at most)
    var stop = Date.now() + 1500;
    var timer = window.setInterval(function () {
      if (Date.now() > stop) { window.clearInterval(timer); return; }
      var gap = Math.abs(target.getBoundingClientRect().top - offsetTop());
      if (gap > 2) place(target);
    }, 120);
    // a touch, wheel or key press by the reader ends the correcting at once
    function release() {
      window.clearInterval(timer);
      ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { window.removeEventListener(t, release, true); });
    }
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { window.addEventListener(t, release, { capture: true, passive: true }); });
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest(SELECTOR);
    if (!a) return;
    var id = decodeURIComponent((a.getAttribute("href") || "").slice(1));
    var target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    go(target);
    if (window.history && history.replaceState) history.replaceState(history.state, "", "#" + encodeURIComponent(id));
    target.setAttribute("tabindex", "-1");
    try { target.focus({ preventScroll: true }); } catch (err) { /* old browsers */ }
  });
})();
