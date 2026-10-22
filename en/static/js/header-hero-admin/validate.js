import { form } from "/static/js/header-hero-admin/state.js";
import { COLOR_FIELDS, LINK_FIELDS, getValue, inputsFor, repeaters } from "/static/js/header-hero-admin/fields.js";

export var FONTS = {
  "default": "",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  modern: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Quicksand, 'Trebuchet MS', sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  elegant: "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', Georgia, serif",
  display: "Impact, 'Arial Narrow Bold', 'Haettenschweiler', 'Franklin Gothic Medium', sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
};

export function validLink(v) {
  if (!v) return true;
  if (/[\s"'<>\\]/.test(v)) return false;
  return /^\/(?!\/)/.test(v) || /^#[\w-]*$/.test(v) || /^https?:\/\/[^\s/]+/i.test(v) || /^mailto:\S+$/i.test(v) || /^tel:[+\d][\d\s().-]*$/i.test(v);
}

export function validColor(v) {
  if (!v) return true;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) || /^(rgb|rgba|hsl|hsla)\(\s*[\d\s.,%/-]+\)$/i.test(v);
}

function showError(name, message) {
  var el = form.querySelector('[data-error-for="' + name + '"]');
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
}

function hexToRgb(v) {
  v = String(v || "").trim();
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return null;
  var h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(rgb) {
  var c = rgb.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  var la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Advice only, never blocks saving: text that is hard to read on the header colour.
function checkContrast() {
  var el = form.querySelector('[data-warn-for="site_header_text_color"]');
  if (!el) return;
  var fg = hexToRgb(String(getValue("site_header_text_color")).trim());
  var bg = hexToRgb(String(getValue("theme_header_background")).trim() || "#000000");
  var low = fg && bg && contrast(fg, bg) < 3;
  el.textContent = low ? "Low contrast with the header colour: the text may be hard to read." : "";
  el.hidden = !low;
}

export function validate() {
  checkContrast();
  var ok = true;
  LINK_FIELDS.forEach(function (k) {
    var bad = !validLink(String(getValue(k)).trim());
    showError(k, bad ? "Use an address starting with / or https://" : "");
    if (bad) ok = false;
  });
  COLOR_FIELDS.forEach(function (k) {
    var bad = !validColor(String(getValue(k)).trim());
    showError(k, bad ? "Use a colour like #1a1a1a" : "");
    if (bad) ok = false;
  });
  var watch = String(getValue("site_hero_watch_url")).trim();
  var watchBad = Boolean(watch) && !parseVideo(watch);
  showError("site_hero_watch_url", watchBad ? "Use a YouTube or Vimeo video link." : "");
  if (watchBad) ok = false;
  Object.keys(repeaters).forEach(function (k) { if (!repeaters[k].validate()) ok = false; });
  return ok;
}

// ------------------------------------------------------------ colours, counters, range output
export function syncPicker(name, picker) {
  var v = String(getValue(name)).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
  else if (/^#[0-9a-fA-F]{3}$/.test(v)) picker.value = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
}

export function updateCounts() {
  Array.prototype.forEach.call(form.querySelectorAll("[data-count-for]"), function (el) {
    var name = el.getAttribute("data-count-for");
    var input = inputsFor(name)[0];
    if (!input) return;
    var max = input.maxLength > 0 ? input.maxLength : 0;
    el.textContent = max ? input.value.length + " / " + max : "";
  });
  Array.prototype.forEach.call(form.querySelectorAll("[data-output-for]"), function (el) {
    el.textContent = String(getValue(el.getAttribute("data-output-for"))) + (el.getAttribute("data-unit") || "%");
  });
}

// ------------------------------------------------------------ slide and picture lists
// The same rules as the server (worker/header-hero.js parseVideoUrl); the server has the final say.
export function parseVideo(value) {
  var raw = String(value || "").trim();
  if (!raw || raw.length > 300 || /[\s"'<>\\]/.test(raw)) return null;
  var u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  var host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  var parts = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return /^[A-Za-z0-9_-]{11}$/.test(parts[0] || "") ? { provider: "youtube", id: parts[0] } : null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    var id = "";
    if (parts[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["embed", "shorts", "live", "v"].indexOf(parts[0]) !== -1) id = parts[1] || "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", id: id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    var segs = host === "player.vimeo.com" ? (parts[0] === "video" ? parts.slice(1) : []) : parts;
    for (var i = 0; i < segs.length; i++) if (/^\d{5,12}$/.test(segs[i])) return { provider: "vimeo", id: segs[i] };
  }
  return null;
}

export var VIDEO_RE = /\.(mp4|webm|ogv|ogg|m4v)(\?[^\s]*)?$/i;
