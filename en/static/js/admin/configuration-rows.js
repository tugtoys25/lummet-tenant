// Dashboard > Configuration > Menus, SEO and components (Phase 6E).
// Edits the row lists of the configuration draft: menu links, page search listings, SEO records, component
// settings and component placement. The lists, labels, limits and field types all come from the server
// (/en/api/v1/config/state -> rows.sets), so this file has no knowledge of any one list.
// Every change is sent to the draft through window.LummetConfig.sendRows (see configuration-draft.js) and goes live only on Publish.
(function () {
  // Starts when its tab first opens (immediately if the tabs script is missing or the tab is already showing).
  var T = window.LummetConfigTabs;
  if (T && T.onFirstOpen) T.onFirstOpen("menus", boot); else boot();
  function boot() {
  var host = document.getElementById("rowsRoot");
  if (!host) return;
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 20;
  var C = null, sets = [], cur = null, data = null, find = "", shown = PAGE, can = false, chain = Promise.resolve(), pend = {}, timer = null;

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else if (k === "style") n.style.cssText = props[k]; else n[k] = props[k]; });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function setDef(id) { return sets.filter(function (s) { return s.id === id; })[0]; }
  function fieldDef(def, k) { return def.fields.filter(function (f) { return f.key === k; })[0]; }
  function msg(t) { $("rowsMsg").textContent = t || ""; }

  // Name shown for an item (same idea as the server's, kept short).
  function nameOf(set, key, r) {
    if (set === "nav") return r.label || "(untitled link)";
    if (set === "pages") return key;
    if (set === "seo") return (r.page_type || "page") + " / " + (r.page_slug || "");
    if (set === "components") return r.name || "(component)";
    return (r.page_type || "page") + " / " + (r.page_slug || "") + " · component " + r.component_id;
  }

  function load() {
    msg("Loading…"); $("rowsList").textContent = "";
    C.api("GET", "/rows/" + cur).then(function (j) {
      if (!j.success) { data = null; msg(j.error || "This list is not available."); return; }
      data = j; msg(""); render();
    }).catch(function () { msg("Could not reach the server."); });
  }

  function tabs() {
    var nav = $("rowsTabs"); nav.textContent = "";
    sets.forEach(function (s) {
      var a = el("a", { href: "#rows-" + s.id, className: "cfg-tab" + (cur === s.id ? " is-active" : ""), text: s.label });
      a.onclick = function (e) { e.preventDefault(); cur = s.id; find = ""; $("rowsFind").value = ""; shown = PAGE; history.replaceState(null, "", "#rows-" + s.id); tabs(); head(); load(); };
      nav.appendChild(a); nav.appendChild(document.createTextNode(" "));
    });
  }
  function head() { var d = setDef(cur); $("rowsHelp").textContent = d ? d.help : ""; buildAdd(); }

  // ----- one input per field type -----
  function input(def, f, key, row, onChange, isNew) {
    var v = row[f.key], inp;
    var dis = !can;
    if (f.type === "bool") { inp = el("input", { type: "checkbox", checked: !!v, disabled: dis }); inp.onchange = function () { onChange(f.key, inp.checked); }; return inp; }
    if (f.type === "enum") {
      inp = el("select", { disabled: dis }); (f.values || []).forEach(function (o) { inp.appendChild(el("option", { value: o, text: (f.valueLabels && f.valueLabels[o]) || o.replace(/_/g, " "), selected: o === v })); });
      if (isNew && v === "" && inp.options.length) { inp.value = inp.options[0].value; onChange(f.key, inp.value, true); }
      inp.onchange = function () { onChange(f.key, inp.value); }; return inp;
    }
    if (f.type === "ref") {
      inp = el("select", { disabled: dis }); inp.appendChild(el("option", { value: "", text: "(top level)" }));
      Object.keys((data && data.rows) || {}).forEach(function (k) { if (k !== key) inp.appendChild(el("option", { value: k, text: nameOf(cur, k, data.rows[k]) + " [" + (data.rows[k].location || "") + "]", selected: k === v })); });
      inp.onchange = function () { onChange(f.key, inp.value); }; return inp;
    }
    if (f.type === "json") {
      inp = el("textarea", { rows: 4, cols: 50, value: v || "", disabled: dis, style: "font-family:ui-monospace,Menlo,monospace;max-width:100%" });
      inp.oninput = function () { onChange(f.key, inp.value); }; return inp;
    }
    inp = el("input", { type: f.type === "int" ? "number" : "text", value: v == null ? "" : String(v), disabled: dis, maxLength: f.max || 300, size: f.type === "int" ? 6 : 36 });
    if (f.type === "int") { inp.min = f.min == null ? 0 : f.min; inp.max = f.max == null ? 9999 : f.max; }
    inp.oninput = function () { onChange(f.key, f.type === "int" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value); };
    return inp;
  }
  function labelled(f, ctl) {
    var l = el("label", { style: "display:block;margin:.35rem 0" }, [el("span", { text: f.label + (f.required ? " *" : ""), style: "display:inline-block;min-width:11rem" }), ctl]);
    if (f.help) l.appendChild(el("small", { className: "muted", text: "  " + f.help }));
    return l;
  }

  // ----- list -----
  function matches(key, r) { if (!find) return true; return (key + " " + JSON.stringify(r)).toLowerCase().indexOf(find.toLowerCase()) !== -1; }
  function isChanged(key) { return data.changed.indexOf(key) !== -1; }

  function render() {
    var d = setDef(cur), list = $("rowsList"); list.textContent = "";
    var keys = Object.keys(data.rows).filter(function (k) { return matches(k, data.rows[k]); });
    var removed = data.changed.filter(function (k) { return !data.rows[k] && data.live[k] && matches(k, data.live[k]); });
    if (!keys.length && !removed.length) list.appendChild(el("p", { className: "muted", text: find ? "Nothing matches." : "Nothing here yet." }));
    keys.slice(0, shown).forEach(function (k) { list.appendChild(item(d, k)); });
    $("rowsMore").hidden = keys.length <= shown;
    $("rowsMore").textContent = "Show more (" + (keys.length - shown) + " left)";
    if (removed.length) {
      list.appendChild(el("h4", { text: "Removed in your draft" }));
      removed.forEach(function (k) {
        var b = el("button", { type: "button", className: "btn", text: "Put back", disabled: !can });
        b.onclick = function () { var p = {}; p[cur] = { set: {} }; p[cur].set[k] = {}; send(p, null); };
        list.appendChild(el("div", { style: "padding:.4rem 0;border-bottom:1px solid var(--border,#ddd)" }, [el("s", { text: nameOf(cur, k, data.live[k]) }), document.createTextNode("  "), b]));
      });
    }
  }

  function item(d, key) {
    var row = data.rows[key], liveRow = data.live[key], changed = isChanged(key);
    var box = el("div", { style: "padding:.6rem 0;border-bottom:1px solid var(--border,#ddd)" });
    var ro = d.fields.filter(function (f) { return f.readonly && (cur === "seo" || cur === "placements" || cur === "components") && (f.key === "type"); });
    var title = el("strong", { text: nameOf(cur, key, row) });
    var badge = el("span", { className: "muted", style: "margin-left:.5rem", text: changed ? (liveRow ? "Changed in draft" : "New in draft") : "" });
    var errs = el("div", { role: "alert", style: "color:var(--danger,#b00020)" });
    var head = el("div", {}, [title, badge]);
    var actions = el("span", { style: "margin-left:.75rem" });
    if (can && changed) {
      var reset = el("button", { type: "button", className: "btn", text: liveRow ? "Undo my changes" : "Discard new item" });
      reset.onclick = function () {
        var p = {}; p[cur] = {};
        if (!liveRow) p[cur].remove = [key];
        else { p[cur].set = {}; p[cur].set[key] = JSON.parse(JSON.stringify(liveRow)); delete_ro(d, p[cur].set[key]); }
        send(p, errs);
      };
      actions.appendChild(reset);
    }
    if (can && d.remove) {
      var rm = el("button", { type: "button", className: "btn", text: "Remove" });
      rm.onclick = function () { if (!window.confirm("Remove “" + nameOf(cur, key, row) + "” from your draft? It stays on the live site until you publish.")) return; var p = {}; p[cur] = { remove: [key] }; send(p, errs); };
      actions.appendChild(document.createTextNode(" ")); actions.appendChild(rm);
    }
    head.appendChild(actions); box.appendChild(head);
    d.fields.forEach(function (f) {
      if (f.readonly) return;
      box.appendChild(labelled(f, input(d, f, key, row, function (k, v) { row[k] = v; edit(key, k, v, errs, badge, liveRow); }, false)));
    });
    box.appendChild(errs);
    return box;
  }
  function delete_ro(d, r) { d.fields.forEach(function (f) { if (f.readonly) delete r[f.key]; }); }

  // ----- sending (serialised, debounced per item) -----
  function edit(key, field, value, errs, badge, liveRow) {
    pend[key] = pend[key] || { fields: {}, errs: errs }; pend[key].fields[field] = value; pend[key].errs = errs; pend[key].badge = badge;
    badge.textContent = "Saving…";
    clearTimeout(timer); timer = setTimeout(flush, 800);
  }
  function flush() {
    var keys = Object.keys(pend); if (!keys.length) return;
    keys.forEach(function (key) {
      var p = pend[key]; delete pend[key];
      var patch = {}; patch[cur] = { set: {} }; patch[cur].set[key] = p.fields;
      send(patch, p.errs, true, p.badge, key);
    });
  }
  function send(patch, errs, quiet, badge, key) {
    chain = chain.then(function () {
      if (errs) errs.textContent = "";
      return C.sendRows(patch).then(function (j) {
        if (!j.success) { var t = (j.errors && j.errors.length ? j.errors.join(" ") : j.error) || "Could not save."; if (errs) errs.textContent = t; else msg(t); if (badge) badge.textContent = "Not saved"; refresh(quiet, badge, key); return; }
        msg(""); refresh(quiet, badge, key);
      }).catch(function () { var t = "Network problem. Try again."; if (errs) errs.textContent = t; else msg(t); });
    });
  }
  // Re-read the list. A quiet refresh (after typing) only updates the "changed" markers so focus is not lost.
  function refresh(quiet, badge, key) {
    C.api("GET", "/rows/" + cur).then(function (j) {
      if (!j.success) return;
      if (quiet) { data.changed = j.changed; if (badge && key) badge.textContent = j.changed.indexOf(key) === -1 ? "" : (j.live[key] ? "Changed in draft" : "New in draft"); return; }
      data = j; render();
    });
  }

  // ----- add -----
  function buildAdd() {
    var d = setDef(cur), box = $("rowsAdd"); box.textContent = ""; box.hidden = true;
    if (!d || !d.create || !can) return;
    var row = {}, vals = {};
    var det = el("details", {}, [el("summary", { text: cur === "nav" ? "Add a menu link" : "Add an SEO record" })]);
    var form = el("div", { style: "padding:.5rem 0" });
    var errs = el("div", { role: "alert", style: "color:var(--danger,#b00020)" });
    var fields = d.fields.filter(function (f) { return !f.readonly || (cur === "seo" && (f.key === "page_type" || f.key === "page_slug")); });
    fields.forEach(function (f) {
      var ff = f.readonly ? { key: f.key, type: "text", label: f.label, max: 200, required: true } : f;
      row[f.key] = f.type === "bool" ? (f.key === "enabled") : f.type === "int" ? 0 : "";
      form.appendChild(labelled(ff, input(d, ff, "", row, function (k, v) { vals[k] = v; row[k] = v; }, true)));
      if (f.type === "bool" && f.key === "enabled") vals.enabled = true;
    });
    var go = el("button", { type: "button", className: "btn btn--primary", text: "Add to draft" });
    go.onclick = function () {
      var key = cur === "seo" ? (String(row.page_type || "").trim() + "|" + String(row.page_slug || "").trim()) : "new-" + Math.random().toString(36).slice(2, 10);
      var out = {}; fields.forEach(function (f) { out[f.key] = row[f.key]; });
      var p = {}; p[cur] = { set: {} }; p[cur].set[key] = out;
      errs.textContent = ""; go.disabled = true;
      chain = chain.then(function () { return C.sendRows(p); }).then(function (j) {
        go.disabled = false;
        if (!j.success) { errs.textContent = (j.errors && j.errors.length ? j.errors.join(" ") : j.error) || "Could not add."; return; }
        buildAdd(); load();
      }).catch(function () { go.disabled = false; errs.textContent = "Network problem. Try again."; });
    };
    form.appendChild(go); form.appendChild(errs); det.appendChild(form); box.appendChild(det); box.hidden = false;
  }

  // ----- start -----
  $("rowsFind").oninput = function () { find = this.value; shown = PAGE; if (data) render(); };
  $("rowsMore").onclick = function () { shown += PAGE; render(); };
  if (!window.LummetConfig) return;
  C = window.LummetConfig;
  C.ready.then(function (S) {
    if (!S.ready) { $("rowsNotice").textContent = "Editing these lists as a draft needs database migration 0009_config_versions.sql. Until it is run, use the Navigation, SEO, Pages and Components screens directly."; $("rowsFind").parentNode.hidden = true; return; }
    var R = S.rows || { sets: [], available: [], skipped: [] };
    sets = R.sets.filter(function (s) { return R.available.indexOf(s.id) !== -1; });
    can = !!(S.permissions && S.permissions.editDraft);
    var notes = [];
    if (!can) notes.push("You can look but not edit: your role cannot change the draft.");
    (R.skipped || []).forEach(function (k) { var d = setDef(k.set) || R.sets.filter(function (s) { return s.id === k.set; })[0]; notes.push((d ? d.label : k.set) + " is not editable here (" + k.reason + "). Use its own screen."); });
    $("rowsNotice").textContent = notes.join(" ");
    if (!sets.length) { $("rowsFind").parentNode.hidden = true; return; }
    var want = (location.hash.match(/^#rows-(\w+)/) || [])[1];
    cur = setDef(want) ? want : sets[0].id;
    tabs(); head(); load();
    C.onSaved(function () { /* status bar is updated by the controller */ });
  });
  }
})();
