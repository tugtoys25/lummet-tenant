// Homepage hero media (Dashboard > Header & Hero): slideshow of images and short videos.
//   - fades or slides between slides, on a timer or by hand
//   - videos play muted and inline; with several slides a video advances when it ends
//   - arrows, dots, keyboard (left/right), swipe, and a pause button
//   - pauses when the tab is hidden, when the hero is off screen, on hover (if chosen)
//   - respects "reduce motion" and "data saver": no autoplay motion, videos stay on their poster
// It builds no HTML from strings (no innerHTML) and does nothing when the markup is absent.
(function () {
  "use strict";

  // Only these two player addresses are ever put into an iframe, whatever the markup says.
  var ALLOWED_EMBED = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?|player\.vimeo\.com\/video\/\d{5,12}\?)/;

  var modalOpen = false;
  var modalWatchers = [];
  var modal = null;
  var modalOpener = null;

  function notifyModal() { modalWatchers.forEach(function (fn) { fn(modalOpen); }); }

  function makeFrame(url, title) {
    var f = document.createElement("iframe");
    f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    f.title = title || "Video";
    f.src = url;
    return f;
  }

  function closeModal() {
    if (!modal) return;
    var overlay = modal;
    modal = null;
    document.removeEventListener("keydown", onModalKey, true);
    document.documentElement.classList.remove("hh-modal-open");
    var frame = overlay.querySelector("iframe");
    if (frame) frame.src = "about:blank";
    overlay.parentNode.removeChild(overlay);
    modalOpen = false;
    notifyModal();
    if (modalOpener && modalOpener.focus) { try { modalOpener.focus(); } catch (e) { /* element gone */ } }
    modalOpener = null;
  }

  function onModalKey(e) {
    if (!modal) return;
    if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
    // the player is in another document and cannot be tabbed through, so keep focus on the close button
    if (e.key === "Tab") { e.preventDefault(); var b = modal.querySelector(".hh-modal__close"); if (b) b.focus(); }
  }

  function openModal(url, title, trigger) {
    if (modal || !ALLOWED_EMBED.test(String(url || ""))) return;
    modalOpener = trigger || null;
    var overlay = document.createElement("div");
    overlay.className = "hh-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", title || "Video");
    var box = document.createElement("div");
    box.className = "hh-modal__box";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "hh-modal__close";
    close.setAttribute("aria-label", "Close video");
    close.textContent = "\u00D7";
    var frameWrap = document.createElement("div");
    frameWrap.className = "hh-modal__frame";
    frameWrap.appendChild(makeFrame(url, title));
    box.appendChild(close);
    box.appendChild(frameWrap);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    close.addEventListener("click", closeModal);
    document.body.appendChild(overlay);
    document.documentElement.classList.add("hh-modal-open");
    document.addEventListener("keydown", onModalKey, true);
    modal = overlay;
    modalOpen = true;
    notifyModal();
    close.focus();
  }

  // any button with data-hh-embed (the hero's "Watch video" button, a slide's pill) opens the player
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-hh-embed]") : null;
    if (!t) return;
    e.preventDefault();
    openModal(t.getAttribute("data-hh-embed"), t.getAttribute("data-hh-title"), t);
  });

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = Boolean(navigator.connection && navigator.connection.saveData);

  function init(hero) {
    var media = hero.querySelector(".hero-media");
    if (!media) return;
    var slides = Array.prototype.slice.call(media.querySelectorAll(".hero-slide"));
    if (!slides.length) return;

    var ui = hero.querySelector(".hero-media__ui");
    var dots = ui ? Array.prototype.slice.call(ui.querySelectorAll("[data-hh-dot]")) : [];
    var toggle = ui ? ui.querySelector("[data-hh-toggle]") : null;
    var many = slides.length > 1;
    var interval = Math.max(3000, parseInt(media.getAttribute("data-interval"), 10) || 6000);
    var wantsAuto = media.getAttribute("data-autoplay") === "1" && many && !reduceMotion;
    var pauseOnHover = media.getAttribute("data-pause-hover") === "1";

    var embedMobile = media.getAttribute("data-embed-mobile") === "1";
    var phone = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    // Online background videos are the heaviest thing here: not for reduced motion, data saver,
    // or (unless chosen) phones. Those visitors keep the poster picture.
    var allowEmbeds = !reduceMotion && !saveData && (embedMobile || !phone);
    var watchPills = ui ? Array.prototype.slice.call(ui.querySelectorAll("[data-hh-watch-for]")) : [];

    var index = 0;
    var timer = null;
    var userPaused = false;
    var hovering = false;
    var tabHidden = document.hidden;
    var onScreen = true;

    if (saveData) media.classList.add("hero-media--saver");

    function videoOf(slide) { return slide.querySelector("video"); }

    function playVideo(slide) {
      var v = videoOf(slide);
      if (!v || saveData || reduceMotion) return;
      v.muted = true;
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* autoplay refused: the poster stays */ });
    }
    function stopVideo(slide) {
      var v = videoOf(slide);
      if (!v) return;
      v.pause();
    }

    function running() { return wantsAuto && !userPaused && !hovering && !tabHidden && onScreen && !modalOpen; }

    function embedHost(slide) { return slide.querySelector("[data-hh-bg-embed]"); }
    function playable() { return !userPaused && !tabHidden && onScreen && !modalOpen; }
    function startEmbed(slide) {
      var host = embedHost(slide);
      if (!host || !allowEmbeds || host.firstChild || !playable()) return;
      var url = host.getAttribute("data-hh-bg-embed");
      if (!ALLOWED_EMBED.test(String(url || ""))) return;
      var f = makeFrame(url, "");
      f.setAttribute("tabindex", "-1");
      f.setAttribute("aria-hidden", "true");
      f.addEventListener("load", function () { slide.classList.add("is-embed-ready"); });
      host.appendChild(f);
    }
    function stopEmbed(slide) {
      var host = embedHost(slide);
      if (!host) return;
      while (host.firstChild) host.removeChild(host.firstChild);
      slide.classList.remove("is-embed-ready");
    }
    function syncWatch() {
      watchPills.forEach(function (b) { b.hidden = parseInt(b.getAttribute("data-hh-watch-for"), 10) !== index; });
    }

    function clear() { if (timer) { window.clearTimeout(timer); timer = null; } }

    function schedule() {
      clear();
      if (!running()) return;
      var v = videoOf(slides[index]);
      // a video slide moves on when the video ends (with a safety cap), an image after the interval
      if (v && !saveData) { timer = window.setTimeout(function () { go(index + 1); }, 30000); return; }
      timer = window.setTimeout(function () { go(index + 1); }, interval);
    }

    function setDots() {
      dots.forEach(function (d, i) {
        if (i === index) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
    }

    function go(n) {
      var next = (n + slides.length) % slides.length;
      if (next === index) { schedule(); return; }
      var prev = slides[index];
      if (next !== index) {
        prev.classList.remove("is-active");
        prev.classList.add("is-prev");
        stopVideoLater(prev);
        window.setTimeout(function () { if (!prev.classList.contains("is-active")) stopEmbed(prev); }, 900);
      }
      var cur = slides[next];
      slides.forEach(function (s) { if (s !== prev && s !== cur) s.classList.remove("is-prev"); });
      // a slide that left earlier waits on the left; put it back on the right before it comes in
      if (cur.classList.contains("is-prev")) {
        cur.classList.add("is-instant");
        cur.classList.remove("is-prev");
        void cur.offsetWidth;
        cur.classList.remove("is-instant");
      }
      cur.classList.add("is-active");
      index = next;
      setDots();
      syncWatch();
      startEmbed(cur);
      var v = videoOf(cur);
      if (v) {
        v.loop = !wantsAuto;
        try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
        if (!userPaused && !tabHidden && onScreen) playVideo(cur);
      }
      schedule();
    }

    function stopVideoLater(slide) {
      window.setTimeout(function () { if (!slide.classList.contains("is-active")) stopVideo(slide); }, 900);
    }

    // a finished video moves the show on
    slides.forEach(function (slide) {
      var v = videoOf(slide);
      if (!v) return;
      v.addEventListener("ended", function () { if (wantsAuto && slides[index] === slide && running()) go(index + 1); });
    });

    if (ui) {
      var prevBtn = ui.querySelector("[data-hh-prev]");
      var nextBtn = ui.querySelector("[data-hh-next]");
      if (prevBtn) prevBtn.addEventListener("click", function () { go(index - 1); });
      if (nextBtn) nextBtn.addEventListener("click", function () { go(index + 1); });
      dots.forEach(function (d) {
        d.addEventListener("click", function () { go(parseInt(d.getAttribute("data-hh-dot"), 10) || 0); });
      });
      if (toggle) {
        toggle.addEventListener("click", function () {
          userPaused = !userPaused;
          toggle.setAttribute("aria-pressed", userPaused ? "true" : "false");
          toggle.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
          if (userPaused) { clear(); stopVideo(slides[index]); stopEmbed(slides[index]); } else { playVideo(slides[index]); startEmbed(slides[index]); schedule(); }
        });
      }
    }
    if (!wantsAuto && toggle) toggle.hidden = true;

    if (many) {
      hero.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") go(index - 1);
        else if (e.key === "ArrowRight") go(index + 1);
      });
      var startX = null;
      hero.addEventListener("touchstart", function (e) { startX = e.touches && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
      hero.addEventListener("touchend", function (e) {
        if (startX === null || !e.changedTouches || !e.changedTouches[0]) return;
        var dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) > 45) go(dx < 0 ? index + 1 : index - 1);
      }, { passive: true });
    }

    if (pauseOnHover) {
      hero.addEventListener("mouseenter", function () { hovering = true; clear(); });
      hero.addEventListener("mouseleave", function () { hovering = false; schedule(); });
    }
    hero.addEventListener("focusin", function () { if (pauseOnHover) { hovering = true; clear(); } });
    hero.addEventListener("focusout", function () { hovering = false; schedule(); });

    document.addEventListener("visibilitychange", function () {
      tabHidden = document.hidden;
      if (tabHidden) { clear(); stopVideo(slides[index]); stopEmbed(slides[index]); } else { if (!userPaused) playVideo(slides[index]); startEmbed(slides[index]); schedule(); }
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (!onScreen) { clear(); stopVideo(slides[index]); stopEmbed(slides[index]); } else { if (!userPaused && !tabHidden) playVideo(slides[index]); startEmbed(slides[index]); schedule(); }
      }, { threshold: 0.15 }).observe(hero);
    }

    // while the pop-up player is open, the slideshow and any background video stand still
    modalWatchers.push(function (open) {
      if (open) { clear(); stopVideo(slides[index]); stopEmbed(slides[index]); }
      else { if (!userPaused) playVideo(slides[index]); startEmbed(slides[index]); schedule(); }
    });

    syncWatch();
    // a background video on the first slide starts once the page has finished loading
    var startFirst = function () { window.setTimeout(function () { startEmbed(slides[index]); }, 400); };
    if (document.readyState === "complete") startFirst();
    else window.addEventListener("load", startFirst);

    // the first slide
    var first = videoOf(slides[0]);
    if (first) {
      first.loop = !wantsAuto;
      if (reduceMotion || saveData) first.pause();
    }
    schedule();
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-hh-hero-media]"), init);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
