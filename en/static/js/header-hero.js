// Public header behaviour driven by Dashboard > Header & Hero:
//   - remembers a dismissed announcement bar (per announcement text)
//   - gives a transparent header a solid background once the page scrolls
// No innerHTML, no dynamic-code sinks, and it does nothing when the markup is absent.
(function () {
  "use strict";

  function read(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* storage may be blocked */ } }

  function initAnnouncement() {
    var bar = document.querySelector(".hh-announce[data-announce-id]");
    if (!bar) return;
    var storeKey = "hh.announce." + bar.getAttribute("data-announce-id");
    if (read(storeKey) === "closed") { bar.hidden = true; return; }
    var close = bar.querySelector("[data-announce-close]");
    if (close) {
      close.addEventListener("click", function () {
        bar.hidden = true;
        write(storeKey, "closed");
      });
    }
  }

  function initScrolledHeader() {
    var header = document.querySelector(".site-header");
    if (!header || !document.body.classList.contains("hh-style-transparent")) return;
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 24); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function init() { initAnnouncement(); initScrolledHeader(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
