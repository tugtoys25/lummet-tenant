import { DEFAULTS, previewEl } from "/static/js/header-hero-admin/state.js";
import { snapshot } from "/static/js/header-hero-admin/fields.js";
import { FONTS, parseVideo, validColor, validLink } from "/static/js/header-hero-admin/validate.js";
import { loaded } from "/static/js/header-hero-admin/actions.js";

var mobilePreview = false;

export function setMobilePreview(value) { mobilePreview = value; }

// ------------------------------------------------------------ preview
export function el(tag, className, text) {
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

export function prepareFrame() {
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

export function fitPreview() {
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

export function renderPreview() {
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
