  // ── tabs ───────────────────────────────────────────────────
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll("[data-nr-tab]").forEach((b) => {
      const on = b.dataset.nrTab === tab;
      b.classList.toggle("btn--primary", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    const panel = $("nrPanel"); panel.replaceChildren();
    if (tab === "queues") renderQueues(panel);
    else if (tab === "article") renderArticle(panel);
    else if (tab === "policies") renderPolicies(panel);
    else if (tab === "flags") renderFlags(panel);
    else if (tab === "authors") renderAuthors(panel);
    else if (tab === "analytics") renderAnalytics(panel);
    else if (tab === "search") renderSearch(panel);
    else if (tab === "homepage") renderHomepageAdmin(panel);
    else renderTaxonomy(panel);
  }

  // ── Queues ─────────────────────────────────────────────────
  async function renderQueues(panel) {
    const views = ["drafts", "assigned_to_me", "review", "factcheck", "approved", "scheduled", "published", "corrections"];
    const sel = h("select", { onchange: () => load(sel.value) }, views.map((v) => h("option", { value: v }, pretty(v))));
    const body = h("tbody");
    panel.append(label("View", sel), h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["Title", "Type", "Workflow", "Updated", ""].map((t) => h("th", {}, t)))), body)));
    async function load(view) {
      body.replaceChildren(h("tr", {}, h("td", { colspan: 5, class: "muted" }, "Loading…")));
      const d = await api("queue?view=" + encodeURIComponent(view));
      body.replaceChildren();
      if (!d || !d.items.length) { body.append(h("tr", {}, h("td", { colspan: 5, class: "muted" }, "Nothing here."))); return; }
      for (const it of d.items) {
        body.append(h("tr", {},
          h("td", {}, h("strong", {}, it.title), h("br"), h("span", { class: "muted" }, it.slug)),
          h("td", {}, pretty(it.article_type || "news")),
          h("td", {}, it.workflow_status ? pretty(it.workflow_status) : (it.published ? "Published (legacy)" : "Draft (legacy)")),
          h("td", {}, it.updated_at || ""),
          h("td", {}, h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.articleId = it.id; setTab("article"); } }, "Open"))));
      }
    }
    load(views[0]);
  }

