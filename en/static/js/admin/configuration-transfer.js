// Dashboard > Configuration > Export, import and presets (Phase 7B).
// Talks to /en/api/v1/config/transfer (see worker/api/routes/site-profile-transfer.js). Five tabs:
//   Export        take sections of this site as a file, or save them as a preset (admin)
//   Import a file check a file or pasted text, review every change, add it to the DRAFT
//   Presets       the saved library: review and apply, download, rename, delete
//   Copy from another site   fetch a configuration with a share code, then review it like any import
//   Share this site          make, list and revoke share codes (admin)
// Importing never changes the live site. The review card shows the dry run the server made; "Add to my draft" asks the
// server to plan it again and saves the result to the draft, which is then published like any other change.
// Everything shown from a file is put on the page as text, never as markup.
(function () {
  // Starts when its tab first opens (immediately if the tabs script is missing or the tab is already showing).
  var T = window.LummetConfigTabs;
  if (T && T.onFirstOpen) T.onFirstOpen("backup", boot); else boot();
  function boot() {
  var root = document.getElementById("xferRoot");
  if (!root) return;
  var C = window.LummetConfig;
  var BASE = "/en/api/v1/config/transfer";
  var SHOW_CHANGES = 80;
  var S = null, tab = "export", editing = 0, seq = 0, timer = null, flash = "";
  var exportSel = null, shareSel = null, rv = null, shareResult = null;
  var ui = {};

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "text") n.textContent = props[k];
      else if (k === "style") n.style.cssText = props[k];
      else if (k === "attrs") Object.keys(props[k]).forEach(function (a) { n.setAttribute(a, props[k][a]); });
      else n[k] = props[k];
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { n.textContent = ""; return n; }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function when(s) { if (!s) return ""; var d = new Date(String(s).replace(" ", "T") + (/Z|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z")); return isNaN(d) ? String(s) : d.toLocaleString(); }
  function kb(n) { return n >= 1024 ? Math.round(n / 1024) + " KB" : n + " bytes"; }
  function perm(k) { return !!(S && S.permissions && S.permissions[k]); }
  function T(method, path, body) { return C.api(method, "/transfer" + path, body); }
  function say(node, text, bad) { node.textContent = text || ""; node.className = "xfer-msg" + (bad ? " is-bad" : ""); }
  function button(text, cls, onclick, extra) { var b = el("button", Object.assign({ type: "button", className: "btn" + (cls ? " " + cls : ""), text: text }, extra || {})); b.onclick = onclick; return b; }
  function field(label, input, help) { return el("label", { className: "xfer-field" }, [el("span", { className: "xfer-label", text: label }), input, help ? el("small", { className: "muted", text: help }) : null]); }

  // ---------- section picker (shared by export and share) ----------
  var GROUPS = [["structure", "Site structure"], ["settings", "Look and feel"], ["rows", "Lists"]];
  function picker(initial, onChange) {
    var chosen = {}, boxes = {}, node = el("div", { className: "xfer-picker" });
    function sel(ids) { chosen = {}; ids.forEach(function (id) { chosen[id] = true; }); Object.keys(boxes).forEach(function (id) { boxes[id].checked = !!chosen[id]; }); if (onChange) onChange(); }
    function ids(pred) { return S.catalog.filter(pred).map(function (s) { return s.id; }); }
    var quick = el("div", { className: "xfer-quick" });
    quick.appendChild(button("Select all", "btn--sm", function () { sel(ids(function () { return true; })); }));
    quick.appendChild(button("Select none", "btn--sm", function () { sel([]); }));
    quick.appendChild(button("Everything except business details", "btn--sm", function () { sel(ids(function (s) { return !s.brand; })); }));
    node.appendChild(quick);
    GROUPS.forEach(function (g) {
      var items = S.catalog.filter(function (s) { return s.kind === g[0]; });
      if (!items.length) return;
      var fs = el("fieldset", { className: "xfer-group" }, [el("legend", { text: g[1] })]);
      items.forEach(function (s) {
        var cb = el("input", { type: "checkbox", checked: false });
        cb.onchange = function () { if (cb.checked) chosen[s.id] = true; else delete chosen[s.id]; if (onChange) onChange(); };
        boxes[s.id] = cb;
        var tags = [];
        if (s.brand) tags.push(el("span", { className: "xfer-tag", text: "About this business" }));
        if (s.risk === "high") tags.push(el("span", { className: "xfer-tag is-warn", text: "Changes which pages exist" }));
        fs.appendChild(el("label", { className: "xfer-check" }, [cb, el("span", {}, [el("strong", { text: " " + s.label.replace(/^Look and feel: /, "") }), " "].concat(tags)), el("small", { className: "muted", text: s.help })]));
      });
      node.appendChild(fs);
    });
    sel(initial);
    return { node: node, value: function () { return S.catalog.map(function (s) { return s.id; }).filter(function (id) { return chosen[id]; }); }, set: sel };
  }

  // ---------- skeleton ----------
  var TABS = [
    { id: "export", label: "Export", need: "export" },
    { id: "import", label: "Import a file", need: "import" },
    { id: "presets", label: "Presets", need: "library" },
    { id: "clone", label: "Copy from another site", need: "import" },
    { id: "share", label: "Share this site", need: "manage" }
  ];
  function skeleton() {
    clear(root);
    ui.notice = el("p", { className: "xfer-notice", role: "status", hidden: true });
    ui.tabs = el("div", { className: "xfer-tabs", role: "tablist", attrs: { "aria-label": "Export, import and presets" } });
    ui.flash = el("p", { className: "xfer-msg", role: "status", hidden: true });
    ui.panel = el("div", { className: "xfer-panel", role: "tabpanel" });
    ui.review = el("div", { className: "xfer-review", hidden: true, tabIndex: -1 });
    [ui.notice, ui.tabs, ui.flash, ui.panel, ui.review].forEach(function (n) { root.appendChild(n); });
  }
  function renderTabs() {
    clear(ui.tabs);
    var visible = TABS.filter(function (t) { return perm(t.need); });
    if (visible.length && !visible.some(function (t) { return t.id === tab; })) tab = visible[0].id;
    visible.forEach(function (t, i) {
      var b = el("button", { type: "button", className: "xfer-tab" + (t.id === tab ? " is-active" : ""), text: t.label, role: "tab", tabIndex: t.id === tab ? 0 : -1, attrs: { "aria-selected": t.id === tab ? "true" : "false" } });
      b.onclick = function () { tab = t.id; renderAll(); };
      b.onkeydown = function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
        var next = visible[(i + d + visible.length) % visible.length]; tab = next.id; renderAll();
        if (e.preventDefault) e.preventDefault();
      };
      ui.tabs.appendChild(b);
    });
  }
  function renderAll() {
    renderTabs(); clear(ui.panel);
    // A confirmation that must survive the redraw a save or delete causes (it is cleared by the next redraw).
    say(ui.flash, flash); ui.flash.hidden = !flash; flash = "";
    if (!S) return;
    var f = { export: panelExport, import: panelImport, presets: panelPresets, clone: panelClone, share: panelShare }[tab];
    if (f) f(ui.panel);
  }
  function needsTables(node) {
    if (S.ready) return false;
    node.appendChild(el("p", { className: "xfer-notice", text: S.message || "This needs a database update before it can be used." }));
    return true;
  }

  // ---------- export ----------
  function download(url, fallback) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || "Could not export."); });
      var m = /filename="([^"]+)"/.exec((r.headers && r.headers.get("Content-Disposition")) || "");
      return r.text().then(function (text) {
        var u = URL.createObjectURL(new Blob([text], { type: "application/json" })), a = document.createElement("a");
        a.href = u; a.download = m ? m[1] : fallback; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      });
    });
  }
  function panelExport(node) {
    var draft = C.getState() && C.getState().draft;
    var from = "live", pick = exportSel ? exportSel.value() : S.catalog.map(function (s) { return s.id; });
    node.appendChild(el("p", { className: "muted", text: "Take any part of this site's configuration as a file, to keep as a backup or to import on another site. Scripts, ad HTML and verification markup are never included. Media files are not copied." }));
    var live = el("input", { type: "radio", name: "xferFrom", checked: true }), dr = el("input", { type: "radio", name: "xferFrom", disabled: !draft || !S.versioning });
    live.onchange = function () { from = "live"; }; dr.onchange = function () { from = "draft"; };
    node.appendChild(el("div", { className: "xfer-row" }, [el("strong", { text: "Take it from: " }), el("label", {}, [live, " What is live now"]), " ", el("label", {}, [dr, " My draft" + (draft ? "" : " (no draft yet)")])]));
    exportSel = picker(pick);
    var name = el("input", { type: "text", maxLength: 80, size: 40, placeholder: "For example: News site starter" }), desc = el("input", { type: "text", maxLength: 400, size: 60, placeholder: "What is this configuration for? (optional)" });
    node.appendChild(field("Name", name)); node.appendChild(field("Description", desc));
    node.appendChild(exportSel.node);
    var msg = el("p", { role: "status", className: "xfer-msg" });
    var actions = el("div", { className: "xfer-actions" });
    actions.appendChild(button("Download file", "btn--primary", function () {
      var ids = exportSel.value(); if (!ids.length) return say(msg, "Choose at least one section.", true);
      say(msg, "Preparing the file…");
      var q = "?download=1&from=" + from + "&sections=" + encodeURIComponent(ids.join(",")) + (name.value ? "&name=" + encodeURIComponent(name.value) : "") + (desc.value ? "&description=" + encodeURIComponent(desc.value) : "");
      download(BASE + "/export" + q, "lummet-config.json").then(function () { say(msg, "File downloaded. Keep it somewhere safe: it describes how your site is set up."); }).catch(function (e) { say(msg, e.message, true); });
    }));
    if (perm("manage")) actions.appendChild(button("Save as preset", "", function () {
      var ids = exportSel.value(); if (!ids.length) return say(msg, "Choose at least one section.", true);
      if (!S.ready) return say(msg, S.message, true);
      if (name.value.trim().length < 2) return say(msg, "Give the preset a name first.", true);
      say(msg, "Saving…");
      T("POST", "/presets", { name: name.value, description: desc.value, sections: ids, from: from }).then(function (j) {
        if (!j.success) return say(msg, j.error || "The preset could not be saved.", true);
        flash = "Saved as a preset." + (j.notes && j.notes.length ? " " + j.notes.join(" ") : ""); refresh();
      }).catch(function () { say(msg, "Network error. Nothing was saved.", true); });
    }));
    node.appendChild(actions); node.appendChild(msg);
  }

  // ---------- import a file ----------
  function panelImport(node) {
    node.appendChild(el("p", { className: "muted", text: "Choose a configuration file, or paste its contents. You will see every change before anything is saved, and the change goes to your draft, not to the live site." }));
    var file = el("input", { type: "file", accept: ".json,application/json" }), text = el("textarea", { rows: 6, cols: 70, placeholder: "…or paste the contents of a configuration file here", spellcheck: false });
    var msg = el("p", { role: "status", className: "xfer-msg" });
    file.onchange = function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (f.size > S.maxBytes) return say(msg, "This file is " + kb(f.size) + ". A configuration file is never larger than " + kb(S.maxBytes) + ".", true);
      f.text().then(function (t) { text.value = t; say(msg, "Read " + f.name + "."); go(f.name); }).catch(function () { say(msg, "The file could not be read.", true); });
    };
    function go(label) {
      var t = text.value.trim(); if (!t) return say(msg, "Choose a file or paste its contents first.", true);
      if (t.length > S.maxBytes) return say(msg, "That is too large to be a configuration file.", true);
      if (!label) say(msg, ""); openReview({ text: t }, label || "Pasted file");
    }
    node.appendChild(field("File", file)); node.appendChild(text);
    node.appendChild(el("div", { className: "xfer-actions" }, [button("Check this file", "btn--primary", function () { go(); })]));
    node.appendChild(msg);
  }

  // ---------- presets ----------
  function panelPresets(node) {
    if (needsTables(node)) return;
    var list = S.presets || [];
    node.appendChild(el("p", { className: "muted", text: "Saved configurations you can apply to this site again. " + plural(list.length, "preset") + " of " + S.limits.presets + ". " + (perm("manage") ? "To save one, use the Export tab." : "An administrator saves presets.") }));
    if (!list.length) return node.appendChild(el("p", { text: "No presets yet." }));
    var msg = el("p", { role: "status", className: "xfer-msg" });
    var tb = el("tbody");
    list.forEach(function (p) {
      var tr = el("tr"), acts = el("td", { className: "xfer-cell-actions" });
      if (editing === p.id) {
        var n = el("input", { type: "text", value: p.name, maxLength: 80 }), d = el("input", { type: "text", value: p.description, maxLength: 400 });
        tr.appendChild(el("td", { attrs: { colspan: "3" } }, [field("Name", n), field("Description", d)]));
        acts.appendChild(button("Save", "btn--primary", function () {
          T("PUT", "/presets/" + p.id, { name: n.value, description: d.value }).then(function (j) { if (!j.success) return say(msg, j.error || "Could not rename.", true); editing = 0; flash = "Preset changed."; refresh(); });
        }));
        acts.appendChild(button("Cancel", "", function () { editing = 0; renderAll(); }));
      } else {
        tr.appendChild(el("td", {}, [el("strong", { text: p.name }), p.description ? el("div", { className: "muted", text: p.description }) : null]));
        tr.appendChild(el("td", { text: plural(p.sections.length, "section") + ", " + kb(p.bytes) }));
        tr.appendChild(el("td", { text: when(p.updatedAt || p.createdAt) + (p.createdBy ? " by " + p.createdBy : "") }));
        acts.appendChild(button("Review and apply", "btn--primary", function () { if (perm("import")) openReview({ presetId: p.id }, "Preset “" + p.name + "”"); else say(msg, "Your role cannot import.", true); }, { disabled: !perm("import") }));
        acts.appendChild(button("Download", "", function () { download(BASE + "/presets/" + p.id + "/download", "lummet-preset.json").then(function () { say(msg, "Downloaded."); }).catch(function (e) { say(msg, e.message, true); }); }));
        if (perm("manage")) {
          acts.appendChild(button("Rename", "", function () { editing = p.id; renderAll(); }));
          acts.appendChild(button("Delete", "btn--danger", function () {
            if (!window.confirm("Delete the preset “" + p.name + "”? Sites that already used it are not affected.")) return;
            T("DELETE", "/presets/" + p.id).then(function (j) { if (!j.success) return say(msg, j.error || "Could not delete.", true); flash = "Preset deleted."; refresh(); });
          }));
        }
      }
      tr.appendChild(acts); tb.appendChild(tr);
    });
    node.appendChild(el("table", { className: "admin-table" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "Preset" }), el("th", { text: "Contents" }), el("th", { text: "Saved" }), el("th", { text: "" })])]), tb]));
    node.appendChild(msg);
  }

  // ---------- copy from another site ----------
  function panelClone(node) {
    node.appendChild(el("p", { className: "muted", text: "Copy the configuration of another site you own. On that site open Configuration, then Share this site, and create a share code. Enter its address and the code here. The code works for a short time and a limited number of uses." }));
    var url = el("input", { type: "text", size: 40, placeholder: "https://my-other-site.com", autocomplete: "off", spellcheck: false });
    var code = el("input", { type: "password", size: 50, placeholder: "lcs_…", autocomplete: "off", spellcheck: false });
    var msg = el("p", { role: "status", className: "xfer-msg" });
    node.appendChild(field("Address of the other site", url)); node.appendChild(field("Share code", code));
    node.appendChild(el("div", { className: "xfer-actions" }, [button("Fetch and review", "btn--primary", function () {
      if (!url.value.trim() || !code.value.trim()) return say(msg, "Enter the address and the share code.", true);
      say(msg, "Contacting the other site…");
      T("POST", "/fetch", { url: url.value, token: code.value }).then(function (j) {
        if (!j.success) return say(msg, j.error || "Could not copy from that site.", true);
        code.value = ""; say(msg, "Received. Review it below."); openReview({ text: j.text }, "Configuration from " + j.host);
      }).catch(function () { say(msg, "Network error. Nothing was changed.", true); });
    })]));
    node.appendChild(msg);
  }

  // ---------- share this site ----------
  function panelShare(node) {
    if (needsTables(node)) return;
    node.appendChild(el("p", { className: "muted", text: "Let another site of yours copy part of this configuration. The code is shown once, only a fingerprint of it is stored here, and you can revoke it at any time. It never exposes scripts, content or visitors." }));
    shareSel = picker(S.catalog.filter(function (s) { return !s.brand; }).map(function (s) { return s.id; }));
    var label = el("input", { type: "text", maxLength: 60, size: 40, placeholder: "For example: Staging site" });
    var hours = el("select", {}, (S.limits.shareHours || [24]).map(function (h) { return el("option", { value: String(h), text: h === 1 ? "1 hour" : h === 168 ? "7 days" : h + " hours", selected: h === 24 }); }));
    var uses = el("input", { type: "number", min: 1, max: 20, value: "5" });
    var msg = el("p", { role: "status", className: "xfer-msg" }), out = el("div", { className: "xfer-secret", hidden: !shareResult });
    node.appendChild(field("Label (so you remember who it is for)", label)); node.appendChild(shareSel.node);
    node.appendChild(el("div", { className: "xfer-row" }, [field("Valid for", hours), field("Uses allowed", uses)]));
    node.appendChild(el("div", { className: "xfer-actions" }, [button("Create share code", "btn--primary", function () {
      var ids = shareSel.value(); if (!ids.length) return say(msg, "Choose what the other site may copy.", true);
      say(msg, "Creating…");
      T("POST", "/shares", { label: label.value, hours: Number(hours.value), maxUses: Number(uses.value), sections: ids }).then(function (j) {
        if (!j.success) return say(msg, j.error || "Could not create the share code.", true);
        shareResult = j; say(msg, ""); refresh();
      }).catch(function () { say(msg, "Network error. Nothing was created.", true); });
    })]));
    node.appendChild(msg);
    if (shareResult) showSecret(out, shareResult); node.appendChild(out);
    var shares = S.shares || [];
    node.appendChild(el("h4", { text: "Share codes" }));
    if (!shares.length) { node.appendChild(el("p", { className: "muted", text: "None yet." })); return; }
    var tb = el("tbody");
    shares.forEach(function (s) {
      var tr = el("tr"), act = el("td");
      tr.appendChild(el("td", {}, [el("strong", { text: s.label || "(no label)" }), el("div", { className: "muted", text: plural(s.sections.length, "section") })]));
      tr.appendChild(el("td", {}, [el("span", { className: "xfer-status is-" + s.status.replace(" ", "-"), text: s.status })]));
      tr.appendChild(el("td", { text: s.uses + " of " + s.maxUses + " used" }));
      tr.appendChild(el("td", { text: "Expires " + when(s.expiresAt) }));
      tr.appendChild(el("td", { text: s.createdBy || "" }));
      if (s.status === "active") act.appendChild(button("Revoke", "btn--danger", function () {
        if (!window.confirm("Revoke this share code? The other site can no longer use it.")) return;
        T("DELETE", "/shares/" + s.id).then(function (j) { if (!j.success) return say(msg, j.error || "Could not revoke.", true); flash = "Revoked."; refresh(); });
      }));
      tr.appendChild(act); tb.appendChild(tr);
    });
    node.appendChild(el("table", { className: "admin-table" }, [el("thead", {}, [el("tr", {}, ["Share code", "Status", "Uses", "Valid until", "Made by", ""].map(function (h) { return el("th", { text: h }); }))]), tb]));
  }
  function showSecret(out, r) {
    clear(out); out.hidden = false;
    var box = el("input", { type: "text", readOnly: true, value: r.token, size: 52, className: "xfer-code" });
    out.appendChild(el("p", {}, [el("strong", { text: "Your share code. Copy it now: it is not shown again." })]));
    out.appendChild(box);
    out.appendChild(button("Copy", "", function () {
      var done = function () { box.select && box.select(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.token).then(function () { out.appendChild(el("span", { className: "xfer-msg", text: " Copied." })); }, done); else done();
    }));
    out.appendChild(el("p", { className: "muted", text: "On the other site, open Configuration, then Copy from another site. Address: https://" + S.host + ". Valid until " + when(r.expiresAt) + ", " + plural(r.maxUses, "use") + "." }));
    out.appendChild(button("I have copied it", "", function () { shareResult = null; renderAll(); }));
  }

  // ---------- review (dry run) ----------
  function bodyOf(extra) { var s = rv.src, b = s.presetId != null ? { presetId: s.presetId } : { text: s.text }; return Object.assign(b, extra || {}); }
  function openReview(src, label) {
    rv = { src: src, label: label, report: null, selected: null, ack: false, busy: false, error: null };
    ui.review.hidden = false; plan(null);
    if (ui.review.scrollIntoView) ui.review.scrollIntoView({ block: "nearest" });
  }
  function closeReview() { rv = null; ui.review.hidden = true; clear(ui.review); }
  function plan(sections) {
    var mine = ++seq; rv.busy = true; rv.error = null; drawReview();
    T("POST", "/plan", bodyOf(sections ? { sections: sections } : {})).then(function (j) {
      if (!rv || mine !== seq) return; rv.busy = false;
      if (!j.success) { rv.error = { text: j.error || "This file cannot be imported.", list: j.errors || [], warnings: j.warnings || [] }; rv.report = null; }
      else { rv.report = j.report; rv.selected = j.report.sections.filter(function (s) { return s.selected; }).map(function (s) { return s.id; }); }
      drawReview(true);
    }).catch(function () { if (!rv || mine !== seq) return; rv.busy = false; rv.error = { text: "Network error. Nothing was changed.", list: [], warnings: [] }; drawReview(); });
  }
  function toggleSection(id, on) {
    var s = (rv.selected || []).filter(function (x) { return x !== id; }); if (on) s.push(id);
    rv.selected = s; rv.ack = false; clearTimeout(timer); timer = setTimeout(function () { plan(s); }, 300);
  }
  function drawReview(focus) {
    var n = clear(ui.review); if (!rv) return; n.hidden = false;
    var r = rv.report;
    var head = el("h3", { text: "Review: " + rv.label, tabIndex: -1 }); n.appendChild(head);
    n.appendChild(button("Close", "xfer-close", closeReview));
    if (rv.busy && !r) { n.appendChild(el("p", { role: "status", text: "Checking the file…" })); return; }
    if (rv.error) {
      n.appendChild(el("p", { className: "xfer-msg is-bad", role: "alert", text: rv.error.text }));
      if (rv.error.list.length > 1) n.appendChild(el("ul", {}, rv.error.list.map(function (e) { return el("li", { text: e }); })));
      if (rv.error.warnings.length) n.appendChild(el("ul", { className: "muted" }, rv.error.warnings.map(function (e) { return el("li", { text: e }); })));
      return;
    }
    var f = r.file;
    var facts = [["Name", f.name || "(unnamed)"], ["From", f.host ? f.host + (f.sameSite ? " (this site)" : "") : "unknown"], ["Exported", f.exportedAt ? when(f.exportedAt) : "unknown"], ["Integrity", f.checksum === "ok" ? "Checksum matches" : f.checksum === "mismatch" ? "Changed after export" : "No checksum"]];
    if (f.description) facts.push(["About", f.description]);
    var dl = el("dl", { className: "xfer-facts" }); facts.forEach(function (x) { dl.appendChild(el("dt", { text: x[0] })); dl.appendChild(el("dd", { text: x[1] })); }); n.appendChild(dl);
    n.appendChild(el("p", { className: "muted", text: r.draft.exists ? "Your draft already has " + plural(r.draft.changes, "change") + ". This import is added on top of it." : "You have no draft yet. This import starts one." }));

    // sections
    n.appendChild(el("h4", { text: "What to take from this file" }));
    var tb = el("tbody");
    r.sections.forEach(function (s) {
      var cb = el("input", { type: "checkbox", checked: rv.selected.indexOf(s.id) >= 0, disabled: s.blocked, attrs: { "aria-label": s.label } });
      cb.onchange = function () { toggleSection(s.id, cb.checked); };
      var c = s.counts;
      tb.appendChild(el("tr", {}, [
        el("td", {}, [cb]),
        el("td", {}, [el("strong", { text: s.label }), s.brand && !f.sameSite ? el("span", { className: "xfer-tag", text: "About that business: ticked only if you want it" }) : null, el("div", { className: "muted", text: s.help })]),
        el("td", { text: s.selected ? [c.add ? c.add + " new" : "", c.change ? c.change + " changed" : "", c.same ? c.same + " same" : "", c.skipped ? c.skipped + " skipped" : ""].filter(Boolean).join(", ") || "nothing to do" : "not included" })
      ]));
    });
    n.appendChild(el("table", { className: "admin-table" }, [tb]));
    if (rv.busy) n.appendChild(el("p", { role: "status", className: "muted", text: "Updating…" }));

    // problems and notes
    if (r.items.length) {
      n.appendChild(el("h4", { text: "Notes from the check" }));
      n.appendChild(el("ul", { className: "xfer-items" }, r.items.map(function (i) { return el("li", { className: "is-" + i.level }, [el("strong", { text: i.level === "error" ? "Problem: " : i.level === "warning" ? "Skipped or changed: " : "Note: " }), i.message]); })));
    }

    // impact and changes
    var imp = r.impact;
    if (imp) {
      var risk = imp.risk === "high" ? "Careful: this removes pages that people and search engines may use." : imp.risk === "medium" ? "This removes some pages. Nothing is deleted; you can switch them back on." : "";
      if (risk) n.appendChild(el("p", { className: "xfer-msg is-bad", role: "status", text: risk }));
      var ul = el("ul", {});
      (imp.removed || []).forEach(function (x) { ul.appendChild(el("li", { text: "Removed: " + x.label })); });
      (imp.added || []).forEach(function (x) { ul.appendChild(el("li", { text: "Added: " + x.label })); });
      (imp.notes || []).forEach(function (x) { ul.appendChild(el("li", { text: x })); });
      if (ul.children.length) n.appendChild(ul);
    }
    n.appendChild(el("h4", { text: r.hasChanges ? "What will change in your draft" : "Nothing to change" }));
    n.appendChild(el("p", { className: "muted", text: r.summary }));
    var byArea = {}, areas = []; r.changes.slice(0, SHOW_CHANGES).forEach(function (c) { if (!byArea[c.area]) { byArea[c.area] = []; areas.push(c.area); } byArea[c.area].push(c); });
    areas.forEach(function (a) {
      n.appendChild(el("h5", { text: a }));
      n.appendChild(el("ul", {}, byArea[a].map(function (c) { return el("li", {}, [el("strong", { text: c.label }), ": " + c.from + "  →  " + c.to]); })));
    });
    if (r.changes.length > SHOW_CHANGES) n.appendChild(el("p", { className: "muted", text: "…and " + (r.changes.length - SHOW_CHANGES) + " more. All of them are listed again before you publish." }));

    // apply
    var needAck = !!(imp && imp.confirm), msg = el("p", { role: "status", className: "xfer-msg" });
    var go = button("Add to my draft", "btn--primary", function () { apply(go, msg); });
    function enable() { go.disabled = rv.busy || !r.canApply || !perm("import") || (needAck && !rv.ack); }
    if (needAck) {
      var ack = el("input", { type: "checkbox", checked: rv.ack }); ack.onchange = function () { rv.ack = ack.checked; enable(); };
      n.appendChild(el("p", {}, [el("label", {}, [ack, " " + imp.confirm + " I understand."])]));
    }
    enable(); n.appendChild(go); n.appendChild(button("Cancel", "", closeReview));
    if (!r.canApply && r.reason) say(msg, r.reason, !r.hasChanges ? false : true);
    n.appendChild(msg);
    if (focus && head.focus) head.focus();
  }
  function apply(go, msg) {
    go.disabled = true; say(msg, "Adding to your draft…");
    C.flush().then(function () { return T("POST", "/apply", bodyOf({ sections: rv.selected, revision: C.revision() })); }).then(function (j) {
      if (j.success) { say(msg, "Added to your draft: " + j.summary + ". Reloading so every screen shows it…"); setTimeout(function () { location.reload(); }, 900); return; }
      go.disabled = false;
      say(msg, j.code === "conflict" ? "Someone else changed the draft. Reload the page, then check the file again." : (j.error || "Nothing was imported."), true);
    }).catch(function () { go.disabled = false; say(msg, "Network error. Nothing was changed.", true); });
  }

  // ---------- state ----------
  function refresh() {
    return T("GET", "/state").then(function (j) {
      if (!j.success) { S = null; ui.notice.hidden = false; ui.notice.textContent = j.error || "Export and import are not available."; clear(ui.panel); renderTabs(); return; }
      S = j; ui.notice.hidden = true; renderAll();
    });
  }

  skeleton();
  if (!C) { ui.notice.hidden = false; ui.notice.textContent = "This panel needs the draft controller, which did not load. Reload the page."; return; }
  ui.notice.hidden = false; ui.notice.textContent = "Loading…";
  C.ready.then(function () { return refresh(); }).catch(function () { ui.notice.hidden = false; ui.notice.textContent = "Could not reach the server."; });
  }
})();
