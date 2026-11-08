/* Live banners admin: picture field, small repeaters, and the item picker (references, not copies). */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin, el = LB.el;

  LB.imageField = function (path, label, f) {
    var input = el("input", { type: "text", maxlength: 2048, placeholder: "/media/... or https://..." }), thumb = el("img", { alt: "", width: 56, height: 40, class: "lb-thumb", hidden: true });
    var show = function () { var v = input.value.trim(); thumb.hidden = !/^(\/|https:\/\/)/.test(v); if (!thumb.hidden) thumb.src = v; };
    input.value = LB.get(path) || ""; show();
    input.addEventListener("input", function () { LB.set(path, input.value.trim()); show(); });
    var pick = LB.btn("Choose from Media", function () {
      var mp = window.MediaPicker;
      if (!mp || !mp.openImagePicker) { LB.say("The Media library is not available here. Paste a picture address instead.", true); return; }
      mp.openImagePicker(function (m) { if (!m) return; input.value = m.url || m.public_url || ""; LB.set(path, input.value); show(); });
    });
    var rm = LB.btn("Remove", function () { input.value = ""; LB.set(path, ""); show(); });
    return el("div", { class: "form-group lb-f", "data-f": f }, [el("label", { text: label }), input, el("div", { class: "lb-row" }, [thumb, pick, rm])]);
  };

  LB.listField = function (path, label, max, f) {
    var wrap = el("div", { class: "form-group lb-f", "data-f": f }, [el("label", { text: label })]), cur = (LB.get(path) || []).slice();
    for (var i = 0; i < max; i++) (function (i) {
      var inp = el("input", { type: "text", maxlength: 200, "aria-label": label + " " + (i + 1) }); inp.value = cur[i] || "";
      inp.addEventListener("input", function () { cur[i] = inp.value; LB.set(path, cur.filter(Boolean)); }); wrap.appendChild(inp);
    })(i);
    return wrap;
  };

  LB.pairsField = function (path, label, max, keys, f) {
    var wrap = el("div", { class: "form-group lb-f", "data-f": f }, [el("label", { text: label })]), cur = (LB.get(path) || []).map(function (x) { return Object.assign({}, x); });
    for (var i = 0; i < max; i++) (function (i) {
      var row = el("div", { class: "lb-row" }); cur[i] = cur[i] || {};
      keys.forEach(function (k) {
        var inp = el("input", { type: "text", maxlength: 120, placeholder: k, "aria-label": label + " " + (i + 1) + " " + k }); inp.value = cur[i][k] || "";
        inp.addEventListener("input", function () { cur[i][k] = inp.value; LB.set(path, cur.filter(function (r) { return keys.some(function (kk) { return r[kk]; }); })); }); row.appendChild(inp);
      }); wrap.appendChild(row);
    })(i);
    return wrap;
  };

  function tplInfo() { return LB.state.templates.filter(function (t) { return t.key === LB.get("template_key"); })[0] || { sources: [], maxItems: 0 }; }
  var LABELS = { casino: "Casinos", news: "News", research: "Research", author: "Authors", update: "Updates", sportsbook: "Sportsbooks", affiliate_partner: "Partners", custom: "Custom", media: "Media" };

  LB.itemsField = function () {
    var box = el("div", { class: "form-group lb-f", "data-f": "items" }), list = el("ol", { class: "lb-items" });
    var items = function () { return LB.state.draft.items; };
    function row(it, i) {
      var li = el("li", { class: "lb-item" }, [el("strong", { text: it.source_type === "slide" ? "Slide " + (i + 1) : it.source_type + ": " + it.source_key })]);
      if (it.source_type === "slide") {
        [["label", "Caption"], ["image", "Picture address"], ["url", "Link"]].forEach(function (p) {
          var inp = el("input", { type: "text", placeholder: p[1], "aria-label": "Slide " + (i + 1) + " " + p[1] }); inp.value = it.overrides[p[0]] || "";
          inp.addEventListener("input", function () { it.overrides[p[0]] = inp.value.trim(); LB.changed(); }); li.appendChild(inp);
        });
      } else {
        var lab = el("input", { type: "text", placeholder: "Custom label (optional)", "aria-label": "Custom label" }); lab.value = it.overrides.label || "";
        lab.addEventListener("input", function () { it.overrides.label = lab.value; LB.changed(); }); li.appendChild(lab);
      }
      li.appendChild(LB.btn("↑", function () { if (i > 0) { items().splice(i - 1, 0, items().splice(i, 1)[0]); draw(); LB.changed(); } }, "btn btn--ghost btn--sm"));
      li.appendChild(LB.btn("↓", function () { if (i < items().length - 1) { items().splice(i + 1, 0, items().splice(i, 1)[0]); draw(); LB.changed(); } }, "btn btn--ghost btn--sm"));
      li.appendChild(LB.btn("Remove", function () { items().splice(i, 1); draw(); LB.changed(); }, "btn btn--danger btn--sm"));
      return li;
    }
    function add(src, key) {
      var t = tplInfo();
      if (items().length >= t.maxItems) return false;
      if (items().some(function (x) { return x.source_type === src && x.source_key === key; })) return true;
      items().push({ source_type: src, source_key: String(key), overrides: {} }); draw(); LB.changed(); return true;
    }
    function draw() { list.textContent = ""; items().forEach(function (it, i) { list.appendChild(row(it, i)); }); count.textContent = items().length + " of " + tplInfo().maxItems; }
    var count = el("small", { class: "muted" });
    var t = tplInfo(), isSlider = t.sources.indexOf("slide") >= 0;
    var pick = LB.btn(isSlider ? "Add slide" : "Pick items", function () {
      if (isSlider) { add("slide", "s" + Date.now().toString(36)); return; }
      if (!window.LummetPicker) { LB.say("The picker is not loaded. Type a slug below.", true); return; }
      window.LummetPicker.open({ sources: t.sources.map(function (s) { return [s, LABELS[s] || s]; }) }, function (p) { return add(p.source, p.key); });
    });
    // manual entry keeps working without the components permission
    var slug = el("input", { type: "text", placeholder: "or type a slug", maxlength: 140, "aria-label": "Item slug" });
    var kind = el("select", { "aria-label": "Item type" }, t.sources.filter(function (s) { return s !== "slide"; }).map(function (s) { return el("option", { value: s, text: LABELS[s] || s }); }));
    var manual = isSlider ? null : el("div", { class: "lb-row" }, [kind, slug, LB.btn("Add", function () { if (slug.value.trim()) { if (add(kind.value, slug.value.trim()) === false) LB.say("This template holds at most " + t.maxItems + " items.", true); slug.value = ""; } })]);
    box.appendChild(el("label", { text: "Items (shown in this order; live data is looked up when the page is built)" })); box.appendChild(list); box.appendChild(el("div", { class: "lb-row" }, [pick, count])); if (manual) box.appendChild(manual);
    draw();
    return box;
  };
})();
