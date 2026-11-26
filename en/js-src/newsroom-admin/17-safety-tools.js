  // ── Safety: content backups and uptime / error alerts ──
  async function renderSafety(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.manage_settings) { panel.append(h("p", { class: "muted" }, "You need the manage-settings permission to see this.")); return; }
    const d = await api("safety/status"); if (!d) return;
    const f = d.flags || {}, c = d.config || {};
    const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
    panel.append(h("h3", {}, "Content backups"),
      h("p", { class: "muted" }, "Status: " + (f.news_backups ? "switched on (a copy is saved every day at about 02:00 UTC, last 14 kept)" : "switched off (turn on “Content backups” in Flags)") + ". Covers articles, authors, sections, redirects and media records. Passwords, members, subscribers and comments are never included." + (d.storage ? "" : " Private storage is not connected, so backups cannot be saved.")));
    if (f.news_backups) {
      panel.append(h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => { const r = await api("safety/backup", { body: {} }); if (r) { notify("Backup saved (" + kb(r.bytes) + ")"); setTab("safety"); } } }, "Back up now"));
      panel.append(d.backups.length ? h("div", { style: "overflow-x:auto;margin-top:12px" }, h("table", { class: "admin-table" },
        h("thead", {}, h("tr", {}, ["When (UTC)", "Type", "Size", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, d.backups.map((b) => h("tr", {}, [b.created_at || "", b.kind, kb(b.bytes)].map((t) => h("td", {}, t)).concat([h("td", {}, h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
          const res = await fetch(API + "safety/download?id=" + b.id, { credentials: "same-origin" });
          if (!res.ok) { notify("Download failed", "error"); return; }
          const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = "newsroom-backup-" + b.id + ".json.gz"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        } }, "Download"))])))))) : h("p", { class: "muted" }, "No backups yet."));
    }

    panel.append(h("h3", { style: "margin-top:28px" }, "Uptime and error alerts"),
      h("p", { class: "muted" }, "Status: " + (f.news_monitoring ? "switched on" : "switched off (turn on “Uptime and error alerts” in Flags)") + ". Current state: " + (c.monitor_state === "down" ? "PROBLEM" : "working") + ". Checks run whenever the site's scheduled job runs. A site that is completely down cannot email you, so also point a free outside monitor (for example UptimeRobot) at:"),
      h("code", {}, d.health_url));
    const email = h("input", { type: "text", value: c.monitor_alert_email || "", placeholder: "Defaults to the first admins' emails", style: "width:100%" });
    const th = h("input", { type: "number", min: "1", max: "1000", value: String(c.monitor_error_threshold || 10), style: "width:100px" });
    panel.append(h("div", { style: "max-width:520px;margin-top:12px" }, label("Send alerts to", email), label("Alert when server errors in an hour reach", th),
      h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" },
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => { const r = await api("safety/config", { body: { monitor_alert_email: email.value, monitor_error_threshold: th.value } }); if (r) notify("Saved"); } }, "Save"),
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const r = await api("safety/test-alert", { body: {} }); if (r) notify(r.sent ? "Test email sent to " + r.to.join(", ") : "No email was sent. Check that email sending is set up and an address exists.", r.sent ? undefined : "error"); } }, "Send test alert"),
        f.news_monitoring ? h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const r = await api("safety/check", { body: {} }); if (r) { notify(r.ok ? "Site is working" : "Problem: " + (r.problems || []).join("; ")); setTab("safety"); } } }, "Check now") : null)));
    if (d.checks.length) panel.append(h("h4", { style: "margin-top:16px" }, "Recent checks"), h("ul", {}, d.checks.map((k) => h("li", {}, (k.checked_at || "") + " — " + (k.ok ? "working" : "PROBLEM") + " (" + (k.ms || 0) + " ms)" + (k.detail ? " — " + k.detail : "")))));
    if (d.errors.length) panel.append(h("h4", { style: "margin-top:16px" }, "Recent server errors"), h("ul", {}, d.errors.map((k) => h("li", {}, (k.at || "") + " — " + k.status + " " + (k.path || "") + " " + (k.message || "")))));
  }
