  // ── Reader comments moderation ─────────────────────────────
  const COMMENT_STATUS = ["pending", "approved", "rejected", "spam"];

  async function renderComments(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.review) { panel.append(h("p", { class: "muted" }, "You need the review permission to moderate comments.")); return; }
    const filter = state.commentFilter || "pending";
    const d = await api("comments/list?status=" + filter); if (!d) return;
    const counts = d.counts || {};
    panel.append(h("p", { class: "muted" }, "Comments are plain text. Rejected and spam comments are kept, not deleted, so you can restore one. Turn comments on in Flags."),
      h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" }, COMMENT_STATUS.map((s) =>
        h("button", { type: "button", class: "btn btn--sm" + (filter === s ? " btn--primary" : ""), onclick: () => { state.commentFilter = s; setTab("comments"); } }, pretty(s) + " (" + (counts[s] || 0) + ")"))));
    if (!d.comments.length) { panel.append(h("p", { class: "muted" }, "Nothing here.")); return; }
    d.comments.forEach((c) => {
      const act = (status) => async () => { const res = await api("comments/moderate", { body: { id: c.id, status } }); if (res) { notify("Comment " + status); setTab("comments"); } };
      const closeToggle = async () => { const res = await api("comments/close", { body: { news_id: c.news_id, closed: !c.closed } }); if (res) { notify(c.closed ? "Discussion reopened" : "Discussion closed"); setTab("comments"); } };
      panel.append(h("div", { style: "border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px" },
        h("div", { class: "muted" }, "#" + c.id + " · " + (c.created_at || "") + (c.parent_id ? " · reply" : "")),
        h("div", {}, h("strong", {}, c.author_name), c.author_email ? " <" + c.author_email + ">" : ""),
        h("div", {}, "On: ", h("a", { href: "/en/news/" + c.article_slug, target: "_blank", rel: "noopener" }, c.article_title)),
        h("div", { style: "margin:8px 0;white-space:pre-wrap" }, c.body),
        h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" },
          filter !== "approved" ? h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: act("approved") }, "Approve") : null,
          filter !== "rejected" ? h("button", { type: "button", class: "btn btn--sm", onclick: act("rejected") }, "Reject") : null,
          filter !== "spam" ? h("button", { type: "button", class: "btn btn--sm", onclick: act("spam") }, "Spam") : null,
          filter !== "pending" ? h("button", { type: "button", class: "btn btn--sm", onclick: act("pending") }, "Back to pending") : null,
          h("button", { type: "button", class: "btn btn--sm", onclick: closeToggle }, c.closed ? "Reopen discussion" : "Close discussion"))));
    });
  }
