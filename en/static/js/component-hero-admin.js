// Dashboard > Components: options panel for a "Hero Section" component.
// The panel and the Settings (JSON) box stay in step: the box is what is saved, the panel is a
// friendly way to fill it in. DOM calls only (no innerHTML); the server checks every value again.
(function () {
  "use strict";

  var form = document.getElementById("componentForm");
  var panel = document.getElementById("chPanel");
  if (!form || !panel) return;

  var area = form.querySelector('[name="settings_json"]');
  var typeSel = document.getElementById("componentType");
  var titleEl = form.querySelector('[name="title"]');
  var contentEl = form.querySelector('[name="content"]');
  var body = document.getElementById("chBody");
  var frame = document.getElementById("chPreview");
  var note = document.getElementById("chPreviewNote");
  var design = panel.querySelector('[name="ch_design"]');

  var DEF = {};
  try { DEF = JSON.parse(document.getElementById("chDefaults").textContent) || {}; } catch (e) { DEF = {}; }
  var KEYS = Object.keys(DEF);
  var LEGACY = { link: "button_url", bg_image: "image", new_tab: "button_new_tab" };
  var BOOLS = ["badge_enabled", "button_enabled", "button_new_tab", "watch_enabled", "overlay", "media_enabled", "media_autoplay", "media_embed_mobile", "media_arrows", "media_dots", "media_pause_hover", "cards_enabled"];
  var repeaters = {};
  var busy = false; // true while the panel is being filled from the box

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function inputs(k) { return panel.querySelectorAll('[name="ch_' + k + '"]'); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  // ------------------------------------------------------------ values
  function getValue(k) {
    if (repeaters[k]) return repeaters[k].serialize();
    var els = inputs(k);
    if (!els.length) return DEF[k];
    var f = els[0];
    if (f.type === "checkbox") return f.checked ? "true" : "false";
    if (f.type === "radio") { for (var i = 0; i < els.length; i++) if (els[i].checked) return els[i].value; return DEF[k]; }
    return f.value;
  }
  function setValue(k, v) {
    v = v == null ? "" : String(v);
    if (repeaters[k]) { repeaters[k].load(v); return; }
    var els = inputs(k);
    for (var i = 0; i < els.length; i++) {
      var f = els[i];
      if (f.type === "checkbox") f.checked = v === "true";
      else if (f.type === "radio") f.checked = f.value === v;
      else f.value = v;
    }
    var pk = panel.querySelector('[data-color-for="ch_' + k + '"]');
    if (pk) syncPicker(k, pk);
  }
  function syncPicker(k, picker) {
    var v = String(getValue(k)).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
    else if (/^#[0-9a-fA-F]{3}$/.test(v)) picker.value = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  }
  function updateCounts() {
    Array.prototype.forEach.call(panel.querySelectorAll("[data-count-for]"), function (n) {
      var f = panel.querySelector('[name="' + n.getAttribute("data-count-for") + '"]');
      if (f) n.textContent = f.maxLength > 0 ? f.value.length + " / " + f.maxLength : "";
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-output-for]"), function (n) {
      var f = panel.querySelector('[name="' + n.getAttribute("data-output-for") + '"]');
      if (f) n.textContent = f.value + (n.getAttribute("data-unit") || "%");
    });
  }

  // ------------------------------------------------------------ the settings box
  function parseBox() {
    var t = area.value.trim();
    if (!t) return {};
    try { var o = JSON.parse(t); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch (e) { return null; }
  }
  function isAdvanced(o) {
    // button_text already existed in the original hero, so it does not count
    return o.design === "advanced" || KEYS.some(function (k) { return k !== "button_text" && has(o, k); });
  }
  function fromBox() {
    var o = parseBox();
    busy = true;
    if (o === null) { design.checked = false; busy = false; syncVisibility(); return; }
    var adv = isAdvanced(o);
    KEYS.forEach(function (k) {
      var v;
      if (has(o, k)) v = o[k];
      else Object.keys(LEGACY).forEach(function (old) { if (LEGACY[old] === k && has(o, old)) v = o[old]; });
      if (v == null) v = DEF[k];
      else if (typeof v === "object") v = JSON.stringify(v);
      setValue(k, v);
    });
    design.checked = adv;
    busy = false;
    updateCounts();
    syncVisibility();
  }
  function toBox() {
    if (busy) return;
    var o = parseBox();
    if (o === null) { setNote("The Settings box does not hold valid JSON. Fix it or clear it, then use the options."); return; }
    if (!design.checked) {
      // the original hero keeps its own button_text
      KEYS.forEach(function (k) { if (k !== "button_text") delete o[k]; });
      delete o.design;
    } else {
      o.design = "advanced";
      Object.keys(LEGACY).forEach(function (old) { delete o[old]; });
      KEYS.forEach(function (k) {
        var v = getValue(k);
        if (v === DEF[k]) { delete o[k]; return; }
        if (BOOLS.indexOf(k) !== -1) o[k] = v === "true";
        else if (k === "slides" || k === "cards") { try { o[k] = JSON.parse(v); } catch (e) { delete o[k]; } }
        else if (k === "overlay_opacity" || k === "media_interval") o[k] = Number(v);
        else o[k] = v;
      });
    }
    area.value = Object.keys(o).length ? JSON.stringify(o) : "";
  }

  function isHero() { return typeSel && typeSel.value === "hero"; }
  function syncVisibility() {
    panel.hidden = !isHero();
    body.hidden = !design.checked;
    if (!panel.hidden && design.checked) schedulePreview();
  }
  function setNote(t) { if (note) note.textContent = t; }

  // ------------------------------------------------------------ slide and picture lists
  function validLink(v) { return /^(\/(?!\/)|https?:\/\/[^\s/])/.test(v) && !/[\s"'<>\\]/.test(v); }
  function parseVideo(value) {
    var raw = String(value || "").trim();
    if (!raw || raw.length > 300 || /[\s"'<>\\]/.test(raw)) return null;
    var u; try { u = new URL(raw); } catch (e) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    var host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
    var parts = u.pathname.split("/").filter(Boolean);
    if (host === "youtu.be") return /^[A-Za-z0-9_-]{11}$/.test(parts[0] || "");
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      var id = "";
      if (parts[0] === "watch") id = u.searchParams.get("v") || "";
      else if (["embed", "shorts", "live", "v"].indexOf(parts[0]) !== -1) id = parts[1] || "";
      return /^[A-Za-z0-9_-]{11}$/.test(id);
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      var segs = host === "player.vimeo.com" ? (parts[0] === "video" ? parts.slice(1) : []) : parts;
      return segs.some(function (s) { return /^\d{5,12}$/.test(s); });
    }
    return false;
  }
  var VIDEO_RE = /\.(mp4|webm|ogv|ogg|m4v)(\?[^\s]*)?$/i;
  var KINDS = {
    slide: { fields: ["type", "src", "poster", "alt", "link", "play"], blank: { type: "image", src: "", poster: "", alt: "", link: "", play: "popup" }, noun: "slide" },
    card: { fields: ["src", "alt", "link", "caption"], blank: { src: "", alt: "", link: "", caption: "" }, noun: "picture" }
  };
  function pickMedia(kind, done) {
    var p = window.MediaPicker;
    var fn = p && (kind === "video" ? p.openVideoPicker : p.openImagePicker);
    if (!fn) { window.alert("The Media library is not available on this page. Paste the address instead."); return; }
    fn.call(p, function (m) { if (m) done(m); }, kind === "video" ? "videos" : "banners");
  }

  function initRepeater(host) {
    var key = host.getAttribute("data-repeat").replace(/^ch_/, "");
    var kind = KINDS[host.getAttribute("data-kind")];
    var max = parseInt(host.getAttribute("data-max"), 10) || 4;
    var items = [];
    var list = el("div", "hh-rows");
    var bar = el("div", "hh-addbar");
    var addMain = el("button", "hh-btn", "+ Add picture"); addMain.type = "button";
    var addVideo = null;
    bar.appendChild(addMain);
    if (kind === KINDS.slide) { addVideo = el("button", "hh-btn", "+ Add video"); addVideo.type = "button"; bar.appendChild(addVideo); }
    var count = el("span", "hh-hint");
    bar.appendChild(count);
    host.appendChild(list); host.appendChild(bar);

    function clean(item) {
      var o = {};
      kind.fields.forEach(function (f) { o[f] = String(item[f] == null ? "" : item[f]).trim(); });
      if (o.type !== undefined) {
        o.type = o.type === "video" || o.type === "embed" ? o.type : "image";
        if (o.type === "image") o.poster = "";
        if (o.type === "embed") { o.play = o.play === "background" ? "background" : "popup"; if (o.play === "popup") o.link = ""; }
        else delete o.play;
      }
      return o;
    }
    function filled() { return items.map(clean).filter(function (i) { return i.src; }).slice(0, max); }
    function changed() { toBox(); validate(); schedulePreview(); }
    function labelled(text, control, wide) {
      var w = el("div", "hh-mini" + (wide ? " hh-mini--wide" : ""));
      w.appendChild(el("label", null, text)); w.appendChild(control); return w;
    }
    function textInput(item, k, ph, mx) {
      var i = el("input"); i.type = "text"; i.value = item[k] || ""; i.placeholder = ph; i.maxLength = mx || 500; i.autocomplete = "off";
      i.addEventListener("input", function () { item[k] = i.value; changed(); thumbsUpdate(); });
      return i;
    }
    var thumbs = [];
    function thumbsUpdate() {
      thumbs.forEach(function (t) {
        var it = t.item, url = it.type === "video" || it.type === "embed" ? it.poster : it.src;
        t.node.textContent = ""; t.node.style.backgroundImage = "";
        if (url && /^(https?:\/\/|\/(?!\/))/i.test(url.trim()) && !/["'()\\\s]/.test(url.trim())) t.node.style.backgroundImage = 'url("' + url.trim() + '")';
        else t.node.textContent = it.type === "video" || it.type === "embed" ? "Video" : "No picture";
      });
    }
    function render() {
      list.textContent = ""; thumbs = [];
      items.forEach(function (item, index) {
        var row = el("div", "hh-row");
        var thumb = el("div", "hh-row__thumb"); thumbs.push({ item: item, node: thumb }); row.appendChild(thumb);
        var fields = el("div", "hh-row__fields");
        if (kind === KINDS.slide) {
          var type = el("select");
          [["image", "Picture"], ["video", "Video file"], ["embed", "YouTube / Vimeo"]].forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; type.appendChild(op); });
          type.value = item.type === "video" || item.type === "embed" ? item.type : "image";
          type.addEventListener("change", function () { item.type = type.value; render(); changed(); });
          fields.appendChild(labelled("Type", type));
        }
        var isEmbed = item.type === "embed";
        var sw = el("div", "hh-srcrow");
        sw.appendChild(textInput(item, "src", isEmbed ? "https://www.youtube.com/watch?v=..." : item.type === "video" ? "/media/videos/clip.mp4" : "/media/banners/hero.jpg", 500));
        if (!isEmbed) {
          var choose = el("button", "hh-btn", "Choose from Media"); choose.type = "button";
          choose.addEventListener("click", function () {
            pickMedia(item.type === "video" ? "video" : "image", function (m) { item.src = m.url || m.public_url || ""; if (!item.alt && m.alt_text) item.alt = m.alt_text; render(); changed(); });
          });
          sw.appendChild(choose);
        }
        fields.appendChild(labelled(isEmbed ? "YouTube or Vimeo link" : item.type === "video" ? "Video file (.mp4 or .webm)" : "Picture address", sw, true));
        if (isEmbed) {
          var play = el("select");
          [["popup", "Opens in a pop-up when clicked"], ["background", "Plays silently behind the text"]].forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; play.appendChild(op); });
          play.value = item.play === "background" ? "background" : "popup";
          play.addEventListener("change", function () { item.play = play.value; render(); changed(); });
          fields.appendChild(labelled("How it plays", play, true));
        }
        if (item.type === "video" || isEmbed) {
          var pw = el("div", "hh-srcrow");
          pw.appendChild(textInput(item, "poster", "/media/banners/poster.jpg", 500));
          var pc = el("button", "hh-btn", "Choose"); pc.type = "button";
          pc.addEventListener("click", function () { pickMedia("image", function (m) { item.poster = m.url || ""; render(); changed(); }); });
          pw.appendChild(pc);
          fields.appendChild(labelled(isEmbed ? "Poster picture (shown before the video plays)" : "Poster picture (recommended)", pw, true));
        }
        fields.appendChild(labelled("Description (alt text)", textInput(item, "alt", "What the picture shows", 140)));
        if (kind === KINDS.card) fields.appendChild(labelled("Caption (optional)", textInput(item, "caption", "Short caption", 60)));
        if (!(isEmbed && item.play !== "background")) fields.appendChild(labelled("Link when clicked (optional)", textInput(item, "link", "/en/casino", 300), kind === KINDS.slide));
        var err = el("p", "hh-error"); err.hidden = true; err.setAttribute("data-row-error", ""); fields.appendChild(err);
        row.appendChild(fields);
        var actions = el("div", "hh-row__actions");
        function act(label, title, fn, disabled) {
          var b = el("button", "hh-btn", label); b.type = "button"; b.title = title; b.setAttribute("aria-label", title); b.disabled = Boolean(disabled);
          b.addEventListener("click", fn); actions.appendChild(b);
        }
        act("↑", "Move up", function () { items.splice(index - 1, 0, items.splice(index, 1)[0]); render(); changed(); }, index === 0);
        act("↓", "Move down", function () { items.splice(index + 1, 0, items.splice(index, 1)[0]); render(); changed(); }, index === items.length - 1);
        act("Remove", "Remove this " + kind.noun, function () { items.splice(index, 1); render(); changed(); });
        row.appendChild(actions);
        list.appendChild(row);
      });
      thumbsUpdate();
      addMain.disabled = items.length >= max;
      if (addVideo) addVideo.disabled = items.length >= max;
      count.textContent = items.length + " of " + max;
    }
    addMain.addEventListener("click", function () { items.push(clean(kind.blank)); render(); changed(); });
    if (addVideo) addVideo.addEventListener("click", function () { var b = clean(kind.blank); b.type = "video"; items.push(b); render(); changed(); });

    function validate() {
      var ok = true;
      var errs = list.querySelectorAll("[data-row-error]");
      items.forEach(function (item, i) {
        var msg = "", src = String(item.src || "").trim();
        if (src && item.type === "embed" && !parseVideo(src)) msg = "Use a YouTube or Vimeo video link (a channel or playlist page will not work).";
        else if (src && item.type !== "embed" && !validLink(src)) msg = "The address must start with / or https://";
        else if (src && item.type === "video" && !VIDEO_RE.test(src)) msg = "Use a video file ending in .mp4 or .webm (not a web page).";
        else if (item.poster && !validLink(String(item.poster).trim())) msg = "The poster address must start with / or https://";
        else if (item.link && !validLink(String(item.link).trim())) msg = "The link must start with / or https://";
        else if (!src && (item.alt || item.link)) msg = "Add a picture or video address, or remove this row.";
        if (errs[i]) { errs[i].textContent = msg; errs[i].hidden = !msg; }
        if (msg) ok = false;
      });
      return ok;
    }
    repeaters[key] = {
      serialize: function () { return JSON.stringify(filled()); },
      validate: validate,
      load: function (value) {
        var parsed = [];
        try { parsed = JSON.parse(value || "[]"); } catch (e) { parsed = []; }
        items = (Array.isArray(parsed) ? parsed : []).slice(0, max).map(function (x) {
          var o = {};
          kind.fields.forEach(function (f) { o[f] = x && x[f] != null ? String(x[f]) : ""; });
          if (o.type !== undefined && o.type !== "video" && o.type !== "embed") o.type = "image";
          return o;
        });
        render();
      }
    };
    repeaters[key].load("[]");
  }
  Array.prototype.forEach.call(panel.querySelectorAll("[data-repeat]"), initRepeater);
  function validateAll() {
    var ok = true;
    Object.keys(repeaters).forEach(function (k) { if (!repeaters[k].validate()) ok = false; });
    return ok;
  }

  // ------------------------------------------------------------ preview (built by the server, so it is exact)
  var timer = null, ticket = 0;
  function schedulePreview() {
    if (!frame || panel.hidden || !design.checked) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(preview, 500);
  }
  function wrapDoc(html) {
    var css = ["main", "responsive", "supportive", "header-hero"].map(function (n) { return '<link rel="stylesheet" href="' + location.origin + "/static/css/" + n + '.css">'; }).join("");
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">' + css +
      '<style>body{margin:0}</style></head><body>' + html + '<script src="' + location.origin + '/static/js/hero-media.js"><\/script></body></html>';
  }
  function preview() {
    var mine = ++ticket;
    fetch("/en/api/v1/component/hero-preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: titleEl.value, content: contentEl.value, settings_json: area.value })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (mine !== ticket) return;
      if (d && d.success) { frame.srcdoc = wrapDoc(d.html); setNote("The preview uses the site styles; a YouTube or Vimeo player is only shown on the live page."); }
      else setNote((d && d.error) || "The preview could not be built.");
    }).catch(function () { if (mine === ticket) setNote("The preview could not be loaded."); });
  }
  Array.prototype.forEach.call(panel.querySelectorAll('[name="ch_device"]'), function (r) {
    r.addEventListener("change", function () {
      var phone = panel.querySelector('[name="ch_device"]:checked').value === "mobile";
      frame.style.width = phone ? "390px" : "100%";
      frame.style.height = phone ? "620px" : "460px";
    });
  });

  // ------------------------------------------------------------ events
  panel.addEventListener("input", function (e) {
    if (busy || (e.target.name || "").indexOf("ch_") !== 0) return;
    if (e.target.getAttribute("data-color-for") === null) {
      var pk = panel.querySelector('[data-color-for="' + e.target.name + '"]');
      if (pk) syncPicker(e.target.name.slice(3), pk);
    }
    updateCounts(); toBox(); schedulePreview();
  });
  panel.addEventListener("change", function (e) {
    if (busy) return;
    if (e.target === design) { syncVisibility(); toBox(); return; }
    var name = e.target.getAttribute("data-color-for");
    if (name) { var f = panel.querySelector('[name="' + name + '"]'); f.value = e.target.value; }
    updateCounts(); toBox(); schedulePreview();
  });
  panel.addEventListener("click", function (e) {
    var clear = e.target.closest && e.target.closest("[data-color-clear]");
    if (clear) {
      var k = clear.getAttribute("data-color-clear").slice(3);
      setValue(k, ""); toBox(); schedulePreview(); return;
    }
    var pick = e.target.closest && e.target.closest("[data-ch-pick]");
    if (pick) {
      var key = pick.getAttribute("data-ch-pick").slice(3);
      pickMedia("image", function (m) { setValue(key, m.url || m.public_url || ""); updateCounts(); toBox(); schedulePreview(); });
    }
  });
  area.addEventListener("input", function () { fromBox(); schedulePreview(); });
  [titleEl, contentEl].forEach(function (n) { n.addEventListener("input", schedulePreview); });
  if (typeSel) typeSel.addEventListener("change", function () {
    if (isHero() && !area.value.trim()) { design.checked = true; busy = false; toBox(); }
    syncVisibility();
  });
  // the component list loads a component into the form, and a saved form is reset
  form.addEventListener("component:loaded", function () { fromBox(); });
  form.addEventListener("reset", function () { window.setTimeout(function () { fromBox(); }, 0); });
  // do not save a hero whose slides or pictures have a mistake
  form.addEventListener("submit", function (e) {
    if (!isHero() || !design.checked) return;
    if (!validateAll()) {
      e.preventDefault(); e.stopImmediatePropagation();
      var a = document.getElementById("componentFormAlert");
      if (a) { a.className = "alert alert--error"; a.textContent = "Please fix the highlighted slide or picture addresses in the hero options."; a.style.display = "block"; }
    }
  }, true);

  updateCounts();
  fromBox();
})();
