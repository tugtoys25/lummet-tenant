  // ── Copyright and takedown reports ─────────────────────────
  const REPORT_STATUS = ["new", "reviewing", "actioned", "rejected", "withdrawn"];

  async function renderReports(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.retract) { panel.append(h("p", { class: "muted" }, "You need the retract permission to handle copyright reports.")); return; }
    const filter = state.reportFilter || "";
    const d = await api("copyright/list" + (filter ? "?status=" + filter : "")); if (!d) return;
    const counts = d.counts || {};
    const bar = h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" },
      [["", "All"]].concat(REPORT_STATUS.map((s) => [s, pretty(s)])).map((x) =>
        h("button", { type: "button", class: "btn btn--sm" + (filter === x[0] ? " btn--primary" : ""), onclick: () => { state.reportFilter = x[0]; setTab("reports"); } },
          x[1] + (x[0] ? " (" + (counts[x[0]] || 0) + ")" : ""))));
    panel.append(h("p", { class: "muted" }, "Reports sent through the public copyright form. Taking an article offline keeps it in your database; it can be published again from the article."), bar);
    if (!d.reports.length) { panel.append(h("p", { class: "muted" }, "No reports.")); return; }
    d.reports.forEach((r) => {
      const note = h("textarea", { rows: 2, maxlength: 2000, placeholder: "Decision notes (kept with the report)", style: "width:100%" });
      note.value = r.resolution || "";
      const act = (status, unpublish) => async () => {
        if (unpublish && !window.confirm("Take the article offline and mark this report actioned?")) return;
        const res = await api("copyright/update", { body: { id: r.id, status, resolution: note.value, unpublish: !!unpublish } });
        if (res) { notify(unpublish ? "Report actioned and article taken offline" : "Report updated"); setTab("reports"); }
      };
      panel.append(h("div", { style: "border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px" },
        h("div", { class: "muted" }, "#" + r.id + " · " + pretty(r.status) + " · " + (r.created_at || "")),
        h("div", {}, h("strong", {}, r.reporter_name), " <" + r.reporter_email + ">" + (r.organisation ? " · " + r.organisation : "")),
        h("div", {}, "Page: ", h("a", { href: r.page_url, target: "_blank", rel: "noopener" }, r.page_url),
          r.article_title ? " (" + r.article_title + (r.article_published ? "" : ", offline") + ")" : ""),
        h("div", { style: "margin-top:6px" }, h("em", {}, "Original: "), r.original_work),
        h("div", { style: "margin:6px 0;white-space:pre-wrap" }, r.details),
        h("div", { class: "muted" }, "Signed: " + r.signature),
        note,
        h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px" },
          h("button", { type: "button", class: "btn btn--sm", onclick: act("reviewing") }, "Mark reviewing"),
          r.news_id && r.article_published ? h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: act("actioned", true) }, "Take article offline") : null,
          h("button", { type: "button", class: "btn btn--sm", onclick: act("actioned") }, "Mark actioned"),
          h("button", { type: "button", class: "btn btn--sm", onclick: act("rejected") }, "Reject"),
          h("button", { type: "button", class: "btn btn--sm", onclick: act("withdrawn") }, "Withdrawn"))));
    });
  }
