/* Live banners admin: the five editor sections and per-template field visibility. */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin;
  var F = LB.field;
  var MODES = { floating: ["bottom-right", "bottom-left", "top-right", "top-left", "center"], edge: ["left", "right", "top", "bottom"], bar: ["top", "bottom"], inline: ["after_header", "before_main", "after_main", "sidebar", "top", "content_bottom", "bottom"] };
  var opt = function (list) { return list.map(function (x) { return [x, x.replace(/[-_]/g, " ")]; }); };
  // which content fields each template uses
  LB.TPL_FIELDS = {
    promo_card: ["headline", "text", "cta_label", "link", "new_tab", "image", "alt", "disclaimer"], image_banner: ["image", "image_2x", "alt", "headline", "text", "link", "new_tab"],
    casino_spotlight: ["cta_label", "disclaimer", "items"], casino_table: ["headline", "cta_label", "disclaimer", "items"], news_carousel: ["headline", "items"],
    slider: ["headline", "cta_label", "link", "new_tab", "disclaimer", "items"], chat: ["messages", "chips", "image", "cta_label", "link", "new_tab", "disclaimer"],
    robot: ["headline", "text", "cta_label", "link", "new_tab", "disclaimer"], marquee: ["marquee_text", "cta_label", "link", "new_tab"],
    countdown: ["headline", "text", "countdown_end", "cta_label", "link", "new_tab", "disclaimer"], stat_card: ["headline", "rows", "cta_label", "link", "new_tab", "disclaimer"]
  };

  function content() {
    var tpl = F({ path: "template_key", label: "Template", type: "select", options: LB.state.templates.map(function (t) { return [t.key, t.label]; }) });
    var nodes = [tpl, F({ path: "name", label: "Name (only you see this)", f: "*" }),
      F({ path: "content.headline", label: "Headline", f: "headline" }), F({ path: "content.text", label: "Body text", type: "textarea", f: "text" }),
      F({ path: "content.marquee_text", label: "Scrolling text", f: "marquee_text", max: 300 }), F({ path: "content.countdown_end", label: "Countdown ends (date and time, UTC)", type: "datetime", f: "countdown_end" }),
      F({ path: "content.cta_label", label: "Button label", f: "cta_label", max: 40 }), F({ path: "content.link", label: "Button link (/path, https:// or mailto:)", f: "link", max: 2048 }),
      F({ path: "content.new_tab", label: "Open in a new tab", type: "checkbox", f: "new_tab" }),
      F({ path: "content.alt", label: "Picture description (alt text)", f: "alt", max: 120 }), F({ path: "content.disclaimer", label: "Disclaimer line (e.g. 18+, T&Cs apply)", f: "disclaimer", max: 240 })];
    return LB.card("1. Content", true, nodes.concat([LB.imageField("content.image", "Picture (Media library or https://)", "image"), LB.imageField("content.image_2x", "Picture for sharp screens (optional, 2x)", "image_2x"),
      LB.listField("content.messages", "Chat messages (1 to 3)", 3, "messages"), LB.pairsField("content.chips", "Quick-reply links", 4, ["label", "url"], "chips"), LB.pairsField("content.rows", "Rows (label and value)", 8, ["k", "v"], "rows"), LB.itemsField()]));
  }
  function look() {
    return LB.card("2. Look", false, [F({ path: "style.bg", label: "Background colour" }), F({ path: "style.text", label: "Text colour" }), F({ path: "style.accent", label: "Accent / button colour" }),
      F({ path: "style.gradient", label: "Gradient", type: "checkbox" }), F({ path: "style.radius", label: "Corner radius (px)", type: "number", min: 0, max: 40 }), F({ path: "style.shadow", label: "Shadow", type: "checkbox" }),
      F({ path: "style.border", label: "Border", type: "checkbox" }), F({ path: "style.opacity", label: "Opacity (0.3 to 1)", type: "number", min: 0.3, max: 1, step: 0.05 }),
      F({ path: "style.font_scale", label: "Text size (0.8 to 1.4)", type: "number", min: 0.8, max: 1.4, step: 0.05 }), F({ path: "style.scheme", label: "Light / dark", type: "select", options: [["auto", "Follow the visitor"], ["light", "Always light"], ["dark", "Always dark"]] })]);
  }
  function size() {
    var p = [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["full", "Full width"], ["custom", "Custom"]];
    return LB.card("3. Size", false, [F({ path: "width.preset", label: "Size preset", type: "select", options: p }), F({ path: "width.value", label: "Custom width", type: "number", min: 10, max: 1200 }), F({ path: "width.unit", label: "Width unit", type: "select", options: [["px", "px"], ["%", "%"], ["vw", "vw"]] }),
      F({ path: "height.value", label: "Custom height (empty = automatic)", type: "number", min: 5, max: 900 }), F({ path: "height.unit", label: "Height unit", type: "select", options: [["px", "px"], ["%", "%"], ["vw", "vw"]] }),
      F({ path: "width.tablet.value", label: "Tablet width (px, optional)", type: "number", min: 120, max: 1200 }), F({ path: "width.mobile.value", label: "Phone width (px, optional)", type: "number", min: 120, max: 1200 })]);
  }
  function placement() {
    var mode = F({ path: "placement_mode", label: "Mode", type: "select", options: [["floating", "Floating card / modal"], ["edge", "Edge rail / pull-tab"], ["bar", "Sticky bar"], ["inline", "Inline in the page"]] });
    var anchor = F({ path: "anchor", label: "Anchor", type: "select", options: opt(MODES[LB.get("placement_mode")] || MODES.floating) });
    var grid = LB.el("div", { class: "lb-grid3", role: "group", "aria-label": "Position on screen (floating mode)" });
    ["top-left", "", "top-right", "", "center", "", "bottom-left", "", "bottom-right"].forEach(function (a) {
      if (!a) { grid.appendChild(LB.el("span")); return; }
      var b = LB.btn(a.replace("-", " "), function () { LB.set("placement_mode", "floating"); LB.set("anchor", a); LB.rebuild(); }, "btn btn--ghost btn--sm" + (LB.get("anchor") === a && LB.get("placement_mode") === "floating" ? " is-on" : ""));
      b.setAttribute("aria-pressed", LB.get("anchor") === a && LB.get("placement_mode") === "floating" ? "true" : "false"); grid.appendChild(b);
    });
    return LB.card("4. Placement", false, [grid, mode, anchor, F({ path: "offset_x", label: "Offset sideways (px)", type: "number", min: 0, max: 200 }), F({ path: "offset_y", label: "Offset from edge (px)", type: "number", min: 0, max: 200 }),
      F({ path: "z_tier", label: "Layer (1 lowest, 3 highest; always below the site header)", type: "number", min: 1, max: 3 }), F({ path: "style.max_per_anchor", label: "Max visible per anchor (1 to 3, extra ones queue)", type: "number", min: 1, max: 3 }),
      F({ path: "style.tab_label", label: "Pull-tab label (edge mode)", max: 24 }), F({ path: "priority", label: "Priority (lower shows first)", type: "number", min: 0, max: 100000 })]);
  }
  function audience() {
    var E = ["none", "slide-left", "slide-right", "slide-up", "slide-down", "fade", "zoom", "bounce"], L = ["none", "pulse", "shimmer", "float", "wiggle", "marquee", "typewriter"];
    return LB.card("5. Motion and audience", false, [F({ path: "motion.entrance", label: "Entrance animation", type: "select", options: opt(E) }), F({ path: "motion.loop", label: "Loop animation", type: "select", options: opt(L) }), F({ path: "motion.delay_ms", label: "Animation delay (ms)", type: "number", min: 0, max: 30000 }),
      F({ path: "trigger.type", label: "Show when", type: "select", options: [["immediate", "Immediately"], ["delay", "After N seconds"], ["scroll", "After scrolling N %"], ["exit", "Exit intent (desktop)"]] }), F({ path: "trigger.seconds", label: "Seconds", type: "number", min: 0, max: 300 }), F({ path: "trigger.scroll", label: "Scroll %", type: "number", min: 0, max: 100 }),
      F({ path: "frequency.type", label: "How often", type: "select", options: [["every", "Every page"], ["session", "Once per session"], ["days", "Once per N days"]] }), F({ path: "frequency.days", label: "Days", type: "number", min: 1, max: 365 }), F({ path: "dismissible", label: "Visitors can close it", type: "checkbox" }),
      F({ path: "targeting.countries_mode", label: "Countries", type: "select", options: [["include", "Only these"], ["exclude", "All except these"]] }), F({ path: "targeting.countries", label: "Country codes (ISO, empty = everywhere)", type: "csv" }),
      F({ path: "targeting.devices", label: "Devices", type: "devices" }), F({ path: "targeting.pages_mode", label: "Pages", type: "select", options: [["include", "Only these"], ["exclude", "All except these"]] }),
      F({ path: "targeting.page_types", label: "Page types (e.g. home, casino, news)", type: "csv" }), F({ path: "targeting.slugs", label: "Page slugs", type: "csv" }),
      F({ path: "targeting.auth", label: "Visitors", type: "select", options: [["any", "Everyone"], ["anonymous", "Signed-out only"], ["signed_in", "Signed-in only"]] }),
      F({ path: "start_at", label: "Start (empty = now)", type: "datetime" }), F({ path: "end_at", label: "End (empty = never)", type: "datetime" })]);
  }
  LB.buildSections = function () { return [content(), look(), size(), placement(), audience()]; };
})();
