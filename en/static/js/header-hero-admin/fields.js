import { DEFAULTS, KEYS, form } from "/static/js/header-hero-admin/state.js";
import { syncPicker } from "/static/js/header-hero-admin/validate.js";

// ------------------------------------------------------------ field access
export function inputsFor(name) { return form.querySelectorAll('[name="' + name + '"]'); }

export var repeaters = {};

export function getValue(name) {
  if (repeaters[name]) return repeaters[name].serialize();
  var els = inputsFor(name);
  if (!els.length) return DEFAULTS[name];
  var first = els[0];
  if (first.type === "checkbox") return first.checked ? "true" : "false";
  if (first.type === "radio") {
    for (var i = 0; i < els.length; i++) if (els[i].checked) return els[i].value;
    return DEFAULTS[name];
  }
  return first.value;
}

export function setValue(name, value) {
  value = value == null ? "" : String(value);
  if (repeaters[name]) { repeaters[name].load(value); return; }
  var els = inputsFor(name);
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.type === "checkbox") el.checked = value === "true";
    else if (el.type === "radio") el.checked = el.value === value;
    else el.value = value;
  }
  var picker = form.querySelector('[data-color-for="' + name + '"]');
  if (picker) syncPicker(name, picker);
}

export function snapshot() {
  var out = {};
  KEYS.forEach(function (k) { out[k] = String(getValue(k)); });
  return out;
}

export function applyAll(values) { KEYS.forEach(function (k) { setValue(k, values[k] != null ? values[k] : DEFAULTS[k]); }); }

// ------------------------------------------------------------ validation (the server checks again)
export var LINK_FIELDS = ["site_announce_url", "site_header_cta_url", "site_hero_button_url", "site_hero_button2_url", "site_hero_image"];

export var COLOR_FIELDS = ["theme_header_background", "site_header_text_color", "site_hero_bg_color", "site_hero_text_color", "site_hero_title_color"];
