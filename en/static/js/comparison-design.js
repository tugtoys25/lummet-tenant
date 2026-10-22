// =====================================================
// COMPARISON DESIGN EDITOR (dashboard)
// Colours and fonts for the whole table, for each item (column) and for each row, plus
// custom values: a grid with one row per criterion and one box per chosen item.
// An empty colour or value means "use the site's look / the real data".
// Mounted by dashboard.js on the comparison create and edit forms.
// =====================================================

(function () {
  "use strict";

  var PAGE_COLORS = [["head_bg", "Header background"], ["head_text", "Header text"], ["label_bg", "Label column background"], ["label_text", "Label text"], ["cell_bg", "Cell background"], ["cell_text", "Cell text"], ["stripe_bg", "Alternate row background"], ["border", "Lines"], ["accent", "Highlight (Best, Our pick)"]];
  var ITEM_COLORS = [["head_bg", "Header background"], ["head_text", "Header text"], ["col_bg", "Column background"], ["col_text", "Column text"], ["accent", "Highlight"]];
  var ROW_COLORS = [["label_bg", "Label background"], ["label_text", "Label text"], ["cell_bg", "Cell background"], ["cell_text", "Cell text"]];
  var FONTS = [["site", "Site font"], ["serif", "Serif (Georgia)"], ["elegant", "Elegant (Palatino)"], ["rounded", "Rounded (Trebuchet)"], ["classic", "Classic (Verdana)"], ["mono", "Monospace"]];
  var SIZES = [["md", "Normal"], ["sm", "Small"], ["lg", "Large"]];
  var RADII = [["md", "Rounded"], ["sq", "Square"], ["lg", "Very round"]];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function mount(opts) {
    var root = opts.container;
    if (!root) return null;
    var state = { page: {}, items: {}, rows: {}, cells: {}, sections: [] };
    var timer;
    // the colour/values part is redrawn when items or criteria change; the sections part is not
    var designRoot = el("div", "cd-part");
    var secRoot = el("div", "cd-part");
    root.appendChild(designRoot);
    root.appendChild(secRoot);

    function itemKey(it) { return it.itemContentType + ":" + it.itemId; }
    function shortName(it) { return String(it.label || "").replace(/\s*\(.*$/, "") || itemKey(it); }
    function bag(group, key) { if (!state[group][key]) state[group][key] = {}; return state[group][key]; }
    function tidy(group, key) { if (state[group][key] && !Object.keys(state[group][key]).length) delete state[group][key]; }

    function colorField(label, get, set) {
      var wrap = el("label", "cd-color");
      var input = document.createElement("input");
      input.type = "color";
      var cur = get();
      input.value = cur || "#888888";
      wrap.classList.toggle("cd-unset", !cur);
      var clear = el("button", "cd-clear", "×");
      clear.type = "button";
      clear.title = "Use the site colour";
      clear.hidden = !cur;
      input.addEventListener("input", function () { set(input.value); wrap.classList.remove("cd-unset"); clear.hidden = false; });
      clear.addEventListener("click", function (e) { e.preventDefault(); set(""); input.value = "#888888"; wrap.classList.add("cd-unset"); clear.hidden = true; });
      wrap.appendChild(el("span", "cd-color__label", label));
      wrap.appendChild(input);
      wrap.appendChild(clear);
      return wrap;
    }

    function selectField(label, options, get, set) {
      var wrap = el("label", "cd-select");
      wrap.appendChild(el("span", "cd-color__label", label));
      var sel = document.createElement("select");
      options.forEach(function (o) { var opt = document.createElement("option"); opt.value = o[0]; opt.textContent = o[1]; sel.appendChild(opt); });
      sel.value = get() || options[0][0];
      sel.addEventListener("change", function () { set(sel.value === options[0][0] ? "" : sel.value); });
      wrap.appendChild(sel);
      return wrap;
    }

    function setIn(group, key, name, value) {
      var b = bag(group, key);
      if (value) b[name] = value; else delete b[name];
      tidy(group, key);
    }

    function section(title, open) {
      var d = document.createElement("details");
      d.className = "cd-section";
      d.open = !!open;
      d.appendChild(el("summary", "", title));
      return d;
    }

    function render() {
      var items = opts.getItems() || [];
      var criteria = opts.getCriteria() || [];
      designRoot.innerHTML = "";

      // whole table
      var s1 = section("Whole table: colours and fonts", true);
      var g1 = el("div", "cd-grid");
      PAGE_COLORS.forEach(function (c) {
        g1.appendChild(colorField(c[1], function () { return state.page[c[0]]; }, function (v) { if (v) state.page[c[0]] = v; else delete state.page[c[0]]; }));
      });
      g1.appendChild(selectField("Font", FONTS, function () { return state.page.font; }, function (v) { if (v) state.page.font = v; else delete state.page.font; }));
      g1.appendChild(selectField("Text size", SIZES, function () { return state.page.size; }, function (v) { if (v) state.page.size = v; else delete state.page.size; }));
      g1.appendChild(selectField("Corners", RADII, function () { return state.page.radius; }, function (v) { if (v) state.page.radius = v; else delete state.page.radius; }));
      s1.appendChild(g1);
      designRoot.appendChild(s1);

      // each item
      var s2 = section("Each item (column)", false);
      if (!items.length) s2.appendChild(el("p", "muted", "Add items to compare first."));
      items.forEach(function (it) {
        var k = itemKey(it);
        var box = el("div", "cd-item");
        box.appendChild(el("strong", "", shortName(it)));
        var g = el("div", "cd-grid");
        ITEM_COLORS.forEach(function (c) {
          g.appendChild(colorField(c[1], function () { return (state.items[k] || {})[c[0]]; }, function (v) { setIn("items", k, c[0], v); }));
        });
        g.appendChild(selectField("Font", FONTS, function () { return (state.items[k] || {}).font; }, function (v) { setIn("items", k, "font", v); }));
        box.appendChild(g);
        s2.appendChild(box);
      });
      designRoot.appendChild(s2);

      // rows and custom values
      var s3 = section("Rows and custom values", true);
      s3.appendChild(el("p", "muted", "One row for each criterion above, one box for each item. Type your own value to replace the real one for that item; leave it empty to keep the real value. Custom rows (add one below) are filled the same way."));
      if (!criteria.length || !items.length) {
        s3.appendChild(el("p", "muted", "Add at least one item and one criterion to fill values."));
      } else {
        var wrap = el("div", "cd-table-wrap");
        var table = el("table", "cd-table");
        var thead = el("thead");
        var hr = el("tr");
        hr.appendChild(el("th", "", "Row"));
        items.forEach(function (it) { hr.appendChild(el("th", "", shortName(it))); });
        thead.appendChild(hr);
        table.appendChild(thead);
        var tbody = el("tbody");
        criteria.forEach(function (c) {
          var tr = el("tr");
          var th = el("th", "");
          th.appendChild(el("div", "", c.label));
          th.appendChild(el("code", "muted", c.key));
          var more = el("button", "btn btn--ghost btn--sm", "Row colours");
          more.type = "button";
          th.appendChild(more);
          tr.appendChild(th);
          items.forEach(function (it) {
            var td = el("td");
            var input = document.createElement("input");
            input.type = "text";
            input.maxLength = 200;
            input.placeholder = "real value";
            input.value = ((state.cells[c.key] || {})[itemKey(it)]) || "";
            input.addEventListener("input", function () {
              var b = bag("cells", c.key);
              var v = input.value.trim();
              if (v) b[itemKey(it)] = v; else delete b[itemKey(it)];
              tidy("cells", c.key);
            });
            td.appendChild(input);
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
          var colorRow = el("tr", "cd-rowcolors");
          colorRow.hidden = !(state.rows[c.key] && Object.keys(state.rows[c.key]).length);
          var ctd = el("td");
          ctd.colSpan = items.length + 1;
          var cg = el("div", "cd-grid");
          ROW_COLORS.forEach(function (rc) {
            cg.appendChild(colorField(rc[1], function () { return (state.rows[c.key] || {})[rc[0]]; }, function (v) { setIn("rows", c.key, rc[0], v); }));
          });
          ctd.appendChild(cg);
          colorRow.appendChild(ctd);
          more.addEventListener("click", function () { colorRow.hidden = !colorRow.hidden; });
          tbody.appendChild(colorRow);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        s3.appendChild(wrap);
      }
      var add = el("button", "btn btn--ghost btn--sm", "+ Add custom row");
      add.type = "button";
      add.addEventListener("click", function () {
        var key = "custom_" + Math.random().toString(36).slice(2, 6);
        opts.addCriterion(key, "Custom row");
      });
      s3.appendChild(add);
      designRoot.appendChild(s3);
    }

    // ------------------------------------------------------------ sections (text below the table)
    var TYPES = [["heading", "Heading"], ["text", "Text"], ["bullets", "List"], ["callout", "Highlighted note"], ["picks", "Picked items (casinos, news, research, ...)"], ["link", "Button / link"], ["image", "Picture"], ["divider", "Divider line"]];
    var nameCache = {};

    function inputText(b, k, ph, max) {
      var i = document.createElement("input"); i.type = "text"; i.placeholder = ph || ""; i.maxLength = max || 200; i.value = b[k] || "";
      i.addEventListener("input", function () { b[k] = i.value; });
      return i;
    }
    function areaText(b, k, ph, max, rows) {
      var t = document.createElement("textarea"); t.rows = rows || 4; t.placeholder = ph || ""; t.maxLength = max || 3000; t.value = b[k] || "";
      t.addEventListener("input", function () { b[k] = t.value; });
      return t;
    }
    function selectOf(b, k, options, def) {
      var s = document.createElement("select");
      options.forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
      s.value = b[k] || def; b[k] = s.value;
      s.addEventListener("change", function () { b[k] = s.value; });
      return s;
    }
    function lab(text, control) { var l = el("label", "cd-field"); l.appendChild(el("span", "cd-color__label", text)); l.appendChild(control); return l; }

    function blockBody(b) {
      var box = el("div", "cd-blockbody");
      if (b.type === "heading") { box.appendChild(lab("Heading", inputText(b, "text", "Heading text", 120))); box.appendChild(lab("Size", selectOf(b, "level", [["h2", "Large"], ["h3", "Medium"]], "h2"))); }
      else if (b.type === "text") { box.appendChild(lab("Text (leave an empty line between paragraphs)", areaText(b, "text", "Write here...", 3000, 6))); }
      else if (b.type === "bullets") {
        var ta = document.createElement("textarea"); ta.rows = 5; ta.placeholder = "One point per line";
        ta.value = (b.items || []).join("\n");
        ta.addEventListener("input", function () { b.items = ta.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean); });
        box.appendChild(lab("Points (one per line)", ta)); box.appendChild(lab("Style", selectOf(b, "style", [["bullet", "Bullets"], ["number", "Numbers"]], "bullet")));
      }
      else if (b.type === "callout") { box.appendChild(lab("Title", inputText(b, "title", "Optional title", 100))); box.appendChild(lab("Text", areaText(b, "text", "Note text", 600, 3))); box.appendChild(lab("Tone", selectOf(b, "tone", [["info", "Information"], ["good", "Positive"], ["warn", "Warning"]], "info"))); }
      else if (b.type === "picks") {
        box.appendChild(lab("Title (optional)", inputText(b, "title", "e.g. Alternatives worth a look", 100)));
        b.picks = Array.isArray(b.picks) ? b.picks : [];
        var list = el("div", "cd-picklist");
        var draw = function () {
          list.textContent = "";
          if (!b.picks.length) list.appendChild(el("p", "muted", "Nothing picked yet."));
          b.picks.forEach(function (p, i) {
            var row = el("div", "cd-pick");
            row.appendChild(el("span", "", (nameCache[p.source + ":" + p.key] || p.label || p.key) + "  \u00b7  " + p.source));
            var rm = el("button", "btn btn--ghost btn--sm", "Remove"); rm.type = "button";
            rm.addEventListener("click", function () { b.picks.splice(i, 1); draw(); });
            row.appendChild(rm); list.appendChild(row);
          });
        };
        var add = el("button", "btn btn--ghost btn--sm", "+ Search and add"); add.type = "button";
        add.addEventListener("click", function () {
          if (!window.LummetPicker) { window.alert("The picker could not be loaded. Reload the page."); return; }
          window.LummetPicker.open({}, function (p) {
            if (b.picks.length >= 12) return false;
            if (!b.picks.some(function (x) { return x.source === p.source && x.key === p.key; })) { b.picks.push({ source: p.source, key: p.key, label: p.label }); nameCache[p.source + ":" + p.key] = p.label; draw(); }
            return true;
          });
        });
        draw(); box.appendChild(list); box.appendChild(add);
      }
      else if (b.type === "link") {
        box.appendChild(lab("Button text", inputText(b, "text", "Read the full review", 80)));
        var li = inputText(b, "link", "/en/page or https://...", 300);
        var pickBtn = el("button", "btn btn--ghost btn--sm", "Pick a page"); pickBtn.type = "button";
        pickBtn.addEventListener("click", function () { if (window.LummetPicker) window.LummetPicker.open({ mode: "link" }, function (p) { li.value = p.url; b.link = p.url; }); });
        var row = el("div", "cd-inline"); row.appendChild(li); row.appendChild(pickBtn);
        box.appendChild(lab("Link", row)); box.appendChild(lab("Look", selectOf(b, "style", [["primary", "Solid"], ["ghost", "Outline"]], "primary")));
      }
      else if (b.type === "image") {
        var si = inputText(b, "src", "/uploads/picture.jpg or https://...", 300);
        var mb = el("button", "btn btn--ghost btn--sm", "Choose from Media"); mb.type = "button";
        mb.addEventListener("click", function () { if (window.MediaPicker && window.MediaPicker.openImagePicker) window.MediaPicker.openImagePicker(function (m) { si.value = m.url; b.src = m.url; }); });
        var r2 = el("div", "cd-inline"); r2.appendChild(si); r2.appendChild(mb);
        box.appendChild(lab("Picture", r2)); box.appendChild(lab("Description (for screen readers)", inputText(b, "alt", "", 160))); box.appendChild(lab("Caption", inputText(b, "caption", "", 200)));
      }
      else { box.appendChild(el("p", "muted", "A thin line between two parts.")); }
      return box;
    }

    function renderSections() {
      secRoot.innerHTML = "";
      var d = document.createElement("details"); d.className = "cd-section"; d.open = state.sections.length > 0;
      d.appendChild(el("summary", "", "Content sections below the table (text, notes, picked items)"));
      d.appendChild(el("p", "muted", "Written content shown under the table, in this order: headings, text, lists, highlighted notes, buttons, pictures, and items you pick from the site (casinos, news, research, authors, updates, sportsbooks, ...). No tables."));
      var list = el("div", "cd-blocks");
      state.sections.forEach(function (b, i) {
        var card = el("div", "cd-block");
        var head = el("div", "cd-block__head");
        head.appendChild(el("strong", "", (TYPES.filter(function (t) { return t[0] === b.type; })[0] || [0, b.type])[1]));
        var acts = el("span", "cd-block__acts");
        [["\u2191", -1], ["\u2193", 1]].forEach(function (m) {
          var bt = el("button", "btn btn--ghost btn--sm", m[0]); bt.type = "button"; bt.disabled = (m[1] < 0 && i === 0) || (m[1] > 0 && i === state.sections.length - 1);
          bt.addEventListener("click", function () { var j = i + m[1]; var t = state.sections[i]; state.sections[i] = state.sections[j]; state.sections[j] = t; renderSections(); });
          acts.appendChild(bt);
        });
        var rm = el("button", "btn btn--danger btn--sm", "Remove"); rm.type = "button";
        rm.addEventListener("click", function () { state.sections.splice(i, 1); renderSections(); });
        acts.appendChild(rm); head.appendChild(acts);
        card.appendChild(head); card.appendChild(blockBody(b)); list.appendChild(card);
      });
      d.appendChild(list);
      var bar = el("div", "cd-addbar");
      var sel = document.createElement("select");
      TYPES.forEach(function (t) { var o = document.createElement("option"); o.value = t[0]; o.textContent = t[1]; sel.appendChild(o); });
      var add = el("button", "btn btn--ghost btn--sm", "+ Add block"); add.type = "button";
      add.addEventListener("click", function () { if (state.sections.length >= 30) return; state.sections.push({ type: sel.value }); renderSections(); });
      bar.appendChild(sel); bar.appendChild(add); d.appendChild(bar);
      secRoot.appendChild(d);
    }

    function later() { clearTimeout(timer); timer = setTimeout(render, 120); }
    (opts.watch || []).forEach(function (n) {
      if (!n) return;
      new MutationObserver(later).observe(n, { childList: true, subtree: true });
      n.addEventListener("change", later);
      n.addEventListener("input", later);
    });
    render();
    renderSections();

    return {
      read: function () {
        // drop values of rows/items that are no longer on the page
        var keys = {};
        (opts.getCriteria() || []).forEach(function (c) { keys[c.key] = true; });
        var itemKeys = {};
        (opts.getItems() || []).forEach(function (i) { itemKeys[itemKey(i)] = true; });
        var out = { page: state.page, items: {}, rows: {}, cells: {}, sections: state.sections };
        Object.keys(state.items).forEach(function (k) { if (itemKeys[k]) out.items[k] = state.items[k]; });
        Object.keys(state.rows).forEach(function (k) { if (keys[k]) out.rows[k] = state.rows[k]; });
        Object.keys(state.cells).forEach(function (k) {
          if (!keys[k]) return;
          out.cells[k] = {};
          Object.keys(state.cells[k]).forEach(function (ik) { if (itemKeys[ik]) out.cells[k][ik] = state.cells[k][ik]; });
        });
        return out;
      },
      load: function (design) {
        var d = design || {};
        state = { page: d.page || {}, items: d.items || {}, rows: d.rows || {}, cells: d.cells || {}, sections: Array.isArray(d.sections) ? d.sections : [] };
        render();
        renderSections();
      },
      refresh: render
    };
  }

  window.ComparisonDesign = { mount: mount };
})();
