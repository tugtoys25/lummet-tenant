/* Live banners admin: slider settings card and the "home banner" preset. Loaded after 06-main.js; called when the editor is built. */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin, F = LB.field;
  var DEFAULTS = { autoplay: true, interval: 6, transition: "fade", speed: 600, pause_hover: true, loop: true, arrows: true, nav: "dots", progress: true, counter: false, swipe: true, keyboard: true, ratio: "2:1", mobile_ratio: "same", fit: "cover", overlay: "soft", ad_label: false, ad_text: "Ad" };
  var opts = function (list) { return list.map(function (x) { return [x[0], x[1]]; }); };
  var RATIOS = [["21:9", "21:9 (ultra wide)"], ["3:1", "3:1 (home banner)"], ["4:1", "4:1 (thin strip)"], ["2:1", "2:1"], ["16:9", "16:9"], ["3:2", "3:2"], ["4:3", "4:3"], ["1:1", "1:1 (square)"]];
  var MOBILE = [["same", "Same as desktop"], ["16:9", "16:9"], ["3:2", "3:2"], ["4:3", "4:3"], ["1:1", "1:1 (square)"], ["3:4", "3:4 (portrait)"]];

  /** Home banner: full width under the header, home page only, always visible, wide on desktop and 16:9 on phones. */
  LB.homePreset = function () {
    var d = LB.state.draft; if (!d) return;
    d.template_key = "slider"; d.placement_mode = "inline"; d.anchor = "after_header"; d.width = { preset: "full" }; d.height = {}; d.dismissible = false;
    d.motion = { entrance: "fade", loop: "none", delay_ms: 0 }; d.trigger = { type: "immediate", seconds: 0, scroll: 50 }; d.frequency = { type: "every", days: 7 };
    d.targeting = Object.assign(d.targeting || {}, { pages_mode: "include", page_types: ["home"], slugs: [] });
    d.content = d.content || {}; d.content.slider = Object.assign({}, DEFAULTS, d.content.slider || {}, { ratio: "3:1", mobile_ratio: "16:9", overlay: "soft", progress: true });
    d.style = Object.assign(d.style || {}, { radius: 12, shadow: false });
    LB.rebuild(); LB.say("Home banner settings applied. Add your slides below, then publish.");
  };
  LB.everyPagePreset = function () {
    var d = LB.state.draft; if (!d) return;
    LB.homePreset(); d.targeting.page_types = []; d.targeting.pages_mode = "include"; LB.rebuild(); LB.say("Banner set to show under the header on every page.");
  };

  LB.sliderCard = function () {
    if (LB.get("template_key") !== "slider") return null;
    var c = LB.state.draft.content = LB.state.draft.content || {};
    c.slider = Object.assign({}, DEFAULTS, c.slider || {});
    var p = function (k) { return "content.slider." + k; };
    var presets = LB.el("div", { class: "lb-presets", role: "group", "aria-label": "Quick setups" }, [LB.btn("Use as home banner", LB.homePreset, "btn btn--primary btn--sm"), LB.btn("Show on every page", LB.everyPagePreset, "btn btn--ghost btn--sm")]);
    var hint = LB.el("p", { class: "lb-hint", text: "Each slide below has its own picture, link and optional schedule. Slides rotate on their own, pause when the visitor points at them, and never move for visitors who asked their device to reduce motion." });
    return LB.card("Slider settings (timing, animation, controls)", true, [presets, hint,
      F({ path: p("autoplay"), label: "Rotate automatically", type: "checkbox" }), F({ path: p("interval"), label: "Seconds per slide (a slide can override this)", type: "number", min: 2, max: 30 }),
      F({ path: p("transition"), label: "Animation", type: "select", options: [["fade", "Fade"], ["slide", "Slide"], ["zoom", "Zoom and fade"], ["kenburns", "Fade with slow zoom (Ken Burns)"]] }),
      F({ path: p("speed"), label: "Animation length (milliseconds)", type: "number", min: 200, max: 2000, step: 50 }),
      F({ path: p("ratio"), label: "Shape on desktop and tablet (width : height)", type: "select", options: opts(RATIOS) }), F({ path: p("mobile_ratio"), label: "Shape on phones", type: "select", options: opts(MOBILE) }),
      F({ path: p("fit"), label: "Picture fit", type: "select", options: [["cover", "Fill the frame (crops edges)"], ["contain", "Show the whole picture"]] }),
      F({ path: p("overlay"), label: "Shade behind text", type: "select", options: [["soft", "Soft"], ["strong", "Strong"], ["none", "None"]] }),
      F({ path: p("arrows"), label: "Previous / next arrows", type: "checkbox" }), F({ path: p("nav"), label: "Slide indicators", type: "select", options: [["dots", "Dots"], ["bars", "Bars"], ["none", "Hidden"]] }),
      F({ path: p("progress"), label: "Progress bar", type: "checkbox" }), F({ path: p("counter"), label: "Slide counter (1 / 5)", type: "checkbox" }),
      F({ path: p("pause_hover"), label: "Pause while the mouse is over it", type: "checkbox" }), F({ path: p("loop"), label: "Loop back to the first slide", type: "checkbox" }),
      F({ path: p("swipe"), label: "Swipe on touch screens", type: "checkbox" }), F({ path: p("keyboard"), label: "Arrow keys work when focused", type: "checkbox" }),
      F({ path: p("ad_label"), label: "Show an advertising label on every slide (recommended for paid placements)", type: "checkbox" }), F({ path: p("ad_text"), label: "Label text", max: 12 })]);
  };
})();
