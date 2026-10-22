// Component Studio: the small form widgets (fields, pickers, repeaters, rich text) that every type form is built from.

import { SOURCES, btn, contentEl, el, settingsEl, st } from "/static/js/component-studio/context.js";
import { schedulePreview } from "/static/js/component-studio/preview.js";

// ---- widgets
var uid = 0;

// ------------------------------------------------------------ saving
// the form writes into the raw boxes; the existing save code reads them as before
export function commit(opts) {
  if (st.busy) return;
  settingsEl.value = Object.keys(st.S).length ? JSON.stringify(st.S) : "";
  if (opts && opts.contentChanged) contentEl.dispatchEvent(new Event("input", { bubbles: true }));
  schedulePreview();
}

export function setContent(v) { if (contentEl.value !== v) { contentEl.value = v; } schedulePreview(); }

// ------------------------------------------------------------ small widgets
export function field(label, hint, control, wide) {
  var f = el("div", "hh-field" + (wide ? " hh-wide" : ""));
  if (label) { var l = el("label", null, label); f.appendChild(l); }
  f.appendChild(control);
  if (hint) f.appendChild(el("p", "hh-hint", hint));
  return f;
}

export function group(title, sub, open) {
  var d = el("details", "hh-card"); if (open) d.open = true;
  var s = el("summary", null, title); if (sub) s.appendChild(el("span", "hh-sub", sub));
  d.appendChild(s);
  var b = el("div", "hh-body"); d.appendChild(b);
  d.body = b;
  return d;
}

export function textIn(o, k, ph, max, tag) {
  var i = el(tag || "input"); if (!tag) i.type = "text"; else i.rows = 3;
  i.placeholder = ph || ""; if (max) i.maxLength = max; i.value = o[k] == null ? "" : String(o[k]);
  i.addEventListener("input", function () { o[k] = i.value; commit(); });
  return i;
}

export function selectIn(o, k, opts, def) {
  var s = el("select");
  opts.forEach(function (p) { var op = el("option", null, p[1]); op.value = p[0]; s.appendChild(op); });
  s.value = o[k] != null && opts.some(function (p) { return p[0] === o[k]; }) ? o[k] : def;
  s.addEventListener("change", function () { o[k] = s.value; commit(); });
  return s;
}

export function segIn(o, k, opts, def, onChange) {
  var wrap = el("div", "hh-seg"); wrap.setAttribute("role", "radiogroup");
  var name = "cs_" + (++uid);
  var cur = o[k] != null ? String(o[k]) : def;
  opts.forEach(function (p) {
    var l = el("label"); var i = el("input"); i.type = "radio"; i.name = name; i.value = p[0]; i.checked = cur === p[0];
    i.addEventListener("change", function () { o[k] = p[0]; commit(); if (onChange) onChange(); });
    l.appendChild(i); l.appendChild(el("span", null, p[1])); wrap.appendChild(l);
  });
  return wrap;
}

export function switchIn(o, k, label, def, onChange) {
  var l = el("label", "hh-switch"); var i = el("input"); i.type = "checkbox";
  i.checked = o[k] == null ? def : (o[k] === true || o[k] === "true");
  i.addEventListener("change", function () { o[k] = i.checked; commit(); if (onChange) onChange(); });
  l.appendChild(i); l.appendChild(el("span", "hh-track")); l.lastChild.setAttribute("aria-hidden", "true"); l.appendChild(el("span", null, label));
  return l;
}

export function rangeIn(o, k, min, max, step, def, unit) {
  var w = el("div", "hh-range"); var i = el("input"); i.type = "range"; i.min = min; i.max = max; i.step = step;
  i.value = o[k] == null || o[k] === "" ? def : o[k];
  var out = el("output", null, i.value + (unit || ""));
  i.addEventListener("input", function () { o[k] = Number(i.value); out.textContent = i.value + (unit || ""); commit(); });
  w.appendChild(i); w.appendChild(out); return w;
}

export function numIn(o, k, min, max, def) {
  var i = el("input"); i.type = "number"; i.min = min; i.max = max; i.value = o[k] == null || o[k] === "" ? def : o[k];
  i.addEventListener("input", function () { var n = parseInt(i.value, 10); if (isFinite(n)) { o[k] = Math.max(min, Math.min(max, n)); commit(); } });
  return i;
}

export function colorIn(o, k) {
  var w = el("div", "hh-color"); var p = el("input"); p.type = "color"; p.value = /^#[0-9a-f]{6}$/i.test(o[k] || "") ? o[k] : "#000000";
  p.setAttribute("aria-label", "Colour picker");
  var t = el("input"); t.type = "text"; t.placeholder = "Default"; t.maxLength = 30; t.value = o[k] || "";
  p.addEventListener("input", function () { t.value = p.value; o[k] = p.value; commit(); });
  t.addEventListener("input", function () { o[k] = t.value; if (/^#[0-9a-f]{6}$/i.test(t.value)) p.value = t.value; commit(); });
  var r = btn("Reset", null, function () { t.value = ""; o[k] = ""; commit(); });
  w.appendChild(p); w.appendChild(t); w.appendChild(r); return w;
}

function pickMedia(done, kind) {
  var p = window.MediaPicker;
  var fn = p && (kind === "video" ? p.openVideoPicker : p.openImagePicker);
  if (!fn) { window.alert("The Media library is not available on this page. Paste the address instead."); return; }
  fn.call(p, function (m) { if (m) done(m); }, kind === "video" ? "videos" : "banners");
}

export function imageIn(o, k, ph) {
  var w = el("div", "cs-image");
  var thumb = el("img", "cs-thumb"); thumb.alt = ""; thumb.hidden = true;
  var t = el("input"); t.type = "text"; t.placeholder = ph || "Choose a picture or paste an address"; t.maxLength = 500; t.value = o[k] || "";
  function show() { if (t.value && /^(\/|https:\/\/)/.test(t.value)) { thumb.src = t.value; thumb.hidden = false; } else thumb.hidden = true; }
  t.addEventListener("input", function () { o[k] = t.value; show(); commit(); });
  var pick = btn("Choose from Media", null, function () { pickMedia(function (m) { t.value = m.url || m.public_url || ""; o[k] = t.value; show(); commit(); }); });
  var clear = btn("Remove", null, function () { t.value = ""; o[k] = ""; show(); commit(); });
  var row = el("div", "cs-row"); row.appendChild(t); row.appendChild(pick); row.appendChild(clear);
  w.appendChild(thumb); w.appendChild(row); show(); return w;
}

export function linkIn(o, k, ph) {
  var w = el("div", "cs-row");
  var t = el("input"); t.type = "text"; t.placeholder = ph || "/en/page or https://..."; t.maxLength = 300; t.value = o[k] || "";
  t.addEventListener("input", function () { o[k] = t.value; commit(); });
  var pick = btn("Pick a page", null, function () { openPicker({ mode: "link" }, function (item) { t.value = item.url; o[k] = item.url; commit(); }); });
  w.appendChild(t); w.appendChild(pick); return w;
}

// ------------------------------------------------------------ picker dialog
// (shared with the navigation and homepage editors: static/js/link-picker.js)
export function openPicker(opts, onPick) {
  if (!window.LummetPicker) { window.alert("The picker could not be loaded. Reload the page."); return; }
  window.LummetPicker.open(opts, onPick);
}

// ------------------------------------------------------------ picked items list
var cardCache = {};

export function picksIn(o, k, opts) {
  opts = opts || {};
  var max = opts.max || 24;
  var wrap = el("div", "cs-picks");
  var list = el("div", "cs-picklist");
  var add = btn("+ Search and add", "hh-btn", function () {
    openPicker({ sources: opts.sources }, function (p) {
      o[k] = o[k] || [];
      if (o[k].length >= max) return false;
      if (o[k].some(function (x) { return x.source === p.source && x.key === p.key; })) return true;
      o[k].push({ source: p.source, key: p.key, label: p.label }); cardCache[p.source + ":" + p.key] = p.card; commit(); draw(); return true;
    });
  });
  var count = el("span", "hh-hint");
  function move(i, d) { var a = o[k]; var j = i + d; if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; commit(); draw(); }
  function draw() {
    list.textContent = "";
    var a = o[k] = Array.isArray(o[k]) ? o[k] : [];
    if (!a.length) list.appendChild(el("p", "hh-hint", "Nothing picked yet. Use “Search and add”."));
    a.forEach(function (p, i) {
      var row = el("div", "cs-pick");
      var c = cardCache[p.source + ":" + p.key];
      if (c && c.image) { var im = el("img", "cs-thumb"); im.alt = ""; im.src = c.image; row.appendChild(im); }
      var tx = el("div", "cs-result__text"); tx.appendChild(el("strong", null, (c && c.title) || p.label || p.key));
      tx.appendChild(el("span", "hh-hint", (SOURCES.filter(function (s) { return s[0] === p.source; })[0] || [0, p.source])[1] + " · " + p.key)); row.appendChild(tx);
      var acts = el("div", "cs-pick__acts");
      var up = btn("↑", "hh-btn", function () { move(i, -1); }); up.setAttribute("aria-label", "Move up"); up.disabled = i === 0;
      var dn = btn("↓", "hh-btn", function () { move(i, 1); }); dn.setAttribute("aria-label", "Move down"); dn.disabled = i === a.length - 1;
      var rm = btn("Remove", "hh-btn", function () { a.splice(i, 1); commit(); draw(); });
      acts.appendChild(up); acts.appendChild(dn); acts.appendChild(rm); row.appendChild(acts); list.appendChild(row);
    });
    count.textContent = a.length + " of " + max;
  }
  // names and pictures of items picked earlier
  function hydrate() {
    var a = Array.isArray(o[k]) ? o[k] : []; if (!a.length) return;
    fetch("/en/api/v1/component/pick-resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ picks: a }) })
      .then(function (r) { return r.json(); }).then(function (d) { ((d && d.results) || []).forEach(function (c) { cardCache[c.source + ":" + c.key] = c; }); draw(); }).catch(function () {});
  }
  var bar = el("div", "hh-addbar"); bar.appendChild(add); bar.appendChild(count);
  wrap.appendChild(list); wrap.appendChild(bar); draw(); hydrate(); return wrap;
}

// ------------------------------------------------------------ generic repeater
// rows = array of objects; spec = [{k,label,type:'text'|'area'|'link'|'image'|'select',opts,max}]
export function repeaterIn(o, k, spec, max, addLabel, blank, titleOf) {
  var wrap = el("div", "cs-rep"); var list = el("div", "hh-rows");
  var count = el("span", "hh-hint");
  var add = btn(addLabel, "hh-btn", function () { o[k].push(JSON.parse(JSON.stringify(blank))); commit(); draw(); });
  function draw() {
    list.textContent = ""; var a = o[k] = Array.isArray(o[k]) ? o[k] : [];
    a.forEach(function (row, i) {
      var card = el("div", "cs-rowcard");
      var head = el("div", "cs-rowcard__head"); head.appendChild(el("strong", null, (titleOf ? titleOf(row, i) : "") || ("Item " + (i + 1))));
      var acts = el("div", "cs-pick__acts");
      var up = btn("↑", "hh-btn", function () { var t = a[i]; a[i] = a[i - 1]; a[i - 1] = t; commit(); draw(); }); up.disabled = i === 0; up.setAttribute("aria-label", "Move up");
      var dn = btn("↓", "hh-btn", function () { var t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; commit(); draw(); }); dn.disabled = i === a.length - 1; dn.setAttribute("aria-label", "Move down");
      var rm = btn("Remove", "hh-btn", function () { a.splice(i, 1); commit(); draw(); });
      acts.appendChild(up); acts.appendChild(dn); acts.appendChild(rm); head.appendChild(acts); card.appendChild(head);
      spec.forEach(function (f) {
        var c;
        if (f.type === "area") c = textIn(row, f.k, f.ph, f.max, "textarea");
        else if (f.type === "link") c = linkIn(row, f.k);
        else if (f.type === "image") c = imageIn(row, f.k);
        else if (f.type === "select") c = selectIn(row, f.k, f.opts, f.opts[0][0]);
        else c = textIn(row, f.k, f.ph, f.max);
        card.appendChild(field(f.label, f.hint, c));
      });
      list.appendChild(card);
    });
    add.disabled = a.length >= max; count.textContent = a.length + " of " + max;
  }
  var bar = el("div", "hh-addbar"); bar.appendChild(add); bar.appendChild(count);
  wrap.appendChild(list); wrap.appendChild(bar); draw(); return wrap;
}

// ------------------------------------------------------------ rich text (visual + HTML)
var RICH_OK = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, A: 1, UL: 1, OL: 1, LI: 1, H3: 1, H4: 1, BLOCKQUOTE: 1, HR: 1 };

function onlySimpleMarkup(html) {
  var d = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
  var ok = true;
  Array.prototype.forEach.call(d.body.querySelectorAll("*"), function (n) {
    if (!RICH_OK[n.tagName]) ok = false;
    Array.prototype.forEach.call(n.attributes, function (a) { if (!(n.tagName === "A" && a.name === "href")) ok = false; });
  });
  return ok;
}

// copy only the simple markup out of what was typed or pasted
function cleanNode(src, dst) {
  Array.prototype.forEach.call(src.childNodes, function (n) {
    if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
    if (n.nodeType !== 1) return;
    var tag = n.tagName === "DIV" ? "P" : n.tagName;
    if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|TEMPLATE)$/.test(tag)) return;
    if (!RICH_OK[tag]) { cleanNode(n, dst); return; }
    var c = document.createElement(tag.toLowerCase());
    if (tag === "A") { var h = n.getAttribute("href") || ""; if (/^(https?:\/\/|\/|#|mailto:)/i.test(h)) c.setAttribute("href", h); }
    cleanNode(n, c); dst.appendChild(c);
  });
}

export function richIn(getHtml, setHtml, opts) {
  opts = opts || {};
  var wrap = el("div", "cs-rich");
  var bar = el("div", "cs-rich__bar");
  var ed = el("div", "cs-rich__ed"); ed.contentEditable = "true"; ed.setAttribute("role", "textbox"); ed.setAttribute("aria-multiline", "true"); ed.setAttribute("aria-label", "Text");
  var code = el("textarea", "cs-rich__code"); code.hidden = true; code.rows = 8;
  var mode = "visual";
  var initial = getHtml() || "";
  var simple = onlySimpleMarkup(initial);
  function loadVisual(html) { ed.textContent = ""; var d = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html"); cleanNode(d.body, ed); }
  function readVisual() { var tmp = document.createElement("div"); cleanNode(ed, tmp); return tmp.innerHTML; }
  function cmd(name, val) { ed.focus(); document.execCommand(name, false, val || null); push(); }
  [["B", "bold", "Bold"], ["I", "italic", "Italic"], ["•", "insertUnorderedList", "Bulleted list"], ["1.", "insertOrderedList", "Numbered list"]].forEach(function (b) {
    var x = btn(b[0], "hh-btn", function () { cmd(b[1]); }); x.setAttribute("aria-label", b[2]); x.title = b[2]; bar.appendChild(x);
  });
  var h = btn("Heading", "hh-btn", function () { cmd("formatBlock", "h3"); }); bar.appendChild(h);
  var pp = btn("Paragraph", "hh-btn", function () { cmd("formatBlock", "p"); }); bar.appendChild(pp);
  var ln = btn("Link", "hh-btn", function () { openPicker({ mode: "link" }, function (it) { cmd("createLink", it.url); }); }); bar.appendChild(ln);
  var tog = btn("Edit as HTML", "hh-btn cs-rich__tog", function () {
    if (mode === "visual") { code.value = readVisual(); ed.hidden = true; code.hidden = false; mode = "html"; tog.textContent = "Back to visual"; }
    else { if (!onlySimpleMarkup(code.value) && !window.confirm("This HTML has parts the visual editor cannot keep (styles, scripts, other tags). Switching will remove them. Continue?")) return; loadVisual(code.value); setHtml(readVisual()); code.hidden = true; ed.hidden = false; mode = "visual"; tog.textContent = "Edit as HTML"; }
  });
  bar.appendChild(tog);
  function push() { setHtml(readVisual()); }
  ed.addEventListener("input", push);
  ed.addEventListener("paste", function (e) {
    e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t);
  });
  code.addEventListener("input", function () { setHtml(code.value); });
  wrap.appendChild(bar); wrap.appendChild(ed); wrap.appendChild(code);
  if (!simple) {
    // keep existing markup exactly as it is until the admin chooses to change it
    code.value = initial; ed.hidden = true; code.hidden = false; mode = "html"; tog.textContent = "Back to visual";
    wrap.insertBefore(el("p", "hh-hint", "This text uses HTML the visual editor cannot keep, so it is shown as HTML and left exactly as it is."), bar);
  } else loadVisual(initial);
  return wrap;
}
