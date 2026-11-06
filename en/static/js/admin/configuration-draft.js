// Dashboard > Configuration > draft, publish, history and activity (Phase 6).
// Loads before configuration.js and configuration-look.js and gives them one shared controller, window.LummetConfig:
//   ready            promise of the server state { ready, permissions, version, live, draft }
//   mode             "draft" (changes autosave to the draft) or "direct" (versioning not set up: old explicit save)
//   queueProfile(p)  autosave the whole profile       queueSettings(obj)  autosave changed settings
// Everything here talks to /en/api/v1/config. Nothing goes live until Publish.
(function () {
  var bar = document.getElementById("cfgBar");
  if (!bar) return;
  var API = "/en/api/v1/config";
  var $ = function (id) { return document.getElementById(id); };
  var S = null, revision = 0, pending = { profile: null, settings: {} }, timer = null, inflight = false, rejected = [], lastError = "", savedAt = null;
  var listeners = [];

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") n.textContent = props[k]; else n[k] = props[k]; });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function api(method, path, body) {
    return fetch(API + path, { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
  }
  function when(s) { if (!s) return ""; var d = new Date(String(s).replace(" ", "T") + (/Z|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z")); return isNaN(d) ? String(s) : d.toLocaleString(); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  // ----- status line -----
  function pendingCount() { return (pending.profile ? 1 : 0) + Object.keys(pending.settings).length; }
  function renderStatus() {
    var st = $("cfgBarStatus"), sv = $("cfgBarSave"), acts = $("cfgBarActions");
    if (!S) return;
    if (!S.ready) {
      st.textContent = "Draft and version history are not set up yet.";
      sv.textContent = S.message || "Run database migration 0009_config_versions.sql, then reload. Until then each save applies straight to your live site.";
      acts.hidden = true; return;
    }
    var d = S.draft, n = d ? d.changes.length : 0;
    st.textContent = "Live site: version " + S.version + ". " + (d ? "Your draft has " + plural(n, "change") + " that visitors do not see yet." : "No draft: what you see here is what is live.");
    var bits = [];
    if (inflight || pendingCount()) bits.push("Saving draft…");
    else if (lastError) bits.push(lastError);
    else if (savedAt) bits.push("Draft saved automatically at " + savedAt.toLocaleTimeString() + ".");
    else if (d) bits.push("Last change by " + (d.updatedBy || "someone") + ", " + when(d.updatedAt) + ".");
    else bits.push("Changes you make are saved automatically as a draft. Nothing goes live until you publish.");
    sv.textContent = bits.join(" ");
    if (rejected.length) { sv.appendChild(el("br")); sv.appendChild(document.createTextNode("Not saved yet: " + rejected.map(function (r) { return r.label + " (" + r.message + ")"; }).join("; "))); }
    var p = S.permissions || {};
    acts.hidden = false;
    $("cfgPreviewBtn").disabled = !d || !p.preview;
    $("cfgReviewBtn").disabled = !d || !p.publish || n === 0;
    $("cfgDiscardBtn").disabled = !d || !p.discard;
    $("cfgReviewBtn").title = p.publish ? "" : "Only administrators can publish.";
  }

  // ----- autosave -----
  function flush() {
    if (inflight || !pendingCount()) return;
    var body = { revision: revision };
    if (pending.profile) body.profile = pending.profile;
    if (Object.keys(pending.settings).length) body.settings = pending.settings;
    var sent = pending; pending = { profile: null, settings: {} }; inflight = true; renderStatus();
    api("PUT", "/draft", body).then(function (j) {
      inflight = false;
      if (j.success) {
        revision = j.draft.revision; S.draft = j.draft; lastError = ""; savedAt = new Date(); rejected = j.rejected || [];
        // keep rejected values pending so a later fix is sent together
        rejected.forEach(function (r) { if (sent.settings[r.key] !== undefined && pending.settings[r.key] === undefined) { /* shown to the user; not retried until edited */ } });
      } else if (j.code === "conflict") {
        lastError = "Someone else changed the draft. Reload to see their changes before you continue.";
        showReload();
      } else {
        lastError = (j.error || "Could not save the draft.") + " Fix it and it saves again automatically.";
        if (sent.profile && !pending.profile) pending.profile = sent.profile;
        rejected = j.rejected || [];
      }
      renderStatus(); listeners.forEach(function (f) { try { f(S); } catch (e) { /* listener errors never block saving */ } });
      if (pendingCount() && !j.code) schedule();
    }).catch(function () { inflight = false; lastError = "Network problem. Your changes are kept on this page and will be retried."; if (sent.profile && !pending.profile) pending.profile = sent.profile; Object.keys(sent.settings).forEach(function (k) { if (pending.settings[k] === undefined) pending.settings[k] = sent.settings[k]; }); renderStatus(); setTimeout(schedule, 4000); });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 800); }
  function showReload() {
    var sv = $("cfgBarSave"); var b = el("button", { type: "button", className: "btn", text: "Reload latest draft" }); b.onclick = function () { location.reload(); }; sv.appendChild(document.createTextNode(" ")); sv.appendChild(b);
  }

  // ----- buttons -----
  function preview() {
    api("POST", "/preview", { on: true }).then(function (j) { if (j.success) window.open("/", "_blank", "noopener"); else $("cfgBarSave").textContent = j.error || "Could not start the preview."; });
  }
  function discard() {
    if (!window.confirm("Throw away every change in this draft? The live site is not affected.")) return;
    api("DELETE", "/draft").then(function (j) { if (j.success) location.reload(); else $("cfgBarSave").textContent = j.error || "Could not discard the draft."; });
  }
  function groupByArea(changes) { var m = {}; changes.forEach(function (c) { (m[c.area] = m[c.area] || []).push(c); }); return m; }
  function renderChanges(host, changes) {
    host.textContent = "";
    var g = groupByArea(changes);
    Object.keys(g).forEach(function (area) {
      host.appendChild(el("h4", { text: area + " (" + g[area].length + ")" }));
      var ul = el("ul"); g[area].forEach(function (c) { ul.appendChild(el("li", {}, [el("strong", { text: c.label }), document.createTextNode(": " + c.from + "  →  " + c.to)])); }); host.appendChild(ul);
    });
    if (!changes.length) host.appendChild(el("p", { className: "muted", text: "No changes." }));
  }

  // Focus management (Phase 10): a panel that opens takes the focus on its heading; closing it (button or Escape) gives the focus back
  // to the control that opened it. Nothing here traps the keyboard: the panels are regions in the page, not modal dialogs.
  var openers = {};
  function focusNode(n) { if (n && typeof n.focus === "function") n.focus(); }
  function openedFrom(key) { var a = document.activeElement; if (a && a !== document.body && a.id !== (key === "publish" ? "cfgPublishTitle" : "cfgVersionTitle")) openers[key] = a; }
  function closePanel(key) {
    var box = $(key === "publish" ? "cfgPublish" : "cfgVersion"); box.hidden = true;
    var back = openers[key]; openers[key] = null;
    focusNode(back && back.isConnected !== false ? back : $(key === "publish" ? "cfgReviewBtn" : "cfgHistoryTitle"));
  }
  function escapeCloses(id, key) { var n = $(id); if (n) n.onkeydown = function (e) { if (e && (e.key === "Escape" || e.key === "Esc") && !n.hidden) { if (e.preventDefault) e.preventDefault(); closePanel(key); } }; }
  function openPublish() {
    openedFrom("publish");
    var box = $("cfgPublish"); box.hidden = false; box.scrollIntoView({ block: "nearest" }); focusNode($("cfgPublishTitle"));
    var list = $("cfgPublishChanges"), msg = $("cfgPublishMsg"), go = $("cfgPublishGo"), conf = $("cfgPublishConfirm"), conflicts = $("cfgPublishConflicts");
    list.textContent = "Checking…"; msg.textContent = ""; go.disabled = true; conf.hidden = true; conflicts.hidden = true; conflicts.textContent = "";
    flushNow().then(function () { return api("GET", "/publish-preview"); }).then(function (j) {
      if (!j.success) { list.textContent = j.error || "Could not check the draft."; return; }
      renderChanges(list, j.changes);
      $("cfgPublishSummary").textContent = j.summary || "";
      var risk = j.impact && j.impact.risk;
      $("cfgPublishRisk").textContent = !j.changes.length ? "Nothing to publish." : risk === "high" ? "Careful: this removes pages that people and search engines may use." : risk === "medium" ? "This removes some pages. Nothing is deleted; you can bring them back." : "Small change. You can undo it from the history below.";
      if (j.impact && j.impact.confirm) { conf.hidden = false; $("cfgPublishConfirmText").textContent = j.impact.confirm; $("cfgPublishAck").checked = false; }
      if (j.conflicts && j.conflicts.length) {
        conflicts.hidden = false;
        conflicts.appendChild(el("p", { text: "Someone changed the same items on the live site while you were editing. Choose whose version to keep:" }));
        j.conflicts.forEach(function (c) { conflicts.appendChild(el("li", { text: c.label + ": yours “" + c.mine + "”, live “" + c.live + "”" })); });
        [["mine", "Keep my draft's values"], ["live", "Keep what is live now"]].forEach(function (o, i) {
          var rb = el("input", { type: "radio", name: "cfgResolve", value: o[0], checked: i === 0 }); conflicts.appendChild(el("label", {}, [rb, document.createTextNode(" " + o[1])])); conflicts.appendChild(el("br"));
        });
      }
      function check() { go.disabled = !j.changes.length || (j.impact && j.impact.confirm && !$("cfgPublishAck").checked) || (j.errors && j.errors.length > 0); }
      $("cfgPublishAck").onchange = check; check();
      if (j.errors && j.errors.length) msg.textContent = j.errors.join(" ");
    });
  }
  function flushNow() {
    clearTimeout(timer);
    return new Promise(function (res) { (function wait() { if (inflight) return setTimeout(wait, 100); if (pendingCount()) { flush(); return setTimeout(wait, 100); } res(); })(); });
  }
  function publish() {
    var msg = $("cfgPublishMsg"), go = $("cfgPublishGo"); go.disabled = true; msg.textContent = "Publishing…";
    var r = document.querySelector("input[name=cfgResolve]:checked");
    api("POST", "/publish", { note: $("cfgPublishNote").value, revision: revision, resolve: r ? r.value : undefined }).then(function (j) {
      if (j.success) { msg.textContent = "Published as version " + j.version + ". Reloading…"; setTimeout(function () { location.reload(); }, 700); return; }
      msg.textContent = j.error || "Could not publish. Nothing was changed."; go.disabled = false;
      if (j.code === "conflict") openPublish();
    }).catch(function () { msg.textContent = "Network error. Nothing was changed."; go.disabled = false; });
  }

  // ----- history -----
  var versionsNext = null;
  function sourceLabel(v) { return v.source === "baseline" ? "Starting point" : v.source === "rollback" ? "Restored v" + v.restored_from : v.source === "direct" ? "Saved directly" : "Published"; }
  function loadVersions(more) {
    var tbody = $("cfgHistBody");
    if (!more) { tbody.textContent = ""; versionsNext = null; }
    api("GET", "/versions?limit=15" + (more && versionsNext ? "&before=" + versionsNext : "")).then(function (j) {
      if (!j.success) { $("cfgHistMsg").textContent = j.error || "History is not available."; return; }
      j.versions.forEach(function (v) {
        var tr = el("tr");
        var actions = el("td");
        var see = el("button", { type: "button", className: "btn", text: "See changes" }); see.onclick = function () { openVersion(v.version); }; actions.appendChild(see);
        tr.appendChild(el("td", { text: "v" + v.version + (v.current ? " (live)" : "") }));
        tr.appendChild(el("td", { text: when(v.created_at) }));
        tr.appendChild(el("td", { text: v.author || "" }));
        tr.appendChild(el("td", { text: sourceLabel(v) + (v.summary ? " — " + v.summary : "") + (v.note ? ". Note: " + v.note : "") }));
        tr.appendChild(actions); tbody.appendChild(tr);
      });
      versionsNext = j.next; $("cfgHistMore").hidden = !j.next;
    });
  }
  function openVersion(n) {
    openedFrom("version");
    var box = $("cfgVersion"); box.hidden = false; box.scrollIntoView({ block: "nearest" }); focusNode($("cfgVersionTitle"));
    var body = $("cfgVersionBody"); body.textContent = "Loading…"; $("cfgVersionTitle").textContent = "Version " + n;
    api("GET", "/versions/" + n).then(function (j) {
      if (!j.success) { body.textContent = j.error || "Could not load this version."; return; }
      body.textContent = "";
      body.appendChild(el("h4", { text: "What this version changed" })); var a = el("div"); renderChanges(a, j.changesFromPrevious); body.appendChild(a);
      body.appendChild(el("h4", { text: "What restoring it would change on the live site" })); var b = el("div"); renderChanges(b, j.changesIfRestored); body.appendChild(b);
      var rb = $("cfgRestoreGo"); rb.hidden = !((S.permissions || {}).rollback) || !j.changesIfRestored.length; rb.textContent = "Restore version " + n; rb.onclick = function () { restore(n); };
      $("cfgRestoreNote").hidden = rb.hidden;
    });
  }
  function restore(n) {
    if (!window.confirm("Make version " + n + " live now? Visitors see the change within about a minute, and the current setup stays in the history.")) return;
    var msg = $("cfgRestoreMsg"); msg.textContent = "Restoring…";
    api("POST", "/rollback", { version: n, note: $("cfgRestoreNote").value }).then(function (j) {
      if (j.success) { msg.textContent = "Restored as version " + j.version + ". Reloading…"; setTimeout(function () { location.reload(); }, 700); } else msg.textContent = j.error || "Could not restore.";
    });
  }

  // ----- activity -----
  var auditNext = null;
  function loadAudit(more) {
    var ul = $("cfgAuditList"); if (!more) { ul.textContent = ""; auditNext = null; }
    api("GET", "/audit?limit=20" + (more && auditNext ? "&before=" + auditNext : "")).then(function (j) {
      if (!j.success) { $("cfgAuditMsg").textContent = j.error || "The activity log is not available."; return; }
      j.entries.forEach(function (e) { ul.appendChild(el("li", {}, [el("strong", { text: when(e.created_at) }), document.createTextNode(" — " + (e.actor || "someone") + ": " + (e.summary || e.action))])); });
      auditNext = j.next; $("cfgAuditMore").hidden = !j.next;
    });
  }

  // ----- public controller -----
  var readyResolve, ready = new Promise(function (r) { readyResolve = r; });
  window.LummetConfig = {
    ready: ready, mode: "draft",
    queueProfile: function (p) { if (this.mode !== "draft") return; pending.profile = JSON.parse(JSON.stringify(p)); schedule(); renderStatus(); },
    queueSettings: function (o) { if (this.mode !== "draft") return; Object.keys(o).forEach(function (k) { pending.settings[k] = o[k]; rejected = rejected.filter(function (r) { return r.key !== k; }); }); schedule(); renderStatus(); },
    onSaved: function (f) { listeners.push(f); },
    // Row changes (menu links, SEO, components). Sends any pending autosave first, then the row patch. Resolves to the server reply.
    sendRows: function (patch) {
      return flushNow().then(function () { return api("PUT", "/draft", { rows: patch, revision: revision }); }).then(function (j) {
        if (j.success) { revision = j.draft.revision; S.draft = j.draft; lastError = ""; savedAt = new Date(); }
        else if (j.code === "conflict") { lastError = "Someone else changed the draft. Reload to see their changes before you continue."; showReload(); }
        renderStatus(); listeners.forEach(function (f) { try { f(S); } catch (e) { /* never blocks */ } });
        return j;
      });
    },
    getState: function () { return S; },
    // Resolves once every pending autosave has been sent. Other panels call it before they read or write the draft.
    flush: function () { return flushNow(); },
    // The draft revision the server last confirmed (0 when there is no draft yet).
    revision: function () { return revision; },
    api: api,
    openPublish: function () { openPublish(); },
  };

  $("cfgPreviewBtn").onclick = function () { flushNow().then(preview); };
  $("cfgReviewBtn").onclick = openPublish;
  $("cfgDiscardBtn").onclick = discard;
  $("cfgPublishGo").onclick = publish;
  $("cfgPublishCancel").onclick = function () { closePanel("publish"); };
  $("cfgVersionClose").onclick = function () { closePanel("version"); };
  escapeCloses("cfgPublish", "publish"); escapeCloses("cfgVersion", "version");
  $("cfgHistMore").onclick = function () { loadVersions(true); };
  $("cfgAuditMore").onclick = function () { loadAudit(true); };
  window.addEventListener("beforeunload", function (e) { if (pendingCount() || inflight) { e.preventDefault(); e.returnValue = ""; } });

  api("GET", "/state").then(function (j) {
    if (!j.success) { S = { ready: false, message: j.error || "Could not load the draft state.", permissions: {} }; window.LummetConfig.mode = "direct"; renderStatus(); readyResolve(S); return; }
    S = j; revision = j.draft ? j.draft.revision : 0;
    if (!j.ready) window.LummetConfig.mode = "direct";
    renderStatus(); readyResolve(S);
    // The history lists are fetched when the History tab first opens (at once when the tabs script is not there).
    if (j.ready) { var T = window.LummetConfigTabs, lazy = function (fn) { if (T && T.onFirstOpen) T.onFirstOpen("history", fn); else fn(); }; lazy(function () { loadVersions(false); loadAudit(false); }); $("cfgHistory").hidden = false; $("cfgAudit").hidden = false; }
  }).catch(function () { S = { ready: false, message: "Could not reach the server.", permissions: {} }; window.LummetConfig.mode = "direct"; renderStatus(); readyResolve(S); });
})();
