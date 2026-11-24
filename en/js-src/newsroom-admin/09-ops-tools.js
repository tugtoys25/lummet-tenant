  // ── Operations: Core Web Vitals, section digests, CSV export ───
  async function renderOps(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.review) { panel.append(h("p", { class: "muted" }, "You need the review permission to see operations.")); return; }
    const d = await api("ops/summary"); if (!d) return;
    const f = d.flags || {};

    // Core Web Vitals
    panel.append(h("h3", {}, "Core Web Vitals (last " + (d.vitals.days || 28) + " days)"));
    if (!f.news_web_vitals) panel.append(h("p", { class: "muted" }, "Switched off. Turn on “Core Web Vitals reporting” in Flags to start collecting real-reader measurements."));
    else if (!d.vitals.rows.length) panel.append(h("p", { class: "muted" }, "No measurements yet. Data appears as readers visit articles and the news page."));
    else {
      const unit = (m) => (m === "CLS" ? "" : " ms");
      const fmt = (r) => (r.metric === "CLS" ? r.mean.toFixed(3) : Math.round(r.mean) + unit(r.metric));
      panel.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
        h("thead", {}, h("tr", {}, ["Page", "Device", "Metric", "Samples", "Good", "Poor", "Average"].map((t) => h("th", {}, t)))),
        h("tbody", {}, d.vitals.rows.map((r) => h("tr", {}, [pretty(r.page), pretty(r.device), r.metric, String(r.samples), r.good_pct + "%", r.poor_pct + "%", fmt(r)].map((t) => h("td", {}, t))))))));
      panel.append(h("p", { class: "muted" }, "Good = within Google's recommended limit. Counts only; no IP addresses or visitor ids are stored."));
    }

    // Section digests
    panel.append(h("h3", { style: "margin-top:24px" }, "Section email digests"));
    if (!f.news_section_digests) panel.append(h("p", { class: "muted" }, "Switched off. Turn on “Section email digests” in Flags. Readers then choose sections from a link in each digest email."));
    else if (!d.digests.rows.length) panel.append(h("p", { class: "muted" }, "No reader has chosen sections yet."));
    else panel.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["Section", "How often", "Readers"].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.digests.rows.map((r) => h("tr", {}, [r.name, pretty(r.frequency), String(r.readers)].map((t) => h("td", {}, t))))))));

    // CSV export
    panel.append(h("h3", { style: "margin-top:24px" }, "Export articles (CSV)"));
    if (!f.news_csv_export) { panel.append(h("p", { class: "muted" }, "Switched off. Turn on “CSV export of articles” in Flags.")); return; }
    const status = h("select", {}, ["all", "published", "draft", "scheduled"].map((v) => h("option", { value: v }, pretty(v))));
    const from = h("input", { type: "date" }), to = h("input", { type: "date" });
    const go = h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
      const q = new URLSearchParams({ status: status.value }); if (from.value) q.set("from", from.value); if (to.value) q.set("to", to.value);
      try {
        const res = await fetch(API + "export/news.csv?" + q.toString(), { credentials: "same-origin" });
        if (!res.ok) { const j = await res.json().catch(() => ({})); notify(j.error || "Export failed", "error"); return; }
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a"); a.href = url; a.download = "news.csv"; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) { notify("Export failed", "error"); }
    } }, "Download CSV");
    panel.append(h("div", { style: "display:flex;gap:12px;flex-wrap:wrap;align-items:end" }, label("Status", status), label("From", from), label("To", to), go),
      h("p", { class: "muted" }, "Up to 20,000 articles, newest first. Cells that start with = + - or @ are prefixed so spreadsheets do not run them as formulas."));
  }
