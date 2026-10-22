// Component Studio: the builder table and the simple type forms (text, call to action, banner, FAQ, author, limit forms).

import { btn, contentEl, el, isObj, parseObj, st } from "/static/js/component-studio/context.js";
import { field, group, imageIn, linkIn, numIn, openPicker, repeaterIn, richIn, setContent, textIn } from "/static/js/component-studio/widgets.js";

// ---- forms
// ------------------------------------------------------------ type forms
export var builders = {};

builders.text = function (root) {
  var g = group("Text", "Write it like a document", true); root.appendChild(g);
  g.body.appendChild(field(null, "Bold, lists, links and headings. “Edit as HTML” is for developers.", richIn(function () { return contentEl.value; }, function (h) { setContent(h); }), true));
};

builders.cta = function (root) {
  var g = group("Call to action", "Text and button", true); root.appendChild(g);
  var c = { v: contentEl.value };
  g.body.appendChild(field("Text", null, (function () { var t = el("textarea"); t.rows = 3; t.value = contentEl.value; t.addEventListener("input", function () { setContent(t.value); }); return t; })(), true));
  g.body.appendChild(field("Button text", null, textIn(st.S, "button_text", "Click here", 40)));
  g.body.appendChild(field("Button link", null, linkIn(st.S, "link")));
};

builders.banner = function (root) { builders.cta(root); root.firstChild.querySelector("summary").firstChild.nodeValue = "Banner"; };

builders.faq_group = function (root) {
  var g = group("Questions and answers", "Add as many as you need", true); root.appendChild(g);
  var box = { items: [] };
  try { var v = JSON.parse(contentEl.value || "[]"); if (Array.isArray(v)) box.items = v.filter(isObj).map(function (r) { var o2 = {}; Object.keys(r).forEach(function (k2) { o2[k2] = r[k2]; }); return o2; }); } catch (e) { box.items = []; }
  var origBlank = contentEl.value && !box.items.length && contentEl.value.trim() !== "[]";
  if (origBlank) g.body.appendChild(el("p", "hh-hint", "The existing content is not a list of questions, so it is left as it is until you add a question here."));
  var rep = repeaterIn(box, "items", [{ k: "q", label: "Question", max: 300 }, { k: "a", label: "Answer", type: "area", max: 2000 }], 40, "+ Add question", { q: "", a: "" }, function (r, i) { return r.q || "Question " + (i + 1); });
  // write on every change
  var write = function () { setContent(JSON.stringify(box.items.filter(function (r) { return r.q || r.a; }))); };
  rep.addEventListener("input", write); rep.addEventListener("click", function () { setTimeout(write, 0); });
  g.body.appendChild(rep);
};

builders.author = function (root) {
  var g = group("Author", "Pick an author or fill in the details", true); root.appendChild(g);
  var a = parseObj(contentEl.value);
  function write() { setContent(JSON.stringify(a)); }
  var pick = btn("Pick an existing author", "hh-btn", function () {
    openPicker({ sources: [["author", "Authors"]] }, function (p) {
      var c = p.card || {};
      a.name = c.title || a.name || ""; if (c.excerpt) a.bio = c.excerpt; if (c.image) a.avatar = c.image;
      write(); g.body.textContent = ""; fill(); return true;
    });
  });
  function fill() {
    g.body.appendChild(pick);
    var wrapper = { get name() { return a.name; } };
    g.body.appendChild(field("Name", null, (function () { var i = textIn(a, "name", "Full name", 120); i.addEventListener("input", write); return i; })()));
    g.body.appendChild(field("Role / title", null, (function () { var i = textIn(a, "title", "Founder", 120); i.addEventListener("input", write); return i; })()));
    g.body.appendChild(field("Short bio", null, (function () { var i = textIn(a, "bio", "A few sentences", 600, "textarea"); i.addEventListener("input", write); return i; })(), true));
    var img = imageIn(a, "avatar", "Choose a photo"); img.addEventListener("input", write); img.addEventListener("click", function () { setTimeout(write, 0); });
    g.body.appendChild(field("Photo", null, img, true));
  }
  fill();
};

function limitForm(label, hint) {
  return function (root) {
    var g = group(label, "How many to show", true); root.appendChild(g);
    g.body.appendChild(field("Number to show", hint, numIn(st.S, "limit", 1, 50, 6)));
    g.body.appendChild(el("p", "hh-hint", "What is shown is chosen automatically by the site. For a hand-picked list, use the “Content grid” type."));
  };
}

builders.casino_grid = limitForm("Casino grid", "The best-rated casinos, newest first on ties.");

builders.comparison_table = limitForm("Comparison table", "Rows in the table.");

builders.news_feed = limitForm("News feed", "The newest articles.");
