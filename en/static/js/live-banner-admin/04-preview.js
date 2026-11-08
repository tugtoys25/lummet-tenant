/* Live banners admin: live preview in a sandboxed iframe (no scripts), fed from the unsaved form. Nothing is saved. */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin, el = LB.el, timer = null, seq = 0;
  var WIDTH = { desktop: "100%", tablet: "768px", phone: "375px" }, device = "desktop";

  LB.buildPreview = function () {
    var frame = el("iframe", { id: "lbPreviewFrame", title: "Banner preview", sandbox: "", class: "lb-preview-frame" });
    var bar = el("div", { class: "lb-row", role: "group", "aria-label": "Preview device" });
    Object.keys(WIDTH).forEach(function (d) {
      var b = LB.btn(d, function () { device = d; frame.style.width = WIDTH[d]; Array.prototype.forEach.call(bar.children, function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); }); }, "btn btn--ghost btn--sm");
      b.setAttribute("aria-pressed", d === device ? "true" : "false"); bar.appendChild(b);
    });
    frame.style.width = WIDTH[device];
    return el("aside", { class: "lb-preview", "aria-label": "Live preview" }, [el("h3", { text: "Preview" }), bar, el("div", { class: "lb-preview-stage" }, [frame]), el("p", { class: "muted", id: "lbPreviewNote", text: "Updates as you type. Animations and sliders are static here." })]);
  };

  function doc(html) {
    var css = location.origin + "/static/css/public.css";
    // the markup is built by the server (everything escaped); it is shown in place instead of fixed to the screen
    var shown = html.replace('class="lb ', 'class="lb is-on ');
    return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="' + css + '">' +
      '<style>body{margin:0;padding:16px;background:#e5e7eb;font-family:system-ui,sans-serif}.lb{position:static!important;margin:0 auto!important;display:block!important}.lb--edge .lb-card{display:block!important}.lb--bar,.lb--edge{width:100%!important}</style><body>' + shown;
  }

  LB.refreshPreview = function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var mine = ++seq, frame = document.getElementById("lbPreviewFrame"), note = document.getElementById("lbPreviewNote");
      if (!frame) return;
      LB.api("/en/api/v1/live-banner/preview", LB.payload()).then(function (d) {
        if (mine !== seq) return;
        if (d && d.success && d.html) { frame.srcdoc = doc(d.html); note.textContent = "Updates as you type. Animations and sliders are static here."; }
        else note.textContent = (d && d.error) || "Fill in the required fields to see the preview.";
      });
    }, 450);
  };
})();
