// Dashboard > Header & Hero
// Loads the saved settings, keeps a live preview in step with the form, offers
// one-click starting styles and saves the changed values through the existing
// settings endpoints. It builds the preview with DOM calls only (no innerHTML)
// and sends nothing but this page's own settings.

import { DEFAULTS, discardBtn, form, previewEl, resetBtn, saveBtn, statusEl } from "/static/js/header-hero-admin/state.js";
import { applyAll, inputsFor, setValue } from "/static/js/header-hero-admin/fields.js";
import { updateCounts, validate } from "/static/js/header-hero-admin/validate.js";
import { fitPreview, prepareFrame, setMobilePreview } from "/static/js/header-hero-admin/preview.js";
import { applyPreset, isDirty, load, loaded, refresh, save, saved, setStatus } from "/static/js/header-hero-admin/actions.js";

// Evaluated for its side effect: builds the repeaters (it exports nothing).
import "/static/js/header-hero-admin/repeater.js";

if (form) {
  // ------------------------------------------------------------ events
  form.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-color-for")) {
      var name = t.getAttribute("data-color-for");
      var text = inputsFor(name)[0];
      if (text) text.value = t.value;
    }
    statusEl.className = "hh-status";
    validate();
    refresh();
  });
  form.addEventListener("change", function () { refresh(); });
  form.addEventListener("click", function (e) {
    var target = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!target) return;
    var preset = target.getAttribute("data-preset");
    if (preset) { applyPreset(preset); return; }
    var clearName = target.getAttribute("data-color-clear");
    if (clearName) { setValue(clearName, ""); statusEl.className = "hh-status"; validate(); refresh(); return; }
    var token = target.getAttribute("data-insert-token");
    if (token) {
      var area = inputsFor("site_hero_subtitle")[0];
      if (area) {
        var piece = "{" + "{" + token + "}" + "}";
        var s = area.selectionStart == null ? area.value.length : area.selectionStart;
        var en = area.selectionEnd == null ? s : area.selectionEnd;
        area.value = area.value.slice(0, s) + piece + area.value.slice(en);
        area.focus();
        area.selectionStart = area.selectionEnd = s + piece.length;
        statusEl.className = "hh-status";
        refresh();
      }
    }
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="hh_device"]'), function (r) {
    r.addEventListener("change", function () { setMobilePreview(r.value === "mobile" && r.checked); fitPreview(); });
  });

  saveBtn.addEventListener("click", save);
  discardBtn.addEventListener("click", function () { applyAll(saved); validate(); statusEl.className = "hh-status"; refresh(); });
  resetBtn.addEventListener("click", function () {
    if (!window.confirm("Reset every Header & Hero option to its default? You can still review it before saving.")) return;
    applyAll(DEFAULTS);
    validate();
    refresh();
    setStatus("Defaults restored. Press Save changes to apply them.", "dirty");
  });
  window.addEventListener("beforeunload", function (e) {
    if (loaded && isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  window.addEventListener("resize", function () { if (loaded) fitPreview(); });
  updateCounts();
  if (previewEl) {
    previewEl.addEventListener("load", prepareFrame);
    previewEl.srcdoc = "<!doctype html><html><head></head><body></body></html>";
  }
  load();
}
