
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

