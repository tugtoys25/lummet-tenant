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

    // embargo: the story cannot go live (published or scheduled) before this time; checked on every publishing path
    {
      const eb = await api("embargo/get?id=" + a.id);
      if (eb) {
        const cur = eb.embargo;
        const untilIn = h("input", { type: "datetime-local", "aria-label": "Embargo until" });
        const noteIn = h("input", { type: "text", maxlength: 200, placeholder: "Why (internal note)", value: cur ? cur.note : "", style: "width:100%" });
        const wall = async (v) => (v ? (window.nrZone ? window.nrZone.wallToIso(v, await window.nrZone.site()) : new Date(v).toISOString()) : null);
        const save = async (until) => { const d = await api("embargo/save", { body: { id: a.id, until, note: noteIn.value } }); if (d) { notify(until ? "Embargo set" : "Embargo lifted"); setTab("article"); } };
        panel.append(h("h3", {}, "Embargo"),
          h("p", { class: "muted" }, cur ? "Embargoed until " + new Date(cur.until).toLocaleString() + (cur.note ? " (" + cur.note + ")" : "") + ". It cannot be published or scheduled before then." : "No embargo. Set one to stop this story going live before a chosen time."),
          eb.can ? h("div", {}, label("Embargo until", untilIn), label("Note", noteIn),
            h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => { const iso = await wall(untilIn.value); if (!iso) { notify("Choose a date and time", "error"); return; } save(iso); } }, cur ? "Change embargo" : "Set embargo"),
            cur ? h("button", { type: "button", class: "btn btn--sm", onclick: () => save(null) }, "Lift embargo") : null) : null);
      }
    }

    // poll (one question per article, off unless the Polls switch is on). Votes are never deleted; options lock once voting starts.
    {
      const pd = await api("poll/get?id=" + a.id);
      if (pd && pd.enabled) {
        const p = pd.poll;
        const q = h("input", { type: "text", maxlength: 200, value: p ? p.question : "", placeholder: "Your question", style: "width:100%", "aria-label": "Poll question" });
        const opts = h("textarea", { rows: 4, placeholder: "One option per line (2 to 6)", "aria-label": "Poll options" }, p ? p.options.map((o) => o.label).join("\n") : "");
        if (p && p.total > 0) opts.disabled = true;
        const closes = h("input", { type: "datetime-local", "aria-label": "Poll closes at (optional)" });
        const wall = async (v) => (v ? (window.nrZone ? window.nrZone.wallToIso(v, await window.nrZone.site()) : new Date(v).toISOString()) : null);
        panel.append(h("h3", {}, "Poll"),
          p ? h("p", { class: "muted" }, p.total + " vote(s)" + (p.closed ? " · closed" : "") + (p.total > 0 ? ". The options are locked now that people have voted." : "") + (p.options.length ? " · " + p.options.map((o) => o.label + " " + o.pct + "%").join(", ") : "")) : h("p", { class: "muted" }, "No poll on this story yet."),
          pd.can ? h("div", {}, label("Question", q), label("Options", opts), label("Closes at (optional)", closes),
            h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => { const d = await api("poll/save", { body: { id: a.id, question: q.value, options: opts.value.split(/\r?\n/), closes_at: await wall(closes.value) } }); if (d) { notify("Poll saved"); setTab("article"); } } }, p ? "Save poll" : "Add poll"),
            p && !p.closed ? h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const d = await api("poll/close", { body: { id: a.id } }); if (d) { notify("Poll closed"); setTab("article"); } } }, "Close poll") : null) : null);
      }
    }

    // live blog (off unless the Live blogs switch is on). Updates are plain text, shown at once, and never deleted: a mistake is hidden.
    {
      const ld = await api("live/get?id=" + a.id);
      if (ld && ld.enabled) {
        const L = ld.live;
        const act = async (op, extra, msg) => { const d = await api("live/act", { body: Object.assign({ id: a.id, op }, extra || {}) }); if (d) { notify(msg || "Done"); setTab("article"); } };
        const text = h("textarea", { rows: 3, maxlength: 2000, placeholder: "Write an update (plain text)", "aria-label": "Live update" });
        panel.append(h("h3", {}, "Live blog"),
          h("p", { class: "muted" }, L ? (L.status === "live" ? "LIVE now. The article page refreshes itself every 30 seconds." : "Ended.") : "Not started. Start it to show a live updates block on this story."),
          ld.can ? h("div", {},
            !L || L.status !== "live" ? h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => act("start", null, L ? "Live blog resumed" : "Live blog started") }, L ? "Resume live blog" : "Start live blog") : h("button", { type: "button", class: "btn btn--sm", onclick: () => act("end", null, "Live blog ended") }, "End live blog"),
            L && L.status === "live" ? h("div", {}, label("New update", text), h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => act("post", { body: text.value }, "Posted") }, "Post update")) : null,
            L ? L.posts.map((p) => h("div", { style: "border-top:1px solid #ddd;padding:8px 0;" + (p.hidden ? "opacity:.5" : "") },
              h("div", { class: "muted" }, new Date(p.at).toLocaleString() + (p.pinned ? " · pinned" : "") + (p.hidden ? " · hidden" : "") + (p.edited ? " · edited" : "")),
              h("div", {}, p.body),
              h("button", { type: "button", class: "btn btn--sm", onclick: () => { const t = prompt("Edit update", p.body); if (t !== null) act("edit", { post_id: p.id, body: t }, "Updated"); } }, "Edit"),
              h("button", { type: "button", class: "btn btn--sm", onclick: () => act(p.pinned ? "unpin" : "pin", { post_id: p.id }, p.pinned ? "Unpinned" : "Pinned") }, p.pinned ? "Unpin" : "Pin"),
              h("button", { type: "button", class: "btn btn--sm", onclick: () => act(p.hidden ? "unhide" : "hide", { post_id: p.id }, p.hidden ? "Shown again" : "Hidden from readers") }, p.hidden ? "Show again" : "Hide"))) : null) : null);
      }
    }

    // image focal point (off unless the switch is on): click the important spot; cards and headers keep it in view when they crop
    {
      const fd = await api("focus/get?id=" + a.id);
      if (fd && fd.enabled) {
        panel.append(h("h3", {}, "Image focal point"));
        if (!fd.image) panel.append(h("p", { class: "muted" }, "This story has no featured picture yet."));
        else {
          let pt = fd.focus ? { x: fd.focus.x, y: fd.focus.y } : { x: 50, y: 50 };
          const big = h("img", { src: fd.image.url, alt: fd.image.alt || "Featured picture", style: "max-width:100%;max-height:320px;display:block;cursor:crosshair" });
          const dot = h("span", { style: "position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #2563eb;pointer-events:none" });
          const crop = (ratio) => { const i = h("img", { src: fd.image.url, alt: "", style: "width:100%;height:100%;object-fit:cover" }); return { i, box: h("div", { style: "overflow:hidden;border-radius:6px;aspect-ratio:" + ratio + ";width:" + (ratio === "1/1" ? "110px" : "200px") }, i) }; };
          const wide = crop("16/9"), sq = crop("1/1");
          const xi = h("input", { type: "number", min: 0, max: 100, value: pt.x, style: "width:70px", "aria-label": "Focal point, percent from the left" });
          const yi = h("input", { type: "number", min: 0, max: 100, value: pt.y, style: "width:70px", "aria-label": "Focal point, percent from the top" });
          const place = () => { dot.style.left = pt.x + "%"; dot.style.top = pt.y + "%"; wide.i.style.objectPosition = sq.i.style.objectPosition = pt.x + "% " + pt.y + "%"; xi.value = pt.x; yi.value = pt.y; };
          big.addEventListener("click", (e) => { const r = big.getBoundingClientRect(); pt = { x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) }; place(); });
          const typed = () => { pt = { x: Math.max(0, Math.min(100, Number(xi.value) || 0)), y: Math.max(0, Math.min(100, Number(yi.value) || 0)) }; place(); };
          xi.addEventListener("change", typed); yi.addEventListener("change", typed);
          const save = async (x, y, msg) => { const d = await api("focus/save", { body: { id: a.id, x, y } }); if (d) { notify(msg); setTab("article"); } };
          panel.append(h("p", { class: "muted" }, fd.focus ? "Saved focal point: " + fd.focus.x + "% across, " + fd.focus.y + "% down." : "No focal point saved. Click the most important spot of the picture. The previews show how a wide and a square crop will look."),
            h("div", { style: "position:relative;display:inline-block" }, big, dot),
            h("div", { style: "display:flex;gap:12px;align-items:flex-start;margin:8px 0;flex-wrap:wrap" }, wide.box, sq.box),
            fd.can ? h("div", {}, label("Across (%)", xi), label("Down (%)", yi),
              h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => save(pt.x, pt.y, "Focal point saved") }, "Save focal point"),
              fd.focus ? h("button", { type: "button", class: "btn btn--sm", onclick: () => save(null, null, "Focal point cleared") }, "Clear") : null) : null);
          place();
        }
      }
    }

    // translations (off unless the switch is on): an article's language, and which other articles are its translations
    {
      const ld = await api("lang/get?id=" + a.id);
      if (ld && ld.enabled) {
        const act = async (route, extra, msg) => { const d = await api(route, { body: Object.assign({ id: a.id }, extra || {}) }); if (d) { notify(msg); setTab("article"); } };
        const code = h("input", { type: "text", list: "nr-lang-list", maxlength: 12, value: ld.lang || "", placeholder: "en, fr, rw, pt-BR", style: "width:110px", "aria-label": "Article language code" });
        const datalist = h("datalist", { id: "nr-lang-list" }, ["en", "fr", "rw", "sw", "es", "pt", "ar", "de", "it", "zh", "hi"].map((c) => h("option", { value: c })));
        panel.append(h("h3", {}, "Language and translations"), datalist,
          h("p", { class: "muted" }, ld.lang ? "This article is in " + ld.lang + (ld.siblings.length ? ". Translations: " + ld.siblings.map((s) => s.lang + " (" + (s.published ? "live" : "not published") + ")").join(", ") + "." : ". No translations linked yet.") : "No language set. Set it first, then link translations."),
          ld.can ? h("div", {}, label("Language of this article", code), h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => act("lang/set", { lang: code.value }, "Language saved") }, "Save language"),
            ld.lang ? h("button", { type: "button", class: "btn btn--sm", onclick: () => { if (confirm("Remove this article from its translation group? The articles themselves are kept.")) act("lang/unlink", null, "Removed from the group"); } }, "Remove from group") : null) : null);
        if (ld.lang && ld.can) {
          const q = h("input", { type: "search", placeholder: "Search for the translation by title", style: "width:100%", "aria-label": "Search articles" });
          const out = h("div", {});
          const run = async () => {
            const d = await api("search?q=" + encodeURIComponent(q.value.trim())); out.replaceChildren(); if (!d) return;
            d.articles.filter((x) => x.id !== a.id).slice(0, 15).forEach((x) => {
              const lang = h("input", { type: "text", maxlength: 12, placeholder: "language", style: "width:90px", "aria-label": "Language of " + x.title });
              out.append(h("div", { style: "border-top:1px solid #ddd;padding:6px 0" }, h("strong", {}, x.title), h("span", { class: "muted" }, "  #" + x.id), " ", lang,
                h("button", { type: "button", class: "btn btn--sm", onclick: () => act("lang/link", { other_id: x.id, lang: lang.value }, "Linked as a translation") }, "Link as translation")));
            });
          };
          q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
          panel.append(h("div", {}, h("p", { class: "muted" }, "Link an existing article as a translation of this one:"), h("div", { style: "display:flex;gap:8px" }, q, h("button", { type: "button", class: "btn btn--sm", onclick: run }, "Search")), out));
        }
      }
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
          const d = await api("workflow/transition", { body: { id: a.id, to: to.value, scheduled_at: when.value ? (window.nrZone ? window.nrZone.wallToIso(when.value, await window.nrZone.site()) : new Date(when.value).toISOString()) : undefined } });
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
      detail, h("p", { class: "muted" }, "Use Compare and restore below to bring an earlier version back; nothing is restored automatically."));
    await renderRevisionTools(panel, b, a);
    await renderBylines(panel, b, a);
    await renderIndexNowBox(panel, b, a);
  }

