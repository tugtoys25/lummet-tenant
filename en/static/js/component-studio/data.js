// Component Studio: the "Data table" type form.

import { btn, el, isObj, st } from "/static/js/component-studio/context.js";
import { commit, field, group, numIn, openPicker, picksIn, segIn, switchIn, textIn } from "/static/js/component-studio/widgets.js";
import { builders } from "/static/js/component-studio/forms.js";

// ---- data table
function tableForm(root) {
  var d = { mode: "manual", style: "striped", header: "dark", casino_source: "picked", limit: 5 };
  Object.keys(d).forEach(function (k) { if (st.S[k] == null) st.S[k] = d[k]; });
  if (!Array.isArray(st.S.columns) || !st.S.columns.length) st.S.columns = [{ label: "Name", align: "left" }, { label: "Details", align: "left" }];
  st.S.columns = st.S.columns.map(function (c) { return isObj(c) ? c : { label: String(c || ""), align: "left" }; });
  if (!Array.isArray(st.S.rows)) st.S.rows = [];
  if (!st.S.rows.length) st.S.rows = [[{ t: "" }, { t: "" }], [{ t: "" }, { t: "" }]];
  var g = group("Table content", "Type your own, or build a casino comparison", true); root.appendChild(g);
  var manual = el("div"), casinos = el("div");
  function sync() { manual.hidden = st.S.mode !== "manual"; casinos.hidden = st.S.mode !== "casinos"; }
  g.body.appendChild(field("Kind of table", null, segIn(st.S, "mode", [["manual", "My own table"], ["casinos", "Casino comparison"]], "manual", sync), true));
  // manual grid
  var gridHost = el("div", "cs-grid-host");
  function norm() { st.S.rows.forEach(function (r, i) { while (r.length < st.S.columns.length) r.push({ t: "" }); st.S.rows[i] = r.slice(0, st.S.columns.length).map(function (c) { return isObj(c) ? c : { t: String(c == null ? "" : c) }; }); }); }
  function draw() {
    norm(); gridHost.textContent = "";
    var tbl = el("table", "cs-grid"); var thead = el("thead"); var hr = el("tr");
    st.S.columns.forEach(function (c, ci) {
      var th = el("th"); var i = el("input"); i.type = "text"; i.value = c.label; i.placeholder = "Column " + (ci + 1); i.maxLength = 60; i.setAttribute("aria-label", "Column " + (ci + 1) + " heading");
      i.addEventListener("input", function () { c.label = i.value; commit(); });
      var al = el("select"); [["left", "Left"], ["center", "Centre"], ["right", "Right"]].forEach(function (p) { var op = el("option", null, p[1]); op.value = p[0]; al.appendChild(op); }); al.value = c.align || "left"; al.setAttribute("aria-label", "Column " + (ci + 1) + " alignment");
      al.addEventListener("change", function () { c.align = al.value; commit(); });
      var rm = btn("×", "hh-btn", function () { if (st.S.columns.length > 1) { st.S.columns.splice(ci, 1); st.S.rows.forEach(function (r) { r.splice(ci, 1); }); commit(); draw(); } }); rm.setAttribute("aria-label", "Remove column"); rm.disabled = st.S.columns.length <= 1;
      th.appendChild(i); th.appendChild(al); th.appendChild(rm); hr.appendChild(th);
    });
    hr.appendChild(el("th")); thead.appendChild(hr); tbl.appendChild(thead);
    var tb = el("tbody");
    st.S.rows.forEach(function (r, ri) {
      var tr = el("tr");
      r.forEach(function (cell, ci) {
        var td = el("td"); var i = el("input"); i.type = "text"; i.value = cell.t || ""; i.maxLength = 300; i.setAttribute("aria-label", "Row " + (ri + 1) + ", " + (st.S.columns[ci].label || "column " + (ci + 1)));
        i.addEventListener("input", function () { cell.t = i.value; commit(); });
        var lk = btn(cell.l ? "🔗" : "link", "hh-btn cs-cell-link", function () { openPicker({ mode: "link" }, function (it) { cell.l = it.url; commit(); draw(); }); });
        lk.title = cell.l ? "Linked to " + cell.l + " (click to change)" : "Add a link";
        td.appendChild(i); td.appendChild(lk);
        if (cell.l) { var cl = btn("×", "hh-btn cs-cell-link", function () { delete cell.l; commit(); draw(); }); cl.setAttribute("aria-label", "Remove link"); td.appendChild(cl); }
        tr.appendChild(td);
      });
      var ac = el("td", "cs-grid__acts");
      var up = btn("↑", "hh-btn", function () { var t = st.S.rows[ri]; st.S.rows[ri] = st.S.rows[ri - 1]; st.S.rows[ri - 1] = t; commit(); draw(); }); up.disabled = ri === 0; up.setAttribute("aria-label", "Move row up");
      var dn = btn("↓", "hh-btn", function () { var t = st.S.rows[ri]; st.S.rows[ri] = st.S.rows[ri + 1]; st.S.rows[ri + 1] = t; commit(); draw(); }); dn.disabled = ri === st.S.rows.length - 1; dn.setAttribute("aria-label", "Move row down");
      var rm = btn("×", "hh-btn", function () { st.S.rows.splice(ri, 1); commit(); draw(); }); rm.setAttribute("aria-label", "Remove row");
      ac.appendChild(up); ac.appendChild(dn); ac.appendChild(rm); tr.appendChild(ac); tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    var sc = el("div", "cs-grid-scroll"); sc.appendChild(tbl); gridHost.appendChild(sc);
    var bar = el("div", "hh-addbar");
    var ar = btn("+ Add row", "hh-btn", function () { st.S.rows.push(st.S.columns.map(function () { return { t: "" }; })); commit(); draw(); }); ar.disabled = st.S.rows.length >= 60;
    var ac2 = btn("+ Add column", "hh-btn", function () { if (st.S.columns.length < 8) { st.S.columns.push({ label: "", align: "left" }); st.S.rows.forEach(function (r) { r.push({ t: "" }); }); commit(); draw(); } }); ac2.disabled = st.S.columns.length >= 8;
    bar.appendChild(ar); bar.appendChild(ac2); bar.appendChild(el("span", "hh-hint", st.S.rows.length + " rows, " + st.S.columns.length + " columns (up to 60 and 8)")); gridHost.appendChild(bar);
  }
  manual.appendChild(gridHost); draw();
  manual.appendChild(field(null, null, switchIn(st.S, "first_col_bold", "Make the first column a row heading", true)));
  // casinos
  casinos.appendChild(field("Which casinos", null, segIn(st.S, "casino_source", [["picked", "Casinos I pick"], ["latest", "Top rated automatically"]], "picked", sync2), true));
  var cp = el("div"); cp.appendChild(field("Casinos", "Reorder with the arrows.", picksIn(st.S, "items", { max: 24, sources: [["casino", "Casinos"]] }), true));
  var cl = el("div"); cl.appendChild(field("How many", null, numIn(st.S, "limit", 1, 24, 5)));
  function sync2() { cp.hidden = st.S.casino_source !== "picked"; cl.hidden = st.S.casino_source !== "latest"; }
  casinos.appendChild(cp); casinos.appendChild(cl); sync2();
  var cols = el("div", "hh-field hh-wide"); cols.appendChild(el("span", "hh-label", "Columns to show"));
  if (!Array.isArray(st.S.casino_cols)) st.S.casino_cols = ["name", "rating", "bonus", "button"];
  [["name", "Casino name"], ["rating", "Rating"], ["bonus", "Bonus"], ["license", "Licence"], ["button", "Visit button"]].forEach(function (p) {
    var l = el("label", "hh-switch"); var i = el("input"); i.type = "checkbox"; i.checked = st.S.casino_cols.indexOf(p[0]) !== -1;
    i.addEventListener("change", function () { var s = st.S.casino_cols.filter(function (x) { return x !== p[0]; }); if (i.checked) s.push(p[0]); st.S.casino_cols = s; commit(); });
    l.appendChild(i); var tr2 = el("span", "hh-track"); tr2.setAttribute("aria-hidden", "true"); l.appendChild(tr2); l.appendChild(el("span", null, p[1])); cols.appendChild(l);
  });
  casinos.appendChild(cols);
  casinos.appendChild(field("Button text", null, textIn(st.S, "button_text", "Visit", 30)));
  g.body.appendChild(manual); g.body.appendChild(casinos); sync();

  var look = group("Look", "Style, header colour, caption"); root.appendChild(look);
  look.body.appendChild(field("Style", null, segIn(st.S, "style", [["default", "Plain"], ["striped", "Striped"], ["bordered", "Bordered"]], "striped")));
  look.body.appendChild(field("Header row", null, segIn(st.S, "header", [["dark", "Dark"], ["brand", "Brand colour"], ["light", "Light"]], "dark")));
  look.body.appendChild(field(null, null, switchIn(st.S, "compact", "Compact (less spacing)", false)));
  look.body.appendChild(field("Caption (read by screen readers and shown above)", null, textIn(st.S, "caption", "Optional", 160)));
  look.body.appendChild(field("Note under the table", null, textIn(st.S, "note", "e.g. Updated monthly", 300, "textarea"), true));
}

builders.data_table = tableForm;
