import { form } from "/static/js/header-hero-admin/state.js";
import { repeaters } from "/static/js/header-hero-admin/fields.js";
import { VIDEO_RE, parseVideo, updateCounts, validLink, validate } from "/static/js/header-hero-admin/validate.js";
import { el } from "/static/js/header-hero-admin/preview.js";
import { refresh } from "/static/js/header-hero-admin/actions.js";

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

if (form) Array.prototype.forEach.call(form.querySelectorAll("[data-repeat]"), initRepeater);
