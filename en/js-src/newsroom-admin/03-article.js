  // ── Article ────────────────────────────────────────────────
  async function renderArticle(panel) {
    const idInput = h("input", { type: "number", min: 1, value: state.articleId || "", "aria-label": "Article ID" });
    panel.append(h("div", { class: "form-group", style: "max-width:260px" }, h("label", {}, "Article ID"), idInput,
      h("button", { type: "button", class: "btn btn--sm", style: "margin-top:8px", onclick: () => { state.articleId = Number(idInput.value) || null; setTab("article"); } }, "Load")));
    if (!state.articleId) { panel.append(h("p", { class: "muted" }, "Open an article from a queue, or enter its ID.")); return; }

    const [b, topics, entities, series] = await Promise.all([
      api("article?id=" + state.articleId), api("taxonomy/list?kind=topics"), api("taxonomy/list?kind=entities"), api("taxonomy/list?kind=series")
    ]);
    if (!b) return;
    const sections = await api("taxonomy/list?kind=sections");
    const a = b.article, m = state.meta, P = m.permissions || {};

    panel.append(h("h2", {}, a.title), h("p", { class: "muted" }, "/" + a.slug + " · " + (a.published ? "published" : "draft") + " · workflow: " +
      (b.editorial && b.editorial.workflow_status ? pretty(b.editorial.workflow_status) : "legacy (simple publishing)")));

    await articlePerformance(panel, a.id);

    // classification
    const f = {};
    f.type = h("select", {}, h("option", { value: "" }, "News (default)"), m.article_types.map((t) => h("option", { value: t, selected: a.article_type === t }, pretty(t))));
    f.section = h("select", {}, h("option", { value: "" }, "—"), ((sections && sections.items) || []).map((s) => h("option", { value: s.id, selected: a.section_id === s.id }, s.name)));
    f.region = h("select", {}, h("option", { value: "" }, "—"), m.regions.map((r) => h("option", { value: r.slug, selected: a.region_slug === r.slug }, r.name)));
    f.country = h("input", { type: "text", maxlength: 2, value: a.primary_country || "", placeholder: "GB", style: "text-transform:uppercase;max-width:80px" });
    f.cls = h("select", {}, h("option", { value: "" }, "Editorial (default)"), m.content_classes.map((c) => h("option", { value: c, selected: a.content_class === c }, pretty(c))));
    f.labels = m.labels.map((l) => h("label", { style: "margin-right:12px;display:inline-block" }, h("input", { type: "checkbox", value: l, checked: (a.labels || []).includes(l) }), " " + pretty(l)));
    f.method = h("textarea", { rows: 4, maxlength: 5000 }, a.methodology || "");
    f.prBy = h("input", { type: "text", maxlength: 200, value: a.pr_provided_by || "" });
    f.prUrl = h("input", { type: "url", value: a.pr_original_source_url || "" });
    f.prDate = h("input", { type: "text", value: a.pr_original_date || "", placeholder: "2026-09-19" });
    const disc = ["editorial_independence", "affiliate", "sponsored", "advertising", "ai_assistance"];
    f.disc = disc.map((k) => h("label", { style: "margin-right:12px;display:inline-block" }, h("input", { type: "checkbox", value: k, checked: !!(a.disclosure || {})[k] }), " " + pretty(k)));
    const multi = (items, chosen) => h("select", { multiple: true, size: 5 }, ((items && items.items) || []).map((i) => h("option", { value: i.id, selected: chosen.includes(i.id) }, i.name)));
    f.topics = multi(topics, b.topics.map((t) => t.id));
    f.entities = multi(entities, b.entities.map((e) => e.id));
    f.series = multi(series, b.series.map((s) => s.id));
    f.countries = h("input", { type: "text", value: b.countries.map((c) => c.country_code).join(", "), placeholder: "GB, DE" });
    f.related = h("textarea", { rows: 3, placeholder: "One per line: articleId,relation_type (e.g. 12,background)" },
      b.related.map((r) => r.news_id + "," + r.relation_type).join("\n"));
    f.summary = h("input", { type: "text", maxlength: 500, placeholder: "Change summary (shown in revision history)" });
    const picked = (sel) => Array.from(sel.selectedOptions).map((o) => Number(o.value));
    const checked = (arr) => arr.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);

    const saveMeta = async () => {
      const codes = f.countries.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const primary = f.country.value ? f.country.value.trim().toUpperCase() : "";
      if (primary && !codes.includes(primary)) codes.push(primary); // primary must be among the article's countries
      const rel = f.related.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [id, t] = l.split(","); return { news_id: Number(id), relation_type: (t || "related").trim() }; });
      const discObj = {}; f.disc.forEach((l) => { const i = l.querySelector("input"); discObj[i.value] = i.checked; });
      const d = await api("article/meta/save", { body: {
        id: a.id, change_summary: f.summary.value || undefined,
        meta: { article_type: f.type.value || null, section_id: f.section.value ? Number(f.section.value) : null, region_slug: f.region.value || null,
          primary_country: f.country.value || null, content_class: f.cls.value || null, labels: checked(f.labels), methodology: f.method.value || null,
          pr_provided_by: f.prBy.value || null, pr_original_source_url: f.prUrl.value || null, pr_original_date: f.prDate.value || null, disclosure_json: discObj },
        relations: { topic_ids: picked(f.topics), entities: picked(f.entities).map((id) => ({ id })), series_ids: picked(f.series),
          countries: codes, primary_country: primary || undefined, related: rel }
      } });
      if (d) { notify("Saved" + (d.revision ? " (revision " + d.revision + ")" : "")); setTab("article"); }
    };

    panel.append(h("h3", {}, "Classification & relations"),
      label("Article type", f.type), label("Section", f.section), label("Region", f.region), label("Primary country (ISO code)", f.country),
      label("Additional countries (comma-separated)", f.countries), label("Commercial classification", f.cls),
      label("Labels", h("div", {}, f.labels)), label("Topics", f.topics), label("Entities", f.entities), label("Series", f.series),
      label("Related stories", f.related), label("Reporting & methodology (public, plain text)", f.method),
      h("fieldset", {}, h("legend", {}, "Press release (required for Press Release type)"), label("Provided by", f.prBy), label("Original source URL", f.prUrl), label("Original date", f.prDate)),
      label("Disclosures shown on this article", h("div", {}, f.disc)), label("Change summary", f.summary),
      h("button", { type: "button", class: "btn btn--primary", onclick: saveMeta }, "Save classification"));

    // sources
    const rows = h("div");
    const addRow = (s) => {
      const r = { name: h("input", { type: "text", placeholder: "Source name", value: s.source_name || "" }),
        type: h("select", {}, m.source_types.map((t) => h("option", { value: t, selected: (s.source_type || "other") === t }, pretty(t)))),
        url: h("input", { type: "url", placeholder: "https://…", value: s.source_url || "" }),
        date: h("input", { type: "text", placeholder: "Date", value: s.source_date || "", style: "max-width:130px" }),
        author: h("input", { type: "text", placeholder: "Author", value: s.author || "" }),
        desc: h("input", { type: "text", placeholder: "Description", value: s.description || "" }) };
      const row = h("div", { class: "nr-source", style: "border:1px solid #ddd;padding:8px;margin-bottom:8px;display:grid;gap:6px" },
        r.name, r.type, r.url, r.date, r.author, r.desc, h("button", { type: "button", class: "btn btn--sm", onclick: () => row.remove() }, "Remove"));
      row._r = r; rows.append(row);
    };
    b.sources.forEach(addRow);
    if (P.manage_sources) {
      panel.append(h("h3", {}, "Sources"), rows,
        h("button", { type: "button", class: "btn btn--sm", onclick: () => addRow({}) }, "Add source"), " ",
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
          const list = Array.from(rows.children).map((row, i) => ({ source_name: row._r.name.value, source_type: row._r.type.value, source_url: row._r.url.value || null,
            source_date: row._r.date.value || null, author: row._r.author.value || null, description: row._r.desc.value || null, display_order: i }));
          const d = await api("sources/save", { body: { id: a.id, sources: list } }); if (d) { notify("Sources saved"); setTab("article"); }
        } }, "Save sources"));
    } else {
      panel.append(h("h3", {}, "Sources"), h("p", { class: "muted" }, b.sources.length + " source(s). You do not have permission to edit sources."));
    }

    // workflow
    if (m.workflow_enabled) {
      const to = h("select", {}, m.workflow_statuses.map((s) => h("option", { value: s }, pretty(s))));
      const when = h("input", { type: "datetime-local", "aria-label": "Schedule time" });
      const fcs = h("select", {}, m.fact_check_statuses.map((s) => h("option", { value: s, selected: b.editorial && b.editorial.fact_check_status === s }, pretty(s))));
      const fcn = h("textarea", { rows: 3, placeholder: "Internal fact-check notes (never public)" }, (b.editorial && b.editorial.fact_check_notes) || "");
      const assignee = h("input", { type: "number", min: 1, placeholder: "User ID", value: (b.editorial && b.editorial.assigned_to) || "" });
      panel.append(h("h3", {}, "Workflow (internal)"),
        label("Move to", to), label("Schedule for (scheduled only)", when),
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
          const d = await api("workflow/transition", { body: { id: a.id, to: to.value, scheduled_at: when.value ? new Date(when.value).toISOString() : undefined } });
          if (d) { notify("Moved from " + pretty(d.from) + " to " + pretty(d.to)); setTab("article"); } } }, "Apply"),
        label("Fact-check status", fcs), label("Fact-check notes", fcn),
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const d = await api("factcheck/save", { body: { id: a.id, status: fcs.value, notes: fcn.value } }); if (d) notify("Fact-check saved"); } }, "Save fact-check"),
        label("Assign to (user ID)", assignee),
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const d = await api("workflow/assign", { body: { id: a.id, assigned_to: assignee.value ? Number(assignee.value) : null } }); if (d) notify("Assignment saved"); } }, "Assign"));
    } else {
      panel.append(h("h3", {}, "Workflow"), h("p", { class: "muted" }, "Editorial workflow is disabled (feature flag news_editorial_workflow). Simple publishing applies."));
    }

    // corrections
    const ct = h("select", {}, m.correction_types.map((t) => h("option", { value: t }, pretty(t))));
    const cm = h("textarea", { rows: 3, maxlength: 2000, placeholder: "Public message shown on the article" });
    put(panel, h("h3", {}, "Corrections & updates (public)"),
      h("ul", {}, b.corrections.map((c) => h("li", {}, pretty(c.type) + " — " + c.created_at + ": " + c.public_message))),
      (P.correct || P.retract) ? h("div", {}, label("Type", ct), label("Public message", cm),
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const d = await api("corrections/add", { body: { id: a.id, type: ct.value, public_message: cm.value } }); if (d) { notify("Added"); setTab("article"); } } }, "Publish correction")) : null);

    // timeline
    if (a.article_type === "live") {
      const tb = h("textarea", { rows: 2, maxlength: 2000, placeholder: "New timeline update" });
      panel.append(h("h3", {}, "Live timeline"), h("ul", {}, b.timeline.map((t) => h("li", {}, t.update_time + " — " + t.body + (t.editor_name ? " (" + t.editor_name + ")" : "")))), tb,
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const d = await api("timeline/add", { body: { id: a.id, body: tb.value } }); if (d) setTab("article"); } }, "Add update"));
    }

    // revisions
    const detail = h("pre", { style: "white-space:pre-wrap;max-height:300px;overflow:auto" });
    panel.append(h("h3", {}, "Revision history"),
      b.revisions && b.revisions.length ? h("table", { class: "admin-table" }, h("thead", {}, h("tr", {}, ["Ver", "When", "By", "Summary", "Fields", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, b.revisions.map((r) => h("tr", {}, h("td", {}, r.version_number), h("td", {}, r.changed_at), h("td", {}, r.changed_by == null ? "" : "user " + r.changed_by),
          h("td", {}, r.change_summary || ""), h("td", {}, r.changed_fields.join(", ")),
          h("td", {}, h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
            const d = await api("revision?id=" + a.id + "&v=" + r.version_number);
            if (d) detail.textContent = JSON.stringify({ previous: d.revision.previous_values, new: d.revision.new_values }, null, 2); } }, "Inspect")))))) : h("p", { class: "muted" }, "No revisions recorded yet."),
      detail, h("p", { class: "muted" }, "Versions are for inspection only; nothing is restored automatically."));
  }

