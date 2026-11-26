/* Live banners admin: one editable card per slide (picture, phone picture, text, link, schedule, numbers). Called by 03-items.js. */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin, el = LB.el, F = LB.field;

  function newKey() { return "s" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36); }
  function figures(it) {
    var s = (LB.state.slideStats || {})[it.source_key];
    if (!s) return "";
    return s.views + " views · " + s.clicks + " clicks · " + (s.views ? Math.round((s.clicks / s.views) * 1000) / 10 : 0) + "% CTR";
  }

  LB.slideRow = function (it, i, ctx) {
    var base = "items." + i + ".overrides.", ov = it.overrides = it.overrides || {};
    var card = el("li", { class: "lb-slide-card-wrap" });
    var d = el("details", { class: "lb-slide-card" }); if (!ov.image || ctx.items().length < 3) d.open = true;
    var thumb = el("img", { class: "lb-slide-card__thumb", alt: "", width: 64, height: 36, hidden: !/^(\/|https:\/\/)/.test(ov.image || "") });
    if (!thumb.hidden) thumb.src = ov.image;
    d.appendChild(el("summary", {}, [thumb, el("span", { text: "Slide " + (i + 1) + (ov.label ? " — " + ov.label : "") }), el("span", { class: "lb-slide-card__stats", text: figures(it) })]));
    var swap = function (from, to) { var a = ctx.items(); if (to < 0 || to >= a.length) return; a.splice(to, 0, a.splice(from, 1)[0]); ctx.redraw(); };
    var tools = el("div", { class: "lb-slide-card__tools" }, [
      LB.btn("↑ Up", function () { swap(i, i - 1); }), LB.btn("↓ Down", function () { swap(i, i + 1); }),
      LB.btn("Duplicate", function () { var a = ctx.items(); if (a.length >= ctx.max) { LB.say("This slider holds at most " + ctx.max + " slides.", true); return; } a.splice(i + 1, 0, { source_type: "slide", source_key: newKey(), overrides: JSON.parse(JSON.stringify(ov)) }); ctx.redraw(); }),
      LB.btn("Remove", function () { ctx.items().splice(i, 1); ctx.redraw(); }, "btn btn--danger btn--sm")]);
    d.appendChild(el("div", { class: "lb-slide-card__body" }, [
      LB.imageField(base + "image", "Picture (required, Media library or https://)", ""),
      LB.imageField(base + "image_mobile", "Picture for phones (optional, for example a square or 4:3 crop)", ""),
      F({ path: base + "alt", label: "Picture description for screen readers (alt text)", max: 160 }),
      F({ path: base + "label", label: "Headline (optional)", max: 120 }), F({ path: base + "subtitle", label: "Short text under the headline (optional)", max: 200 }), F({ path: base + "badge", label: "Badge, e.g. NEW or 100% bonus (optional)", max: 30 }),
      F({ path: base + "url", label: "Link when clicked (/path, https:// or mailto:)", max: 2048, hint: "Every slide with a link is clickable as a whole. Slides without one use the banner-wide link, if any." }),
      F({ path: base + "cta_label", label: "Button text (optional)", max: 40 }), F({ path: base + "new_tab", label: "Open the link in a new tab", type: "checkbox" }),
      F({ path: base + "sponsored", label: "Paid or affiliate link (adds rel=\"sponsored\")", type: "checkbox" }),
      F({ path: base + "text_pos", label: "Text position", type: "select", options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] }),
      F({ path: base + "duration", label: "Seconds on screen (empty = slider default)", type: "number", min: 2, max: 60 }),
      F({ path: base + "start_at", label: "Show from (UTC, empty = now)", type: "datetime" }), F({ path: base + "end_at", label: "Show until (UTC, empty = no end)", type: "datetime" }),
      tools]));
    card.appendChild(d);
    return card;
  };
})();
