  "use strict";
  var root = document.getElementById("asRoot");
  if (!root) return;
  var API = "/api/v1/ai-studio/";
  var S = { meta: null, task: null, group: null, item: null, items: [], research: null, result: null, edit: null, busy: false };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") n.className = attrs[k]; else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function api(path, body) {
    var opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch(API + path, opt).then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); })
      .catch(function () { return { error: "Network problem. Try again.", _status: 0 }; });
  }
  function say(kind, msg) {
    var b = root.querySelector(".as-alert");
    if (!b) { b = el("div", { class: "as-alert alert", role: "status" }); root.insertBefore(b, root.firstChild); }
    b.className = "as-alert alert alert--" + kind; b.textContent = msg; b.style.display = "block";
    window.scrollTo({ top: root.offsetTop, behavior: "smooth" });
  }
  var $ = function (id) { return document.getElementById(id); };
  var GROUPS = ["Content", "Research", "News", "Language", "SEO"];
  var NEEDS_TEXT = { translate: "Text or HTML to translate", rewrite: "Text to improve", summarize: "Text to summarise", headlines: "Article or summary", social_posts: "Article or summary", suggest_tags: "Article text", seo_pack: "Page text",
    research_draft: "Notes and pasted source text (optional)", research_claims: "Text to take claims from", research_factcheck: "The draft to check", research_brief: "Text to summarise", news_article: "Notes or source text (optional)" };
  var NEEDS_TOPIC = { research_draft: "Topic", news_article: "Story brief", seo_pack: "Page title (optional)" };
  var NEEDS_URLS = { research_draft: 1, research_claims: 1, research_factcheck: 1, research_brief: 1, news_article: 1 };

  function taskInfo(id) { return (S.meta.tasks || []).filter(function (t) { return t.id === id; })[0]; }

  function labelled(label, ctl, hint) { return el("label", { class: "as-field" }, [el("span", { class: "as-label", text: label }), ctl, hint ? el("small", { class: "muted", text: hint }) : null]); }

  // ---------- item picker ----------
  function picker(multi, onPick, types) {
    var wrap = el("div", { class: "as-picker" });
    var type = el("select", { class: "gm-select", "aria-label": "Type" });
    types.forEach(function (t) { type.appendChild(el("option", { value: t[0], text: t[1] })); });
    var q = el("input", { class: "gm-input", type: "search", placeholder: "Search by name", "aria-label": "Search" });
    var list = el("select", { class: "gm-select", "aria-label": "Results" });
    var timer;
    function load() {
      api("items?type=" + encodeURIComponent(type.value) + "&q=" + encodeURIComponent(q.value)).then(function (d) {
        list.textContent = "";
        // nothing is chosen until the editor chooses it, so a save can never land on an item they did not pick
        list.appendChild(el("option", { value: "", text: (d.items || []).length ? "Choose..." : (d.error || "Nothing found") }));
        (d.items || []).forEach(function (it) { list.appendChild(el("option", { value: it.key, text: it.name })); });
      });
    }
    type.addEventListener("change", load);
    q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 250); });
    list.addEventListener("change", function () { if (!multi && list.value) onPick({ type: type.value, key: list.value, name: list.options[list.selectedIndex].text }); });
    wrap.appendChild(type); wrap.appendChild(q); wrap.appendChild(list);
    if (multi) wrap.appendChild(el("button", { type: "button", class: "btn btn--small", text: "Add", onclick: function () { if (list.value) onPick({ type: type.value, key: list.value, name: list.options[list.selectedIndex].text }); } }));
    load();
    return wrap;
  }
  var ITEM_TYPES = [["casino", "Casino"], ["sportsbook", "Sportsbook"], ["affiliate_partner", "Affiliate partner"], ["custom", "Custom content"]];

