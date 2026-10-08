// Dashboard > Header & Hero
// Loads the saved settings, keeps a live preview in step with the form, offers
// one-click starting styles and saves the changed values through the existing
// settings endpoints. It builds the preview with DOM calls only (no innerHTML)
// and sends nothing but this page's own settings.
(function () {
  "use strict";

  var form = document.getElementById("hhForm");
  if (!form) return;

  var statusEl = document.getElementById("hhStatus");
  var saveBtn = document.getElementById("hhSave");
  var discardBtn = document.getElementById("hhDiscard");
  var resetBtn = document.getElementById("hhReset");
  var previewEl = document.getElementById("hhPreview");

  var DEFAULTS = {};
  try { DEFAULTS = JSON.parse(document.getElementById("hhDefaults").textContent) || {}; } catch (e) { DEFAULTS = {}; }
  var KEYS = Object.keys(DEFAULTS);

  var saved = {};
  var mobilePreview = false;
  var loaded = false;

  // ------------------------------------------------------------ field access
  function inputsFor(name) { return form.querySelectorAll('[name="' + name + '"]'); }

  var repeaters = {};

  function getValue(name) {
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

  function setValue(name, value) {
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

  function snapshot() {
    var out = {};
    KEYS.forEach(function (k) { out[k] = String(getValue(k)); });
    return out;
  }

  function applyAll(values) { KEYS.forEach(function (k) { setValue(k, values[k] != null ? values[k] : DEFAULTS[k]); }); }

  // ------------------------------------------------------------ validation (the server checks again)
  var LINK_FIELDS = ["site_announce_url", "site_header_cta_url", "site_hero_button_url", "site_hero_button2_url", "site_hero_image"];
  var COLOR_FIELDS = ["theme_header_background", "site_header_text_color", "site_hero_bg_color", "site_hero_text_color", "site_hero_title_color"];
  var FONTS = {
    "default": "",
    system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    modern: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
    rounded: "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Quicksand, 'Trebuchet MS', sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    elegant: "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', Georgia, serif",
    display: "Impact, 'Arial Narrow Bold', 'Haettenschweiler', 'Franklin Gothic Medium', sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
  };

  function validLink(v) {
    if (!v) return true;
    if (/[\s"'<>\\]/.test(v)) return false;
    return /^\/(?!\/)/.test(v) || /^#[\w-]*$/.test(v) || /^https?:\/\/[^\s/]+/i.test(v) || /^mailto:\S+$/i.test(v) || /^tel:[+\d][\d\s().-]*$/i.test(v);
  }
  function validColor(v) {
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
  function validate() {
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
  function syncPicker(name, picker) {
    var v = String(getValue(name)).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
    else if (/^#[0-9a-fA-F]{3}$/.test(v)) picker.value = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  }
  function updateCounts() {
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
  function parseVideo(value) {
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
  var VIDEO_RE = /\.(mp4|webm|ogv|ogg|m4v)(\?[^\s]*)?$/i;
  var KINDS = {
    slide: { fields: ["type", "src", "poster", "alt", "link", "play"], blank: { type: "image", src: "", poster: "", alt: "", link: "", play: "popup" }, noun: "slide" },
    card: { fields: ["src", "alt", "link", "caption"], blank: { src: "", alt: "", link: "", caption: "" }, noun: "picture" }
  };

  function pickMedia(kind, done) {
    var picker = window.MediaPicker;
    var fn = picker && (kind === "video" ? picker.openVideoPicker : picker.openImagePicker);
    if (!fn) { window.alert("The Media library is not available on this page. Paste the address instead."); return; }
    fn.call(picker, function (media) { if (media) done(media); }, kind === "video" ? "videos" : "banners");
  }

  function initRepeater(host) {
    var name = host.getAttribute("data-repeat");
    var kind = KINDS[host.getAttribute("data-kind")];
    var max = parseInt(host.getAttribute("data-max"), 10) || 4;
    var items = [];
    var list = el("div", "hh-rows");
    var addBar = el("div", "hh-addbar");
    var addMain = el("button", "hh-btn", "+ Add " + (kind === KINDS.slide ? "picture" : "picture"));
    addMain.type = "button";
    var addVideo = null;
    addBar.appendChild(addMain);
    if (kind === KINDS.slide) {
      addVideo = el("button", "hh-btn", "+ Add video");
      addVideo.type = "button";
      addBar.appendChild(addVideo);
    }
    var count = el("span", "hh-hint");
    addBar.appendChild(count);
    host.appendChild(list);
    host.appendChild(addBar);

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
    function changed() { updateCounts(); validate(); refresh(); }

    function labelled(text, control, wide) {
      var wrap = el("div", "hh-mini" + (wide ? " hh-mini--wide" : ""));
      wrap.appendChild(el("label", null, text));
      wrap.appendChild(control);
      return wrap;
    }
    function textInput(item, key, placeholder, max2) {
      var input = el("input");
      input.type = "text"; input.value = item[key] || ""; input.placeholder = placeholder; input.maxLength = max2 || 500; input.autocomplete = "off";
      input.addEventListener("input", function () { item[key] = input.value; changed(); updateThumbs(); });
      return input;
    }

    var thumbs = [];
    function updateThumbs() {
      thumbs.forEach(function (t) {
        var it = t.item, url = it.type === "video" || it.type === "embed" ? it.poster : it.src;
        t.node.textContent = "";
        t.node.style.backgroundImage = "";
        if (url && /^(https?:\/\/|\/(?!\/))/i.test(url.trim()) && !/["'()\\\s]/.test(url.trim())) t.node.style.backgroundImage = 'url("' + url.trim() + '")';
        else t.node.textContent = it.type === "video" || it.type === "embed" ? "Video" : "No picture";
      });
    }

    function render() {
      list.textContent = "";
      thumbs = [];
      items.forEach(function (item, index) {
        var row = el("div", "hh-row");
        var thumb = el("div", "hh-row__thumb");
        thumbs.push({ item: item, node: thumb });
        row.appendChild(thumb);
        var fields = el("div", "hh-row__fields");

        if (kind === KINDS.slide) {
          var type = el("select");
          [["image", "Picture"], ["video", "Video file"], ["embed", "YouTube / Vimeo"]].forEach(function (o) {
            var opt = el("option", null, o[1]); opt.value = o[0]; type.appendChild(opt);
          });
          type.value = item.type === "video" || item.type === "embed" ? item.type : "image";
          type.addEventListener("change", function () { item.type = type.value; render(); changed(); });
          fields.appendChild(labelled("Type", type));
        }

        var isEmbed = item.type === "embed";
        var srcWrap = el("div", "hh-srcrow");
        var src = textInput(item, "src", isEmbed ? "https://www.youtube.com/watch?v=..." : item.type === "video" ? "/media/videos/clip.mp4" : "/media/banners/hero.jpg", 500);
        var choose = el("button", "hh-btn", "Choose from Media");
        choose.type = "button";
        choose.addEventListener("click", function () {
          pickMedia(item.type === "video" ? "video" : "image", function (m) {
            item.src = m.url || m.public_url || "";
            if (!item.alt && m.alt_text) item.alt = m.alt_text;
            render(); changed();
          });
        });
        srcWrap.appendChild(src);
        if (!isEmbed) srcWrap.appendChild(choose);
        fields.appendChild(labelled(isEmbed ? "YouTube or Vimeo link" : item.type === "video" ? "Video file (.mp4 or .webm)" : "Picture address", srcWrap, true));

        if (isEmbed) {
          var play = el("select");
          [["popup", "Opens in a pop-up when clicked"], ["background", "Plays silently behind the text"]].forEach(function (o) {
            var opt = el("option", null, o[1]); opt.value = o[0]; play.appendChild(opt);
          });
          play.value = item.play === "background" ? "background" : "popup";
          play.addEventListener("change", function () { item.play = play.value; render(); changed(); });
          fields.appendChild(labelled("How it plays", play, true));
        }

        if (item.type === "video" || isEmbed) {
          var posterWrap = el("div", "hh-srcrow");
          posterWrap.appendChild(textInput(item, "poster", "/media/banners/poster.jpg", 500));
          var pc = el("button", "hh-btn", "Choose");
          pc.type = "button";
          pc.addEventListener("click", function () { pickMedia("image", function (m) { item.poster = m.url || ""; render(); changed(); }); });
          posterWrap.appendChild(pc);
          fields.appendChild(labelled(isEmbed ? "Poster picture (shown before the video plays)" : "Poster picture (recommended)", posterWrap, true));
        }
        fields.appendChild(labelled("Description (alt text)", textInput(item, "alt", "What the picture shows", 140)));
        if (kind === KINDS.card) fields.appendChild(labelled("Caption (optional)", textInput(item, "caption", "Short caption", 60)));
        if (!(isEmbed && item.play !== "background")) fields.appendChild(labelled("Link when clicked (optional)", textInput(item, "link", "/en/casino", 300), kind === KINDS.slide));
        var err = el("p", "hh-error"); err.hidden = true; err.setAttribute("data-row-error", "");
        fields.appendChild(err);
        row.appendChild(fields);

        var actions = el("div", "hh-row__actions");
        function act(label, title, fn, disabled) {
          var b = el("button", "hh-btn", label);
          b.type = "button"; b.title = title; b.setAttribute("aria-label", title); b.disabled = Boolean(disabled);
          b.addEventListener("click", fn);
          actions.appendChild(b);
        }
        act("\u2191", "Move up", function () { items.splice(index - 1, 0, items.splice(index, 1)[0]); render(); changed(); }, index === 0);
        act("\u2193", "Move down", function () { items.splice(index + 1, 0, items.splice(index, 1)[0]); render(); changed(); }, index === items.length - 1);
        act("Remove", "Remove this " + kind.noun, function () { items.splice(index, 1); render(); changed(); });
        row.appendChild(actions);
        list.appendChild(row);
      });
      updateThumbs();
      addMain.disabled = items.length >= max;
      if (addVideo) addVideo.disabled = items.length >= max;
      count.textContent = items.length + " of " + max;
    }

    addMain.addEventListener("click", function () { items.push(clean(kind.blank)); render(); changed(); });
    if (addVideo) addVideo.addEventListener("click", function () { var b = clean(kind.blank); b.type = "video"; items.push(b); render(); changed(); });

    repeaters[name] = {
      serialize: function () { return JSON.stringify(filled()); },
      load: function (value) {
        var parsed = [];
        try { parsed = JSON.parse(value || "[]"); } catch (e) { parsed = []; }
        items = (Array.isArray(parsed) ? parsed : []).slice(0, max).map(function (x) {
          var o = {};
          kind.fields.forEach(function (f) { o[f] = x && x[f] != null ? String(x[f]) : ""; });
          if (o.type !== undefined && o.type !== "video") o.type = "image";
          return o;
        });
        render();
      },
      validate: function () {
        var ok = true;
        var errs = list.querySelectorAll("[data-row-error]");
        items.forEach(function (item, i) {
          var msg = "";
          var src = String(item.src || "").trim();
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
    };
    repeaters[name].load("[]");
  }

  Array.prototype.forEach.call(form.querySelectorAll("[data-repeat]"), initRepeater);

  // ------------------------------------------------------------ preview
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function isOn(v) { return v === "true"; }
  function pick(v, allowed, fallback) { return allowed.indexOf(v) !== -1 ? v : fallback; }
  function linesOf(text, max) {
    return String(text || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, max);
  }
  function withCount(text) { return String(text || "").split("{{casino_count}}").join("250"); }

  // The preview is a sandboxed frame that loads this site's own stylesheets, so its media
  // queries behave exactly as on a visitor's screen. It is laid out at a real width (960px,
  // or 390px for a phone) and scaled down to fit its box.
  var frameReady = false;
  function frameDoc() { return previewEl && previewEl.contentDocument; }

  function prepareFrame() {
    var doc = frameDoc();
    if (!doc || !doc.head || !doc.body) return;
    Array.prototype.forEach.call(document.head.querySelectorAll('link[rel="stylesheet"], style#tenant-theme'), function (node) {
      doc.head.appendChild(doc.importNode(node, true));
    });
    var meta = doc.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1";
    doc.head.appendChild(meta);
    frameReady = true;
    renderPreview();
    Array.prototype.forEach.call(doc.head.querySelectorAll('link[rel="stylesheet"]'), function (link) {
      link.addEventListener("load", fitPreview);
    });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitPreview);
  }

  function fitPreview() {
    var doc = frameDoc();
    if (!doc || !doc.body) return;
    var width = mobilePreview ? 390 : 960;
    var stage = previewEl.parentElement;
    var available = stage.clientWidth - 28;
    var scale = available > 0 ? Math.min(1, available / width) : 1;
    previewEl.style.width = width + "px";
    previewEl.style.height = "100px";
    var contentHeight = Math.ceil(doc.body.getBoundingClientRect().height) || 100;
    previewEl.style.height = contentHeight + "px";
    previewEl.style.transform = "scale(" + scale + ")";
    previewEl.style.left = Math.max(14, Math.round((stage.clientWidth - width * scale) / 2)) + "px";
    stage.style.height = Math.ceil(contentHeight * scale) + 28 + "px";
  }

  function setOptionalVar(node, name, value) {
    if (value) node.style.setProperty(name, value);
    else node.style.removeProperty(name);
  }

  // The preview shows the first slide, the controls and the picture motion; the live site also slides on its own.
  function previewMedia(v, slides) {
    var wrap = el("div", "hero-media hero-media--" + pick(v.site_hero_media_transition, ["fade", "slide"], "fade") +
      " hero-media--motion-" + pick(v.site_hero_media_motion, ["none", "zoom", "pan"], "zoom"));
    var first = slides[0];
    var slide = el("div", "hero-slide is-active");
    slide.setAttribute("data-type", first.type);
    var img;
    if (first.type === "embed" && !first.poster) {
      slide.style.background = "#0b0b10";
    } else if (first.type === "video" && !first.poster) {
      var vid = el("video");
      vid.muted = true; vid.preload = "metadata";
      vid.src = first.src;
      slide.appendChild(vid);
    } else {
      img = el("img");
      img.src = first.type === "video" || first.type === "embed" ? first.poster : first.src;
      img.alt = "";
      slide.appendChild(img);
    }
    wrap.appendChild(slide);
    return wrap;
  }
  function previewControls(v, slides) {
    var ui = el("div", "hero-media__ui");
    if (slides[0].type === "embed" && slides[0].play !== "background") ui.appendChild(el("span", "hero-watch", "\u25B6 " + (slides[0].alt || "Watch video")));
    if (isOn(v.site_hero_media_arrows)) {
      ui.appendChild(el("span", "hero-media__nav hero-media__prev", "\u2039"));
      ui.appendChild(el("span", "hero-media__nav hero-media__next", "\u203A"));
    }
    if (isOn(v.site_hero_media_dots)) {
      var dots = el("div", "hero-media__dots");
      slides.forEach(function (s, i) { var d = el("button"); if (i === 0) d.setAttribute("aria-current", "true"); dots.appendChild(d); });
      ui.appendChild(dots);
    }
    return ui;
  }
  function previewCards(v, cards) {
    var wrap = el("div", "hero-cards hero-cards--" + pick(v.site_hero_cards_size, ["sm", "md", "lg"], "md") + " hero-cards--n" + cards.length);
    cards.forEach(function (c) {
      var fig = el("figure", "hero-card" + (c.link ? " hero-card--link" : ""));
      var img = el("img");
      img.src = c.src; img.alt = "";
      fig.appendChild(img);
      if (c.caption) fig.appendChild(el("figcaption", null, c.caption));
      wrap.appendChild(fig);
    });
    return wrap;
  }

  function renderPreview() {
    if (!previewEl || !loaded || !frameReady) return;
    var doc = frameDoc();
    var body = doc && doc.body;
    if (!body) return;
    var v = snapshot();
    var heights = { compact: 56, "default": 68, tall: 84 };
    var logos = { sm: 32, md: 40, lg: 52 };
    var headerStyle = pick(v.theme_header_style, ["default", "solid", "glass", "transparent"], "default");
    var heightKey = pick(v.site_header_height, ["compact", "default", "tall"], "default");
    var logoKey = pick(v.site_header_logo_size, ["sm", "md", "lg"], "md");
    var logoMode = pick(v.site_header_logo_mode, ["both", "logo", "text"], "both");
    var navAlign = pick(v.site_header_nav_align, ["left", "center", "right"], "left");

    body.className = "hh-preview-body hh-static hh-height-" + heightKey + " hh-style-" + headerStyle + " hh-logo-" + logoMode +
      " hh-logo-size-" + logoKey + " hh-nav-" + navAlign +
      (validColor(v.site_header_text_color) && v.site_header_text_color ? " hh-hfg" : "") +
      (FONTS[v.site_header_font] ? " hh-hfont" : "");
    setOptionalVar(body, "--hh-header-fg", validColor(v.site_header_text_color) ? v.site_header_text_color : "");
    setOptionalVar(body, "--hh-hero-fg", validColor(v.site_hero_text_color) ? v.site_hero_text_color : "");
    setOptionalVar(body, "--hh-hero-title", validColor(v.site_hero_title_color) ? v.site_hero_title_color : "");
    setOptionalVar(body, "--hh-header-font", FONTS[v.site_header_font] || "");
    setOptionalVar(body, "--hh-hero-heading-font", FONTS[v.site_hero_heading_font] || "");
    setOptionalVar(body, "--hh-hero-body-font", FONTS[v.site_hero_body_font] || "");
    body.style.setProperty("--hh-header-h", heights[heightKey] + "px");
    body.style.setProperty("--hh-logo", logos[logoKey] + "px");
    body.style.setProperty("--hh-hero-overlay", String(Math.min(85, Math.max(0, Number(v.site_hero_overlay_opacity) || 0)) / 100));
    if (validColor(v.theme_header_background) && v.theme_header_background) body.style.setProperty("--hh-header-bg", v.theme_header_background);
    else body.style.removeProperty("--hh-header-bg");
    if (validColor(v.site_hero_bg_color) && v.site_hero_bg_color) body.style.setProperty("--hh-hero-bg", v.site_hero_bg_color);
    else body.style.removeProperty("--hh-hero-bg");

    while (body.firstChild) body.removeChild(body.firstChild);
    var root = body;

    // announcement bar
    if (isOn(v.site_announce_enabled) && v.site_announce_text.trim()) {
      var bar = el("div", "hh-announce hh-announce--" + pick(v.site_announce_tone, ["info", "promo", "success", "warning"], "info"));
      var inner = el("div", "hh-announce__inner");
      var p = el("p", "hh-announce__text", v.site_announce_text.trim());
      if (v.site_announce_link_text.trim() && v.site_announce_url.trim()) {
        p.appendChild(document.createTextNode(" "));
        p.appendChild(el("a", "hh-announce__link", v.site_announce_link_text.trim()));
      }
      inner.appendChild(p);
      if (isOn(v.site_announce_dismissible)) inner.appendChild(el("span", "hh-announce__close", "×"));
      bar.appendChild(inner);
      root.appendChild(bar);
    }

    // header
    var header = el("header", "site-header");
    var headerInner = el("div", "container header-inner");
    var logo = el("span", "logo");
    var logoUrl = previewEl.getAttribute("data-logo");
    var name = previewEl.getAttribute("data-site-name") || "Your site";
    if (logoUrl) {
      var img = el("img", "logo-icon");
      img.src = logoUrl;
      img.alt = "";
      logo.appendChild(img);
    }
    logo.appendChild(el("span", "logo-text", name));
    headerInner.appendChild(logo);

    var nav = el("nav", "main-nav");
    var source = document.getElementById("hhNavSource");
    if (source && source.content) nav.appendChild(source.content.cloneNode(true));
    if (!nav.textContent.trim()) ["Casinos", "Reviews", "News"].forEach(function (t) { nav.appendChild(el("a", null, t)); });
    headerInner.appendChild(nav);

    var actions = el("div", "header-actions");
    if (isOn(v.site_header_show_search)) {
      var box = el("div", "search-box");
      var input = el("input");
      input.type = "text";
      input.placeholder = v.site_header_search_placeholder || "Search";
      input.disabled = true;
      box.appendChild(input);
      actions.appendChild(box);
    }
    if (isOn(v.site_header_cta_enabled) && v.site_header_cta_text.trim() && v.site_header_cta_url.trim()) {
      actions.appendChild(el("span", "btn header-cta " + (v.site_header_cta_style === "outline" ? "btn--outline" : "btn--primary"), v.site_header_cta_text.trim()));
    }
    if (isOn(v.site_header_show_auth)) actions.appendChild(el("span", "btn btn--ghost", v.site_header_login_label.trim() || "Login"));
    actions.appendChild(el("span", "nav-toggle", "☰"));
    headerInner.appendChild(actions);
    header.appendChild(headerInner);
    root.appendChild(header);

    // hero
    if (isOn(v.site_hero_enabled)) {
      var hasImage = Boolean(v.site_hero_image.trim()) && validLink(v.site_hero_image.trim());
      var heroClass = "hero hero--h-" + pick(v.site_hero_height, ["compact", "standard", "tall", "screen"], "standard") +
        " hero--text-" + pick(v.site_hero_text_theme, ["light", "dark"], "light") +
        " hero--focus-" + pick(v.site_hero_image_focus, ["center", "top", "bottom"], "center") +
        (hasImage ? " hero--image" : " hero--bg-" + pick(v.site_hero_bg_mode, ["default", "brand", "solid"], "default")) +
        (validColor(v.site_hero_text_color) && v.site_hero_text_color ? " hero--custom-fg" : "") +
        (validColor(v.site_hero_title_color) && v.site_hero_title_color ? " hero--custom-title" : "") +
        (FONTS[v.site_hero_heading_font] ? " hero--font-heading" : "") +
        (FONTS[v.site_hero_body_font] ? " hero--font-body" : "");
      var slidesOk = [];
      var cardsOk = [];
      try { slidesOk = JSON.parse(v.site_hero_slides || "[]"); } catch (e) { slidesOk = []; }
      try { cardsOk = JSON.parse(v.site_hero_cards || "[]"); } catch (e) { cardsOk = []; }
      var showMedia = isOn(v.site_hero_media_enabled) && slidesOk.length > 0;
      var showCards = isOn(v.site_hero_cards_enabled) && cardsOk.length > 0;
      var cardsSide = showCards && v.site_hero_cards_position === "side";
      if (showMedia) heroClass += " hero--has-media" + (slidesOk.length > 1 && isOn(v.site_hero_media_arrows) ? " hero--arrows" : "");
      if (cardsSide) heroClass += " hero--cards-side";
      var hero = el("section", heroClass);
      if (showMedia) hero.appendChild(previewMedia(v, slidesOk));
      if (hasImage && /^(https?:\/\/|\/(?!\/))/i.test(v.site_hero_image.trim())) {
        hero.style.backgroundImage = 'url("' + encodeURI(v.site_hero_image.trim()).replace(/"/g, "%22") + '")';
      }
      if (isOn(v.site_hero_overlay) && Number(v.site_hero_overlay_opacity) > 0) {
        hero.appendChild(el("div", "hero-overlay"));
      }
      var container = el("div", "container");
      var content = el("div", "hero-content hero-content--" + pick(v.site_hero_alignment, ["left", "center", "right"], "center"));
      var badge = v.site_hero_badge.trim() || DEFAULTS.site_hero_badge;
      if (isOn(v.site_hero_badge_enabled) && badge) content.appendChild(el("div", "hero-badge", badge));
      content.appendChild(el("h1", null, v.site_hero_title.trim() || DEFAULTS.site_hero_title));
      content.appendChild(el("p", "hero-subtitle", withCount(v.site_hero_subtitle.trim() || DEFAULTS.site_hero_subtitle)));
      if (v.site_hero_description.trim()) content.appendChild(el("p", "hero-description", v.site_hero_description.trim()));
      var chips = linesOf(v.site_hero_highlights, 4);
      if (chips.length) {
        var ul = el("ul", "hero-highlights");
        chips.forEach(function (t) { ul.appendChild(el("li", null, t)); });
        content.appendChild(ul);
      }
      var acts = el("div", "hero-actions");
      var btn1 = v.site_hero_button_text.trim() || DEFAULTS.site_hero_button_text;
      if (isOn(v.site_hero_button_enabled) && btn1) acts.appendChild(el("span", "btn btn--primary btn--lg", btn1));
      if (v.site_hero_button2_text.trim() && v.site_hero_button2_url.trim()) acts.appendChild(el("span", "btn btn--ghost btn--lg", v.site_hero_button2_text.trim()));
      if (isOn(v.site_hero_watch_enabled) && parseVideo(v.site_hero_watch_url.trim())) acts.appendChild(el("span", "btn btn--ghost btn--lg", "\u25B6 " + (v.site_hero_watch_text.trim() || DEFAULTS.site_hero_watch_text)));
      if (acts.children.length) content.appendChild(acts);
      if (showCards && !cardsSide) content.appendChild(previewCards(v, cardsOk));
      container.appendChild(content);
      if (cardsSide) { container.className = "container hero-grid"; container.appendChild(previewCards(v, cardsOk)); }
      hero.appendChild(container);
      if (showMedia && (slidesOk.length > 1 || (slidesOk[0].type === "embed" && slidesOk[0].play !== "background"))) hero.appendChild(previewControls(v, slidesOk));
      root.appendChild(hero);
    } else {
      var off = el("div", "hh-preview-off", "The homepage hero is switched off.");
      root.appendChild(off);
    }
    fitPreview();
  }

  // ------------------------------------------------------------ status / dirty tracking
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "hh-status" + (kind ? " is-" + kind : "");
  }
  function isDirty() {
    var now = snapshot();
    return KEYS.some(function (k) { return now[k] !== saved[k]; });
  }
  function refresh() {
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
  function applyPreset(key) {
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
  function load() {
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

  function save() {
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
    r.addEventListener("change", function () { mobilePreview = r.value === "mobile" && r.checked; fitPreview(); });
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
})();
