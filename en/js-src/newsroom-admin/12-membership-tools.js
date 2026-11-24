  // ── Membership and article access ──────────────────────────
  async function renderMembership(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.review) { panel.append(h("p", { class: "muted" }, "You need the review permission to see membership.")); return; }
    const d = await api("membership/status"); if (!d) return;
    panel.append(h("p", { class: "muted" }, "Mark articles as registered-only or members-only. Other readers see the first paragraphs and a sign-in box. Turn on “Membership and member-only articles” in Flags."),
      h("p", {}, "Status: ", h("strong", {}, d.enabled ? "switched on" : "switched off"), " · set up: ", h("strong", {}, d.configured ? "yes" : "no")));

    if (P.manage_settings) {
      panel.append(h("h3", {}, "Set up"), h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
        const res = await api("membership/setup", { body: {} });
        if (res) { notify(res.webhook_secret ? "Set up. Copy the webhook secret now: " + res.webhook_secret : "Already set up"); setTab("membership"); }
      } }, d.configured ? "Check set-up" : "Set up membership"),
      h("button", { type: "button", class: "btn btn--sm", style: "margin-left:8px", onclick: async () => {
        if (!window.confirm("Make a new webhook secret? The old one stops working at once.")) return;
        const res = await api("membership/setup", { body: { rotate_webhook: true } });
        if (res && res.webhook_secret) window.prompt("New webhook secret (copy it now, it is not shown again):", res.webhook_secret);
      } }, "New webhook secret"),
      h("p", { class: "muted" }, "Payment provider or automation webhook: POST " + d.webhook_url + " with a JSON body {event: grant or revoke, email, ts (unix seconds), tier, expires_at} and header X-Signature = hex HMAC-SHA256 of the raw body with the webhook secret."));
    }

    // Article access
    panel.append(h("h3", { style: "margin-top:24px" }, "Article access"));
    const art = h("select", {}, d.recent.map((a) => h("option", { value: a.id }, a.title + " [" + a.level + "]")));
    const lvl = h("select", {}, [["free", "Free for everyone"], ["registered", "Newsletter subscribers and members"], ["members", "Members only"]].map((x) => h("option", { value: x[0] }, x[1])));
    const prev = h("input", { type: "number", min: 1, max: 20, value: 3, style: "width:80px" });
    panel.append(h("div", { style: "display:flex;gap:12px;flex-wrap:wrap;align-items:end" }, label("Article", art), label("Who can read it", lvl), label("Preview paragraphs", prev),
      h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
        const res = await api("membership/access", { body: { news_id: Number(art.value), level: lvl.value, preview_paragraphs: Number(prev.value) } });
        if (res) { notify("Access saved"); setTab("membership"); }
      } }, "Save")),
      h("p", { class: "muted" }, "At least half of an article is always held back from the preview. Pick “Free for everyone” to open an article again."));
    if (d.limited.length) panel.append(h("ul", {}, d.limited.map((a) => h("li", {}, a.title + " — " + a.level + ", " + a.preview_paragraphs + " preview paragraphs"))));

    // Members
    panel.append(h("h3", { style: "margin-top:24px" }, "Members"));
    if (P.manage_settings) {
      const email = h("input", { type: "email", maxlength: 200, placeholder: "reader@example.com" }), tier = h("input", { type: "text", maxlength: 60, placeholder: "Tier (optional)" }), until = h("input", { type: "date" });
      panel.append(h("div", { style: "display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:12px" }, label("Email", email), label("Tier", tier), label("Ends on (optional)", until),
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
          const res = await api("membership/grant", { body: { email: email.value, tier: tier.value, expires_at: until.value || null } });
          if (res) { notify("Member added"); setTab("membership"); }
        } }, "Add member")));
    }
    if (!d.members.length) { panel.append(h("p", { class: "muted" }, "No members yet.")); return; }
    panel.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["Email", "Status", "Tier", "Source", "Ends", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.members.map((m) => h("tr", {}, [m.email, m.status, m.tier || "", m.source, m.expires_at || "never"].map((t) => h("td", {}, t)).concat([h("td", {},
        P.manage_settings && m.status === "active" ? h("button", { type: "button", class: "btn btn--sm", onclick: async () => { if (!window.confirm("Remove access for " + m.email + "?")) return; const res = await api("membership/revoke", { body: { id: m.id } }); if (res) { notify("Access removed"); setTab("membership"); } } }, "Remove") : "")])))))));
  }
