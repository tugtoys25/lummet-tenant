// Component Studio: the "Content grid" type form.

import { RESEARCH_TYPES, SOURCES, el, st } from "/static/js/component-studio/context.js";
import { commit, field, group, linkIn, numIn, picksIn, segIn, selectIn, switchIn, textIn } from "/static/js/component-studio/widgets.js";
import { builders } from "/static/js/component-studio/forms.js";

// ---- content grid
function gridForm(root) {
  var d = { mode: "picked", columns: 3, limit: 6, style: "card", ratio: "wide", latest_source: "news", latest_sort: "newest" };
  Object.keys(d).forEach(function (k) { if (st.S[k] == null) st.S[k] = d[k]; });
  var src = group("What to show", "Pick items, or use the newest automatically", true); root.appendChild(src);
  var pickedBox = el("div"); var latestBox = el("div");
  function sync() { pickedBox.hidden = st.S.mode !== "picked"; latestBox.hidden = st.S.mode !== "latest"; }
  src.body.appendChild(field("Fill the grid", null, segIn(st.S, "mode", [["picked", "Items I pick"], ["latest", "Newest automatically"]], "picked", sync), true));
  pickedBox.appendChild(field("Items (casinos, news, research, authors, updates, pictures and more)", "You can mix kinds. Reorder with the arrows.", picksIn(st.S, "items", { max: 24 }), true));
  latestBox.appendChild(field("Show the newest", null, (function () {
    var s = el("select"); SOURCES.filter(function (x) { return x[0] !== "media" && x[0] !== "author"; }).concat([["author", "Authors"]]).forEach(function (p) { var op = el("option", null, p[1]); op.value = p[0]; s.appendChild(op); });
    s.value = st.S.latest_source; s.addEventListener("change", function () { st.S.latest_source = s.value; st.S.latest_type = ""; commit(); typeRow(); }); return s;
  })()));
  var typeHost = el("div");
  function typeRow() {
    typeHost.textContent = "";
    if (st.S.latest_source === "research") typeHost.appendChild(field("Research type (optional)", null, selectIn(st.S, "latest_type", [["", "All types"]].concat(RESEARCH_TYPES.map(function (t) { return [t, t.charAt(0).toUpperCase() + t.slice(1)]; })), "")));
    else if (st.S.latest_source === "custom") typeHost.appendChild(field("Content type", "The short name used in its address.", textIn(st.S, "latest_type", "guides", 60)));
  }
  typeRow(); latestBox.appendChild(typeHost);
  latestBox.appendChild(field("Order", null, selectIn(st.S, "latest_sort", [["newest", "Newest first"], ["rating", "Best rating first"], ["name", "A to Z"]], "newest")));
  latestBox.appendChild(field("How many", null, numIn(st.S, "limit", 1, 24, 6)));
  src.body.appendChild(pickedBox); src.body.appendChild(latestBox); sync();

  var lay = group("Layout", "Columns, card style, picture shape"); root.appendChild(lay);
  lay.body.appendChild(field("Columns (wide screens)", null, segIn(st.S, "columns", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]], "3", null)));
  // numeric values for the seg
  lay.body.lastChild.querySelectorAll("input").forEach(function (i) { i.addEventListener("change", function () { st.S.columns = parseInt(i.value, 10); commit(); }); });
  lay.body.appendChild(field("Card style", null, segIn(st.S, "style", [["card", "Card"], ["compact", "Compact"], ["list", "List"], ["overlay", "Picture overlay"]], "card")));
  lay.body.appendChild(field("Picture shape", null, segIn(st.S, "ratio", [["wide", "Wide"], ["standard", "Standard"], ["square", "Square"], ["auto", "Natural"]], "wide")));
  lay.body.appendChild(field("Text alignment", null, segIn(st.S, "align", [["left", "Left"], ["center", "Centre"]], "left")));
  lay.body.appendChild(field("Background", null, segIn(st.S, "bg", [["none", "None"], ["soft", "Soft"], ["dark", "Dark"]], "none")));

  var show = group("What each card shows", "Picture, rating, bonus, button…"); root.appendChild(show);
  [["show_image", "Picture", true], ["show_badge", "Badge (e.g. category)", true], ["show_rating", "Star rating", true], ["show_bonus", "Bonus line (casinos)", true], ["show_excerpt", "Short description", true], ["show_date", "Date", false], ["show_button", "Button", true]].forEach(function (s) { show.body.appendChild(field(null, null, switchIn(st.S, s[0], s[1], s[2]))); });
  show.body.appendChild(field("Button text (optional)", "Leave empty for “Read review”, “Read more”…", textIn(st.S, "button_text", "Read more", 30)));

  var more = group("Heading and “see all” link", "Optional"); root.appendChild(more);
  more.body.appendChild(field("Intro text under the title", "The title above is the component’s Title.", textIn(st.S, "intro", "A short line", 300, "textarea"), true));
  more.body.appendChild(field("“See all” text", null, textIn(st.S, "more_text", "See all casinos", 40)));
  more.body.appendChild(field("“See all” link", null, linkIn(st.S, "more_url")));
}

builders.content_grid = gridForm;
