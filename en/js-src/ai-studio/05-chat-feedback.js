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
