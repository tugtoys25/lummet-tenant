// Component Studio: the live preview (debounced, newest answer wins).

import { contentEl, frame, panel, previewBox, previewNote, settingsEl, titleEl, typeSel } from "/static/js/component-studio/context.js";

// ---- preview
var ticket = 0;

var timer = null;

// ------------------------------------------------------------ preview
function wrapDoc(html) {
  var css = ["main", "responsive", "supportive", "header-hero", "component-blocks"].map(function (n) { return '<link rel="stylesheet" href="' + location.origin + "/static/css/" + n + '.css">'; }).join("");
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">' + css +
    '<style>body{margin:0;padding:16px;background:#fff}</style></head><body><div class="container" style="max-width:1100px;margin:0 auto">' + html + '</div></body></html>';
}

export function schedulePreview() {
  if (previewBox.hidden || panel.hidden) return;
  window.clearTimeout(timer); timer = window.setTimeout(preview, 450);
}

function preview() {
  var mine = ++ticket;
  fetch("/en/api/v1/component/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: typeSel.value, title: titleEl.value, content: contentEl.value, settings_json: settingsEl.value }) })
    .then(function (r) { return r.json(); }).then(function (d) {
      if (mine !== ticket) return;
      if (d && d.success) { frame.srcdoc = wrapDoc(d.html || '<p style="color:#64748b;font:14px sans-serif">Nothing to show yet. Add content on the left.</p>'); previewNote.textContent = "The preview uses the site styles. Grids and feeds that load on the live page are shown by the live page."; }
      else previewNote.textContent = (d && d.error) || "The preview could not be built.";
    }).catch(function () { if (mine === ticket) previewNote.textContent = "The preview could not be loaded."; });
}
