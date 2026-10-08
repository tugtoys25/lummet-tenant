// static/js/newsroom-admin.js  --  Newsroom admin page (/en/dashboard/newsroom)
// Vanilla JS, no dependencies. ALL dynamic content is inserted with
// textContent / value (never innerHTML), so editor-supplied strings cannot
// inject markup. The server enforces every permission; the UI only hides
// controls it knows the server would refuse.
(function () {
  "use strict";
  const API = "/en/api/v1/newsroom/";
  const state = { meta: null, articleId: null, tab: "queues" };

  // ── tiny DOM helper ────────────────────────────────────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = !!v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  // Real DOM append() turns null/undefined/false into the TEXT "null"/"undefined"/"false": drop them first.
  const put = (el, ...kids) => el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  const $ = (id) => document.getElementById(id);
  const label = (text, control) => h("div", { class: "form-group" }, h("label", {}, text), control);
  const pretty = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

  function notify(msg, type) {
    const a = $("nrAlert"); if (!a) return;
    a.className = "alert alert--" + (type || "success");
    a.textContent = msg; a.style.display = "block";
    if (type !== "error") setTimeout(() => { a.style.display = "none"; }, 4000);
  }

  async function api(route, opts) {
    const init = { credentials: "same-origin", headers: {} };
    if (opts && opts.body !== undefined) {
      init.method = "POST"; init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body);
    }
    try {
      const res = await fetch(API + route, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) { notify(data.error || ("Request failed (" + res.status + ")"), "error"); return null; }
      return data;
    } catch { notify("Network error", "error"); return null; }
  }

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

  // ── Taxonomy ───────────────────────────────────────────────
  async function renderTaxonomy(panel) {
    const P = state.meta.permissions || {};
    const kinds = ["sections", "topics", "entities", "series"];
    const kind = h("select", { onchange: () => load() }, kinds.map((k) => h("option", { value: k }, pretty(k))));
    const list = h("div");
    panel.append(label("Kind", kind), list);
    if (P.manage_taxonomy) {
      const nm = h("input", { type: "text", maxlength: 160, placeholder: "Name" });
      const sl = h("input", { type: "text", placeholder: "slug (optional)" });
      const ds = h("textarea", { rows: 2, placeholder: "Description" });
      const et = h("select", {}, state.meta.entity_types.map((t) => h("option", { value: t }, pretty(t))));
      const wu = h("input", { type: "url", placeholder: "Website (entities)" });
      panel.append(h("h3", {}, "Add new"), label("Name", nm), label("Slug", sl), label("Description", ds), label("Entity type (entities only)", et), label("Website (entities only)", wu),
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
          const body = { kind: kind.value, name: nm.value, slug: sl.value || undefined, description: ds.value || undefined };
          if (kind.value === "entities") { body.entity_type = et.value; if (wu.value) body.website_url = wu.value; }
          const d = await api("taxonomy/save", { body }); if (d) { notify("Created /" + d.slug); nm.value = sl.value = ds.value = wu.value = ""; load(); } } }, "Create"));
    }
    if (P.manage_taxonomy) renderRegionMapping(panel);
    async function load() {
      list.replaceChildren();
      const d = await api("taxonomy/list?kind=" + kind.value + "&all=1"); if (!d) return;
      list.append(h("table", { class: "admin-table" }, h("thead", {}, h("tr", {}, ["Name", "Slug", "Active", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, d.items.map((i) => h("tr", {}, h("td", {}, i.name), h("td", {}, i.slug), h("td", {}, i.active ? "Yes" : "No"),
          h("td", {}, P.manage_taxonomy ? h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
            const r = await api("taxonomy/archive", { body: { kind: kind.value, id: i.id, active: !i.active } }); if (r) load(); } }, i.active ? "Archive" : "Restore") : null))))));
    }
    load();
  }

  // ── Region -> countries mapping (used by /en/news/<region> pages) ──
  async function renderRegionMapping(panel) {
    const region = h("select", { "aria-label": "Region" }, state.meta.regions.map((r) => h("option", { value: r.slug }, r.name)));
    const codes = h("textarea", { rows: 3, "aria-label": "Country codes", placeholder: "DE, FR, IT, ES" });
    const load = async () => { const d = await api("regions/countries?region=" + encodeURIComponent(region.value)); if (d) codes.value = d.country_codes.join(", "); };
    region.addEventListener("change", load);
    panel.append(h("h3", {}, "Region countries"),
      h("p", { class: "muted" }, "Which countries belong to each region (two-letter ISO codes, comma-separated). Region pages list articles tagged with the region plus articles about these countries."),
      label("Region", region), label("Country codes", codes),
      h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
        const list = codes.value.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
        const r = await api("regions/countries/save", { body: { region_slug: region.value, country_codes: list } }); if (r) notify("Saved " + r.count + " countries"); } }, "Save countries"));
    load();
  }

  // ── Homepage: lead / featured / trending pins ──────────────
  const toLocalInput = (s) => { if (!s) return ""; const d = new Date(String(s).replace(" ", "T") + "Z"); if (Number.isNaN(d.getTime())) return ""; const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); };
  const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

  async function renderHomepageAdmin(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.review) { panel.append(h("p", { class: "muted" }, "You do not have permission to pin stories.")); return; }
    panel.append(h("p", { class: "muted" }, "Pinned stories override the automatic choice on the News homepage. A pin only takes effect while the article is live and inside its start/end window; sponsored and press-release content is never auto-promoted, but an editor may pin it as the lead."));
    for (const [slot, title, hint] of [["lead", "Top story", "The first live pin becomes the lead story."], ["featured", "Featured", "Shown first in Latest news."], ["trending", "Trending", "Shown first in Trending (needs news_trending)."]]) {
      const d = await api("pins/list?slot=" + slot); if (!d) return;
      const items = d.pins.map((p) => ({ news_id: p.news_id, title: p.title, slug: p.slug, starts: toLocalInput(p.starts_at), ends: toLocalInput(p.ends_at) }));
      const holder = h("div");
      const draw = () => {
        holder.replaceChildren(items.length ? h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
          h("thead", {}, h("tr", {}, ["Article", "From", "Until", ""].map((t) => h("th", {}, t)))),
          h("tbody", {}, items.map((it, i) => h("tr", {},
            h("td", {}, h("strong", {}, it.title), h("br"), h("span", { class: "muted" }, "/" + it.slug)),
            h("td", {}, h("input", { type: "datetime-local", value: it.starts, "aria-label": "Start", onchange: (e) => { it.starts = e.target ? e.target.value : it.starts; } })),
            h("td", {}, h("input", { type: "datetime-local", value: it.ends, "aria-label": "End", onchange: (e) => { it.ends = e.target ? e.target.value : it.ends; } })),
            h("td", {}, h("button", { type: "button", class: "btn btn--sm", disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } }, "Up"), " ",
              h("button", { type: "button", class: "btn btn--sm", onclick: () => { items.splice(i, 1); draw(); } }, "Remove"))))))) : h("p", { class: "muted" }, "Nothing pinned: the automatic choice is used."));
      };
      draw();
      const q = h("input", { type: "search", maxlength: 100, placeholder: "Find a published article to pin", "aria-label": "Find article for " + title });
      const found = h("div");
      const search = async () => {
        const r = await api("search?status=published&q=" + encodeURIComponent(q.value)); found.replaceChildren(); if (!r) return;
        found.append(h("ul", {}, r.articles.slice(0, 8).map((a) => h("li", {}, a.title + " ", h("button", { type: "button", class: "btn btn--sm", onclick: () => {
          if (!items.some((x) => x.news_id === a.id) && items.length < 10) { items.push({ news_id: a.id, title: a.title, slug: a.slug, starts: "", ends: "" }); draw(); } } }, "Pin")))));
      };
      panel.append(h("section", { style: "margin:0 0 28px" }, h("h3", {}, title), h("p", { class: "muted" }, hint), holder,
        h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin:8px 0" }, q, h("button", { type: "button", class: "btn btn--sm", onclick: search }, "Find")), found,
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
          const r = await api("pins/save", { body: { slot, items: items.map((it) => ({ news_id: it.news_id, starts_at: fromLocalInput(it.starts), ends_at: fromLocalInput(it.ends) })) } });
          if (r) notify(title + ": saved " + r.count + " pin" + (r.count === 1 ? "" : "s")); } }, "Save " + title)));
    }
  }

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

  // ── Authors (newsroom profile fields) ──────────────────────
  async function renderAuthors(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.manage_authors) { panel.append(h("p", { class: "muted" }, "You do not have permission to manage author profiles.")); return; }
    const d = await api("authors/list"); if (!d) return;
    const body = h("tbody");
    for (const a of d.authors) {
      body.append(h("tr", {}, h("td", {}, h("strong", {}, a.name), h("br"), h("span", { class: "muted" }, "/en/author/" + a.slug)),
        h("td", {}, a.role || ""), h("td", {}, a.job_title || ""), h("td", {}, a.location || ""),
        h("td", {}, h("button", { type: "button", class: "btn btn--sm", onclick: () => editAuthor(panel, a) }, "Edit"))));
    }
    panel.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["Author", "Role", "Job title", "Location", ""].map((t) => h("th", {}, t)))), body)));
  }

  function editAuthor(panel, a) {
    const role = h("select", {}, h("option", { value: "" }, "(keep current)"), state.meta.author_roles.map((r) => h("option", { value: r, selected: a.role === r }, r)));
    const jt = h("input", { type: "text", maxlength: 120, value: a.job_title || "" });
    const ex = h("input", { type: "text", maxlength: 500, value: a.expertise || "", placeholder: "Regulation, Payments, Sports betting" });
    const lo = h("input", { type: "text", maxlength: 120, value: a.location || "" });
    const ws = h("input", { type: "url", value: a.website_url || "", placeholder: "https://…" });
    panel.replaceChildren(h("h2", {}, "Edit " + a.name),
      label("Role", role), label("Job title (shown instead of the role when the newsroom taxonomy is on)", jt),
      label("Expertise (comma-separated)", ex), label("Based in", lo), label("Website", ws),
      h("button", { type: "button", class: "btn btn--primary", onclick: async () => {
        const body = { id: a.id, job_title: jt.value, expertise: ex.value, location: lo.value, website_url: ws.value };
        if (role.value) body.role = role.value;
        const r = await api("authors/profile/save", { body }); if (r) { notify("Author saved"); setTab("authors"); } } }, "Save"), " ",
      h("button", { type: "button", class: "btn btn--sm", onclick: () => setTab("authors") }, "Back"));
  }

  // ── Flags (news_* feature flags) ────────────────────────────
  async function renderFlags(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.manage_settings) { panel.append(h("p", { class: "muted" }, "You do not have permission to change newsroom feature flags.")); return; }
    const d = await api("flags"); if (!d) return;
    put(panel, h("p", { class: "muted" }, "Each flag takes effect within about 30 seconds everywhere, plus whatever is left of the page cache (up to a few minutes on public pages). Nothing here changes data -- only what is shown."));
    const rows = [];
    for (const f of d.flags) {
      const toggle = h("input", { type: "checkbox", checked: f.value, "aria-label": f.label });
      toggle._flagKey = f.key;
      rows.push(h("tr", {},
        h("td", {}, h("strong", {}, f.label), h("br"), h("span", { class: "muted" }, f.key)),
        h("td", {}, f.help || ""),
        h("td", {}, h("label", { class: "nr-flag-switch" }, toggle, " ", f.value ? "On" : "Off"))));
      rows[rows.length - 1]._toggle = toggle;
    }
    const table = h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["Flag", "What it does", "Status"].map((t) => h("th", {}, t)))),
      h("tbody", {}, rows));
    const saveAll = h("button", { type: "button", class: "btn btn--primary", style: "margin-top:12px", onclick: async () => {
      const flags = {}; for (const r of rows) flags[r._toggle._flagKey] = r._toggle.checked;
      const res = await api("flags/save", { body: { flags } });
      if (res) { notify("Saved " + res.updated + " flag" + (res.updated === 1 ? "" : "s")); setTab("flags"); }
    } }, "Save changes");
    put(panel, h("div", { style: "overflow-x:auto" }, table), saveAll);
  }

  // ── Policies (editorial trust center) ──────────────────────
  async function renderPolicies(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.manage_settings) { panel.append(h("p", { class: "muted" }, "You do not have permission to manage editorial policy pages.")); return; }
    const d = await api("trust-pages/list"); if (!d) return;
    panel.append(h("p", { class: "muted" }, "Policy pages are created as unpublished drafts. Complete every [[FILL IN]] item and remove the draft notice before publishing; the server refuses to publish otherwise."));
    const body = h("tbody");
    for (const p of d.pages) {
      body.append(h("tr", {},
        h("td", {}, h("strong", {}, p.template_title), h("br"), h("span", { class: "muted" }, "/en/" + p.slug)),
        h("td", {}, !p.exists ? "Not created" : (p.published ? "Published" : "Draft")),
        h("td", {}, p.exists
          ? h("button", { type: "button", class: "btn btn--sm", onclick: () => editPolicy(panel, p.slug) }, "Edit")
          : h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const r = await api("trust-pages/create", { body: { slug: p.slug } }); if (r) { notify("Draft created"); setTab("policies"); } } }, "Create draft"))));
    }
    panel.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["Page", "Status", ""].map((t) => h("th", {}, t)))), body)));
  }

  async function editPolicy(panel, slug) {
    const d = await api("trust-pages/get?slug=" + encodeURIComponent(slug)); if (!d) return;
    const pg = d.page;
    const title = h("input", { type: "text", maxlength: 160, value: pg.title || "" });
    const seoT = h("input", { type: "text", maxlength: 160, value: pg.seo_title || "" });
    const seoD = h("textarea", { rows: 2, maxlength: 320 }, pg.seo_description || "");
    const content = h("textarea", { rows: 16, style: "width:100%;font-family:monospace" }, typeof pg.content === "string" ? pg.content : "");
    const pub = h("input", { type: "checkbox", checked: Number(pg.published) === 1 });
    panel.replaceChildren(h("h2", {}, "Edit /en/" + slug),
      label("Title", title), label("SEO title", seoT), label("SEO description", seoD),
      label("Content (HTML; unsafe markup is removed on save)", content),
      h("label", {}, pub, " Published"),
      h("div", { style: "margin-top:12px" },
        h("button", { type: "button", class: "btn btn--primary", onclick: async () => {
          const r = await api("trust-pages/save", { body: { slug, title: title.value, seo_title: seoT.value, seo_description: seoD.value, content: content.value, published: pub.checked } });
          if (r) { notify(r.published ? "Saved and published" : "Saved (draft)"); setTab("policies"); } } }, "Save"), " ",
        h("button", { type: "button", class: "btn btn--sm", onclick: () => setTab("policies") }, "Back")));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!$("nrPanel")) return;
    document.querySelectorAll("[data-nr-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.nrTab)));
    const d = await api("meta");
    if (!d) { $("nrPanel").textContent = "Could not load newsroom settings."; return; }
    state.meta = d; setTab("queues");
  });
})();
