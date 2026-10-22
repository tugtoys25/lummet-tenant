// Component Studio: the "Section" type form and its content blocks.

import { btn, el, st } from "/static/js/component-studio/context.js";
import { colorIn, commit, field, group, imageIn, linkIn, rangeIn, repeaterIn, richIn, segIn, switchIn, textIn } from "/static/js/component-studio/widgets.js";
import { builders } from "/static/js/component-studio/forms.js";

// ---- section
var BLOCKS = [["heading", "Heading"], ["text", "Text"], ["image", "Picture"], ["button", "Button"], ["list", "List"], ["video", "Video"], ["features", "Feature cards"], ["stats", "Numbers"], ["spacer", "Space"], ["divider", "Line"]];

var BLANK = {
  heading: { type: "heading", text: "", level: "h2", col: 1 }, text: { type: "text", html: "", col: 1 }, image: { type: "image", src: "", alt: "", link: "", size: "full", rounded: true, caption: "", col: 1 },
  button: { type: "button", text: "", link: "", style: "primary", new_tab: false, col: 1 }, list: { type: "list", items: [{ t: "" }], style: "check", col: 1 },
  video: { type: "video", url: "", poster: "", text: "Watch video", col: 1 }, features: { type: "features", items: [{ icon: "", title: "", text: "" }], col: 1 },
  stats: { type: "stats", items: [{ value: "", label: "" }], col: 1 }, spacer: { type: "spacer", size: "md", col: 1 }, divider: { type: "divider", col: 1 }
};

function sectionForm(root) {
  var d = { bg: "none", pad: "md", width: "normal", align: "left", cols: 1, gap: "md", valign: "top", overlay: 45 };
  Object.keys(d).forEach(function (k) { if (st.S[k] == null) st.S[k] = d[k]; });
  if (!Array.isArray(st.S.blocks)) st.S.blocks = [];
  var look = group("Look of the section", "Background, spacing, width"); root.appendChild(look);
  var colorBox = el("div"), imgBox = el("div");
  function sync() { colorBox.hidden = st.S.bg !== "color"; imgBox.hidden = st.S.bg !== "image"; }
  look.body.appendChild(field("Background", null, segIn(st.S, "bg", [["none", "None"], ["soft", "Soft grey"], ["dark", "Dark"], ["brand", "Brand colour"], ["color", "My colour"], ["image", "Picture"]], "none", sync), true));
  colorBox.appendChild(field("Background colour", null, colorIn(st.S, "bg_color")));
  imgBox.appendChild(field("Background picture", null, imageIn(st.S, "bg_image"), true));
  imgBox.appendChild(field("Darkening over the picture", null, rangeIn(st.S, "overlay", 0, 85, 5, 45, "%")));
  look.body.appendChild(colorBox); look.body.appendChild(imgBox); sync();
  look.body.appendChild(field("Text colour (optional)", "Leave on Default for automatic.", colorIn(st.S, "text_color")));
  look.body.appendChild(field("Space above and below", null, segIn(st.S, "pad", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"], ["xl", "Extra large"]], "md")));
  look.body.appendChild(field("Content width", null, segIn(st.S, "width", [["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"], ["full", "Full"]], "normal")));
  look.body.appendChild(field("Text alignment", null, segIn(st.S, "align", [["left", "Left"], ["center", "Centre"], ["right", "Right"]], "left")));
  look.body.appendChild(field(null, null, switchIn(st.S, "rounded", "Rounded corners", false)));
  look.body.appendChild(field("Anchor name (optional)", "Lets a link jump here, e.g. “bonuses” → /en/page#bonuses.", textIn(st.S, "anchor", "bonuses", 40)));

  var lay = group("Columns", "Put content side by side"); root.appendChild(lay);
  lay.body.appendChild(field("Columns", null, segIn(st.S, "cols", [["1", "1"], ["2", "2"], ["3", "3"]], "1", function () { rebuildBlocks(); })));
  lay.body.lastChild.querySelectorAll("input").forEach(function (i) { i.addEventListener("change", function () { st.S.cols = parseInt(i.value, 10); commit(); rebuildBlocks(); }); });
  lay.body.appendChild(field("Gap between columns", null, segIn(st.S, "gap", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]], "md")));
  lay.body.appendChild(field("Vertical alignment", null, segIn(st.S, "valign", [["top", "Top"], ["center", "Centre"]], "top")));

  var bl = group("Content blocks", "Build the section from blocks", true); root.appendChild(bl);
  var host = el("div", "cs-blocks"); bl.body.appendChild(host);
  var bar = el("div", "cs-blockbar"); bar.appendChild(el("span", "hh-label", "Add a block:"));
  BLOCKS.forEach(function (b) { bar.appendChild(btn("+ " + b[1], "hh-btn", function () { if (st.S.blocks.length >= 30) return; var nb = JSON.parse(JSON.stringify(BLANK[b[0]])); st.S.blocks.push(nb); commit(); rebuildBlocks(); })); });
  bl.body.appendChild(bar);
  function rebuildBlocks() {
    host.textContent = "";
    if (!st.S.blocks.length) host.appendChild(el("p", "hh-hint", "No blocks yet. Add a heading, text, picture, button…"));
    st.S.blocks.forEach(function (b, i) {
      var card = el("details", "cs-block"); card.open = true;
      var sm = el("summary"); sm.appendChild(el("strong", null, (BLOCKS.filter(function (x) { return x[0] === b.type; })[0] || [0, b.type])[1]));
      var prev = b.text || b.url || (b.html ? b.html.replace(/<[^>]*>/g, " ").trim().slice(0, 40) : "") || ""; if (prev) sm.appendChild(el("span", "hh-sub", String(prev).slice(0, 40)));
      card.appendChild(sm);
      var acts = el("div", "cs-pick__acts");
      if (st.S.cols > 1) { var cs = el("select"); cs.setAttribute("aria-label", "Column"); for (var c = 1; c <= st.S.cols; c++) { var op = el("option", null, "Column " + c); op.value = c; cs.appendChild(op); } cs.value = Math.min(b.col || 1, st.S.cols); cs.addEventListener("change", function () { b.col = parseInt(cs.value, 10); commit(); }); acts.appendChild(cs); }
      var up = btn("↑", "hh-btn", function () { var t = st.S.blocks[i]; st.S.blocks[i] = st.S.blocks[i - 1]; st.S.blocks[i - 1] = t; commit(); rebuildBlocks(); }); up.disabled = i === 0; up.setAttribute("aria-label", "Move up");
      var dn = btn("↓", "hh-btn", function () { var t = st.S.blocks[i]; st.S.blocks[i] = st.S.blocks[i + 1]; st.S.blocks[i + 1] = t; commit(); rebuildBlocks(); }); dn.disabled = i === st.S.blocks.length - 1; dn.setAttribute("aria-label", "Move down");
      var rm = btn("Remove", "hh-btn", function () { st.S.blocks.splice(i, 1); commit(); rebuildBlocks(); });
      acts.appendChild(up); acts.appendChild(dn); acts.appendChild(rm); card.appendChild(acts);
      var inner = el("div", "cs-block__body"); blockFields(inner, b); card.appendChild(inner); host.appendChild(card);
    });
  }
  rebuildBlocksRef = rebuildBlocks;
  rebuildBlocks();
}

var rebuildBlocksRef = null;

function blockFields(root, b) {
  switch (b.type) {
    case "heading":
      root.appendChild(field("Heading", null, textIn(b, "text", "Heading", 160)));
      root.appendChild(field("Size", null, segIn(b, "level", [["h2", "Large"], ["h3", "Medium"], ["h4", "Small"]], "h2"))); break;
    case "text":
      root.appendChild(field(null, null, richIn(function () { return b.html || ""; }, function (h) { b.html = h; commit(); }), true)); break;
    case "image":
      root.appendChild(field("Picture", null, imageIn(b, "src"), true));
      root.appendChild(field("Description for screen readers", null, textIn(b, "alt", "What the picture shows", 140)));
      root.appendChild(field("Caption", null, textIn(b, "caption", "Optional", 120)));
      root.appendChild(field("Link (optional)", null, linkIn(b, "link")));
      root.appendChild(field("Size", null, segIn(b, "size", [["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["full", "Full width"]], "full")));
      root.appendChild(field(null, null, switchIn(b, "rounded", "Rounded corners", true))); break;
    case "button":
      root.appendChild(field("Button text", null, textIn(b, "text", "Play now", 40)));
      root.appendChild(field("Link", null, linkIn(b, "link")));
      root.appendChild(field("Style", null, segIn(b, "style", [["primary", "Solid"], ["ghost", "Outline"]], "primary")));
      root.appendChild(field(null, null, switchIn(b, "new_tab", "Open in a new tab", false))); break;
    case "list":
      root.appendChild(field("Style", null, segIn(b, "style", [["check", "Ticks"], ["bullet", "Bullets"], ["number", "Numbers"]], "check")));
      root.appendChild(field("Items", null, repeaterIn(b, "items", [{ k: "t", label: "Text", max: 200 }], 12, "+ Add item", { t: "" }, function (r) { return r.t; }), true)); break;
    case "video":
      root.appendChild(field("YouTube or Vimeo link", "Opens in a pop-up. Nothing loads from those sites until it is clicked.", textIn(b, "url", "https://www.youtube.com/watch?v=…", 300), true));
      root.appendChild(field("Cover picture (optional)", null, imageIn(b, "poster"), true));
      root.appendChild(field("Button text", null, textIn(b, "text", "Watch video", 40))); break;
    case "features":
      root.appendChild(field("Cards (up to 8)", null, repeaterIn(b, "items", [{ k: "icon", label: "Icon (an emoji)", max: 8 }, { k: "title", label: "Title", max: 80 }, { k: "text", label: "Text", type: "area", max: 240 }], 8, "+ Add card", { icon: "", title: "", text: "" }, function (r) { return r.title; }), true)); break;
    case "stats":
      root.appendChild(field("Numbers (up to 6)", null, repeaterIn(b, "items", [{ k: "value", label: "Number or value", ph: "250+", max: 20 }, { k: "label", label: "Label", ph: "Casinos reviewed", max: 60 }], 6, "+ Add number", { value: "", label: "" }, function (r) { return r.value; }), true)); break;
    case "spacer":
      root.appendChild(field("Size", null, segIn(b, "size", [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]], "md"))); break;
    default: root.appendChild(el("p", "hh-hint", "No options."));
  }
}

builders.section = sectionForm;
