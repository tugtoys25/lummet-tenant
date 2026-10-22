  // ── Search (all states; index maintenance) ─────────────────
  async function renderSearch(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    const q = h("input", { type: "search", maxlength: 200, placeholder: "Search titles, excerpts, tags and body text", "aria-label": "Search query", style: "flex:1;min-width:200px" });
    const status = h("select", { "aria-label": "Status" }, [["", "Any status"], ["draft", "Draft"], ["scheduled", "Scheduled"], ["published", "Published"]].map(([v, t]) => h("option", { value: v }, t)));
    const type = h("select", { "aria-label": "Article type" }, [h("option", { value: "" }, "Any type"), ...state.meta.article_types.map((t) => h("option", { value: t }, pretty(t)))]);
    const wf = h("select", { "aria-label": "Workflow status" }, [h("option", { value: "" }, "Any workflow status"), ...state.meta.workflow_statuses.map((t) => h("option", { value: t }, pretty(t)))]);
    const out = h("div", { role: "status", "aria-live": "polite" });
    const go = async () => {
      const qs = new URLSearchParams(); if (q.value) qs.set("q", q.value); if (status.value) qs.set("status", status.value); if (type.value) qs.set("type", type.value); if (wf.value) qs.set("workflow", wf.value);
      out.replaceChildren(h("p", { class: "muted" }, "Searching…"));
      const d = await api("search?" + qs.toString()); out.replaceChildren(); if (!d) return;
      out.append(h("p", { class: "muted" }, d.total + " result" + (d.total === 1 ? "" : "s") + (d.total > d.page_size ? " (first " + d.page_size + " shown)" : "")));
      if ((d.invalid_filters || []).length) out.append(h("p", { class: "muted" }, "Ignored unknown filter: " + d.invalid_filters.join(", ")));
      out.append(simpleTable(["Article", "Type", "Status", ""], d.articles.map((a) => [
        h("span", {}, h("strong", {}, a.title), h("br"), h("span", { class: "muted" }, "/" + a.slug)), pretty(a.article_type || "news"),
        a.workflow_status ? pretty(a.workflow_status) : (a.published ? "Published" : "Draft"),
        h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.articleId = a.id; setTab("article"); } }, "Open")])));
    };
    panel.append(h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" }, q, status, type, wf, h("button", { type: "button", class: "btn btn--primary", onclick: go }, "Search")), out);
    if (P.manage_settings) {
      const st = await api("search/status");
      if (st) {
        const info = h("p", {}, (st.enabled ? "Public search v2 is ON. " : "Public search v2 is OFF (flag news_search_v2). ") + st.indexed_articles + " of " + st.articles + " articles indexed (" + st.terms + " terms)." + (st.complete ? "" : " The index is incomplete: rebuild it before enabling search v2."));
        const prog = h("span", { class: "muted", role: "status", "aria-live": "polite" });
        panel.append(h("h3", {}, "Search index"), info, h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
          let cursor = 0, done = false, total = 0;
          while (!done) { const r = await api("search/reindex", { body: { cursor, limit: 25 } }); if (!r) return; cursor = r.cursor; total += r.processed; done = r.remaining === 0; prog.textContent = " Processed " + total + "…"; }
          notify("Search index rebuilt"); setTab("search"); } }, "Rebuild index"), prog);
      }
    }
  }

  // ── Analytics ──────────────────────────────────────────────
  const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US"));
  const simpleTable = (heads, rows) => h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
    h("thead", {}, h("tr", {}, heads.map((t) => h("th", {}, t)))),
    h("tbody", {}, rows.length ? rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, c)))) : [h("tr", {}, h("td", { colspan: heads.length, class: "muted" }, "No data in this period."))])));
  // Bars are plain elements (no SVG, no innerHTML): height is a validated number.
  const bars = (points, title) => {
    const max = Math.max(1, ...points.map((p) => Number(p.value) || 0));
    return h("div", { class: "nr-bars", role: "img", "aria-label": title + ": " + points.map((p) => p.label + " " + p.value).join(", ") },
      points.map((p) => h("div", { class: "nr-bar", title: p.label + ": " + p.value, style: "height:" + Math.max(2, Math.round(((Number(p.value) || 0) / max) * 100)) + "%" })));
  };
  const stat = (labelText, value, note) => h("div", { class: "stat-card", style: "flex:1;min-width:140px" }, h("div", { class: "stat-value" }, value), h("div", { class: "stat-label" }, labelText), note ? h("div", { class: "muted", style: "font-size:12px" }, note) : null);

  async function renderAnalytics(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.view_analytics) { panel.append(h("p", { class: "muted" }, "You do not have permission to view newsroom analytics.")); return; }
    const days = h("select", { onchange: () => load() }, [7, 30, 90].map((d) => h("option", { value: d, selected: d === 30 }, "Last " + d + " days")));
    const out = h("div");
    panel.append(label("Period", days), out);
    async function load() {
      out.replaceChildren(h("p", { class: "muted" }, "Loading…"));
      const d = await api("analytics/overview?days=" + encodeURIComponent(days.value)); out.replaceChildren(); if (!d) return;
      const dq = d.data_quality || {};
      if ((dq.notes || []).length) out.append(h("div", { class: "alert alert--warning", role: "note" }, h("strong", {}, "Data limits: "), h("ul", { style: "margin:6px 0 0" }, dq.notes.map((n) => h("li", {}, n)))));
      out.append(h("div", { style: "display:flex;gap:16px;flex-wrap:wrap;margin:16px 0" },
        stat("Articles published", fmt(d.articles_published)), stat("Page views", fmt(d.views), d.views_per_article !== null ? fmt(d.views_per_article) + " per article" : ""),
        stat("Unique visitors", d.unique_visitors.available ? fmt(d.unique_visitors.value) : "Not available", d.unique_visitors.available ? "" : "no visitor identifier recorded"),
        stat("Organic search views", fmt(d.organic_search_views))));
      out.append(h("h3", {}, "Views per day"), bars(d.daily_views.map((p) => ({ label: p.date, value: p.views })), "Views per day"));
      out.append(h("h3", {}, "Articles published per day"), bars(d.publication_frequency.map((p) => ({ label: p.date, value: p.articles })), "Articles published per day"));
      out.append(h("h3", {}, "Most read"), simpleTable(["Article", "Views", ""], d.top_articles.map((a) => [a.title, fmt(a.views), h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.articleId = a.id; setTab("article"); } }, "Open")])));
      if ((d.trending || []).length) out.append(h("h3", {}, "Trending now"), h("ol", {}, d.trending.map((a) => h("li", {}, a.title))));
      out.append(h("h3", {}, "Traffic by section"), simpleTable(["Section", "Views"], d.by_section.map((s) => [s.name, fmt(s.views)])));
      out.append(h("h3", {}, "Traffic by author"), simpleTable(["Author", "Views"], d.by_author.map((s) => [s.name, fmt(s.views)])));
      out.append(h("h3", {}, "Traffic by article type"), simpleTable(["Type", "Views"], d.by_article_type.map((s) => [pretty(s.type), fmt(s.views)])));
      out.append(h("h3", {}, "Traffic by country"), simpleTable(["Country", "Views"], d.by_country.map((s) => [s.name, fmt(s.views)])));
      out.append(h("h3", {}, "Traffic sources"), simpleTable(["Channel", "Views"], d.traffic_sources.map((s) => [pretty(s.channel), fmt(s.views)])));
      if (d.top_referrers.length) out.append(h("h3", {}, "Top referrers"), simpleTable(["Site", "Views"], d.top_referrers.map((s) => [s.host, fmt(s.views)])));
      out.append(h("h3", {}, "Newsletter"), d.newsletter && d.newsletter.site_wide_signups !== undefined
        ? h("p", {}, fmt(d.newsletter.site_wide_signups) + " signups and " + fmt(d.newsletter.site_wide_confirmed) + " confirmations site-wide in this period. Signups are not attributed to individual articles.")
        : h("p", { class: "muted" }, "Not available for your access level."));
      out.append(h("h3", {}, "Engagement"), h("p", { class: "muted" }, d.engagement.note || "Not tracked."));
    }
    load();
  }

  async function articlePerformance(panel, articleId) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.view_analytics) return;
    const d = await api("analytics/article?id=" + articleId + "&days=30"); if (!d) return;
    put(panel, h("h3", {}, "Performance (last 30 days)"),
      h("div", { style: "display:flex;gap:16px;flex-wrap:wrap" }, stat("Views", fmt(d.views), fmt(d.views_all_time) + " all time"),
        stat("Unique readers", d.unique_readers.available ? fmt(d.unique_readers.value) : "Not available"), stat("From search", fmt(d.search_views)),
        stat("From newsletter", fmt(d.newsletter_views)), stat("From other news articles", fmt(d.views_from_other_news_articles), "proxy for related-story clicks")),
      bars(d.daily_views.map((p) => ({ label: p.date, value: p.views })), "Views per day"),
      d.traffic_sources.length ? simpleTable(["Source", "Views"], d.traffic_sources.map((s) => [pretty(s.channel), fmt(s.views)])) : null,
      d.countries.length ? simpleTable(["Country", "Views"], d.countries.map((s) => [s.name, fmt(s.views)])) : null);
  }

