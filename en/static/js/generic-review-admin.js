// Generic reviews (sportsbook / affiliate partner / custom): the single dashboard screen.
// List, add and edit all live on /en/dashboard/reviews/generic:
//   (nothing)  -> the list        ?new=1 -> add        ?edit=ID -> edit
// Moving between them never reloads the page, and the address always reflects the view, so
// back/forward and bookmarks work. The body and every section use the rich editor.
(function () {
  "use strict";
  var root = document.getElementById("grRoot");
  if (!root) return;

  var $ = function (id) { return document.getElementById(id); };
  var listView = $("grListView"), editView = $("grEditView"), form = $("grForm");
  var alertEl = $("grAlert"), stateEl = $("grState");

  var mode = "list";          // list | new | edit
  var editId = null;
  var current = null;          // loaded review (edit)
  var builder = null;          // the typed section builder
  var dirty = false;
  var saving = false;
  var slugTouched = false;

  function clientEscape(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function show(kind, msg) { alertEl.className = "alert alert--" + kind; alertEl.textContent = msg; alertEl.style.display = "block"; if (kind === "error") alertEl.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  function hideAlert() { alertEl.style.display = "none"; }
  function setDirty(v) { dirty = v; stateEl.textContent = v ? "Unsaved changes" : (mode === "edit" ? "Saved" : ""); stateEl.classList.toggle("is-dirty", v); }
  function api(path, opts) { return fetch("/en/api/v1/" + path, opts).then(function (r) { return r.json(); }); }
  function post(path, body) { return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
  function editorId(key) { return "gr-sec-" + key; }

  // ---------- routing (one route, three views) ----------
  function parse() {
    var p = new URLSearchParams(location.search);
    if (p.get("new")) return { mode: "new", type: p.get("type"), item: p.get("item") };
    var id = parseInt(p.get("edit"), 10);
    if (id > 0) return { mode: "edit", id: id };
    return { mode: "list" };
  }
  function go(search, replace) {
    var url = location.pathname + (search || "");
    if (replace) history.replaceState(null, "", url); else history.pushState(null, "", url);
    route();
  }
  function confirmLeave() { return !dirty || confirm("You have unsaved changes. Leave without saving?"); }

  function route() {
    var r = parse();
    if (r.mode === "list") return showList();
    if (r.mode === "new") return openNew(r);
    return openEdit(r.id);
  }

  function showList() {
    destroyEditors();
    mode = "list"; editId = null; current = null; setDirty(false);
    editView.hidden = true; listView.hidden = false;
    document.title = "Reviews (other types)";
    hideAlert();
    if (typeof loadGenericReviewsTable === "function") loadGenericReviewsTable();
  }

  function showEditor() { listView.hidden = true; editView.hidden = false; window.scrollTo(0, 0); }

  // ---------- loading helpers ----------
  function loadAuthors(selected) {
    var sel = $("grAuthor");
    return api("authors/list").then(function (d) {
      var list = (d && (d.authors || d.items)) || [];
      sel.innerHTML = '<option value="">No author assigned</option>' + list.map(function (a) { return '<option value="' + Number(a.id) + '">' + clientEscape(a.name) + "</option>"; }).join("");
      if (selected) sel.value = String(selected);
    }).catch(function () {});
  }

  // The reviewed item is found by searching, not by scrolling a long list.
  var itemPicker = null;
  function setPickedItem(it) {
    $("grItem").value = it ? it.value : "";
    $("grItemPicked").textContent = it ? "Reviewing: " + it.label + " (" + it.sub + ")" : "Nothing chosen yet.";
    $("grItemPicked").classList.toggle("is-set", !!it);
  }
  function itemSearch(q) {
    var u = "content-items/list?content_type=" + encodeURIComponent($("grType").value) + "&page=1&per_page=15" + (q ? "&search=" + encodeURIComponent(q) : "");
    return api(u).then(function (d) {
      return ((d && d.items) || []).map(function (i) { return { value: String(i.id), label: i.name, sub: i.slug + (i.status && i.status !== "published" ? " · " + i.status : "") }; });
    });
  }
  function initItemPicker() {
    if (itemPicker) return;
    itemPicker = EntityPicker.attach($("grItemSearch"), { search: itemSearch, onPick: setPickedItem, onType: function () { setPickedItem(null); } });
  }
  function preselectItem(type, id) {
    return api("content-items/list?content_type=" + encodeURIComponent(type)).then(function (d) {
      var it = ((d && d.items) || []).filter(function (i) { return Number(i.id) === id; })[0];
      if (it) { $("grItemSearch").value = it.name; setPickedItem({ value: String(it.id), label: it.name, sub: it.slug }); }
    }).catch(function () {});
  }

  function resetForm() {
    form.reset();
    slugTouched = false;
    $("grSlug").disabled = false;
    setPickedItem(null);
    if (builder) builder.load([]);
  }

  // ---------- add ----------
  function openNew(r) {
    mode = "new"; editId = null; current = null;
    resetForm();
    $("grHeading").textContent = "Add Review"; $("grSubtitle").textContent = "";
    $("grTargetCard").hidden = false; $("grSlugNote").hidden = true; $("grDangerZone").hidden = true; $("grView").hidden = true;
    $("grSave").textContent = "Create review";
    hideAlert(); showEditor();
    if (r.type && ["sportsbook", "affiliate_partner", "custom"].indexOf(r.type) !== -1) $("grType").value = r.type;
    initItemPicker();
    if (r.item && parseInt(r.item, 10) > 0) preselectItem($("grType").value, parseInt(r.item, 10));
    loadAuthors();
    setEditorContent("");
    snapshot();
    setDirty(false);
    document.title = "Add review";
  }

  // ---------- edit ----------
  function openEdit(id) {
    mode = "edit"; editId = id; resetForm();
    $("grHeading").textContent = "Edit Review"; $("grSubtitle").textContent = "Loading…";
    $("grTargetCard").hidden = true; $("grSlugNote").hidden = false; $("grDangerZone").hidden = false;
    $("grSave").textContent = "Save changes";
    hideAlert(); showEditor();
    return api("generic-review/get?id=" + id).then(function (d) {
      if (!d.success) { show("error", d.error || "Review not found"); form.hidden = true; return; }
      form.hidden = false;
      current = d.review;
      $("grSubtitle").textContent = " · " + current.reviewed_content_type + " #" + current.reviewed_content_id;
      form.elements.title.value = current.title || "";
      form.elements.slug.value = current.slug || ""; form.elements.slug.disabled = true;
      var arr = function (raw) { try { return (JSON.parse(raw || "[]") || []).join("\n"); } catch (e) { return raw || ""; } };
      form.elements.pros.value = arr(current.pros); form.elements.cons.value = arr(current.cons);
      form.elements.rating.value = current.rating != null ? current.rating : "";
      form.elements.verdict.value = current.verdict || "";
      form.elements.published.checked = !!current.published;
      form.elements.seo_title.value = current.seo_title || ""; form.elements.seo_description.value = current.seo_description || ""; form.elements.seo_keywords.value = current.seo_keywords || "";
      setEditorContent(legacyToHtml(current.content || ""));
      builder.load((d.sections || []).map(function (s) {
        if (s.type === "rich" && s.data) s.data.html = legacyToHtml(s.data.html || "");
        return { title: s.title || "", type: s.type, data: s.data };
      }));
      var prefix = { sportsbook: "/en/sportsbook/review/", affiliate_partner: "/en/affiliate-partner/review/" }[current.reviewed_content_type];
      var v = $("grView");
      if (prefix && current.published) { v.href = prefix + encodeURIComponent(current.slug); v.hidden = false; } else v.hidden = true;
      updateCounts();
      return loadAuthors(current.author_id);
    }).then(function () { snapshot(); setDirty(false); document.title = "Edit review"; }).catch(function () { show("error", "Failed to load review."); });
  }

  // plain text from before the rich editor -> paragraphs (the page does the same when it renders)
  function legacyToHtml(text) {
    var s = String(text || "");
    if (!s.trim() || /<\/?[a-z][\s\S]*?>/i.test(s)) return s;
    return s.split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return "<p>" + clientEscape(p).replace(/\n/g, "<br>") + "</p>"; }).join("\n");
  }

  // ---------- rich editor glue ----------
  var mainStarted = false;
  function ensureMainEditor() {
    // started on first show, not at page load: TinyMCE sizes itself badly inside a hidden block
    if (mainStarted || !window.RichEditor) return;
    mainStarted = true; RichEditor.init($("grContent"), { id: "gr-content", folder: "reviews", height: "420" });
  }
  var pendingBody = null;
  function setEditorContent(html) {
    var ta = $("grContent"); ta.value = html;
    ensureMainEditor();
    if (window.RichEditor && RichEditor.isReady("gr-content")) { RichEditor.set("gr-content", html); pendingBody = null; return; }
    // the editor is still loading and may already have read the old text: apply once it is up
    pendingBody = html;
    var tries = 0, t = setInterval(function () {
      if (pendingBody !== html) return clearInterval(t);
      if (window.RichEditor && RichEditor.isReady("gr-content")) { RichEditor.set("gr-content", html); pendingBody = null; clearInterval(t); }
      else if (++tries > 100) clearInterval(t);
    }, 100);
  }
  function getEditorContent() {
    if (pendingBody != null) return pendingBody;
    if (window.RichEditor && RichEditor.isReady("gr-content")) return RichEditor.get("gr-content") || "";
    return $("grContent").value;
  }
  function destroyEditors() { if (builder) builder.destroy(); }


  // ---------- form behaviour ----------
  form.addEventListener("input", function (e) {
    setDirty(true);
    if (e.target === $("grTitle") && mode === "new" && !slugTouched) $("grSlug").value = slugify(e.target.value);
    if (e.target === $("grSlug")) slugTouched = true;
    if (e.target.name === "seo_title" || e.target.name === "seo_description") updateCounts();
  });
  $("grSlug").addEventListener("blur", function () { this.value = slugify(this.value); });
  $("grType").addEventListener("change", function () { $("grItemSearch").value = ""; setPickedItem(null); });
  function updateCounts() {
    Array.prototype.forEach.call(form.querySelectorAll("[data-count-for]"), function (c) {
      var f = form.elements[c.dataset.countFor], n = f ? f.value.length : 0, good = parseInt(c.dataset.good, 10);
      c.textContent = n + " / " + good + " recommended"; c.classList.toggle("is-over", n > good);
    });
  }
  // rich editors fire their own change events inside iframes; poll cheaply for dirtiness
  var lastSnap = "";
  function snapshot() { lastSnap = getEditorContent() + "\u0001" + (builder ? JSON.stringify(builder.read()) : ""); }
  setInterval(function () {
    if (editView.hidden || saving || !lastSnap) return;
    var now = getEditorContent() + "\u0001" + (builder ? JSON.stringify(builder.read()) : "");
    if (now !== lastSnap) { lastSnap = now; setDirty(true); }
  }, 1500);

  // ---------- save ----------
  function payload() {
    var fd = new FormData(form);
    var lines = function (t) { return JSON.stringify((t || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean)); };
    var p = {
      title: String(fd.get("title") || "").trim(), content: getEditorContent(),
      pros: lines(fd.get("pros")), cons: lines(fd.get("cons")),
      rating: fd.get("rating") || null, verdict: fd.get("verdict") || null,
      author_id: fd.get("author_id") ? parseInt(fd.get("author_id"), 10) : null,
      published: fd.get("published") === "on",
      seo_title: fd.get("seo_title") || null, seo_description: fd.get("seo_description") || null, seo_keywords: fd.get("seo_keywords") || null,
      sections: builder.read()
    };
    if (mode === "new") {
      p.reviewed_content_type = fd.get("reviewed_content_type");
      p.reviewed_content_id = parseInt(fd.get("reviewed_content_id"), 10);
      p.slug = slugify(fd.get("slug"));
    } else p.id = editId;
    return p;
  }
  function validate(p) {
    if (!p.title) return "Give the review a title.";
    if (mode === "new") {
      if (!p.reviewed_content_id) return "Pick the item being reviewed -- none available for this type yet.";
      if (!p.slug) return "The slug is required.";
    }
    var untitled = p.sections.filter(function (s) { return !s.title; });
    if (untitled.length) return "Give every section a title — each one becomes a tab in the review's top bar.";
    return "";
  }
  function save() {
    if (saving) return;
    hideAlert();
    var p = payload(), bad = validate(p);
    if (bad) return show("error", bad);
    saving = true; $("grSave").disabled = true; stateEl.textContent = "Saving…";
    post(mode === "new" ? "generic-review/create" : "generic-review/update", p).then(function (d) {
      saving = false; $("grSave").disabled = false;
      if (!d.success) { stateEl.textContent = ""; return show("error", d.error || "Failed to save"); }
      setDirty(false);
      if (mode === "new") { show("success", "Review created."); setDirty(false); go("?edit=" + d.review.id, true); }
      else { show("success", "Saved."); snapshot(); }
    }).catch(function () { saving = false; $("grSave").disabled = false; stateEl.textContent = ""; show("error", "Network error. Try again."); });
  }
  $("grSave").addEventListener("click", save);
  form.addEventListener("submit", function (e) { e.preventDefault(); save(); });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !editView.hidden) { e.preventDefault(); save(); }
  });
  window.addEventListener("beforeunload", function (e) { if (dirty && !editView.hidden) { e.preventDefault(); e.returnValue = ""; } });

  $("grDelete").addEventListener("click", function () {
    if (!confirm("Delete this review and all its sections? This cannot be undone.")) return;
    post("generic-review/delete", { id: editId }).then(function (d) {
      if (d.success) { setDirty(false); go("", false); } else show("error", d.error || "Delete failed");
    }).catch(function () { show("error", "Network error. Try again."); });
  });

  // ---------- navigation inside the one route ----------
  $("grBack").addEventListener("click", function () { if (confirmLeave()) { setDirty(false); go(""); } });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-gr-new], a[data-gr-edit]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (!confirmLeave()) return;
    setDirty(false);
    var type = document.getElementById("genericReviewTypeFilter");
    if (a.hasAttribute("data-gr-new")) go("?new=1" + (type ? "&type=" + encodeURIComponent(type.value) : ""));
    else go("?edit=" + encodeURIComponent(a.getAttribute("data-gr-edit")));
  });
  window.addEventListener("popstate", function () { setDirty(false); route(); });

  builder = SectionBuilder.mount({ root: $("grSections"), addButton: $("grAddSection"), presets: $("grPresets"), onChange: function () { setDirty(true); } });
  initItemPicker();
  route();
})();
