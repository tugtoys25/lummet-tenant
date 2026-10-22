// Component Studio: builds the form for the chosen type, and wires the editor events (initComponentStudio).

import { FORM_TYPES, NEW_TYPES, advToggle, body, contentEl, contentGroup, form, frame, isObj, panel, parseObj, previewBox, settingsEl, settingsGroup, st, titleEl, typeSel } from "/static/js/component-studio/context.js";
import { schedulePreview } from "/static/js/component-studio/preview.js";
import { builders } from "/static/js/component-studio/forms.js";

// Evaluated for their side effect: each registers its type form in `builders` (they export nothing).
import "/static/js/component-studio/content.js";
import "/static/js/component-studio/data.js";
import "/static/js/component-studio/section.js";

// ---- main
var current = "";

// ------------------------------------------------------------ build / sync
function usesForm(type) { return FORM_TYPES.indexOf(type) !== -1; }

function build() {
  var type = typeSel.value; current = type;
  body.textContent = "";
  var on = usesForm(type);
  panel.hidden = !on;
  // raw boxes: hidden behind "Advanced" when a form exists; always the title row stays
  contentGroup.hidden = on && !advToggle.checked;
  settingsGroup.hidden = on && !advToggle.checked;
  if (type === "hero") { contentGroup.hidden = false; settingsGroup.hidden = false; }
  previewBox.hidden = !on;
  if (!on) return;
  st.S = parseObj(settingsEl.value);
  // a settings box that held something that is not an object is left alone until the form changes it
  st.busy = true;
  try { builders[type](body); } finally { st.busy = false; }
  schedulePreview();
}

export function initComponentStudio() {
  Array.prototype.forEach.call(panel.querySelectorAll('[name="cs_device"]'), function (r) {
    r.addEventListener("change", function () {
      var phone = panel.querySelector('[name="cs_device"]:checked').value === "mobile";
      frame.style.width = phone ? "390px" : "100%"; frame.style.height = phone ? "620px" : "480px";
    });
  });
  titleEl.addEventListener("input", schedulePreview);

  // ------------------------------------------------------------ events
  typeSel.addEventListener("change", function () {
    // options of a grid, table or section mean nothing to another type: start that type fresh
    if (current !== typeSel.value && (NEW_TYPES.indexOf(current) !== -1 || NEW_TYPES.indexOf(typeSel.value) !== -1)) settingsEl.value = "";
    build();
  });
  advToggle.addEventListener("change", function () { build(); });
  form.addEventListener("component:loaded", function () { build(); });
  form.addEventListener("reset", function () { window.setTimeout(build, 0); });
  // developers editing the raw boxes: the form follows
  var rawTimer = null;
  function rawChanged() { if (!advToggle.checked) return; window.clearTimeout(rawTimer); rawTimer = window.setTimeout(build, 600); }
  settingsEl.addEventListener("input", rawChanged); contentEl.addEventListener("input", function (e) { if (e.isTrusted) rawChanged(); });
  // a form that would send a non-object Settings box is stopped here with a clear message
  form.addEventListener("submit", function (e) {
    if (!usesForm(typeSel.value)) return;
    var v = settingsEl.value.trim();
    if (v) { try { if (!isObj(JSON.parse(v))) throw 0; } catch (err) { e.preventDefault(); e.stopImmediatePropagation(); window.alert("The advanced Settings box is not valid. Fix it or clear it."); } }
  }, true);

  window.addEventListener("DOMContentLoaded", build);
  if (document.readyState !== "loading") build();
}
