// Geo rules tab (Reviews screen): see, edit, bulk-change, import and export country rules.
// Talks to /en/api/v1/geo-manager/*. All text is inserted with textContent, never as HTML.
(function () {
  "use strict";
  var root = document.getElementById("gmRoot");
  if (!root) return;
  var API = "/en/api/v1/geo-manager/";
  var state = { meta: null, type: "casino", items: [], q: "", country: "", selected: {}, edit: null, loaded: false };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") n.className = attrs[k]; else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch(API + path, opt).then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); });
  }
  function toast(kind, msg) {
    var box = root.querySelector(".gm-alert");
    if (!box) { box = el("div", { class: "gm-alert alert", style: "display:none", role: "status" }); root.insertBefore(box, root.firstChild); }
    box.className = "gm-alert alert alert--" + kind; box.textContent = msg; box.style.display = "block";
    clearTimeout(toast.t); toast.t = setTimeout(function () { box.style.display = "none"; }, 6000);
  }
  var cname = function (code) { var c = (state.meta.countries || []).filter(function (x) { return x.code === code; })[0]; return c ? c.name : code; };
  var MODE_LABEL = { none: "No rules", allow: "Allow-list", block: "Block-list", mixed: "Custom" };

  // Same decision the public pages make.
  function evaluate(rules, cc) {
    cc = String(cc || "").toUpperCase();
    if (!rules.length) return { status: "blocked", reason: "No rules: the item is treated as not available." };
    var hit = rules.filter(function (r) { return r.country_code === cc; })[0];
    if (hit) return { status: hit.status, reason: "A rule for " + cc + " says " + hit.status + "." };
    var a = rules.some(function (r) { return r.status === "allowed"; }), b = rules.some(function (r) { return r.status === "blocked"; });
    if (a && !b) return { status: "blocked", reason: "Allow-list: " + cc + " is not in the list, so it is blocked." };
    if (b && !a) return { status: "allowed", reason: "Block-list: " + cc + " is not in the list, so it is allowed." };
    return { status: "blocked", reason: "Mixed rules and none for " + cc + ": blocked by default." };
  }
  function modeOf(rules) {
    var a = rules.some(function (r) { return r.status === "allowed"; }), b = rules.some(function (r) { return r.status === "blocked"; });
    return a && b ? "mixed" : a ? "allow" : b ? "block" : "none";
  }

  // ---------- list ----------
  function load() {
    return api("items?type=" + encodeURIComponent(state.type) + "&q=" + encodeURIComponent(state.q) + (state.country ? "&country=" + state.country : "")).then(function (d) {
      if (d.error) { toast("error", d.error); return; }
      state.items = d.items || []; state.selected = {}; render();
    });
  }
  function countryOptions(sel, blank) {
    var s = el("select", { class: "gm-select" });
    if (blank) s.appendChild(el("option", { value: "", text: blank }));
    (state.meta.countries || []).forEach(function (c) { s.appendChild(el("option", { value: c.code, text: c.name + " (" + c.code + ")" })); });
    if (sel) s.value = sel;
    return s;
  }
  function badge(text, cls) { return el("span", { class: "gm-badge gm-badge--" + cls, text: text }); }

  function render() {
    root.textContent = "";
    root.appendChild(el("div", { class: "gm-alert alert", style: "display:none", role: "status" }));
    // toolbar
    var typeSel = el("select", { class: "gm-select", "aria-label": "Type", onchange: function () { if (!confirmLeave()) { typeSel.value = state.type; return; } state.type = typeSel.value; state.edit = null; load(); } });
    state.meta.types.forEach(function (t) { typeSel.appendChild(el("option", { value: t.key, text: t.label })); });
    typeSel.value = state.type;
    var search = el("input", { type: "search", class: "gm-input", placeholder: "Search by name…", value: state.q, "aria-label": "Search" });
    var timer; search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { state.q = search.value; load().then(function () { var s = root.querySelector("input[type=search]"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }); }, 250); });
    var view = countryOptions(state.country, "Show status in…"); view.setAttribute("aria-label", "Show status for a country");
    view.addEventListener("change", function () { state.country = view.value; load(); });
    var tools = el("div", { class: "gm-toolbar" }, [
      typeSel, search, view,
      el("a", { class: "btn btn--ghost btn--sm", href: "/en/api/v1/geo-manager/export?type=" + encodeURIComponent(state.type), text: "Export CSV" }),
      el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Import CSV", onclick: showImport }),
      el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Presets", onclick: showPresets })
    ]);
    root.appendChild(tools);
    root.appendChild(el("div", { id: "gmPanelSlot" }));
    if (state.edit) root.querySelector("#gmPanelSlot").appendChild(renderEditor());
    var bulk = renderBulk(); if (bulk) root.appendChild(bulk);
    root.appendChild(renderTable());
  }

  function renderTable() {
    var n = Object.keys(state.selected).length;
    var table = el("table", { class: "admin-table gm-table" });
    var all = el("input", { type: "checkbox", "aria-label": "Select all" });
    all.checked = state.items.length > 0 && n === state.items.length;
    all.addEventListener("change", function () { state.selected = {}; if (all.checked) state.items.forEach(function (i) { state.selected[i.key] = true; }); render(); });
    var head = el("tr", {}, [el("th", {}, [all]), el("th", { text: "Name" }), el("th", { text: "Rules" }), el("th", { text: state.country ? "In " + state.country : "Countries" }), el("th", { text: "" })]);
    table.appendChild(el("thead", {}, [head]));
    var body = el("tbody");
    if (!state.items.length) body.appendChild(el("tr", {}, [el("td", { colspan: "5", class: "muted", text: "Nothing found." })]));
    state.items.forEach(function (it) {
      var cb = el("input", { type: "checkbox", "aria-label": "Select " + it.name });
      cb.checked = !!state.selected[it.key];
      cb.addEventListener("change", function () { if (cb.checked) state.selected[it.key] = true; else delete state.selected[it.key]; render(); });
      var cls = it.mode === "none" ? "off" : it.mode === "allow" ? "ok" : it.mode === "block" ? "warn" : "mix";
      var third = it.status_in ? badge(it.status_in === "allowed" ? "Available" : "Not available", it.status_in === "allowed" ? "ok" : "bad") : el("span", { class: "muted", text: it.total ? it.total + (it.total === 1 ? " country" : " countries") : "—" });
      body.appendChild(el("tr", {}, [
        el("td", {}, [cb]),
        el("td", {}, [el("strong", { text: it.name }), it.published ? null : el("small", { class: "muted", text: "  draft" })]),
        el("td", {}, [badge(MODE_LABEL[it.mode], cls)]),
        el("td", {}, [third]),
        el("td", {}, [el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Edit rules", onclick: function () { openEditor(it); } })])
      ]));
    });
    table.appendChild(body);
    return el("div", { class: "gm-tablewrap" }, [table]);
  }

  // ---------- bulk ----------
  function renderBulk() {
    var keys = Object.keys(state.selected);
    if (!keys.length) return null;
    var bar = el("div", { class: "gm-bulk is-on" });
    bar.appendChild(el("strong", { text: keys.length + " selected" }));
    bar.appendChild(el("button", { type: "button", class: "btn btn--primary btn--sm", text: "Set countries…", onclick: showBulkApply }));
    bar.appendChild(el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Copy rules from…", onclick: showBulkCopy }));
    bar.appendChild(el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Clear rules", onclick: function () {
      if (!window.confirm("Remove all country rules from " + keys.length + " item(s)? They will be treated as not available.")) return;
      api("bulk", { type: state.type, keys: keys, action: "clear" }).then(function (d) { done(d, "Rules cleared on " + (d.changed || 0) + " item(s)."); });
    } }));
    bar.appendChild(el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Deselect", onclick: function () { state.selected = {}; render(); } }));
    return bar;
  }
  function done(d, msg) { if (d && d.success) { load().then(function () { toast("success", msg); }); } else toast("error", (d && d.error) || "Could not save."); }
  function modal(title, content, actions) {
    if (!confirmLeave()) return;
    var slot = root.querySelector("#gmPanelSlot"); slot.textContent = ""; state.edit = null;
    var card = el("div", { class: "gm-card" }, [el("h3", { text: title }), content, el("div", { class: "gm-actions" }, actions)]);
    slot.appendChild(card); card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function closeModal() { root.querySelector("#gmPanelSlot").textContent = ""; }
  var cancelBtn = function () { return el("button", { type: "button", class: "btn btn--ghost", text: "Cancel", onclick: closeModal }); };

  // "us, gb;de fr" -> {codes, invalid, unknown}; used by every country box on the screens.
  function parseCodes(text) {
    var codes = [], invalid = [], unknown = [], known = {};
    (state.meta.countries || []).forEach(function (c) { known[c.code] = true; });
    String(text || "").split(/[\s,;]+/).map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean).forEach(function (t) {
      if (!/^[A-Z]{2}$/.test(t)) { invalid.push(t); return; }
      if (!known[t]) { unknown.push(t); return; }
      if (codes.indexOf(t) < 0) codes.push(t);
    });
    return { codes: codes, invalid: invalid, unknown: unknown };
  }
  // text box for typed codes with live feedback; onAdd(codes) is called when the user presses Add
  function codesBox(onAdd, label) {
    var ta = el("textarea", { class: "gm-input gm-codes", rows: "2", placeholder: "Type country codes separated by commas, e.g. US, GB, DE", "aria-label": label || "Country codes" });
    var msg = el("small", { class: "muted gm-codesmsg" });
    function check() {
      var r = parseCodes(ta.value); msg.textContent = "";
      if (!ta.value.trim()) return r;
      var bits = [r.codes.length + " valid"]; if (r.invalid.length) bits.push("not codes: " + r.invalid.join(", ")); if (r.unknown.length) bits.push("not on file: " + r.unknown.join(", "));
      msg.textContent = bits.join(" · "); return r;
    }
    ta.addEventListener("input", check);
    var add = el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Add these codes", onclick: function () {
      var r = check(); if (r.invalid.length || r.unknown.length) return toast("error", "Fix the codes marked above first."); if (!r.codes.length) return;
      onAdd(r.codes); ta.value = ""; msg.textContent = "";
    } });
    return { node: el("div", { class: "gm-codeswrap" }, [ta, msg, add]), value: function () { return ta.value; }, check: check };
  }
  function picker(initial) {
    // a country multi-picker with presets; returns {node, get()}
    var set = {}; (initial || []).forEach(function (c) { set[c] = true; });
    var chips = el("div", { class: "gm-chips" });
    var sel = countryOptions("", "Add a country…");
    function paint() {
      chips.textContent = "";
      Object.keys(set).sort().forEach(function (c) {
        chips.appendChild(el("span", { class: "gm-chip" }, [cname(c) + " ", el("button", { type: "button", "aria-label": "Remove " + cname(c), text: "×", onclick: function () { delete set[c]; paint(); } })]));
      });
      if (!Object.keys(set).length) chips.appendChild(el("span", { class: "muted", text: "No countries chosen yet." }));
    }
    sel.addEventListener("change", function () { if (sel.value) { set[sel.value] = true; sel.value = ""; paint(); } });
    var presets = el("div", { class: "gm-presets" }, (state.meta.presets || []).map(function (p) {
      return el("button", { type: "button", class: "btn btn--ghost btn--sm", title: p.countries.length + " countries", text: "+ " + p.name, onclick: function () { p.countries.forEach(function (c) { set[c] = true; }); paint(); } });
    }));
    presets.appendChild(el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Clear", onclick: function () { set = {}; paint(); } }));
    paint();
    var cb = codesBox(function (codes) { codes.forEach(function (c) { set[c] = true; }); paint(); });
    return { node: el("div", {}, [sel, cb.node, presets, chips]), get: function () { return Object.keys(set); }, add: function (codes) { codes.forEach(function (c) { set[c] = true; }); paint(); } };
  }
  function modeSelect() {
    var s = el("select", { class: "gm-select" }, [el("option", { value: "allow", text: "Allow only these countries" }), el("option", { value: "block", text: "Block these countries (allow all others)" })]);
    return s;
  }
  function mergeSelect() {
    return el("select", { class: "gm-select", "aria-label": "How to combine" }, [el("option", { value: "replace", text: "Replace the existing countries" }), el("option", { value: "add", text: "Add to the existing countries" }), el("option", { value: "remove", text: "Remove from the existing countries" })]);
  }
  function showBulkApply() {
    var keys = Object.keys(state.selected), m = modeSelect(), mg = mergeSelect(), p = picker([]);
    modal("Set countries for " + keys.length + " item(s)", el("div", { class: "gm-stack" }, [mg, m, p.node]), [
      el("button", { type: "button", class: "btn btn--primary", text: "Apply to selected", onclick: function () {
        if (!p.get().length) return toast("error", "Choose or type at least one country.");
        api("bulk", { type: state.type, keys: keys, action: "apply", mode: m.value, merge: mg.value, countries: p.get() }).then(function (d) { done(d, "Updated " + (d.changed || 0) + " item(s)." + (d.mixed ? " " + d.mixed + " now mix allowed and blocked countries." : "")); });
      } }), cancelBtn()]);
  }
  function showBulkCopy() {
    var keys = Object.keys(state.selected), s = el("select", { class: "gm-select" });
    state.items.forEach(function (i) { if (!state.selected[i.key]) s.appendChild(el("option", { value: i.key, text: i.name + " (" + MODE_LABEL[i.mode] + ", " + i.total + ")" })); });
    modal("Copy rules to " + keys.length + " item(s)", el("div", {}, [el("p", { class: "muted", text: "Choose the item whose countries and bonus overrides should be copied. The selected items' own rules are replaced." }), s]), [
      el("button", { type: "button", class: "btn btn--primary", text: "Copy rules", onclick: function () {
        if (!s.value) return toast("error", "Choose a source item.");
        api("bulk", { type: state.type, keys: keys, action: "copy", from_key: s.value }).then(function (d) { done(d, "Rules copied to " + (d.changed || 0) + " item(s)."); });
      } }), cancelBtn()]);
  }

  // ---------- editor ----------
  var snapshot = "";
  function dirty() { return state.edit && JSON.stringify(state.edit.rules) !== snapshot; }
  function confirmLeave() { return !dirty() || window.confirm("You have unsaved changes to country rules. Leave without saving?"); }
  function openEditor(it) {
    if (!confirmLeave()) return;
    api("rules?type=" + encodeURIComponent(state.type) + "&key=" + encodeURIComponent(it.key)).then(function (d) {
      if (d.error) return toast("error", d.error);
      state.edit = { key: it.key, name: it.name, rules: d.rules.map(function (r) { return { country_code: r.country_code, status: r.status, bonus_override: r.bonus_override || "" }; }) };
      snapshot = JSON.stringify(state.edit.rules);
      var slot = root.querySelector("#gmPanelSlot"); slot.textContent = ""; slot.appendChild(renderEditor());
      slot.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  function renderEditor() {
    var e = state.edit, isCasino = state.type === "casino";
    var card = el("div", { class: "gm-card gm-editor" });
    var mode = modeOf(e.rules);
    var modeSel = el("select", { class: "gm-select", "aria-label": "Mode" }, [
      el("option", { value: "allow", text: "Allow only the countries below" }),
      el("option", { value: "block", text: "Block the countries below (allow all others)" }),
      el("option", { value: "mixed", text: "Custom: choose allowed or blocked per country" })]);
    modeSel.value = mode === "none" ? "allow" : mode;
    var curMode = modeSel.value;
    var list = el("div", { class: "gm-rules" }), testOut = el("div", { class: "gm-test", "aria-live": "polite" });
    var testSel = countryOptions(state.country || "", "Test a country…");
    function repaint() {
      list.textContent = "";
      if (!e.rules.length) list.appendChild(el("p", { class: "muted", text: "No countries yet. With no rules this item is treated as not available." }));
      e.rules.slice().sort(function (a, b) { return cname(a.country_code).localeCompare(cname(b.country_code)); }).forEach(function (r) {
        var row = el("div", { class: "gm-rule" });
        row.appendChild(el("span", { class: "gm-rule__name", text: cname(r.country_code) + " (" + r.country_code + ")" }));
        if (curMode === "mixed") {
          var st = el("select", { class: "gm-select", "aria-label": "Status for " + r.country_code }, [el("option", { value: "allowed", text: "Allowed" }), el("option", { value: "blocked", text: "Blocked" })]);
          st.value = r.status; st.addEventListener("change", function () { r.status = st.value; test(); });
          row.appendChild(st);
        } else row.appendChild(badge(r.status === "allowed" ? "Allowed" : "Blocked", r.status === "allowed" ? "ok" : "bad"));
        if (isCasino) {
          var bo = el("input", { type: "text", class: "gm-input", maxlength: "200", placeholder: "Bonus override (optional)", value: r.bonus_override || "", "aria-label": "Bonus for " + r.country_code });
          bo.addEventListener("input", function () { r.bonus_override = bo.value; });
          row.appendChild(bo);
        }
        row.appendChild(el("button", { type: "button", class: "btn btn--ghost btn--sm", "aria-label": "Remove " + r.country_code, text: "Remove", onclick: function () { e.rules = e.rules.filter(function (x) { return x !== r; }); repaint(); test(); } }));
        list.appendChild(row);
      });
      test();
    }
    function applyMode() {
      curMode = modeSel.value;
      if (curMode !== "mixed") { var s = curMode === "allow" ? "allowed" : "blocked"; e.rules.forEach(function (r) { r.status = s; }); }
      repaint();
    }
    modeSel.addEventListener("change", applyMode);
    function test() {
      testOut.textContent = "";
      if (!testSel.value) { testOut.appendChild(el("span", { class: "muted", text: "Pick a country to see what its visitors would get (using the rules as edited here)." })); return; }
      var res = evaluate(e.rules, testSel.value);
      testOut.appendChild(badge(res.status === "allowed" ? "Available" : "Not available", res.status === "allowed" ? "ok" : "bad"));
      testOut.appendChild(document.createTextNode(" " + res.reason));
    }
    testSel.addEventListener("change", test);
    var addSel = countryOptions("", "Add a country…");
    addSel.addEventListener("change", function () {
      if (!addSel.value) return;
      if (!e.rules.some(function (r) { return r.country_code === addSel.value; })) e.rules.push({ country_code: addSel.value, status: curMode === "block" ? "blocked" : "allowed", bonus_override: "" });
      addSel.value = ""; repaint();
    });
    var typed = codesBox(function (codes) {
      codes.forEach(function (c) { if (!e.rules.some(function (r) { return r.country_code === c; })) e.rules.push({ country_code: c, status: curMode === "block" ? "blocked" : "allowed", bonus_override: "" }); });
      repaint();
    });
    var presets = el("div", { class: "gm-presets" }, (state.meta.presets || []).map(function (p) {
      return el("button", { type: "button", class: "btn btn--ghost btn--sm", title: p.countries.join(", "), text: "+ " + p.name, onclick: function () {
        p.countries.forEach(function (c) { if (!e.rules.some(function (r) { return r.country_code === c; })) e.rules.push({ country_code: c, status: curMode === "block" ? "blocked" : "allowed", bonus_override: "" }); });
        repaint();
      } });
    }));
    var save = el("button", { type: "button", class: "btn btn--primary", text: "Save rules", onclick: function () {
      save.disabled = true;
      api("save", { type: state.type, key: e.key, rules: e.rules }).then(function (d) {
        save.disabled = false;
        if (d.success) { snapshot = JSON.stringify(e.rules); load().then(function () { toast("success", "Saved. " + (e.rules.length ? "" : "This item now has no rules and is treated as not available.")); }); }
        else toast("error", d.error || "Could not save.");
      }).catch(function () { save.disabled = false; toast("error", "Network error. Try again."); });
    } });
    card.appendChild(el("h3", { text: "Rules for " + e.name }));
    card.appendChild(el("label", { class: "gm-label", text: "How should these countries be treated?" }));
    card.appendChild(modeSel);
    card.appendChild(el("label", { class: "gm-label", text: "Countries" }));
    card.appendChild(el("div", { class: "gm-addrow" }, [addSel]));
    card.appendChild(typed.node);
    card.appendChild(presets);
    card.appendChild(list);
    card.appendChild(el("div", { class: "gm-testbox" }, [el("strong", { text: "Check a visitor's country" }), testSel, testOut]));
    card.appendChild(el("div", { class: "gm-actions" }, [save,
      el("button", { type: "button", class: "btn btn--ghost", text: "Close", onclick: function () { if (!confirmLeave()) return; state.edit = null; closeModal(); } }),
      el("button", { type: "button", class: "btn btn--ghost", text: "Remove all rules", onclick: function () { if (!e.rules.length || !window.confirm("Remove every country rule from this item?")) return; e.rules = []; repaint(); } })]));
    repaint();
    return card;
  }

  // ---------- import ----------
  function showImport() {
    var file = el("input", { type: "file", accept: ".csv,text/csv", "aria-label": "CSV file" });
    var out = el("div", { class: "gm-importout" }), csvText = "";
    var apply = el("button", { type: "button", class: "btn btn--primary", text: "Apply import", disabled: "disabled", onclick: function () {
      api("import", { type: state.type, csv: csvText }).then(function (d) { if (d.applied) { closeModal(); load().then(function () { toast("success", "Imported rules for " + d.items + " item(s)."); }); } else out.textContent = (d.errors || [d.error]).join("\n"); });
    } });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        csvText = String(rd.result || ""); out.textContent = "Checking…"; apply.setAttribute("disabled", "disabled");
        api("import", { type: state.type, csv: csvText, dry_run: true }).then(function (d) {
          if (d.errors && d.errors.length) out.textContent = "Nothing was changed. Fix these and try again:\n- " + d.errors.slice(0, 20).join("\n- ") + (d.errors.length > 20 ? "\n…and " + (d.errors.length - 20) + " more" : "");
          else if (d.error) out.textContent = d.error;
          else { out.textContent = "Ready: " + d.rules + " rule(s) for " + d.items + " item(s). Items in the file get exactly these rules; other items are left alone."; apply.removeAttribute("disabled"); }
        });
      };
      rd.readAsText(f);
    });
    modal("Import rules from CSV", el("div", {}, [el("p", { class: "muted", text: "Columns: item_key, country_code, status (allowed or blocked), optional bonus_override. Use Export CSV to get a file in the right shape. The file is checked first and nothing changes if any row is wrong." }), file, out]), [apply, cancelBtn()]);
  }

  // ---------- presets ----------
  function showPresets() {
    var presets = (state.meta.presets || []).map(function (p) { return { name: p.name, countries: p.countries.slice() }; });
    var box = el("div", { class: "gm-presetlist" });
    var name = el("input", { type: "text", class: "gm-input", maxlength: "40", placeholder: "New preset name" });
    var np = picker([]);
    function paint() {
      box.textContent = "";
      presets.forEach(function (p, i) {
        box.appendChild(el("div", { class: "gm-presetrow" }, [el("strong", { text: p.name }), el("span", { class: "muted", text: " " + p.countries.length + " countries: " + p.countries.slice(0, 12).join(", ") + (p.countries.length > 12 ? "…" : "") }),
          el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Delete", onclick: function () { presets.splice(i, 1); paint(); } })]));
      });
      if (!presets.length) box.appendChild(el("p", { class: "muted", text: "No presets." }));
    }
    paint();
    var add = el("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Add preset", onclick: function () {
      if (!name.value.trim() || !np.get().length) return toast("error", "Give the preset a name and at least one country.");
      presets.push({ name: name.value.trim(), countries: np.get() }); name.value = ""; paint();
    } });
    modal("Country presets", el("div", {}, [el("p", { class: "muted", text: "Presets are one-click groups of countries used in the editor." }), box, el("h4", { text: "Add a preset" }), name, np.node, add]), [
      el("button", { type: "button", class: "btn btn--primary", text: "Save presets", onclick: function () {
        api("presets/save", { presets: presets }).then(function (d) { if (d.success) { state.meta.presets = d.presets; closeModal(); toast("success", "Presets saved."); } else toast("error", d.error || "Could not save."); });
      } }), cancelBtn()]);
  }

  // load on first view of the tab
  var metaP = null;
  function loadMeta() {
    if (!metaP) metaP = api("meta").then(function (m) {
      if (m.error) throw new Error(m.error);
      state.meta = m; if (m.types.length && !m.types.some(function (t) { return t.key === state.type; })) state.type = m.types[0].key;
      return m;
    });
    return metaP;
  }
  function boot() {
    if (state.loaded) return; state.loaded = true;
    loadMeta().then(function (m) {
      if (!m.types.length) { root.textContent = "You do not have access to any geo rules."; return; }
      var q = new URLSearchParams(location.search), want = q.get("edit");
      if (want && q.get("type") && m.types.some(function (t) { return t.key === q.get("type"); })) state.type = q.get("type");
      return load().then(function () { if (want) { var it = state.items.filter(function (i) { return i.key === want; })[0]; if (it) openEditor(it); } });
    }).catch(function (e) { state.loaded = false; root.textContent = (e && e.message) || "Could not load. Reload the page and try again."; });
  }
  // The other sections of the dedicated page use these (see geo-rules-pages.js).
  window.GeoRulesKit = { el: el, api: api, state: state, loadMeta: loadMeta, countryOptions: countryOptions, badge: badge, picker: picker, codesBox: codesBox, parseCodes: parseCodes, cname: cname, toast: toast, MODE_LABEL: MODE_LABEL, evaluate: evaluate, modeOf: modeOf, root: root };
  var gmSection = root.getAttribute("data-gm-section") || "rules";
  if (root.hasAttribute("data-gm-page") && gmSection === "rules") boot();
  Array.prototype.forEach.call(document.querySelectorAll("[data-rv-tab='geo']"), function (t) { t.addEventListener("click", boot); });
  if ((location.hash || "") === "#geo") boot();
  window.addEventListener("beforeunload", function (ev) { if (dirty()) { ev.preventDefault(); ev.returnValue = ""; } });
})();
