  // ---------- chat feedback (admins) ----------
  var REASON_LABEL = { wrong: "Incorrect", missing: "Missing info", unclear: "Unclear", other: "Something else" };
  // ---------- chat widget: shown or hidden on the public site, and what the site is about ----------
  function renderWidget() {
    var card = el("div", { class: "gm-card" }, [el("h3", { text: "Chat widget" }), el("p", { class: "muted", text: "Controls the floating Lummet AI button on your public pages and the wording the chat uses. The dedicated lummet. chat page uses the same wording." })]);
    root.appendChild(card);
    var form = el("div", { class: "as-form" });
    card.appendChild(form);
    form.appendChild(el("p", { class: "muted", text: "Loading..." }));
    api("chat-widget").then(function (d) {
      form.textContent = "";
      if (d.error) { say("error", d.error); return; }
      var shown = el("input", { type: "checkbox", id: "asWidgetOn" });
      shown.checked = !!d.settings.widget;
      form.appendChild(el("label", { class: "as-field" }, [shown, el("span", { text: " Show the chat widget on public pages" })]));
      form.appendChild(el("small", { class: "muted", text: "Off hides the floating button for every visitor. Nothing is deleted, conversations and settings are kept, and you can switch it back on at any time. It applies within a minute." }));
      var mode = el("select", { class: "gm-select", id: "asTopic" }, Object.keys(d.modes).map(function (k) { var o = el("option", { value: k, text: d.modes[k] }); if (k === d.settings.mode) o.selected = true; return o; }));
      form.appendChild(labelled("What is this site about?", mode, "Automatic uses casino wording while a casino, sportsbook or partner section is on, and neutral wording otherwise. Right now: " + (d.effective === "general" ? "general website." : "casino and iGaming site.")));
      var rgSel = el("select", { class: "gm-select", id: "asRg" }, [["auto", "Follow the site (Settings > Responsible gambling)"], ["show", "Always include it in the chat"], ["hide", "Never include it in the chat"]].map(function (p) { var o = el("option", { value: p[0], text: p[1] }); if (p[0] === d.settings.rgChat) o.selected = true; return o; }));
      form.appendChild(labelled("Responsible gambling in the chat", rgSel, "The 18+ note, the responsible-gambling link and the related suggestion cards. Right now: " + (d.rg ? "included." : "left out.") + " The footer block is set in Settings > Responsible gambling."));
      var about = el("textarea", { class: "as-text", id: "asAbout", rows: "3", maxlength: String(d.aboutLimit) });
      about.value = d.settings.about;
      form.appendChild(labelled("About the site (up to " + d.aboutLimit + " characters, used for a general website)", about, "For example: A local news site about Kigali with weekly guides and event listings."));
      var save = el("button", { type: "button", class: "btn btn--primary btn--sm", text: "Save", onclick: function () {
        save.disabled = true;
        api("chat-widget", { widget: shown.checked, mode: mode.value, about: about.value, rgChat: rgSel.value }).then(function (x) {
          save.disabled = false;
          if (x.error) say("error", x.error); else { say("success", (x.settings.widget ? "Saved. The widget is shown." : "Saved. The widget is hidden.") + " Chat wording: " + (x.effective === "general" ? "general website." : "casino and iGaming.") + " Responsible gambling in chat: " + (x.rg ? "included." : "left out.")); about.value = x.settings.about; }
        });
      } });
      form.appendChild(el("div", { class: "as-actions" }, [save]));
      var q = el("input", { class: "gm-input", type: "text", id: "asWidgetTry", maxlength: "300", placeholder: "For example: What is this site about?" });
      var out = el("div", { class: "as-faq", hidden: "hidden" });
      var tryBtn = el("button", { type: "button", class: "btn btn--sm btn--primary", text: "Ask the chat", onclick: function () {
        var text = q.value.trim(); if (!text) { say("error", "Type a question first."); return; }
        tryBtn.disabled = true; tryBtn.textContent = "Asking...";
        api("chat-rules/preview", { message: text, topic: { widget: shown.checked, mode: mode.value, about: about.value, rgChat: rgSel.value } }).then(function (x) {
          tryBtn.disabled = false; tryBtn.textContent = "Ask the chat";
          out.textContent = ""; out.hidden = false;
          if (x.error) { out.appendChild(el("p", { text: x.error })); return; }
          out.appendChild(el("strong", { text: "Answer with the settings above (not saved)" }));
          out.appendChild(el("p", { text: x.answer }));
        });
      } });
      form.appendChild(el("h4", { text: "Try it before you save" }));
      form.appendChild(labelled("Question", q)); form.appendChild(el("div", { class: "as-actions" }, [tryBtn])); form.appendChild(out);
    });
  }

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
      var save = el("button", { type: "button", class: "btn btn--primary btn--sm", text: "Save settings", onclick: function () {
        save.disabled = true;
        api("chat-rules", { tone: tone.value, decline: decline.value, notes: notes.value }).then(function (x) {
          save.disabled = false;
          if (x.error) say("error", x.error); else { say("success", "Saved. It applies from the next chat message."); decline.value = x.rules.decline.join("\n"); notes.value = x.rules.notes; tone.value = x.rules.tone; }
        });
      } });
      var reset = el("button", { type: "button", class: "btn btn--sm", text: "Back to defaults", onclick: function () {
        if (!window.confirm("Clear tone, declined topics and extra guidance?")) return;
        api("chat-rules", { tone: "friendly", decline: "", notes: "" }).then(function (x) { if (x.error) say("error", x.error); else { say("success", "Back to defaults."); renderRulesAgain(); } });
      } });
      form.appendChild(el("div", { class: "as-actions" }, [save, reset]));
      var q = el("input", { class: "gm-input", type: "text", id: "asTry", maxlength: "300", placeholder: "For example: Tell me about a casino, or ask about a topic you declined" });
      var out = el("div", { class: "as-faq", hidden: "hidden" });
      var tryBtn = el("button", { type: "button", class: "btn btn--sm btn--primary", text: "Ask the chat", onclick: function () {
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
          var markBtn = el("button", { type: "button", class: "btn btn--sm", text: "Mark as handled", onclick: function () {
            markBtn.disabled = true;
            Promise.all((g.ids || []).map(function (id) { return api("feedback/review", { id: id, reviewed: true }); })).then(function () { say("success", "Marked as handled."); load(); });
          } });
          body.appendChild(el("div", { class: "as-faq" }, [
            el("strong", { text: g.topic + " (" + g.count + " thumbs-down)" }),
            el("ul", {}, g.examples.map(function (e) { return el("li", { text: e.question }); })),
            el("div", { class: "as-actions" }, [
              el("button", { type: "button", class: "btn btn--sm btn--primary", text: "Research draft", onclick: function () { start(g, "research_draft", "Research"); } }),
              el("button", { type: "button", class: "btn btn--sm", text: "News article draft", onclick: function () { start(g, "news_article", "News"); } }),
              markBtn
            ])
          ]));
        });
      });
    }
    load();
  }

