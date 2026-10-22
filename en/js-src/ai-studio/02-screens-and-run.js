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
