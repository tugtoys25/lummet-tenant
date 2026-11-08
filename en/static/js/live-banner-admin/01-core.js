/* Live banners admin: core helpers and the form engine. One global: window.LiveBannerAdmin. DOM APIs only (no innerHTML). */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin = window.LiveBannerAdmin || {};
  LB.state = { draft: null, templates: [], banners: [], editingId: null };

  LB.el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else if (v === true) n.setAttribute(k, ""); else if (v !== false && v != null) n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  };
  LB.btn = function (text, fn, cls) { var b = LB.el("button", { type: "button", class: cls || "btn btn--ghost btn--sm", text: text }); if (fn) b.addEventListener("click", fn); return b; };

  LB.api = function (url, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch(url, opt).then(function (r) { return r.json().catch(function () { return { success: false, error: "Bad response" }; }).then(function (d) { d.__status = r.status; return d; }); });
  };

  LB.say = function (msg, bad) {
    var box = document.getElementById("lbMessage"); if (!box) return;
    box.textContent = msg || ""; box.className = "alert" + (bad ? " alert--error" : " alert--success"); box.hidden = !msg;
  };

  // dotted-path get/set on the draft: "style.bg", "content.link"
  LB.get = function (path) { return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, LB.state.draft); };
  LB.set = function (path, v) {
    var parts = path.split("."), o = LB.state.draft;
    parts.slice(0, -1).forEach(function (k) { if (!o[k] || typeof o[k] !== "object") o[k] = {}; o = o[k]; });
    o[parts[parts.length - 1]] = v;
    if (LB.onChange) LB.onChange(path);
  };

  // field(spec): spec = { path, label, type, options, min, max, step, hint, f }
  LB.field = function (spec) {
    var id = "lb_" + spec.path.replace(/\W/g, "_"), val = LB.get(spec.path), input;
    if (spec.type === "textarea") input = LB.el("textarea", { id: id, rows: 3, maxlength: spec.max || 400 });
    else if (spec.type === "select") { input = LB.el("select", { id: id }, spec.options.map(function (o) { return LB.el("option", { value: o[0], text: o[1] }); })); }
    else if (spec.type === "checkbox") input = LB.el("input", { id: id, type: "checkbox" });
    else if (spec.type === "color") input = LB.el("input", { id: id, type: "text", placeholder: "#1a1a2e or rgb(26,26,46)", maxlength: 40 });
    else if (spec.type === "number") input = LB.el("input", { id: id, type: "number", min: spec.min, max: spec.max, step: spec.step || 1 });
    else if (spec.type === "datetime") input = LB.el("input", { id: id, type: "datetime-local" });
    else if (spec.type === "devices") {
      input = LB.el("div", { class: "lb-checks", id: id, role: "group", "aria-label": spec.label });
      ["desktop", "tablet", "mobile"].forEach(function (d) {
        var cb = LB.el("input", { type: "checkbox", value: d }); cb.checked = (val || ["desktop", "tablet", "mobile"]).indexOf(d) >= 0;
        cb.addEventListener("change", function () { var on = []; input.querySelectorAll("input").forEach(function (x) { if (x.checked) on.push(x.value); }); LB.set(spec.path, on); });
        input.appendChild(LB.el("label", { class: "lb-inline" }, [cb, " " + d]));
      });
    } else input = LB.el("input", { id: id, type: "text", maxlength: spec.max || 200, placeholder: spec.placeholder });
    if (spec.type !== "devices") {
      var show = function (v) {
        if (spec.type === "checkbox") input.checked = !!v;
        else if (spec.type === "datetime") input.value = v ? String(v).replace(" ", "T").slice(0, 16) : "";
        else if (spec.type === "csv") input.value = (v || []).join(", ");
        else input.value = v == null ? "" : v;
      };
      if (spec.type === "csv") input.setAttribute("placeholder", "US, GB, CA");
      show(spec.type === "csv" ? val : val);
      var ev = spec.type === "checkbox" || spec.type === "select" ? "change" : "input";
      input.addEventListener(ev, function () {
        var v = input.value;
        if (spec.type === "checkbox") v = input.checked; else if (spec.type === "number") v = v === "" ? undefined : Number(v);
        else if (spec.type === "csv") v = v.split(/[\s,]+/).filter(Boolean);
        LB.set(spec.path, v);
      });
    }
    var wrap = LB.el("div", { class: "form-group lb-f", "data-f": spec.f || "" }, [LB.el("label", { for: id, text: spec.label }), input, spec.hint ? LB.el("small", { class: "muted", text: spec.hint }) : null]);
    return wrap;
  };

  LB.card = function (title, open, kids) {
    var d = LB.el("details", { class: "lb-card-admin" }); if (open) d.open = true;
    d.appendChild(LB.el("summary", { text: title })); (kids || []).forEach(function (k) { d.appendChild(k); });
    return d;
  };
})();
