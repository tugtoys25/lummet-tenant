import { DEFAULTS, KEYS, discardBtn, saveBtn, statusEl } from "/static/js/header-hero-admin/state.js";
import { applyAll, getValue, setValue, snapshot } from "/static/js/header-hero-admin/fields.js";
import { updateCounts, validate } from "/static/js/header-hero-admin/validate.js";
import { renderPreview } from "/static/js/header-hero-admin/preview.js";

export var saved = {};

export var loaded = false;

// ------------------------------------------------------------ status / dirty tracking
export function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "hh-status" + (kind ? " is-" + kind : "");
}

export function isDirty() {
  var now = snapshot();
  return KEYS.some(function (k) { return now[k] !== saved[k]; });
}

export function refresh() {
  updateCounts();
  renderPreview();
  if (!loaded) return;
  var dirty = isDirty();
  saveBtn.disabled = !dirty;
  discardBtn.disabled = !dirty;
  if (dirty) setStatus("You have unsaved changes.", "dirty");
  else if (statusEl.className.indexOf("is-ok") === -1) setStatus("All changes saved.", "");
}

// ------------------------------------------------------------ presets
var PRESETS = {
  classic: {},
  modern: {
    theme_header_style: "glass", site_header_height: "default", site_header_nav_align: "center",
    site_hero_height: "tall", site_hero_bg_mode: "brand", site_hero_alignment: "center", site_hero_text_theme: "light",
    site_hero_overlay_opacity: "35", site_hero_highlights: "Expert reviews\nExclusive bonuses\nLocal offers"
  },
  bold: {
    site_announce_enabled: "true", site_announce_tone: "promo", site_announce_text: "Limited time: exclusive welcome bonuses",
    site_announce_link_text: "See offers", site_announce_url: "/en/casino",
    theme_header_style: "solid", site_header_height: "default", site_header_cta_enabled: "true", site_header_cta_text: "Get the bonus",
    site_header_cta_url: "/en/casino", site_header_cta_style: "primary",
    site_hero_height: "screen", site_hero_alignment: "left", site_hero_bg_mode: "brand", site_hero_overlay_opacity: "40"
  },
  minimal: {
    theme_header_style: "solid", site_header_height: "compact", site_header_logo_size: "sm", site_header_show_search: "false",
    site_hero_height: "compact", site_hero_alignment: "left", site_hero_badge_enabled: "false", site_hero_bg_mode: "solid"
  }
};

export function applyPreset(key) {
  var preset = PRESETS[key];
  if (!preset) return;
  // keep the visitor-facing text you wrote; a style changes the look, not your words
  var keep = ["site_hero_media_enabled", "site_hero_slides", "site_hero_media_embed_mobile", "site_hero_cards_enabled", "site_hero_cards", "site_hero_title", "site_hero_subtitle", "site_hero_description", "site_hero_badge", "site_hero_button_text", "site_hero_button_url", "site_hero_image"];
  var next = {};
  KEYS.forEach(function (k) { next[k] = keep.indexOf(k) !== -1 ? getValue(k) : DEFAULTS[k]; });
  Object.keys(preset).forEach(function (k) { next[k] = preset[k]; });
  applyAll(next);
  validate();
  refresh();
  setStatus("Style applied. Review the preview, then save.", "dirty");
}

// ------------------------------------------------------------ loading and saving
export function load() {
  fetch("/en/api/v1/settings/get", { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
    .then(function (data) {
      var settings = (data && data.settings) || {};
      var values = {};
      KEYS.forEach(function (k) { values[k] = settings[k] != null ? settings[k] : DEFAULTS[k]; });
      applyAll(values);
      saved = snapshot();
      loaded = true;
      setStatus("All changes saved.", "");
      refresh();
    })
    .catch(function () {
      applyAll(DEFAULTS);
      saved = snapshot();
      loaded = true;
      refresh();
      setStatus("Could not load the saved settings. Showing defaults; saving will overwrite them.", "error");
    });
}

export function save() {
  if (!validate()) { setStatus("Fix the highlighted fields first.", "error"); return; }
  var payload = snapshot();
  KEYS.forEach(function (k) { if (typeof payload[k] === "string") payload[k] = payload[k].replace(/\s+$/, ""); });
  saveBtn.disabled = true;
  setStatus("Saving...", "");
  fetch("/en/api/v1/settings/save", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
    .then(function (res) {
      if (!res.ok || (res.body && res.body.success === false)) {
        setStatus((res.body && (res.body.error || res.body.message)) || "Could not save. You may not have permission.", "error");
        saveBtn.disabled = false;
        return;
      }
      // The server tidies some values (for example an empty title becomes the default); show what is stored.
      return fetch("/en/api/v1/settings/get", { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var s = (data && data.settings) || {};
          KEYS.forEach(function (k) { if (s[k] != null) setValue(k, s[k]); });
        })
        .catch(function () { /* keep what was typed */ })
        .then(function () {
          saved = snapshot();
          setStatus("Saved. Your live site now uses these settings.", "ok");
          refresh();
        });
    })
    .catch(function () {
      setStatus("Could not reach the server. Your changes are still in the form.", "error");
      saveBtn.disabled = false;
    });
}
