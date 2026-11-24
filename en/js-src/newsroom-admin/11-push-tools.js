  // ── Web push notifications ─────────────────────────────────
  async function renderPush(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.review) { panel.append(h("p", { class: "muted" }, "You need the review permission to send notifications.")); return; }
    const d = await api("push/status"); if (!d) return;
    const subs = d.subscribers || {};
    panel.append(h("p", { class: "muted" }, "Readers who opt in get a browser notification for stories you announce. Turn on “Web push notifications” in Flags first."),
      h("p", {}, "Status: ", h("strong", {}, d.enabled ? "switched on" : "switched off"), " · keys: ", h("strong", {}, d.configured ? "set up" : "not set up"),
        " · subscribers: ", h("strong", {}, String(subs.active || 0)), " active, " + (subs.gone || 0) + " expired, " + (subs.unsubscribed || 0) + " opted out"));

    if (P.manage_settings) {
      const contact = h("input", { type: "text", maxlength: 200, placeholder: "mailto:newsroom@yourdomain.com", style: "width:100%" });
      contact.value = d.contact || "";
      panel.append(h("h3", {}, "Push keys"), label("Contact address (browser vendors may use it to reach you)", contact),
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
          const res = await api("push/setup", { body: { contact: contact.value } });
          if (res) { notify(res.created ? "Push keys created" : "Contact saved"); setTab("push"); }
        } }, d.configured ? "Save contact" : "Create push keys"));
    }

    if (d.configured && d.enabled) {
      const sel = h("select", { style: "width:100%" }, d.live.map((a) => h("option", { value: a.id }, a.title)));
      panel.append(h("h3", { style: "margin-top:24px" }, "Announce a story"), label("Live story", sel),
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
          if (!window.confirm("Send a notification for this story to every subscriber?")) return;
          const res = await api("push/announce", { body: { news_id: Number(sel.value) } });
          if (res) { notify("Announcement queued"); setTab("push"); }
        } }, "Send notification"));
    }

    panel.append(h("h3", { style: "margin-top:24px" }, "Recent announcements"));
    if (!d.recent.length) { panel.append(h("p", { class: "muted" }, "None yet.")); return; }
    panel.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["When", "Story", "How", "Sent", "Expired", "Failed", "State"].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.recent.map((r) => h("tr", {}, [r.created_at || "", r.title, pretty(r.trigger), String(r.sent), String(r.gone), String(r.failed), r.done ? "Done" : "Sending"].map((t) => h("td", {}, t))))))));
  }
