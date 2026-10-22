// AI Studio (admin). Picks a tool, collects what it needs, shows the result for editing, and saves drafts only.
// All text goes in with textContent, never as HTML.
(function () {
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

  // ---------- screens ----------
  function render() {
    root.textContent = "";
    var tabs = el("nav", { class: "rv-tabs gm-subnav", "aria-label": "AI Studio" }, [
      el("button", { type: "button", class: "rv-tab" + (S.view !== "audit" ? " is-on" : ""), text: "Tools", onclick: function () { S.view = "tools"; render(); } }),
      el("button", { type: "button", class: "rv-tab" + (S.view === "audit" ? " is-on" : ""), text: "Content audit", onclick: function () { S.view = "audit"; render(); } }),
      el("button", { type: "button", class: "rv-tab" + (S.view === "history" ? " is-on" : ""), text: "History", onclick: function () { S.view = "history"; render(); } }),
      S.meta.feedback ? el("button", { type: "button", class: "rv-tab" + (S.view === "feedback" ? " is-on" : ""), text: "Chat feedback", onclick: function () { S.view = "feedback"; render(); } }) : null,
      S.meta.feedback ? el("button", { type: "button", class: "rv-tab" + (S.view === "gaps" ? " is-on" : ""), text: "Content gaps", onclick: function () { S.view = "gaps"; render(); } }) : null,
      S.meta.feedback ? el("button", { type: "button", class: "rv-tab" + (S.view === "rules" ? " is-on" : ""), text: "Chat settings", onclick: function () { S.view = "rules"; render(); } }) : null
    ]);
    root.appendChild(tabs);
    if (!S.meta.available) root.appendChild(el("div", { class: "alert alert--warning", text: "The AI service is not connected on this site, so tools cannot generate text. The content audit still works." }));
    if (S.view === "audit") return renderAudit();
    if (S.view === "history") return renderHistory();
    if (S.view === "feedback" && S.meta.feedback) return renderFeedback();
    if (S.view === "gaps" && S.meta.feedback) return renderGaps();
    if (S.view === "rules" && S.meta.feedback) return renderRules();
    renderTools();
  }

  function renderTools() {
    var groups = GROUPS.filter(function (g) { return (S.meta.tasks || []).some(function (t) { return t.group === g; }); });
    if (!S.group) S.group = groups[0];
    root.appendChild(el("div", { class: "as-groups" }, groups.map(function (g) {
      return el("button", { type: "button", class: "as-chip" + (g === S.group ? " is-on" : ""), text: g, onclick: function () { S.group = g; S.task = null; S.result = null; render(); } });
    })));
    var cards = el("div", { class: "as-cards" });
    (S.meta.tasks || []).filter(function (t) { return t.group === S.group; }).forEach(function (t) {
      cards.appendChild(el("button", { type: "button", class: "as-card" + (S.task === t.id ? " is-on" : ""), onclick: function () { S.task = t.id; S.result = null; S.item = null; S.items = []; S.research = null; render(); } }, [
        el("strong", { text: t.label }), el("span", { class: "muted", text: t.help })
      ]));
    });
    root.appendChild(cards);
    if (!S.task) { root.appendChild(el("p", { class: "muted", text: "Pick a tool above." })); return; }
    root.appendChild(renderForm(taskInfo(S.task)));
    if (S.result) root.appendChild(renderResult());
  }

  function renderForm(t) {
    var f = el("div", { class: "gm-card as-form" }, [el("h3", { text: t.label }), el("p", { class: "muted", text: t.help })]);
    if (t.needs.indexOf("item") >= 0) {
      f.appendChild(labelled("Item", picker(false, function (it) { S.item = it; var s = $("asPicked"); if (s) s.textContent = "Selected: " + it.name; }, ITEM_TYPES)));
      f.appendChild(el("div", { id: "asPicked", class: "muted", text: S.item ? "Selected: " + S.item.name : "" }));
    }
    if (t.needs.indexOf("items") >= 0) {
      f.appendChild(labelled("Items to compare (2 to 4)", picker(true, function (it) {
        if (S.items.length < 4 && !S.items.some(function (x) { return x.key === it.key && x.type === it.type; })) S.items.push(it);
        drawChips();
      }, ITEM_TYPES)));
      f.appendChild(el("div", { id: "asChips", class: "as-chips" })); setTimeout(drawChips, 0);
    }
    if (NEEDS_TOPIC[t.id]) { var topicIn = el("input", { id: "asTopic", class: "gm-input", type: "text", maxlength: "300" }); if (S.prefill && S.prefill.topic) { topicIn.value = String(S.prefill.topic).slice(0, 300); S.prefill = null; } f.appendChild(labelled(NEEDS_TOPIC[t.id], topicIn)); }
    if (t.id === "research_draft") {
      var rt = el("select", { id: "asRType", class: "gm-select" });
      ["report", "country", "regulator", "topic", "development", "legislation", "licence"].forEach(function (x) { rt.appendChild(el("option", { value: x, text: x })); });
      rt.value = "topic";
      f.appendChild(labelled("Research type", rt));
    }
    if (t.id === "research_draft" || t.id === "item_review") f.appendChild(labelled("Country (optional)", el("input", { id: "asCountry", class: "gm-input", type: "text", maxlength: "40", placeholder: "e.g. Kenya" })));
    if (t.id === "translate") f.appendChild(labelled("Language", el("input", { id: "asLang", class: "gm-input", type: "text", maxlength: "40", value: "French" })));
    if (t.id === "rewrite") {
      var m = el("select", { id: "asMode", class: "gm-select" });
      (S.meta.rewrite_modes || []).forEach(function (x) { m.appendChild(el("option", { value: x, text: x })); });
      f.appendChild(labelled("How to improve it", m));
    }
    if (NEEDS_TEXT[t.id]) f.appendChild(labelled(NEEDS_TEXT[t.id], el("textarea", { id: "asText", class: "as-text", rows: "8", maxlength: "12000" })));
    if (NEEDS_URLS[t.id]) f.appendChild(labelled("Web addresses to read (up to 3, one per line)", el("textarea", { id: "asUrls", class: "as-text", rows: "3", placeholder: "https://..." }), "The page text is read by the server, summarised by the AI, and never saved unless you save a draft."));
    if (t.id === "research_factcheck") {
      f.appendChild(labelled("Compare with saved claims of a research item (optional)", picker(false, function (it) { S.research = it; }, [["research", "Research item"]])));
    }
    f.appendChild(el("div", { class: "as-actions" }, [
      el("button", { type: "button", id: "asRun", class: "btn btn--primary", text: S.busy ? "Working..." : "Generate", onclick: run })
    ]));
    return f;
  }
  function drawChips() {
    var box = $("asChips"); if (!box) return; box.textContent = "";
    S.items.forEach(function (it, n) { box.appendChild(el("span", { class: "gm-chip as-chip2" }, [it.name + " ", el("button", { type: "button", "aria-label": "Remove " + it.name, text: "x", onclick: function () { S.items.splice(n, 1); drawChips(); } })])); });
  }
  var val = function (id) { var n = $(id); return n ? n.value : ""; };

  function run() {
    if (S.busy) return;
    var t = taskInfo(S.task), input = {};
    if (t.needs.indexOf("item") >= 0 && !S.item) { say("warning", "Choose an item first."); return; }
    if (t.needs.indexOf("items") >= 0 && S.items.length < 2) { say("warning", "Add at least two items to compare."); return; }
    if (S.item) input.item = { type: S.item.type, key: S.item.key };
    if (S.items.length) input.items = S.items.map(function (x) { return { type: x.type, key: x.key }; });
    input.text = val("asText"); input.topic = val("asTopic"); input.country = val("asCountry");
    if (val("asLang")) input.language = val("asLang"); if (val("asMode")) input.mode = val("asMode"); if (val("asRType")) input.research_type = val("asRType");
    var urls = val("asUrls").split(/\s+/).filter(Boolean); if (urls.length) input.urls = urls.slice(0, 3);
    if (S.research && t.id === "research_factcheck") input.research_item_id = Number(S.research.key);
    S.busy = true; S.result = null; var b = $("asRun"); if (b) { b.textContent = "Working..."; b.disabled = true; }
    api("run", { task: S.task, input: input }).then(function (d) {
      S.busy = false;
      if (d.error || d.success === false) { say("error", d.error || "That did not work."); render(); return; }
      if (!d.generated) { say("warning", d.message || "Nothing was generated."); if (d.source_errors && d.source_errors.length) say("warning", d.message + " " + d.source_errors.map(function (e) { return e.error; }).join(" ")); render(); return; }
      S.result = d; S.edit = JSON.parse(JSON.stringify(d.data || {})); render();
      var r = document.querySelector(".as-result"); if (r) r.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ---------- results ----------
  function field(label, key, multi) {
    var c = multi ? el("textarea", { class: "as-text", rows: "5" }) : el("input", { class: "gm-input", type: "text" });
    c.value = S.edit[key] || ""; c.addEventListener("input", function () { S.edit[key] = c.value; });
    return labelled(label, c);
  }
  function copyBtn(getText) {
    return el("button", { type: "button", class: "btn", text: "Copy", onclick: function () {
      var t = getText();
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { say("success", "Copied."); }, function () { say("warning", "Could not copy. Select the text and copy it."); });
      else say("warning", "Could not copy. Select the text and copy it.");
    } });
  }
  function save(target, payload, okMsg) {
    api("apply", { target: target, payload: payload }).then(function (d) {
      if (d.error || d.success === false) say("error", d.error || "Could not save."); else say("success", okMsg(d));
    });
  }
  function renderResult() {
    var r = S.result, t = S.task;
    var box = el("div", { class: "gm-card as-result" }, [el("h3", { text: "Result" }), el("p", { class: "muted", text: "Review and edit before using it. Nothing has been saved or published." })]);
    if (r.sources && r.sources.length) box.appendChild(el("p", { class: "muted", text: "Read: " + r.sources.map(function (s) { return s.url; }).join(", ") }));
    if (r.source_errors && r.source_errors.length) box.appendChild(el("p", { class: "muted", text: "Could not read: " + r.source_errors.map(function (s) { return s.url + " (" + s.error + ")"; }).join("; ") }));
    var actions = el("div", { class: "as-actions" });
    if (r.kind === "text") {
      var ta = el("textarea", { class: "as-text as-out", rows: "16" }); ta.value = r.text; ta.addEventListener("input", function () { r.text = ta.value; });
      box.appendChild(ta); actions.appendChild(copyBtn(function () { return r.text; }));
    } else if (t === "item_description") {
      ["title", "excerpt", "seo_title", "seo_description", "seo_keywords"].forEach(function (k) { box.appendChild(field(k.replace("_", " "), k, false)); });
      box.appendChild(field("description", "description", true));
      if (S.item) actions.appendChild(el("button", { type: "button", class: "btn btn--primary", text: "Save to " + S.item.name, onclick: function () {
        if (!window.confirm("Fill these fields on " + S.item.name + "? Existing values in them will be replaced. It stays published or unpublished as it is.")) return;
        save("item_fields", { type: S.item.type, key: S.item.key, fields: S.edit }, function (d) { return "Saved " + d.saved + " field(s)."; });
      } }));
      actions.appendChild(copyBtn(function () { return JSON.stringify(S.edit, null, 2); }));
    } else if (t === "item_faqs") {
      (S.edit || []).forEach(function (q) { box.appendChild(el("div", { class: "as-faq" }, [el("strong", { text: q.q }), el("p", { text: q.a })])); });
      actions.appendChild(copyBtn(function () { return S.edit.map(function (q) { return "Q: " + q.q + "\nA: " + q.a; }).join("\n\n"); }));
    } else if (t === "news_article") {
      ["title", "excerpt", "tags", "seo_title", "seo_description"].forEach(function (k) { box.appendChild(field(k.replace("_", " "), k, false)); });
      box.appendChild(field("content", "content", true));
      actions.appendChild(el("button", { type: "button", class: "btn btn--primary", text: "Save as unpublished news draft", onclick: function () { save("news_draft", S.edit, function (d) { return "Saved as a draft: " + d.slug + ". Find it under News."; }); } }));
    } else if (t === "research_draft") {
      ["title", "subtitle", "excerpt", "seo_title", "seo_description"].forEach(function (k) { box.appendChild(field(k.replace("_", " "), k, false)); });
      (S.edit.sections || []).forEach(function (s, n) {
        var h = el("input", { class: "gm-input", type: "text" }); h.value = s.title; h.addEventListener("input", function () { s.title = h.value; });
        var b = el("textarea", { class: "as-text", rows: "6" }); b.value = s.body; b.addEventListener("input", function () { s.body = b.value; });
        box.appendChild(el("div", { class: "as-sec" }, [labelled("Section " + (n + 1) + " heading", h), labelled("Text", b)]));
      });
      actions.appendChild(el("button", { type: "button", class: "btn btn--primary", text: "Save as research draft", onclick: function () {
        var p = JSON.parse(JSON.stringify(S.edit)); p.type = val("asRType") || "topic";
        save("research_draft", p, function (d) { return "Saved as a draft (not published): " + d.slug + ". Find it under Research."; });
      } }));
    } else if (t === "research_claims") {
      var chosen = {}; (S.edit || []).forEach(function (c, n) { chosen[n] = true; });
      (S.edit || []).forEach(function (c, n) {
        var cb = el("input", { type: "checkbox", checked: "checked" }); cb.addEventListener("change", function () { chosen[n] = cb.checked; });
        box.appendChild(el("label", { class: "as-claim" }, [cb, el("span", { text: " [" + c.claim_type + "] " + c.claim_text })]));
      });
      box.appendChild(labelled("Save the ticked claims to this research item", picker(false, function (it) { S.research = it; }, [["research", "Research item"]]), "They are saved as unverified."));
      actions.appendChild(el("button", { type: "button", class: "btn btn--primary", text: "Save ticked claims", onclick: function () {
        if (!S.research) { say("warning", "Pick the research item first."); return; }
        var claims = (S.edit || []).filter(function (c, n) { return chosen[n]; });
        save("research_claims", { research_item_id: Number(S.research.key), claims: claims }, function (d) { return "Saved " + d.saved + " unverified claim(s)."; });
      } }));
    } else if (t === "research_factcheck") {
      box.appendChild(el("p", { class: "gm-badge " + (S.edit.verdict === "ok" ? "gm-badge--ok" : "gm-badge--warn"), text: S.edit.verdict === "ok" ? "No problems found" : "Needs work" }));
      (S.edit.issues || []).forEach(function (i) { box.appendChild(el("div", { class: "as-faq" }, [el("strong", { text: i.statement }), el("p", { text: i.problem + (i.suggestion ? ": " + i.suggestion : "") })])); });
    } else if (t === "research_brief") {
      box.appendChild(el("p", { text: S.edit.summary }));
      box.appendChild(el("strong", { text: "Key points" })); box.appendChild(el("ul", {}, (S.edit.key_points || []).map(function (x) { return el("li", { text: x }); })));
      box.appendChild(el("strong", { text: "Still unanswered" })); box.appendChild(el("ul", {}, (S.edit.open_questions || []).map(function (x) { return el("li", { text: x }); })));
    } else if (t === "social_posts") {
      ["x", "linkedin", "facebook", "telegram"].forEach(function (k) { box.appendChild(field(k, k, true)); });
    } else if (t === "seo_pack") {
      ["seo_title", "seo_description", "seo_keywords"].forEach(function (k) { box.appendChild(field(k.replace("_", " "), k, false)); });
      actions.appendChild(copyBtn(function () { return JSON.stringify(S.edit, null, 2); }));
    } else if (Array.isArray(S.edit)) {
      box.appendChild(el("ul", {}, S.edit.map(function (x) { return el("li", { text: String(x) }); })));
      actions.appendChild(copyBtn(function () { return S.edit.join("\n"); }));
    } else {
      box.appendChild(el("pre", { class: "as-pre", text: JSON.stringify(S.edit, null, 2) }));
    }
    box.appendChild(actions);
    return box;
  }

  // ---------- chat feedback (admins) ----------
  var REASON_LABEL = { wrong: "Incorrect", missing: "Missing info", unclear: "Unclear", other: "Something else" };
  // ---------- chat settings: tone, topics to decline, extra guidance (applies to the widget and the lummet. page) ----------
  function renderRules() {
    var card = el("div", { class: "gm-card" }, [el("h3", { text: "Chat settings" }), el("p", { class: "muted", text: "How Lummet AI should sound and what it should stay away from. This applies to the floating widget and the lummet. page alike, from the next message on. These settings sit below the chat's built-in rules: they cannot make it invent facts or links." })]);
    root.appendChild(card);
    var form = el("div", { class: "as-form" });
    card.appendChild(form);
    form.appendChild(el("p", { class: "muted", text: "Loading..." }));
    api("chat-rules").then(function (d) {
      form.textContent = "";
      if (d.error) { say("error", d.error); return; }
      var tone = el("select", { class: "gm-select", id: "asTone" }, Object.keys(d.tones).map(function (k) { var o = el("option", { value: k, text: d.tones[k] }); if (k === d.rules.tone) o.selected = true; return o; }));
      var decline = el("textarea", { class: "as-text", id: "asDecline", rows: "5", maxlength: String(d.limits.declineLines * (d.limits.declineLen + 1)) });
      decline.value = d.rules.decline.join("\n");
      var notes = el("textarea", { class: "as-text", id: "asNotes", rows: "5", maxlength: String(d.limits.notes) });
      notes.value = d.rules.notes;
      form.appendChild(labelled("Tone", tone));
      form.appendChild(labelled("Topics to politely decline (one per line, up to " + d.limits.declineLines + ")", decline));
      form.appendChild(labelled("Extra guidance (up to " + d.limits.notes + " characters), for example: always mention that we do not accept deposits", notes));
      var save = el("button", { type: "button", class: "btn btn--primary btn--small", text: "Save settings", onclick: function () {
        save.disabled = true;
        api("chat-rules", { tone: tone.value, decline: decline.value, notes: notes.value }).then(function (x) {
          save.disabled = false;
          if (x.error) say("error", x.error); else { say("success", "Saved. It applies from the next chat message."); decline.value = x.rules.decline.join("\n"); notes.value = x.rules.notes; tone.value = x.rules.tone; }
        });
      } });
      var reset = el("button", { type: "button", class: "btn btn--small", text: "Back to defaults", onclick: function () {
        if (!window.confirm("Clear tone, declined topics and extra guidance?")) return;
        api("chat-rules", { tone: "friendly", decline: "", notes: "" }).then(function (x) { if (x.error) say("error", x.error); else { say("success", "Back to defaults."); renderRulesAgain(); } });
      } });
      form.appendChild(el("div", { class: "as-actions" }, [save, reset]));
      var q = el("input", { class: "gm-input", type: "text", id: "asTry", maxlength: "300", placeholder: "For example: Tell me about a casino, or ask about a topic you declined" });
      var out = el("div", { class: "as-faq", hidden: "hidden" });
      var tryBtn = el("button", { type: "button", class: "btn btn--small btn--primary", text: "Ask the chat", onclick: function () {
        var text = q.value.trim(); if (!text) { say("error", "Type a question first."); return; }
        tryBtn.disabled = true; tryBtn.textContent = "Asking...";
        api("chat-rules/preview", { message: text, rules: { tone: tone.value, decline: decline.value, notes: notes.value } }).then(function (x) {
          tryBtn.disabled = false; tryBtn.textContent = "Ask the chat";
          out.textContent = ""; out.hidden = false;
          if (x.error) { out.appendChild(el("p", { text: x.error })); return; }
          out.appendChild(el("strong", { text: "Answer with the settings above (not saved)" }));
          out.appendChild(el("p", { text: x.answer }));
        });
      } });
      form.appendChild(el("h4", { text: "Try it before you save" }));
      form.appendChild(el("p", { class: "muted", text: "Sends your question through the real chat with the settings in the boxes above, even if you have not saved them. Nothing is saved or counted." }));
      form.appendChild(labelled("Question", q)); form.appendChild(el("div", { class: "as-actions" }, [tryBtn])); form.appendChild(out);
    });
  }
  function renderRulesAgain() { render(); }

  // ---------- content gaps: things visitors asked about that the site has nothing on ----------
  function renderGaps() {
    var card = el("div", { class: "gm-card" }, [el("h3", { text: "Content gaps" }), el("p", { class: "muted", text: "Questions that got a thumbs-down where the site has nothing on the topic (checked the same way the chat looks things up). Each one is something worth writing. Drafts are never published automatically." })]);
    var body = el("div", {});
    card.appendChild(body); root.appendChild(card);
    function start(g, task, group) { S.prefill = { topic: g.examples[0].question }; S.view = "tools"; S.group = group; S.task = task; S.result = null; S.item = null; S.items = []; S.research = null; render(); }
    function load() {
      body.textContent = "";
      body.appendChild(el("p", { class: "muted", text: "Checking..." }));
      api("feedback/gaps").then(function (d) {
        body.textContent = "";
        if (d.error) { say("error", d.error); return; }
        if (!d.available) { body.appendChild(el("p", { class: "muted", text: "Chat feedback is not set up on this site yet." })); return; }
        if (!(d.gaps || []).length) { body.appendChild(el("p", { text: "No gaps found. Every topic that got a thumbs-down is already covered on the site." })); return; }
        d.gaps.forEach(function (g) {
          var markBtn = el("button", { type: "button", class: "btn btn--small", text: "Mark as handled", onclick: function () {
            markBtn.disabled = true;
            Promise.all((g.ids || []).map(function (id) { return api("feedback/review", { id: id, reviewed: true }); })).then(function () { say("success", "Marked as handled."); load(); });
          } });
          body.appendChild(el("div", { class: "as-faq" }, [
            el("strong", { text: g.topic + " (" + g.count + " thumbs-down)" }),
            el("ul", {}, g.examples.map(function (e) { return el("li", { text: e.question }); })),
            el("div", { class: "as-actions" }, [
              el("button", { type: "button", class: "btn btn--small btn--primary", text: "Research draft", onclick: function () { start(g, "research_draft", "Research"); } }),
              el("button", { type: "button", class: "btn btn--small", text: "News article draft", onclick: function () { start(g, "news_article", "News"); } }),
              markBtn
            ])
          ]));
        });
      });
    }
    load();
  }

  function renderFeedback() {
    var card = el("div", { class: "gm-card" }, [el("h3", { text: "Lummet AI chat feedback" }), el("p", { class: "muted", text: "Thumbs from visitors on the public chat. Question and answer text is kept only for thumbs-down, for 180 days. Nothing identifying is stored." })]);
    root.appendChild(card);
    var show = el("select", { class: "gm-select", "aria-label": "Show" }, [el("option", { value: "0", text: "Not reviewed yet" }), el("option", { value: "", text: "All thumbs-down" }), el("option", { value: "1", text: "Reviewed" })]);
    var bar = el("div", { class: "gm-toolbar" }, [show]), sum = el("div", { class: "as-chips" }), body = el("div", {});
    var digestBox = el("div", { class: "as-digest" });
    card.appendChild(digestBox); card.appendChild(sum); card.appendChild(bar); card.appendChild(body);
    loadDigest(digestBox);
    function load() {
      body.textContent = ""; sum.textContent = "";
      api("feedback?rating=down&reviewed=" + encodeURIComponent(show.value)).then(function (d) {
        if (d.error) { body.appendChild(el("p", { text: d.error })); return; }
        var m = d.summary || {};
        if (!m.available) { body.appendChild(el("p", { class: "muted", text: "Feedback is not switched on for this site yet. Apply migration 0063_ai_feedback.sql to turn it on." })); return; }
        var total = m.up + m.down, pct = total ? Math.round(m.up * 100 / total) : null;
        [["Last " + m.days + " days", total + " ratings"], ["Helpful", m.up + (pct === null ? "" : " (" + pct + "%)")], ["Not helpful", String(m.down)], ["Waiting for review", String(m.unreviewed_down)]].forEach(function (x) {
          sum.appendChild(el("span", { class: "gm-chip as-chip2" }, [x[0] + ": ", el("strong", { text: x[1] })]));
        });
        (m.reasons || []).forEach(function (r) { sum.appendChild(el("span", { class: "gm-badge gm-badge--warn", text: (REASON_LABEL[r.reason] || r.reason) + " " + r.n })); });
        if (!d.rows.length) { body.appendChild(el("p", { class: "muted", text: "Nothing here." })); return; }
        d.rows.forEach(function (r) {
          var done = !!r.reviewed;
          var btn = el("button", { type: "button", class: "btn btn--small", text: done ? "Mark as not reviewed" : "Mark reviewed", onclick: function () {
            api("feedback/review", { id: r.id, reviewed: !done }).then(function (x) { if (x.error) say("error", x.error); else load(); });
          } });
          var panel = el("div", { class: "as-fix" });
          var fixBtn = r.question ? el("button", { type: "button", class: "btn btn--small btn--primary", text: "Draft a fix", onclick: function () { draftFix(r, panel, fixBtn); } }) : null;
          body.appendChild(el("div", { class: "as-faq" }, [
            el("strong", { text: "Q: " + (r.question || "(not kept)") }),
            el("p", { text: "A: " + (r.answer || "") }),
            el("p", { class: "muted", text: [String(r.created_at || "").slice(0, 16), r.country, r.reason ? (REASON_LABEL[r.reason] || r.reason) : null].filter(Boolean).join(" - ") }),
            el("div", { class: "as-actions" }, [fixBtn, btn]), panel
          ]));
        });
      });
    }
    show.addEventListener("change", load); load();
    var faqBox = el("div", { class: "as-faqs" }); card.appendChild(faqBox); loadDraftFaqs(faqBox);
  }

  function loadReportToggle(box) {
    box.textContent = "";
    api("feedback/report").then(function (d) {
      if (d.error) return;
      var note = el("span", { class: "muted", text: d.email_ready ? "" : " Email sending is not set up on this site yet." });
      var btn = el("button", { type: "button", class: "btn btn--small", text: d.enabled ? "Stop the weekly email" : "Email me this report every week", onclick: function () {
        api("feedback/report", { enabled: !d.enabled }).then(function (x) { if (x.error) say("error", x.error); else { say("success", x.enabled ? "You will get the report every week." : "Weekly email stopped."); loadReportToggle(box); } });
      } });
      var now = el("button", { type: "button", class: "btn btn--small", text: "Send me one now", onclick: function () {
        now.disabled = true;
        api("feedback/report", { send_now: true }).then(function (x) {
          now.disabled = false;
          if (x.error) say("error", x.error);
          else if (x.skipped) say("success", "Nothing sent: " + (x.reason || "nothing to report") + ".");
          else if (x.failed) say("error", "Could not send: " + (x.error || "email problem") + ".");
          else say("success", "Sent. Check your inbox.");
        });
      } });
      box.appendChild(el("div", { class: "as-actions" }, [btn, now, note]));
    });
  }

  function loadDigest(box) {
    box.textContent = "";
    api("feedback/digest").then(function (d) {
      if (d.error || !d.available) return;
      var wk = function (w) { return w.up + w.down ? (w.helpful_pct + "% helpful (" + w.up + " up, " + w.down + " down)") : "no ratings"; };
      var trend = d.trend === null ? "" : (d.trend > 0 ? " - up " + d.trend + " points" : d.trend < 0 ? " - down " + Math.abs(d.trend) + " points" : " - no change");
      var c = el("div", { class: "as-faq" }, [
        el("strong", { text: "This week: " + wk(d.this_week) + trend }),
        el("p", { class: "muted", text: "Last week: " + wk(d.last_week) })
      ]);
      if ((d.by_country || []).length) c.appendChild(el("p", { class: "muted", text: "By country (28 days): " + d.by_country.map(function (x) { return x.country + " " + (x.helpful_pct === null ? "-" : x.helpful_pct + "%") + " (" + x.down + " down)"; }).join(", ") }));
      var SRC = { widget: "Floating widget", subdomain: "lummet. page" };
      if ((d.by_source || []).length) c.appendChild(el("p", { class: "muted", text: "By entrance (28 days): " + d.by_source.map(function (x) { return (SRC[x.source] || x.source) + " " + (x.helpful_pct === null ? "-" : x.helpful_pct + "%") + " helpful (" + (x.up + x.down) + " ratings)"; }).join(", ") }));
      box.appendChild(c);
      var rb = el("div", {}); box.appendChild(rb); loadReportToggle(rb);
      if ((d.topics || []).length) {
        box.appendChild(el("h4", { text: "Topics that keep getting thumbs-down (28 days)" }));
        d.topics.forEach(function (t) {
          var badge = t.site_has_content === false ? el("span", { class: "gm-badge gm-badge--bad", text: "Site has nothing on this" }) : t.site_has_content === true ? el("span", { class: "gm-badge gm-badge--warn", text: "Site has content" }) : null;
          var fixPanel = el("div", { class: "as-fix" });
          var fixBtn = t.site_has_content === true && t.examples.length ? el("button", { type: "button", class: "btn btn--small btn--primary", text: "Draft a fix", onclick: function () { draftFix({ id: t.examples[0].id, question: t.examples[0].question }, fixPanel, fixBtn); } }) : null;
          var row = el("div", { class: "as-faq" }, [
            el("strong", { text: t.topic + " (" + t.count + ")" }), badge ? el("span", {}, [" ", badge]) : null,
            el("ul", {}, t.examples.map(function (e) { return el("li", { text: e.question }); })),
            fixBtn, fixPanel,
            t.site_has_content === false ? el("button", { type: "button", class: "btn btn--small", text: "Start a research draft", onclick: function () { S.prefill = { topic: t.examples[0].question }; S.view = "tools"; S.group = "Research"; S.task = "research_draft"; S.result = null; render(); } }) : null
          ]);
          box.appendChild(row);
        });
      }
    });
  }

  function draftFix(r, panel, btn) {
    btn.disabled = true; btn.textContent = "Looking..."; panel.textContent = "";
    api("feedback/fix", { id: r.id }).then(function (d) {
      btn.disabled = false; btn.textContent = "Draft a fix";
      if (d.error || d.success === false) { say("error", d.error || "Could not draft a fix."); return; }
      panel.appendChild(el("div", { class: "as-chips" }, (d.coverage || []).map(function (c) { return el("span", { class: "gm-chip as-chip2", text: c.n + " " + c.label }); }).concat(d.coverage && d.coverage.length ? [] : [el("span", { class: "gm-badge gm-badge--bad", text: "Nothing on this topic" })])));
      if (d.diagnosis) panel.appendChild(el("p", { class: "muted", text: "Why it probably failed: " + d.diagnosis }));
      if (!d.answerable) {
        panel.appendChild(el("p", { text: d.advice || "No answer could be drafted from what the site has." }));
        panel.appendChild(el("button", { type: "button", class: "btn btn--small", text: "Start a research draft on this", onclick: function () { S.prefill = { topic: d.question || r.question }; S.view = "tools"; S.group = "Research"; S.task = "research_draft"; S.result = null; render(); } }));
        return;
      }
      var q = el("input", { class: "gm-input", type: "text", maxlength: "240" }); q.value = d.question;
      var a = el("textarea", { class: "as-text", rows: "4", maxlength: "900" }); a.value = d.answer;
      panel.appendChild(labelled("FAQ question", q)); panel.appendChild(labelled("FAQ answer (edit freely; check it against the site before turning it on)", a));
      panel.appendChild(el("button", { type: "button", class: "btn btn--primary btn--small", text: "Save as draft FAQ (not live yet)", onclick: function () {
        save("faq_draft", { question: q.value, answer: a.value, feedback_id: r.id }, function () { return "Saved. Turn it on under Draft FAQs below when you are happy with it."; });
        setTimeout(function () { var fb = root.querySelector(".as-faqs"); if (fb) loadDraftFaqs(fb); }, 600);
      } }));
    });
  }

  function loadDraftFaqs(box) {
    box.textContent = "";
    api("feedback/faqs").then(function (d) {
      if (d.error || !(d.faqs || []).length) return;
      box.appendChild(el("h4", { text: "Draft FAQs (switched off, not used by the chat yet)" }));
      d.faqs.forEach(function (f) {
        var act = function (action, confirmText) { if (confirmText && !window.confirm(confirmText)) return; api("feedback/faq", { id: f.id, action: action }).then(function (x) { if (x.error) say("error", x.error); else { say("success", action === "activate" ? "Switched on. The chat can use it now." : "Done."); loadDraftFaqs(box); } }); };
        box.appendChild(el("div", { class: "as-faq" }, [
          el("strong", { text: f.question }), el("p", { text: f.answer }),
          el("div", { class: "as-actions" }, [
            el("button", { type: "button", class: "btn btn--small btn--primary", text: "Switch on", onclick: function () { act("activate", "Let the public chat use this FAQ?"); } }),
            el("button", { type: "button", class: "btn btn--small", text: "Delete", onclick: function () { act("delete", "Delete this draft FAQ?"); } })
          ])
        ]));
      });
    });
  }

  // ---------- history ----------
  var TASK_LABEL = {}; var TARGET_LABEL = { news_draft: "Saved a news draft", research_draft: "Saved a research draft", research_claims: "Saved claims", item_fields: "Filled item fields", chat_rules: "Changed chat settings", faq_draft: "Saved a draft FAQ" };
  function renderHistory() {
    var card = el("div", { class: "gm-card" }, [el("h3", { text: "History" }), el("p", { class: "muted", text: "Who ran which tool and what was saved. Prompts and generated text are not stored." })]);
    root.appendChild(card);
    var kind = el("select", { class: "gm-select", "aria-label": "Show" }, [el("option", { value: "", text: "Everything" }), el("option", { value: "generate", text: "Tools run" }), el("option", { value: "save", text: "Things saved" })]);
    var mine = el("label", { class: "as-claim" }, [el("input", { type: "checkbox", id: "asMine" }), " Only mine"]);
    var body = el("div", {});
    var bar = el("div", { class: "gm-toolbar" }, [kind]);
    card.appendChild(bar); card.appendChild(body);
    function load() {
      body.textContent = "";
      api("history?kind=" + encodeURIComponent(kind.value) + ($("asMine") && $("asMine").checked ? "&mine=1" : "")).then(function (d) {
        if (d.error) { body.appendChild(el("p", { text: d.error })); return; }
        if (d.everyone && !$("asMine")) bar.appendChild(mine);
        if (!d.available) { body.appendChild(el("p", { class: "muted", text: "History is not switched on for this site yet. Apply migration 0062_ai_studio_history.sql to turn it on." })); return; }
        if (!d.rows.length) { body.appendChild(el("p", { class: "muted", text: "Nothing recorded yet." })); return; }
        var table = el("table", { class: "gm-table" }, [el("thead", {}, [el("tr", {}, ["When", "Who", "What", "Item", "Result"].map(function (h) { return el("th", { text: h }); }))])]);
        var tb = el("tbody", {});
        d.rows.forEach(function (r) {
          var what = r.kind === "save" ? (TARGET_LABEL[r.target] || "Saved") : "Ran " + (r.task || "a tool");
          tb.appendChild(el("tr", {}, [
            el("td", { text: String(r.created_at || "").replace("T", " ").slice(0, 16) }), el("td", { text: r.user_label || "" }), el("td", { text: what }),
            el("td", { text: [r.item_type, r.item_key].filter(Boolean).join(" / ") }),
            el("td", {}, [el("span", { class: "gm-badge " + (r.outcome === "ok" ? "gm-badge--ok" : "gm-badge--bad"), text: r.outcome === "ok" ? "OK" : "Failed" }), r.detail ? el("small", { class: "muted", text: " " + r.detail }) : null])
          ]));
        });
        table.appendChild(tb); body.appendChild(el("div", { class: "gm-tablewrap" }, [table]));
      });
    }
    kind.addEventListener("change", load); mine.addEventListener("change", load);
    load();
  }

  // ---------- audit ----------
  function renderAudit() {
    var card = el("div", { class: "gm-card" }, [el("h3", { text: "Content audit" }), el("p", { class: "muted", text: "Published items that are missing basics. This check does not use the AI." })]);
    root.appendChild(card);
    api("audit").then(function (d) {
      if (d.error) { card.appendChild(el("p", { text: d.error })); return; }
      if (!d.total) card.appendChild(el("p", { text: "Nothing is missing. Good." }));
      (d.groups || []).forEach(function (g) {
        if (!g.items.length) return;
        card.appendChild(el("h4", { text: g.label + " (" + g.items.length + ")" }));
        card.appendChild(el("ul", {}, g.items.map(function (it) {
          var li = el("li", {}, [it.name + " "]);
          if (/^(casino|sportsbook|affiliate_partner|custom)$/.test(it.type) && /seo|thin/.test(g.key)) {
            li.appendChild(el("button", { type: "button", class: "btn btn--small", text: "Write copy", onclick: function () {
              S.view = "tools"; S.group = "Content"; S.task = "item_description"; S.item = { type: it.type, key: it.key, name: it.name }; S.result = null; render();
            } }));
          }
          return li;
        })));
      });
    });
  }

  S.view = "tools";
  api("meta").then(function (m) {
    if (m.error || !m.tasks) { root.textContent = m.error || "AI Studio is not available for your role."; return; }
    S.meta = m; render();
  });
})();
