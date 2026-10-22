// Geo Rules pages: default rules, bulk changes, import & export, presets, country lookup.
// Uses the helpers exposed by geo-rules-admin.js. All text goes in with textContent, never as HTML.
(function () {
  "use strict";
  var root = document.getElementById("gmRoot");
  if (!root || !root.hasAttribute("data-gm-page")) return;
  var section = root.getAttribute("data-gm-section") || "rules";
  // highlight the current section in the sub-navigation
  Array.prototype.forEach.call(document.querySelectorAll("[data-gm-link]"), function (a) {
    var on = a.getAttribute("data-gm-link") === section;
    a.classList.toggle("is-on", on); if (on) a.setAttribute("aria-current", "page");
  });
  if (section === "rules") return;
  var K = window.GeoRulesKit; if (!K) return;
  var el = K.el, api = K.api, state = K.state;

  function note(kind, msg) { K.toast(kind, msg); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function typeSelect(onchange) {
    var s = el("select", { class: "gm-select", "aria-label": "Type" });
    state.meta.types.forEach(function (t) { s.appendChild(el("option", { value: t.key, text: t.label })); });
    s.value = state.type; s.addEventListener("change", function () { state.type = s.value; onchange(s.value); });
    return s;
  }
  function card(title, kids) { return el("div", { class: "gm-card" }, [title ? el("h3", { text: title }) : null].concat(kids)); }
  function begin() { root.textContent = ""; root.appendChild(el("div", { class: "gm-alert alert", style: "display:none", role: "status" })); }

  // ================= default rules =================
  function defaultsPage() {
    api("defaults").then(function (d) {
      if (d.error) { root.textContent = d.error; return; }
      begin();
      root.appendChild(el("p", { class: "gm-lead", text: "When a casino or other item is registered without any country rules, it gets the default for its type. Existing items are not touched unless you press \"Apply to items without rules\". Whatever you set on an item itself always wins." }));
      state.meta.types.forEach(function (t) {
        var cur = (d.defaults || {})[t.key] || { mode: "none", countries: [] };
        var mode = cur.mode, name = "gmdef-" + t.key;
        var picker = K.picker(cur.countries || []);
        var pickBox = el("div", { class: "gm-defpick" }, [el("p", { class: "muted", text: "Countries that are NOT allowed:" }), picker.node]);
        function opt(value, title, help) {
          var r = el("input", { type: "radio", name: name, value: value });
          r.checked = mode === value;
          r.addEventListener("change", function () { mode = value; show(); });
          return el("label", { class: "gm-opt" }, [r, el("span", {}, [el("strong", { text: title }), el("small", { text: help })])]);
        }
        function show() { pickBox.hidden = mode !== "except"; }
        var withoutRules = (d.no_rules || {})[t.key] || 0;
        var save = el("button", { type: "button", class: "btn btn--primary", text: "Save default", onclick: function () {
          if (mode === "except" && !picker.get().length) return note("error", t.label + ": choose at least one country to leave out.");
          var body = { defaults: {} }; body.defaults[t.key] = { mode: mode, countries: mode === "except" ? picker.get() : [] };
          api("defaults/save", body).then(function (r) { if (r.success) { state.meta.defaults = r.defaults; note("success", t.label + ": default saved."); } else note("error", r.error || "Could not save."); });
        } });
        var apply = el("button", { type: "button", class: "btn btn--ghost", text: "Apply to items without rules (" + withoutRules + ")", onclick: function () {
          api("defaults/apply", { type: t.key, dry_run: true }).then(function (pre) {
            if (!pre.success) return note("error", pre.error || "Nothing to apply.");
            if (!pre.items) return note("success", "Every " + t.label.toLowerCase() + " item already has rules.");
            if (!window.confirm("Give the saved default to " + pre.items + " item(s) that have no country rules? Save the default first if you just changed it.")) return;
            api("defaults/apply", { type: t.key }).then(function (r) { if (r.success) { note("success", r.items + " item(s) updated."); defaultsPage(); } else note("error", r.error || "Could not apply."); });
          });
        } });
        root.appendChild(card(t.label, [
          el("p", { class: "muted", text: withoutRules + " item(s) currently have no country rules." }),
          el("div", { class: "gm-opts" }, [
            opt("none", "Not available", "New items stay out of country-filtered lists until you give them countries (today's behaviour)."),
            opt("everyone", "Available to everyone", "New items are allowed in every country on file."),
            opt("except", "Available to everyone except…", "New items are allowed everywhere apart from the countries you list.")]),
          pickBox, el("div", { class: "gm-actions" }, [save, apply])
        ]));
        show();
      });
    }).catch(function () { root.textContent = "Could not load. Reload the page and try again."; });
  }

  // ================= bulk changes =================
  function bulkPage() {
    var bk = { scope: "keys", action: "apply", merge: "replace", mode: "allow", picked: {}, items: [], q: "" };
    begin();
    var out = el("div", { class: "gm-bkresult", "aria-live": "polite" });
    var listBox = el("div", { class: "gm-pickitems" });
    var scopeBox = el("div", {}), actionBox = el("div", {});
    var pk = K.picker([]);
    var typeSel = typeSelect(function () { bk.picked = {}; loadItems(); });
    var search = el("input", { type: "search", class: "gm-input", placeholder: "Search items…", "aria-label": "Search items" });
    var t; search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { bk.q = search.value; loadItems(); }, 250); });
    var fromSel = el("select", { class: "gm-select", "aria-label": "Copy from" });

    function loadItems() {
      api("items?type=" + encodeURIComponent(state.type) + "&q=" + encodeURIComponent(bk.q)).then(function (d) { bk.items = d.items || []; paintItems(); });
    }
    function counts() { var n = bk.items.length, none = bk.items.filter(function (i) { return !i.total; }).length; return { all: n, no_rules: none, with_rules: n - none }; }
    function paintScope() {
      scopeBox.textContent = ""; var c = counts();
      [["keys", "Items I tick below"], ["all", "All items of this type (" + c.all + ")"], ["no_rules", "Only items without rules (" + c.no_rules + ")"], ["with_rules", "Only items that have rules (" + c.with_rules + ")"]].forEach(function (o) {
        var r = el("input", { type: "radio", name: "gmscope", value: o[0] }); r.checked = bk.scope === o[0];
        r.addEventListener("change", function () { bk.scope = o[0]; paintItems(); });
        scopeBox.appendChild(el("label", { class: "gm-opt gm-opt--row" }, [r, el("span", { text: o[1] })]));
      });
    }
    function paintItems() {
      paintScope(); listBox.textContent = ""; fromSel.textContent = "";
      bk.items.forEach(function (i) { fromSel.appendChild(el("option", { value: i.key, text: i.name + " (" + K.MODE_LABEL[i.mode] + ", " + i.total + ")" })); });
      listBox.hidden = bk.scope !== "keys"; search.hidden = bk.scope !== "keys";
      if (bk.scope !== "keys") return;
      var all = el("input", { type: "checkbox", "aria-label": "Select all shown" });
      all.checked = bk.items.length > 0 && bk.items.every(function (i) { return bk.picked[i.key]; });
      all.addEventListener("change", function () { bk.items.forEach(function (i) { if (all.checked) bk.picked[i.key] = true; else delete bk.picked[i.key]; }); paintItems(); });
      listBox.appendChild(el("label", { class: "gm-opt gm-opt--row" }, [all, el("strong", { text: "Select all shown (" + Object.keys(bk.picked).length + " ticked)" })]));
      bk.items.forEach(function (i) {
        var cb = el("input", { type: "checkbox" }); cb.checked = !!bk.picked[i.key];
        cb.addEventListener("change", function () { if (cb.checked) bk.picked[i.key] = true; else delete bk.picked[i.key]; paintItems(); });
        listBox.appendChild(el("label", { class: "gm-opt gm-opt--row" }, [cb, el("span", { text: i.name }), K.badge(K.MODE_LABEL[i.mode], i.mode === "none" ? "off" : i.mode === "allow" ? "ok" : i.mode === "block" ? "warn" : "mix")]));
      });
    }
    var actionSel = el("select", { class: "gm-select", "aria-label": "What to do" }, [
      el("option", { value: "apply:replace", text: "Set these countries (replace what is there)" }),
      el("option", { value: "apply:add", text: "Add these countries to what is there" }),
      el("option", { value: "apply:remove", text: "Remove these countries from what is there" }),
      el("option", { value: "copy", text: "Copy the rules of another item" }),
      el("option", { value: "default", text: "Give them this type's default" }),
      el("option", { value: "clear", text: "Clear all their rules" })]);
    var modeSel = el("select", { class: "gm-select", "aria-label": "Mode" }, [el("option", { value: "allow", text: "Those countries are allowed (allow-list)" }), el("option", { value: "block", text: "Those countries are blocked (all others allowed)" })]);
    var fromWrap = el("div", {}, [el("label", { class: "gm-label", text: "Copy from" }), fromSel]);
    var cWrap = el("div", { class: "gm-stack" }, [modeSel, pk.node]);
    function paintAction() {
      var v = actionSel.value; bk.action = v.split(":")[0]; bk.merge = v.split(":")[1] || "replace";
      cWrap.hidden = bk.action !== "apply"; fromWrap.hidden = bk.action !== "copy";
      modeSel.hidden = bk.merge === "remove" && false;
    }
    actionSel.addEventListener("change", function () { paintAction(); out.textContent = ""; });

    function request(dry) {
      var body = { type: state.type, action: bk.action, scope: bk.scope, dry_run: dry };
      if (bk.scope === "keys") { body.keys = Object.keys(bk.picked); if (!body.keys.length) { note("error", "Tick at least one item."); return null; } }
      if (bk.action === "apply") { body.mode = modeSel.value; body.merge = bk.merge; body.countries = pk.get(); if (!body.countries.length) { note("error", "Choose or type at least one country."); return null; } }
      if (bk.action === "copy") { body.from_key = fromSel.value; if (!body.from_key) { note("error", "Choose the item to copy from."); return null; } }
      return body;
    }
    function describe(d, dry) {
      var s = (dry ? "This would change " : "Changed ") + d.changed + " item(s)" + (d.sample && d.sample.length ? " (" + d.sample.join(", ") + (d.changed > d.sample.length ? ", …" : "") + ")" : "") + ".";
      if (d.mixed) s += " " + d.mixed + " of them would mix allowed and blocked countries, which is treated as a custom list.";
      return s;
    }
    var preview = el("button", { type: "button", class: "btn btn--ghost", text: "Preview", onclick: function () {
      var b = request(true); if (!b) return;
      api("bulk", b).then(function (d) { out.textContent = d.success ? describe(d, true) : (d.error || "Could not preview."); });
    } });
    var apply = el("button", { type: "button", class: "btn btn--primary", text: "Apply changes", onclick: function () {
      var b = request(true); if (!b) return;
      api("bulk", b).then(function (d) {
        if (!d.success) { out.textContent = d.error || "Could not apply."; return; }
        var risky = bk.action === "clear" || (bk.action === "apply" && bk.merge === "replace") || bk.action === "copy" || bk.action === "default";
        if (!window.confirm(describe(d, true) + (risky ? " Their current rules will be replaced." : "") + " Continue?")) return;
        b.dry_run = false;
        api("bulk", b).then(function (r) { out.textContent = r.success ? describe(r, false) : (r.error || "Could not apply."); if (r.success) { note("success", describe(r, false)); loadItems(); } });
      });
    } });
    root.appendChild(card("1. Which items?", [typeSel, scopeBox, search, listBox]));
    root.appendChild(card("2. What to do?", [actionSel, fromWrap, cWrap]));
    root.appendChild(card("3. Check and apply", [el("div", { class: "gm-actions" }, [preview, apply]), out]));
    paintAction(); loadItems();
  }

  // ================= import & export =================
  function importExportPage() {
    begin();
    var typeSel = typeSelect(function () { link.setAttribute("href", "/en/api/v1/geo-manager/export?type=" + encodeURIComponent(state.type)); });
    var link = el("a", { class: "btn btn--primary", href: "/en/api/v1/geo-manager/export?type=" + encodeURIComponent(state.type), text: "Download CSV" });
    root.appendChild(card("Export", [el("p", { class: "muted", text: "Downloads every item of the chosen type that has rules: item_key, item_name, country_code, status, bonus_override." }), typeSel, link]));
    var file = el("input", { type: "file", accept: ".csv,text/csv", "aria-label": "CSV file" });
    var paste = el("textarea", { class: "gm-input gm-codes", rows: "6", placeholder: "…or paste CSV text here", "aria-label": "CSV text" });
    var out = el("div", { class: "gm-importout" });
    var typeSel2 = typeSelect(function () {});
    var check = el("button", { type: "button", class: "btn btn--ghost", text: "Check file", onclick: function () {
      if (!paste.value.trim()) return note("error", "Choose a file or paste CSV text first.");
      out.textContent = "Checking…";
      api("import", { type: state.type, csv: paste.value, dry_run: true }).then(function (d) {
        if (d.errors && d.errors.length) out.textContent = "Nothing was changed. Fix these and try again:\n- " + d.errors.slice(0, 30).join("\n- ") + (d.errors.length > 30 ? "\n…and " + (d.errors.length - 30) + " more" : "");
        else if (d.error) out.textContent = d.error;
        else { out.textContent = "Ready: " + d.rules + " rule(s) for " + d.items + " item(s). Items in the file get exactly these rules; other items are left alone."; apply.removeAttribute("disabled"); }
      });
    } });
    var apply = el("button", { type: "button", class: "btn btn--primary", text: "Import", disabled: "disabled", onclick: function () {
      if (!window.confirm("Replace the rules of every item listed in the file?")) return;
      api("import", { type: state.type, csv: paste.value }).then(function (d) { if (d.applied) { out.textContent = "Imported rules for " + d.items + " item(s)."; note("success", "Import finished."); apply.setAttribute("disabled", "disabled"); } else out.textContent = (d.errors || [d.error]).join("\n"); });
    } });
    paste.addEventListener("input", function () { apply.setAttribute("disabled", "disabled"); });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () { paste.value = String(rd.result || ""); apply.setAttribute("disabled", "disabled"); out.textContent = "File loaded. Press Check file."; };
      rd.readAsText(f);
    });
    root.appendChild(card("Import", [el("p", { class: "muted", text: "Use the same type as in the file. The file is checked first and nothing changes unless every row is valid. Items that are not in the file keep their rules." }), typeSel2, file, paste, el("div", { class: "gm-actions" }, [check, apply]), out]));
  }

  // ================= presets =================
  function presetsPage() {
    begin();
    var presets = (state.meta.presets || []).map(function (p) { return { name: p.name, countries: p.countries.slice() }; });
    var box = el("div", { class: "gm-presetlist" });
    var name = el("input", { type: "text", class: "gm-input", maxlength: "40", placeholder: "Preset name", "aria-label": "Preset name" });
    var np = K.picker([]);
    function paint() {
      box.textContent = "";
      presets.forEach(function (p, i) {
        box.appendChild(el("div", { class: "gm-presetrow" }, [el("strong", { text: p.name }), el("span", { class: "muted", text: " " + p.countries.length + " countries: " + p.countries.slice(0, 16).join(", ") + (p.countries.length > 16 ? "…" : "") }),
          el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Edit", onclick: function () { name.value = p.name; np.add(p.countries); presets.splice(i, 1); paint(); name.focus(); } }),
          el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Delete", onclick: function () { presets.splice(i, 1); paint(); } })]));
      });
      if (!presets.length) box.appendChild(el("p", { class: "muted", text: "No presets." }));
    }
    paint();
    var add = el("button", { type: "button", class: "btn btn--ghost", text: "Add preset", onclick: function () {
      if (!name.value.trim() || !np.get().length) return note("error", "Give the preset a name and at least one country.");
      presets.push({ name: name.value.trim(), countries: np.get() }); name.value = ""; np = null; rebuild(); paint();
    } });
    var addWrap = el("div", { class: "gm-stack" });
    function rebuild() { np = K.picker([]); addWrap.textContent = ""; [name, np.node, add].forEach(function (n) { addWrap.appendChild(n); }); }
    rebuild();
    root.appendChild(card("Your presets", [el("p", { class: "muted", text: "Presets appear as one-click buttons in every country picker. \"Edit\" loads a preset into the form below; Add preset puts it back in the list; then press Save presets." }), box]));
    root.appendChild(card("Add or change a preset", [addWrap]));
    root.appendChild(el("div", { class: "gm-actions" }, [el("button", { type: "button", class: "btn btn--primary btn--lg", text: "Save presets", onclick: function () {
      api("presets/save", { presets: presets }).then(function (d) { if (d.success) { state.meta.presets = d.presets; note("success", "Presets saved."); } else note("error", d.error || "Could not save."); });
    } })]));
  }

  // ================= country lookup =================
  function lookupPage() {
    begin();
    var sel = K.countryOptions("", "Choose a country…");
    var filter = "all", rows = [];
    var out = el("div", { class: "gm-lookup" });
    var chips = el("div", { class: "gm-presets" });
    function paint() {
      out.textContent = ""; chips.textContent = "";
      [["all", "All"], ["allowed", "Available"], ["blocked", "Not available"]].forEach(function (f) {
        chips.appendChild(el("button", { type: "button", class: "btn btn--sm " + (filter === f[0] ? "btn--primary" : "btn--ghost"), text: f[1] + " (" + rows.filter(function (r) { return f[0] === "all" || r.status_in === f[0]; }).length + ")", onclick: function () { filter = f[0]; paint(); } }));
      });
      var shown = rows.filter(function (r) { return filter === "all" || r.status_in === filter; });
      var body = el("tbody");
      shown.forEach(function (r) {
        body.appendChild(el("tr", {}, [el("td", { text: r.typeLabel }), el("td", {}, [el("strong", { text: r.name })]), el("td", {}, [K.badge(r.status_in === "allowed" ? "Available" : "Not available", r.status_in === "allowed" ? "ok" : "bad")]), el("td", {}, [K.badge(K.MODE_LABEL[r.mode], r.mode === "none" ? "off" : r.mode === "allow" ? "ok" : r.mode === "block" ? "warn" : "mix")]),
          el("td", {}, [el("a", { class: "btn btn--ghost btn--sm", href: "/en/dashboard/geo-rules?type=" + encodeURIComponent(r.type) + "&edit=" + encodeURIComponent(r.key), text: "Edit rules" })])]));
      });
      if (!shown.length) body.appendChild(el("tr", {}, [el("td", { colspan: "5", class: "muted", text: "Nothing to show." })]));
      out.appendChild(el("div", { class: "gm-tablewrap" }, [el("table", { class: "admin-table gm-table" }, [el("thead", {}, [el("tr", {}, ["Type", "Item", "For visitors from here", "Rules", ""].map(function (h) { return el("th", { text: h }); }))]), body])]));
    }
    sel.addEventListener("change", function () {
      if (!sel.value) { rows = []; out.textContent = ""; chips.textContent = ""; return; }
      Promise.all(state.meta.types.map(function (t) { return api("items?type=" + encodeURIComponent(t.key) + "&country=" + sel.value).then(function (d) { return (d.items || []).map(function (i) { i.type = t.key; i.typeLabel = t.label; return i; }); }); })).then(function (lists) {
        rows = [].concat.apply([], lists); paint();
      });
    });
    root.appendChild(card("Which items can a visitor from this country reach?", [sel, el("p", { class: "muted", text: "Uses the saved rules and the same decision the public pages make." }), chips]));
    root.appendChild(out);
  }

  K.loadMeta().then(function (m) {
    if (!m.types.length) { root.textContent = "You do not have access to any geo rules."; return; }
    if (section === "defaults") defaultsPage();
    else if (section === "bulk") bulkPage();
    else if (section === "import-export") importExportPage();
    else if (section === "presets") presetsPage();
    else if (section === "lookup") lookupPage();
  }).catch(function (e) { root.textContent = (e && e.message) || "Could not load. Reload the page and try again."; });
})();
