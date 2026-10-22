// Review section builder (dashboard).
// A review can have up to 30 titled sections. Each one has a type:
//   Text · FAQ · Images + text · Payment methods · Picked items · Cards & grid · Callout · Key figures
// window.SectionBuilder.mount({ root, addButton, presets, onChange }) -> { load(list), read(), destroy() }
//   list item: { title, type, data }   (data is what the server stores for that type)
// DOM calls only (no innerHTML on anything typed by a person).
(function () {
  "use strict";
  var MAX = 30;
  var seq = 0;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function btn(text, cls, fn, title) { var b = el("button", cls || "btn btn--ghost btn--sm", text); b.type = "button"; if (title) { b.title = title; b.setAttribute("aria-label", title); } if (fn) b.addEventListener("click", fn); return b; }
  function field(label, input, hint) { var l = el("label", "sb-field"); l.appendChild(el("span", "sb-field__label", label)); l.appendChild(input); if (hint) l.appendChild(el("span", "sb-hint", hint)); return l; }
  function input(value, ph, max, type) { var i = el("input"); i.type = type || "text"; i.value = value == null ? "" : value; if (ph) i.placeholder = ph; if (max) i.maxLength = max; return i; }
  function area(value, ph, rows, max) { var t = el("textarea"); t.value = value == null ? "" : value; if (ph) t.placeholder = ph; t.rows = rows || 3; if (max) t.maxLength = max; return t; }
  function select(options, value) { var s = el("select"); options.forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; s.appendChild(op); }); s.value = String(value); return s; }
  function row() { var r = el("div", "sb-row"); Array.prototype.slice.call(arguments).forEach(function (c) { if (c) r.appendChild(c); }); return r; }

  // A rich-text box (TinyMCE through RichEditor); the id is unique per box so boxes can be rebuilt freely.
  function richBox(value, height) {
    var id = "sb-rt-" + (++seq);
    var ta = el("textarea"); ta.value = value || ""; ta.rows = 6;
    ta.setAttribute("data-rich-editor", ""); ta.setAttribute("data-editor-id", id); ta.setAttribute("data-editor-folder", "reviews"); ta.setAttribute("data-editor-height", String(height || 260));
    return { id: id, ta: ta, get: function () { return window.RichEditor && RichEditor.isReady(id) ? (RichEditor.get(id) || "") : ta.value; } };
  }
  function dropEditor(id) { try { if (window.RichEditor && RichEditor.isReady(id)) RichEditor.destroy(id); } catch (e) {} }

  // A list of editable rows (plain inputs, so rows can be moved around freely).
  function repeater(opts) {
    var box = el("div", "sb-rep"), rows = el("div", "sb-rep__rows"), count = el("span", "sb-hint");
    function refresh() { count.textContent = rows.children.length + " / " + opts.max; add.disabled = rows.children.length >= opts.max; }
    function addRow(v) {
      if (rows.children.length >= opts.max) return;
      var r = el("div", "sb-rep__row"), body = el("div", "sb-rep__body"), tools = el("div", "sb-rep__tools");
      var api = opts.build(body, v || {});
      r._api = api;
      tools.appendChild(btn("↑", "gr-icon", function () { if (r.previousSibling) rows.insertBefore(r, r.previousSibling); opts.onChange(); }, "Move up"));
      tools.appendChild(btn("↓", "gr-icon", function () { if (r.nextSibling) rows.insertBefore(r.nextSibling, r); opts.onChange(); }, "Move down"));
      tools.appendChild(btn("✕", "gr-icon gr-icon--danger", function () { r.remove(); refresh(); opts.onChange(); }, "Remove"));
      r.appendChild(body); r.appendChild(tools); rows.appendChild(r); refresh();
    }
    var add = btn("+ " + opts.addLabel, "btn btn--ghost btn--sm", function () { addRow({}); opts.onChange(); var last = rows.lastChild; var f = last && last.querySelector("input,textarea"); if (f) f.focus(); });
    (opts.items || []).forEach(addRow);
    box.appendChild(rows); box.appendChild(row(add, count)); refresh();
    return { node: box, read: function () { return Array.prototype.map.call(rows.children, function (r) { return r._api.read(); }); }, add: addRow, refresh: refresh };
  }

  function pickImage(then) {
    if (window.MediaPicker && typeof MediaPicker.openImagePicker === "function") MediaPicker.openImagePicker(function (m) { if (m && m.url) then(m); }, "reviews");
    else alert("The picture library is not available on this page. Paste the picture address instead.");
  }
  function pickLink(then) {
    if (window.LummetPicker) LummetPicker.open({ mode: "link" }, function (p) { if (p && p.url) then(p); });
    else alert("The page picker is not available here. Type the address instead.");
  }
  function imageField(value, label, ph) {
    var wrap = el("div", "sb-img"), i = input(value, ph || "Picture address, or pick one", 600), thumb = el("img", "sb-img__thumb"); thumb.alt = ""; thumb.hidden = !value; if (value) thumb.src = value;
    i.addEventListener("input", function () { thumb.hidden = !i.value; thumb.src = i.value; });
    thumb.addEventListener("error", function () { thumb.hidden = true; });
    var pick = btn("Pick picture", null, function () { pickImage(function (m) { i.value = m.url; thumb.src = m.url; thumb.hidden = false; i.dispatchEvent(new Event("input", { bubbles: true })); }); });
    wrap.appendChild(thumb); wrap.appendChild(i); wrap.appendChild(pick);
    return { node: field(label, wrap), get value() { return i.value.trim(); }, input: i };
  }
  function linkField(value, label) {
    var wrap = el("div", "sb-img"), i = input(value, "https://… or /en/page — or pick a page", 600);
    wrap.appendChild(i); wrap.appendChild(btn("Pick page", null, function () { pickLink(function (p) { i.value = p.url; i.dispatchEvent(new Event("input", { bubbles: true })); }); }));
    return { node: field(label, wrap), get value() { return i.value.trim(); } };
  }

  var payCache = null;
  function loadPayments() {
    if (payCache) return payCache;
    payCache = fetch("/en/api/v1/payment-methods/list").then(function (r) { return r.json(); }).then(function (d) { return (d && d.payment_methods) || []; }).catch(function () { payCache = null; return []; });
    return payCache;
  }

  // ---------------------------------------------------------------- types
  var TYPES = {
    rich: {
      label: "Text", icon: "¶", help: "Formatted text with pictures, tables, links and the page picker.",
      blank: function () { return { html: "", size: "m", align: "left", width: "full" }; },
      mount: function (body, d, change) {
        var rt = richBox(d.html, 300); body.appendChild(rt.ta);
        var size = select([["s", "Small"], ["m", "Normal"], ["l", "Large"]], d.size), align = select([["left", "Left"], ["center", "Centered"], ["justify", "Justified"]], d.align), width = select([["full", "Full width"], ["narrow", "Readable width"]], d.width);
        [size, align, width].forEach(function (s) { s.addEventListener("change", change); });
        body.appendChild(row(field("Text size", size), field("Alignment", align), field("Width", width)));
        return { read: function () { return { html: rt.get(), size: size.value, align: align.value, width: width.value }; }, editors: [rt.id] };
      }
    },
    faq: {
      label: "FAQ", icon: "?", help: "Questions and answers as an expandable list. Search engines can show them too.",
      blank: function () { return { items: [{ q: "", a: "" }], open_first: false }; },
      mount: function (body, d, change) {
        var rep = repeater({ items: d.items, max: 40, addLabel: "Add question", onChange: change, build: function (b, v) {
          var q = input(v.q, "Question", 240), a = area(v.a, "Answer", 3, 4000);
          q.addEventListener("input", change); a.addEventListener("input", change);
          b.appendChild(field("Question", q)); b.appendChild(field("Answer", a));
          return { read: function () { return { q: q.value, a: a.value }; } };
        } });
        var open = el("input"); open.type = "checkbox"; open.checked = !!d.open_first; open.addEventListener("change", change);
        var lab = el("label", "sb-check"); lab.appendChild(open); lab.appendChild(el("span", null, "Show the first answer open"));
        body.appendChild(rep.node); body.appendChild(lab);
        return { read: function () { return { items: rep.read(), open_first: open.checked }; }, editors: [] };
      }
    },
    media: {
      label: "Images + text", icon: "▣", help: "One picture or a gallery, with text before or after it.",
      blank: function () { return { images: [], layout: "grid3", fit: "cover", ratio: "auto", size: "full", align: "center", text_html: "", text_position: "after" }; },
      mount: function (body, d, change) {
        var rep = repeater({ items: d.images, max: 24, addLabel: "Add picture", onChange: change, build: function (b, v) {
          var img = imageField(v.src, "Picture"), alt = input(v.alt, "Describe the picture (for accessibility)", 200), cap = input(v.caption, "Caption (optional)", 300), link = linkField(v.link, "Link (optional)");
          [img.input, alt, cap].forEach(function (i) { i.addEventListener("input", change); });
          b.appendChild(img.node); b.appendChild(row(field("Description", alt), field("Caption", cap))); b.appendChild(link.node);
          return { read: function () { return { src: img.value, alt: alt.value, caption: cap.value, link: link.value }; } };
        } });
        var layout = select([["single", "One picture"], ["grid2", "Gallery, 2 columns"], ["grid3", "Gallery, 3 columns"], ["grid4", "Gallery, 4 columns"]], d.layout);
        var fit = select([["cover", "Fill the frame (crop)"], ["contain", "Show whole picture"]], d.fit);
        var ratio = select([["auto", "Natural shape"], ["16:9", "Wide 16:9"], ["4:3", "Classic 4:3"], ["1:1", "Square"]], d.ratio);
        var size = select([["full", "Full width"], ["large", "Large"], ["medium", "Medium"], ["small", "Small"]], d.size);
        var align = select([["center", "Centered"], ["left", "Left"], ["right", "Right"]], d.align);
        var pos = select([["after", "Text after the pictures"], ["before", "Text before the pictures"]], d.text_position);
        [layout, fit, ratio, size, align, pos].forEach(function (s) { s.addEventListener("change", change); });
        var rt = richBox(d.text_html, 220);
        body.appendChild(rep.node);
        body.appendChild(row(field("Layout", layout), field("Picture frame", fit), field("Shape", ratio)));
        body.appendChild(row(field("Size (one picture)", size), field("Position (one picture)", align), field("Text", pos)));
        body.appendChild(el("p", "sb-hint", "Text"));
        body.appendChild(rt.ta);
        return { read: function () { return { images: rep.read(), layout: layout.value, fit: fit.value, ratio: ratio.value, size: size.value, align: align.value, text_position: pos.value, text_html: rt.get() }; }, editors: [rt.id] };
      }
    },
    payments: {
      label: "Payment methods", icon: "$", help: "Pick payment methods one by one or in bulk, with text before or after.",
      blank: function () { return { ids: [], layout: "chips", text_html: "", text_position: "after" }; },
      mount: function (body, d, change) {
        var ids = (d.ids || []).slice();
        var chosen = el("div", "sb-chips"), list = el("div", "sb-paylist"), q = input("", "Search payment methods…", 60, "search"), status = el("span", "sb-hint");
        var all = [];
        function nameOf(id) { var m = all.filter(function (x) { return x.id === id; })[0]; return m ? m.name : "#" + id; }
        function drawChosen() {
          chosen.textContent = "";
          if (!ids.length) chosen.appendChild(el("span", "sb-hint", "Nothing picked yet."));
          ids.forEach(function (id) { var c = el("span", "sb-chip", nameOf(id) + " "); c.appendChild(btn("✕", "sb-chip__x", function () { ids = ids.filter(function (x) { return x !== id; }); drawChosen(); drawList(); change(); }, "Remove " + nameOf(id))); chosen.appendChild(c); });
          status.textContent = ids.length + " picked";
        }
        function shown() { var t = q.value.trim().toLowerCase(); return all.filter(function (m) { return !t || (m.name + " " + m.slug).toLowerCase().indexOf(t) !== -1; }); }
        function drawList() {
          list.textContent = "";
          var rows = shown();
          if (!rows.length) list.appendChild(el("p", "sb-hint", all.length ? "No match." : "No payment methods yet — add some in Payment methods."));
          rows.forEach(function (m) {
            var l = el("label", "sb-pay"), c = el("input"); c.type = "checkbox"; c.checked = ids.indexOf(m.id) !== -1;
            c.addEventListener("change", function () { if (c.checked) { if (ids.indexOf(m.id) === -1) ids.push(m.id); } else ids = ids.filter(function (x) { return x !== m.id; }); drawChosen(); change(); });
            l.appendChild(c); if (m.icon_url) { var im = el("img"); im.src = m.icon_url; im.alt = ""; im.loading = "lazy"; im.addEventListener("error", function () { im.remove(); }); l.appendChild(im); }
            l.appendChild(el("span", null, m.name)); list.appendChild(l);
          });
        }
        loadPayments().then(function (rows) { all = rows.map(function (r) { return { id: Number(r.id), name: r.name, slug: r.slug, icon_url: r.icon_url }; }); drawChosen(); drawList(); });
        q.addEventListener("input", drawList);
        var bulk = row(
          btn("Select all shown", null, function () { shown().forEach(function (m) { if (ids.indexOf(m.id) === -1) ids.push(m.id); }); drawChosen(); drawList(); change(); }),
          btn("Clear shown", null, function () { var s = shown().map(function (m) { return m.id; }); ids = ids.filter(function (x) { return s.indexOf(x) === -1; }); drawChosen(); drawList(); change(); }),
          btn("Clear all", null, function () { ids = []; drawChosen(); drawList(); change(); }), status);
        var layout = select([["chips", "Chips"], ["grid", "Logo grid"], ["list", "List"]], d.layout), pos = select([["after", "Text after"], ["before", "Text before"]], d.text_position);
        [layout, pos].forEach(function (s) { s.addEventListener("change", change); });
        var rt = richBox(d.text_html, 200);
        body.appendChild(chosen); body.appendChild(q); body.appendChild(bulk); body.appendChild(list);
        body.appendChild(row(field("Layout", layout), field("Text", pos))); body.appendChild(el("p", "sb-hint", "Text")); body.appendChild(rt.ta);
        drawChosen();
        return { read: function () { return { ids: ids.slice(), layout: layout.value, text_position: pos.value, text_html: rt.get() }; }, editors: [rt.id] };
      }
    },
    picks: {
      label: "Picked items", icon: "★", help: "Casinos, reviews, news, research, updates, pages, sportsbooks… shown as cards or a list.",
      blank: function () { return { items: [], intro_html: "", layout: "cards", columns: 3 }; },
      mount: function (body, d, change) {
        var rep = repeater({ items: d.items, max: 24, addLabel: "Add by address", onChange: change, build: function (b, v) {
          var kind = v.source ? v.source : (v.kind || "link");
          var label = input(v.label, v.source ? "Custom title (optional)" : "Title", 160), meta = el("span", "sb-hint", v.source ? kind + " · " + v.key : (v.url || ""));
          var url = input(v.url, "https://… or /en/page", 600);
          label.addEventListener("input", change); url.addEventListener("input", change);
          b.appendChild(el("span", "sb-badge", kind)); b.appendChild(field("Title", label));
          if (v.source) b.appendChild(meta); else b.appendChild(field("Address", url));
          return { read: function () { return v.source ? { source: v.source, key: v.key, label: label.value } : { url: url.value, label: label.value, kind: kind }; } };
        } });
        var items = btn("Pick items…", "btn btn--primary btn--sm", function () {
          if (!window.LummetPicker) return alert("The picker is not available here.");
          LummetPicker.open({}, function (p) { rep.add({ source: p.source, key: p.key, label: p.label }); change(); return true; });
        });
        var pages = btn("Pick pages, reviews & more…", null, function () {
          if (!window.LummetPicker) return alert("The picker is not available here.");
          LummetPicker.open({ mode: "link" }, function (p) { if (p && p.url) { rep.add({ url: p.url, label: p.title || p.url, kind: "page" }); change(); } });
        });
        var layout = select([["cards", "Cards"], ["grid", "Grid with big pictures"], ["list", "List"], ["compact", "Compact list"]], d.layout), cols = select([["2", "2 columns"], ["3", "3 columns"], ["4", "4 columns"]], String(d.columns));
        [layout, cols].forEach(function (s) { s.addEventListener("change", change); });
        var rt = richBox(d.intro_html, 180);
        body.appendChild(el("p", "sb-hint", "Text above the items")); body.appendChild(rt.ta);
        body.appendChild(row(items, pages)); body.appendChild(rep.node);
        body.appendChild(row(field("Layout", layout), field("Columns", cols)));
        return { read: function () { return { items: rep.read(), layout: layout.value, columns: parseInt(cols.value, 10), intro_html: rt.get() }; }, editors: [rt.id] };
      }
    },
    cards: {
      label: "Cards & grid", icon: "▦", help: "Your own cards in a grid: picture, title, text and an optional link.",
      blank: function () { return { cards: [{}], columns: 3, style: "outlined" }; },
      mount: function (body, d, change) {
        var rep = repeater({ items: d.cards, max: 24, addLabel: "Add card", onChange: change, build: function (b, v) {
          var title = input(v.title, "Title", 140), text = area(v.text, "Text", 3, 1200), img = imageField(v.image, "Picture"), link = linkField(v.url, "Link"), cta = input(v.cta, "Button words, e.g. Read more", 40);
          [title, text, img.input, cta].forEach(function (i) { i.addEventListener("input", change); });
          b.appendChild(field("Title", title)); b.appendChild(field("Text", text)); b.appendChild(img.node); b.appendChild(row(link.node, field("Link words", cta)));
          return { read: function () { return { title: title.value, text: text.value, image: img.value, url: link.value, cta: cta.value }; } };
        } });
        var cols = select([["1", "1 column"], ["2", "2 columns"], ["3", "3 columns"], ["4", "4 columns"]], String(d.columns)), style = select([["outlined", "Outlined"], ["filled", "Filled"], ["plain", "Plain"]], d.style);
        [cols, style].forEach(function (s) { s.addEventListener("change", change); });
        body.appendChild(rep.node); body.appendChild(row(field("Columns", cols), field("Style", style)));
        return { read: function () { return { cards: rep.read(), columns: parseInt(cols.value, 10), style: style.value }; }, editors: [] };
      }
    },
    callout: {
      label: "Callout", icon: "!", help: "A highlighted note: tip, warning, good news.",
      blank: function () { return { tone: "info", title: "", text: "" }; },
      mount: function (body, d, change) {
        var tone = select([["info", "Info"], ["tip", "Tip"], ["warning", "Warning"], ["success", "Good news"]], d.tone), title = input(d.title, "Headline", 140), text = area(d.text, "Text", 4, 3000);
        [tone, title, text].forEach(function (i) { i.addEventListener("input", change); i.addEventListener("change", change); });
        body.appendChild(row(field("Kind", tone), field("Headline", title))); body.appendChild(field("Text", text));
        return { read: function () { return { tone: tone.value, title: title.value, text: text.value }; }, editors: [] };
      }
    },
    stats: {
      label: "Key figures", icon: "#", help: "Big numbers with labels, e.g. 24h · Payout time.",
      blank: function () { return { items: [{}, {}, {}] }; },
      mount: function (body, d, change) {
        var rep = repeater({ items: d.items, max: 12, addLabel: "Add figure", onChange: change, build: function (b, v) {
          var val = input(v.value, "e.g. 24h", 40), lab = input(v.label, "e.g. Payout time", 100);
          val.addEventListener("input", change); lab.addEventListener("input", change);
          b.appendChild(row(field("Figure", val), field("Label", lab)));
          return { read: function () { return { value: val.value, label: lab.value }; } };
        } });
        body.appendChild(rep.node);
        return { read: function () { return { items: rep.read() }; }, editors: [] };
      }
    }
  };
  var ORDER = ["rich", "faq", "media", "payments", "picks", "cards", "callout", "stats"];
  var PRESETS = [["Overview", "rich"], ["Features", "rich"], ["Bonuses & promotions", "rich"], ["Payment methods", "payments"], ["Mobile experience", "rich"], ["Customer support", "rich"], ["Security & licensing", "rich"], ["FAQ", "faq"]];

  // ---------------------------------------------------------------- builder
  function mount(cfg) {
    var root = cfg.root, state = [], cards = [];
    var onChange = cfg.onChange || function () {};
    var menu = null;

    function readCards() {
      return cards.map(function (c) { return { title: c.titleInput.value, type: c.type, data: c.api.read(), hidden: !c.show.checked, open: !c.node.classList.contains("is-collapsed") }; });
    }
    function destroyCards() { cards.forEach(function (c) { (c.api.editors || []).forEach(dropEditor); }); cards = []; }

    function render(list) {
      destroyCards();
      root.textContent = "";
      state = list;
      if (!list.length) root.appendChild(el("p", "muted gr-empty", "No sections yet. Choose a type below, or use a quick-add chip."));
      list.forEach(function (s, i) { root.appendChild(buildCard(s, i, list.length)); });
      if (cfg.addButton) cfg.addButton.disabled = list.length >= MAX;
      drawPresets();
    }

    function restructure(fn) { var cur = readCards(); fn(cur); render(cur); onChange(); }

    function buildCard(s, i, n) {
      var T = TYPES[s.type] || TYPES.rich;
      var node = el("div", "gr-section sb-card" + (s.open === false ? " is-collapsed" : "") + (s.hidden ? " is-off" : ""));
      var head = el("div", "gr-section__head");
      var num = el("span", "gr-section__num", String(i + 1));
      var badge = el("span", "sb-type", T.icon + " " + T.label); badge.title = T.help;
      var title = input(s.title, "Section title", 120); title.className = "gr-section__title"; title.setAttribute("aria-label", "Section " + (i + 1) + " title");
      title.addEventListener("input", onChange);
      head.appendChild(num); head.appendChild(badge); head.appendChild(title);
      var showLab = el("label", "sb-show"); showLab.title = "Show this section on the page and in its top bar";
      var show = document.createElement("input"); show.type = "checkbox"; show.checked = !s.hidden; show.setAttribute("aria-label", "Show section " + (i + 1) + " on the page");
      show.addEventListener("change", function () { node.classList.toggle("is-off", !show.checked); onChange(); });
      showLab.appendChild(show); showLab.appendChild(el("span", null, "Show"));
      head.appendChild(showLab);
      var tg = btn(s.open === false ? "+" : "–", "gr-icon", function () { var c = node.classList.toggle("is-collapsed"); tg.textContent = c ? "+" : "–"; tg.title = c ? "Expand" : "Collapse"; }, s.open === false ? "Expand" : "Collapse");
      var up = btn("↑", "gr-icon", function () { restructure(function (cur) { var x = cur.splice(i, 1)[0]; cur.splice(i - 1, 0, x); }); }, "Move section " + (i + 1) + " up"); up.disabled = i === 0;
      var down = btn("↓", "gr-icon", function () { restructure(function (cur) { var x = cur.splice(i, 1)[0]; cur.splice(i + 1, 0, x); }); }, "Move section " + (i + 1) + " down"); down.disabled = i === n - 1;
      var dup = btn("⧉", "gr-icon", function () { if (n >= MAX) return; restructure(function (cur) { var c = JSON.parse(JSON.stringify(cur[i])); c.title = (c.title || "") + " (copy)"; cur.splice(i + 1, 0, c); }); }, "Duplicate section " + (i + 1));
      var del = btn("✕", "gr-icon gr-icon--danger", function () { var t = title.value.trim(); if (!confirm("Remove the section" + (t ? ' "' + t + '"' : "") + "?")) return; restructure(function (cur) { cur.splice(i, 1); }); }, "Remove section " + (i + 1));
      [up, down, dup, tg, del].forEach(function (b) { head.appendChild(b); });
      var body = el("div", "gr-section__body");
      var api = T.mount(body, s.data || T.blank(), onChange);
      node.appendChild(head); node.appendChild(body);
      cards.push({ node: node, type: s.type in TYPES ? s.type : "rich", titleInput: title, show: show, api: api });
      return node;
    }

    function add(type, title) {
      if (state.length >= MAX) return;
      var T = TYPES[type] || TYPES.rich;
      restructure(function (cur) { cur.push({ title: title || "", type: type, data: T.blank(), open: true }); });
      var last = root.querySelector(".sb-card:last-child .gr-section__title");
      if (last) { last.focus(); last.scrollIntoView({ block: "center", behavior: "smooth" }); }
    }

    function drawPresets() {
      if (!cfg.presets) return;
      var used = readCardsTitles();
      cfg.presets.textContent = "";
      PRESETS.forEach(function (p) {
        if (used.indexOf(p[0].toLowerCase()) !== -1) return;
        var b = el("button", "gr-chip", "+ " + p[0]); b.type = "button"; b.addEventListener("click", function () { add(p[1], p[0]); }); cfg.presets.appendChild(b);
      });
    }
    function readCardsTitles() { return cards.map(function (c) { return c.titleInput.value.trim().toLowerCase(); }); }

    function openMenu() {
      if (menu) { menu.remove(); menu = null; return; }
      menu = el("div", "sb-menu"); menu.setAttribute("role", "menu");
      ORDER.forEach(function (t) {
        var T = TYPES[t], b = el("button", "sb-menu__item"); b.type = "button"; b.setAttribute("role", "menuitem");
        b.appendChild(el("span", "sb-menu__icon", T.icon)); var tx = el("span", "sb-menu__text"); tx.appendChild(el("strong", null, T.label)); tx.appendChild(el("span", null, T.help)); b.appendChild(tx);
        b.addEventListener("click", function () { menu.remove(); menu = null; add(t, ""); });
        menu.appendChild(b);
      });
      cfg.addButton.parentNode.insertBefore(menu, cfg.addButton.nextSibling);
      var first = menu.querySelector("button"); if (first) first.focus();
    }
    if (cfg.addButton) {
      cfg.addButton.addEventListener("click", openMenu);
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu) { menu.remove(); menu = null; cfg.addButton.focus(); } });
      document.addEventListener("click", function (e) { if (menu && !menu.contains(e.target) && e.target !== cfg.addButton) { menu.remove(); menu = null; } });
    }

    return {
      load: function (list) { render((list || []).map(function (s) { var type = TYPES[s.type] ? s.type : "rich"; return { title: s.title || "", type: type, data: s.data || TYPES[type].blank(), hidden: !!s.hidden, open: false }; })); },
      read: function () { return readCards().map(function (c) { return { title: c.title.trim(), type: c.type, data: c.data, hidden: !!c.hidden }; }); },
      count: function () { return cards.length; },
      destroy: function () { destroyCards(); root.textContent = ""; },
      types: TYPES
    };
  }

  window.SectionBuilder = { mount: mount, TYPES: TYPES, MAX: MAX };
})();
