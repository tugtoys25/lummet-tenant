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

