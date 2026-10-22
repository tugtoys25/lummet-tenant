// Landing pages (/en/best/...): one script for the create and edit forms.
(function () {
  "use strict";
  var form = document.getElementById("lpForm");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var mode = form.getAttribute("data-mode"), slug = form.getAttribute("data-slug") || "";
  var alertEl = $("landingPageFormAlert"), stateEl = $("lpState"), saveBtn = $("lpSave");
  var builder = null, picker = null, dirty = false, slugTouched = false, page = null, lastSnap = "", typeProxy = null, saving = false;

  function show(kind, msg) { alertEl.className = "alert alert--" + kind; alertEl.textContent = msg; alertEl.style.display = "block"; if (kind === "error") alertEl.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  function hide() { alertEl.style.display = "none"; }
  function api(path, opts) { return fetch("/en/api/v1/" + path, opts).then(function (r) { return r.json(); }); }
  function post(path, body) { return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function setDirty(v) { dirty = v; stateEl.textContent = v ? "Unsaved changes" : (mode === "edit" ? "Saved" : ""); stateEl.classList.toggle("is-dirty", v); }
  function val(n) { return form.elements[n] ? form.elements[n].value : ""; }
  function itemMode() { var r = form.querySelector('input[name="item_mode"]:checked'); return r ? r.value : "manual"; }
  function contentType() { return mode === "edit" ? (page ? page.content_type : "") : val("content_type"); }

  function updateModeUi() {
    var auto = itemMode() === "auto";
    $("landingPageAutoFields").hidden = !auto; $("landingPageManualFields").hidden = auto;
    Array.prototype.forEach.call(form.querySelectorAll(".lp-mode"), function (l) { l.classList.toggle("is-on", l.querySelector("input").checked); });
  }
  function updateCounts() {
    Array.prototype.forEach.call(form.querySelectorAll("[data-count-for]"), function (c) {
      var f = form.elements[c.dataset.countFor], n = f ? f.value.length : 0, good = parseInt(c.dataset.good, 10);
      c.textContent = n + " characters" + (good ? " (aim for under " + good + ")" : ""); c.classList.toggle("is-over", !!good && n > good);
    });
    var s = mode === "edit" ? slug : val("slug");
    $("lpAddress").textContent = "/en/best/" + (s || "…");
    $("lpSerpUrl").textContent = location.origin + "/en/best/" + (s || "…");
    $("lpSerpTitle").textContent = val("seo_title") || val("title") || "Page title";
    $("lpSerpDesc").textContent = val("seo_description") || val("description") || "Add a description so searchers know what the page offers.";
  }
  function snapshot() { return JSON.stringify([new FormData(form) && Array.from(new FormData(form).entries()), builder ? builder.read() : [], picker ? picker.getSelected().map(function (i) { return i.itemId; }) : []]); }
  function mark() { lastSnap = snapshot(); }
  function watch() { setInterval(function () { if (!saving && !dirty && snapshot() !== lastSnap) setDirty(true); }, 800); }

  function loadAuthors(selected) {
    return api("authors/list").then(function (d) {
      var sel = $("lpAuthor");
      (d.authors || []).forEach(function (a) { var o = document.createElement("option"); o.value = a.id; o.textContent = a.name; sel.appendChild(o); });
      if (selected) sel.value = String(selected);
    }).catch(function () {});
  }
  function loadCustomTypes() {
    var sel = $("landingPageCustomTypeSelect"), wrap = $("landingPageCustomTypeField");
    if (!sel) return;
    function upd() {
      var c = val("content_type") === "custom"; wrap.hidden = !c;
      if (c && !sel.dataset.loaded) { sel.dataset.loaded = "1"; api("custom-types/list").then(function (d) { sel.innerHTML = (d.types || []).map(function (t) { return '<option value="' + esc(t.slug) + '">' + esc(t.label) + "</option>"; }).join(""); }).catch(function () { sel.innerHTML = '<option value="">Could not load</option>'; }); }
    }
    form.elements.content_type.addEventListener("change", upd); upd();
  }

  function payload() {
    var p = {
      title: val("title").trim(), description: val("description") || null,
      item_mode: itemMode(), auto_limit: parseInt(val("auto_limit"), 10) || 10,
      status: val("status") || "draft", author_id: val("author_id") ? Number(val("author_id")) : null,
      seo_title: val("seo_title") || null, seo_description: val("seo_description") || null, seo_keywords: val("seo_keywords") || null,
      item_ids: picker.getSelected().map(function (i) { return i.itemId; }), sections: builder.read()
    };
    if (mode === "edit") p.slug = slug;
    else { p.slug = val("slug").trim(); p.content_type = val("content_type"); p.custom_type_slug = p.content_type === "custom" ? (val("custom_type_slug") || null) : null; }
    return p;
  }
  function validate(p) {
    if (!p.title) return "Give the page a title.";
    if (mode === "create" && !/^[a-z0-9-]{1,120}$/.test(p.slug)) return "The slug can only use lowercase letters, numbers and dashes.";
    if (mode === "create" && p.content_type === "custom" && !p.custom_type_slug) return "Pick the custom type.";
    if (p.sections.some(function (s) { return !String(s.title || "").trim(); })) return "Give every section a title. It becomes its tab.";
    return "";
  }
  function save() {
    if (saving) return; hide();
    var p = payload(), err = validate(p);
    if (err) { show("error", err); return; }
    saving = true; saveBtn.disabled = true;
    post("content-landing-page/" + (mode === "edit" ? "update" : "create"), p).then(function (d) {
      if (d && d.success) {
        setDirty(false); mark();
        if (mode === "create") { show("success", "Landing page created."); setTimeout(function () { location.href = "/en/dashboard/content-landing-page/edit/" + encodeURIComponent(p.slug); }, 700); }
        else { show("success", "Saved."); updateView(p.status); }
      } else show("error", (d && d.error) || "Could not save.");
    }).catch(function () { show("error", "Network error. Try again."); }).then(function () { saving = false; saveBtn.disabled = false; });
  }
  function updateView(status) { var v = $("lpView"); if (mode === "edit" && status === "published") { v.href = "/en/best/" + encodeURIComponent(slug); v.hidden = false; } else v.hidden = true; }

  function loadPage() {
    return api("content-landing-page/get?slug=" + encodeURIComponent(slug)).then(function (d) {
      if (!d.success) { show("error", d.error || "Not found"); form.hidden = true; return; }
      page = d.page;
      $("landingPageContentType").value = page.content_type + (page.custom_type_slug ? " (" + page.custom_type_slug + ")" : "");
      typeProxy = { value: page.content_type, addEventListener: function () {} };
      form.elements.title.value = page.title; form.elements.description.value = page.description || "";
      var r = form.querySelector('input[name="item_mode"][value="' + page.item_mode + '"]'); if (r) r.checked = true;
      form.elements.auto_limit.value = page.auto_limit; form.elements.status.value = page.status;
      form.elements.seo_title.value = page.seo_title || ""; form.elements.seo_description.value = page.seo_description || ""; form.elements.seo_keywords.value = page.seo_keywords || "";
      builder.load((d.sections || []).map(function (s) { return { title: s.title || "", type: s.type, data: s.data }; }));
      picker = initComparisonItemPicker({ contentTypeSelectEl: typeProxy, searchInputId: "itemSearchInput", resultsId: "itemSearchResults", selectedRowsId: "selectedItemRows", rowTemplateId: "selectedItemRowTemplate" });
      var ids = d.item_ids || [];
      return Promise.all(ids.map(function (id) {
        return fetch("/en/api/v1/content-item/search?content_type=" + encodeURIComponent(page.content_type) + "&id=" + id).then(function (r) { return r.json(); })
          .then(function (rd) { return (rd.items || [])[0] || { id: id, content_type: page.content_type, name: "#" + id }; }).catch(function () { return { id: id, content_type: page.content_type, name: "#" + id }; });
      })).then(function (items) { items.forEach(function (it) { picker.addPreset(it); }); }).then(function () { return loadAuthors(page.author_id); }).then(function () { updateView(page.status); });
    }).catch(function () { show("error", "Failed to load the landing page."); form.hidden = true; });
  }

  builder = SectionBuilder.mount({ root: $("lpSections"), addButton: $("lpAddSection"), presets: $("lpPresets"), onChange: function () { setDirty(true); } });
  Array.prototype.forEach.call(form.querySelectorAll('input[name="item_mode"]'), function (r) { r.addEventListener("change", function () { updateModeUi(); setDirty(true); }); });
  form.addEventListener("input", function (e) {
    if (e.target.id === "lpTitle" && mode === "create" && !slugTouched) form.elements.slug.value = slugify(e.target.value);
    if (e.target.name === "slug") { slugTouched = true; e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); }
    updateCounts(); setDirty(true);
  });
  form.addEventListener("change", function () { setDirty(true); });
  form.addEventListener("submit", function (e) { e.preventDefault(); save(); });
  saveBtn.addEventListener("click", save);
  document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  var del = $("deleteLandingPageBtn");
  if (del) del.addEventListener("click", function () {
    if (!confirm("Delete this landing page? This cannot be undone.")) return;
    post("content-landing-page/delete", { slug: slug }).then(function (d) { if (d.success) { dirty = false; location.href = "/en/dashboard/content-landing-pages"; } else alert(d.error || "Delete failed"); }).catch(function () { alert("Network error. Try again."); });
  });

  updateModeUi(); updateCounts();
  if (mode === "create") {
    typeProxy = form.elements.content_type;
    picker = initComparisonItemPicker({ contentTypeSelectEl: typeProxy, searchInputId: "itemSearchInput", resultsId: "itemSearchResults", selectedRowsId: "selectedItemRows", rowTemplateId: "selectedItemRowTemplate" });
    loadCustomTypes(); loadAuthors(null).then(function () { mark(); watch(); });
  } else loadPage().then(function () { updateModeUi(); updateCounts(); mark(); setDirty(false); watch(); });
})();
