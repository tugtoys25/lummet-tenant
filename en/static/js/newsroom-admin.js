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
    else if (tab === "calendar") renderCalendar(panel);
    else if (tab === "reports") renderReports(panel);
    else if (tab === "ops") renderOps(panel);
    else if (tab === "comments") renderComments(panel);
    else if (tab === "push") renderPush(panel);
    else if (tab === "membership") renderMembership(panel);
    else if (tab === "import") renderImport(panel);
    else if (tab === "media") renderMedia(panel);
    else if (tab === "commerce") renderCommerce(panel);
    else if (tab === "safety") renderSafety(panel);
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
    const SLOTS = [["lead", "Top story", "The first live pin becomes the lead story."], ["featured", "Featured", "Shown first in Latest news."], ["trending", "Trending", "Shown first in Trending (needs news_trending)."]];
    const renderSlot = async ([slot, title, hint]) => {
      const d = await api("pins/list?slot=" + slot); if (!d) return;
      const items = d.pins.map((p) => ({ news_id: p.news_id, title: p.title, slug: p.slug, starts: toLocalInput(p.starts_at), ends: toLocalInput(p.ends_at) }));
      const holder = h("div");
      let dragFrom = null;
      const draw = () => {
        holder.replaceChildren(items.length ? h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
          h("thead", {}, h("tr", {}, ["Article", "From", "Until", ""].map((t) => h("th", {}, t)))),
          h("tbody", {}, items.map((it, i) => h("tr", { draggable: "true", title: "Drag to reorder", ondragstart: (e) => { dragFrom = i; if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }, ondragover: (e) => e.preventDefault(), ondrop: (e) => { e.preventDefault(); if (dragFrom === null || dragFrom === i) return; const [mv] = items.splice(dragFrom, 1); items.splice(i, 0, mv); dragFrom = null; draw(); } },
            h("td", {}, h("strong", {}, it.title), h("br"), h("span", { class: "muted" }, "/" + it.slug)),
            h("td", {}, h("input", { type: "datetime-local", value: it.starts, "aria-label": "Start", onchange: (e) => { it.starts = e.target ? e.target.value : it.starts; } })),
            h("td", {}, h("input", { type: "datetime-local", value: it.ends, "aria-label": "End", onchange: (e) => { it.ends = e.target ? e.target.value : it.ends; } })),
            h("td", {}, h("button", { type: "button", class: "btn btn--sm", disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } }, "Up"), " ",
              h("button", { type: "button", class: "btn btn--sm", disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } }, "Down"), " ",
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
    };
    for (const slotDef of SLOTS) await renderSlot(slotDef);

    // Section blocks: each section on the homepage can have its own pinned stories.
    const secs = await api("taxonomy/list?kind=sections");
    const list = ((secs && secs.items) || []).filter((x) => x.active !== 0);
    if (list.length) {
      const pickSec = h("select", { "aria-label": "Section" }, list.map((x) => h("option", { value: x.id }, x.name)));
      const host = h("div");
      const showSec = async () => { host.replaceChildren(); const before = panel.children.length; const cur = list.find((x) => String(x.id) === String(pickSec.value)) || list[0]; await renderSlot(["section:" + cur.id, "Section block: " + cur.name, "Pinned stories come first in this section's block on the News homepage. Leave empty for the automatic choice."]); const added = Array.from(panel.children).slice(before); host.append(...added); };
      panel.append(h("h3", { style: "margin-top:28px" }, "Section blocks"), label("Section", pickSec), host);
      pickSec.addEventListener("change", showSec); showSec();
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
    // Newsroom time zone: every editor sees and types times on the same clock. Times are still stored in UTC.
    const tz = await api("timezone"); if (!tz) return;
    const zoneInput = h("input", { type: "text", value: tz.timezone || "", placeholder: "Leave empty to use each editor's own browser time zone", list: "nrZoneList", style: "width:100%", "aria-label": "Newsroom time zone" });
    const zones = (typeof Intl.supportedValuesOf === "function") ? Intl.supportedValuesOf("timeZone") : [];
    put(panel, h("h3", { style: "margin-top:28px" }, "Time zone"),
      h("p", { class: "muted" }, "Stored times are always UTC. This only decides which clock the calendar, the schedule boxes and the article editor show and accept, so all editors agree. Empty means each editor's own browser time zone. Examples: Africa/Kigali, Europe/London, America/New_York."),
      h("div", { style: "max-width:420px" }, zoneInput, h("datalist", { id: "nrZoneList" }, zones.map((z) => h("option", { value: z }))),
        h("div", { style: "margin-top:8px;display:flex;gap:8px;flex-wrap:wrap" },
          h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => { const r = await api("timezone/save", { body: { timezone: zoneInput.value } }); if (r) { if (window.nrZone) window.nrZone.reset(); notify(r.timezone ? "Time zone set to " + r.timezone : "Using each editor's own time zone"); } } }, "Save time zone"),
          h("button", { type: "button", class: "btn btn--sm", onclick: () => { zoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } }, "Use my current zone"))));
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

  // ── Pro tools: credits, revision compare & restore, week calendar, IndexNow ──
  const BYLINE_ROLES = ["co-author", "reporter", "editor", "photographer", "illustrator", "translator", "contributor"];

  async function renderBylines(panel, b, a) {
    const P = (state.meta && state.meta.permissions) || {};
    const pick = await api("authors/pick");
    const people = (pick && pick.authors) || [];
    const rows = h("div");
    const addRow = (it) => {
      const who = h("select", { "aria-label": "Person" }, h("option", { value: "" }, "Choose a person"),
        people.map((p) => h("option", { value: p.id, selected: Number(it.author_id) === p.id }, p.name)));
      const role = h("select", { "aria-label": "Role" }, BYLINE_ROLES.map((r) => h("option", { value: r, selected: (it.role || "co-author") === r }, pretty(r))));
      const row = h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center" }, who, role,
        h("button", { type: "button", class: "btn btn--sm", onclick: () => row.remove() }, "Remove"));
      row._f = { who, role }; rows.append(row);
    };
    (b.bylines || []).forEach(addRow);
    panel.append(h("h3", {}, "Extra credits (bylines)"),
      h("p", { class: "muted" }, "The main author stays as it is. Add a reporter, editor, photographer or other contributors; they appear under the author and in the article's search-engine data."), rows);
    if (!P.update) return;
    panel.append(h("button", { type: "button", class: "btn btn--sm", onclick: () => addRow({}) }, "Add credit"), " ",
      h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
        const list = Array.from(rows.children).filter((r) => r._f && r._f.who.value).map((r) => ({ author_id: Number(r._f.who.value), role: r._f.role.value }));
        const d = await api("bylines/save", { body: { id: a.id, bylines: list } }); if (d) notify("Credits saved (" + d.count + ")");
      } }, "Save credits"));
  }

  // Line-level diff of two lists (longest common subsequence). Capped so a huge article cannot freeze the page.
  function diffLines(oldLines, newLines) {
    if (oldLines.length * newLines.length > 4000000) return null;
    const n = oldLines.length, m = newLines.length;
    const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = oldLines[i] === newLines[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (oldLines[i] === newLines[j]) { out.push({ k: "same", s: oldLines[i] }); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) { out.push({ k: "del", s: oldLines[i++] }); } else { out.push({ k: "add", s: newLines[j++] }); }
    }
    while (i < n) out.push({ k: "del", s: oldLines[i++] });
    while (j < m) out.push({ k: "add", s: newLines[j++] });
    return out;
  }
  const chunks = (html) => String(html || "").split(/(?<=<\/p>|<\/h[1-6]>|<\/li>|<\/blockquote>|<br\s*\/?>|\n)/i).map((s) => s.trim()).filter(Boolean);

  function renderDiff(box, diff, a, version) {
    box.replaceChildren();
    const P = (state.meta && state.meta.permissions) || {};
    box.append(h("h4", {}, "Version " + version + " compared with the current article"));
    if (diff.drift) box.append(h("p", { class: "alert alert--error" }, "Some edits were made outside the recorded history, so this version may not be exact. A restore is saved as a new revision, so it can be undone."));
    if (!diff.changed.length) { box.append(h("p", { class: "muted" }, "This version is the same as the current article.")); return; }
    for (const f of diff.changed) {
      const was = diff.current_values[f], will = diff.version_values[f];
      box.append(h("h5", { style: "margin:12px 0 4px" }, pretty(f)));
      if (f === "content") {
        const d = diffLines(chunks(was), chunks(will));
        if (!d) { box.append(h("p", { class: "muted" }, "The text is too long to compare line by line. Current length " + String(was || "").length + ", version length " + String(will || "").length + " characters.")); continue; }
        box.append(h("div", { style: "max-height:320px;overflow:auto;border:1px solid #ddd;padding:8px;font-family:monospace;font-size:12px;white-space:pre-wrap" },
          d.filter((x) => x.k !== "same").length ? d.map((x) => h("div", { style: x.k === "del" ? "background:#fde8e8" : x.k === "add" ? "background:#e6f7e9" : "color:#888" }, (x.k === "del" ? "− " : x.k === "add" ? "+ " : "  ") + x.s)) : "No visible text difference."));
      } else {
        box.append(h("div", { style: "font-size:13px" }, h("div", { style: "background:#fde8e8;padding:2px 6px" }, "− Current: " + (was === null ? "(empty)" : String(was))), h("div", { style: "background:#e6f7e9;padding:2px 6px" }, "+ Restore to: " + (will === null ? "(empty)" : String(will)))));
      }
    }
    box.append(h("p", { class: "muted" }, "Red lines would be removed, green lines would come back. The address and published state are never changed by a restore."));
    if (P.update) box.append(h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
      if (!window.confirm("Restore the " + diff.changed.length + " changed field(s) to version " + version + "? The current text is kept in the history.")) return;
      const r = await api("revision/restore", { body: { id: a.id, version } });
      if (r) { notify("Restored version " + version + (r.revision ? " (new revision " + r.revision + ")" : "")); setTab("article"); }
    } }, "Restore version " + version));
  }

  async function renderRevisionTools(panel, b, a) {
    if (!b.revisions || !b.revisions.length) return;
    const box = h("div", { style: "margin-top:12px" });
    panel.append(h("h3", {}, "Compare and restore"),
      h("p", { class: "muted" }, "Pick a version to compare it with the current article, then restore it if you want it back."),
      h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" },
        h("select", { "aria-label": "Version", id: "nrCmpVer" }, [h("option", { value: "0" }, "Before the first recorded edit")].concat(b.revisions.map((r) => h("option", { value: r.version_number }, "Version " + r.version_number + " · " + (r.changed_at || "") + (r.change_summary ? " · " + r.change_summary : ""))))),
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
          const v = Number($("nrCmpVer").value);
          const d = await api("revision/diff?id=" + a.id + "&v=" + v); if (d) renderDiff(box, d.diff, a, v);
        } }, "Compare")), box);
  }

  async function renderIndexNowBox(panel, b, a) {
    const P = (state.meta && state.meta.permissions) || {};
    panel.append(h("h3", {}, "Search engines (IndexNow)"));
    const pings = b.pings || [];
    panel.append(pings.length ? h("ul", {}, pings.map((p) => h("li", {}, p.created_at + " · " + p.reason + " · " + p.status + (p.http_status ? " (" + p.http_status + ")" : ""))))
      : h("p", { class: "muted" }, "Nothing sent yet for this article. Turn on IndexNow in the Flags tab to send new and corrected articles automatically."));
    if (P.publish || P.manage_settings) panel.append(h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
      const d = await api("indexnow/ping", { body: { id: a.id } }); if (d) { notify(d.sent ? "Sent to search engines" : (d.note || "Nothing sent")); setTab("article"); }
    } }, "Send to search engines now"));
  }

  // ── Week calendar ──────────────────────────────────────────
  // Shows the week in the editor's own timezone (or UTC), can be narrowed by section and author, and lets people with the
  // right permission move, unschedule or publish a SCHEDULED story right from the card. Every action is checked again on the server.
  async function renderCalendar(panel) {
    const Z = window.nrZone;
    const siteZone = Z ? await Z.site() : "";
    // Which clock to show: the newsroom's (when one is set), the editor's own browser, or UTC. The choice is remembered.
    const modes = siteZone ? ["site", "mine", "utc"] : ["mine", "utc"];
    let mode = modes[0];
    try { const saved = localStorage.getItem("nrCalZone"); if (modes.indexOf(saved) >= 0) mode = saved; } catch (e) { /* remembered choice is optional */ }
    const zoneId = () => (mode === "site" ? siteZone : mode === "utc" ? "UTC" : "");
    const zoneName = () => (mode === "utc" ? "UTC" : Z ? Z.label(zoneId()) : "your time");
    const dayKey = (iso) => (iso ? (Z ? Z.dayKey(iso, zoneId()) : iso.slice(0, 10)) : "");
    const clock = (iso) => (iso ? (Z ? Z.clock(iso, zoneId()) : iso.slice(11, 16)) : "");
    const addDays = (key, n) => { const x = new Date(key + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const startOfWeek = (key) => { const x = new Date(key + "T00:00:00Z"); return addDays(key, -((x.getUTCDay() + 6) % 7)); };
    const todayKey = () => dayKey(new Date().toISOString());
    // Minutes the chosen clock is ahead of UTC around the start of the shown week (the server turns "local midnight" into UTC with it).
    const tzo = () => (Z ? Z.offsetMin(zoneId(), new Date(state.calFrom + "T12:00:00Z")) : 0);
    if (!state.calFrom) state.calFrom = startOfWeek(todayKey());
    state.calSection = state.calSection || ""; state.calAuthor = state.calAuthor || "";
    const reload = () => setTab("calendar");
    const shift = (days) => { state.calFrom = addDays(state.calFrom, days); reload(); };

    const qs = "from=" + state.calFrom + "&days=7&tzo=" + tzo() + (state.calSection ? "&section=" + encodeURIComponent(state.calSection) : "") + (state.calAuthor ? "&author=" + encodeURIComponent(state.calAuthor) : "");
    const d = await api("calendar?" + qs); if (!d) return;
    const F = d.filters || { sections: [], authors: [] }, C = d.can || {};
    const sectionName = {}; F.sections.forEach((x) => { sectionName[x.id] = x.name; });
    const authorName = {}; F.authors.forEach((x) => { authorName[x.id] = x.name; });

    const pick = (items, current, anyText, set) => { const sel = h("select", { "aria-label": anyText }, [h("option", { value: "" }, anyText), ...items.map((x) => h("option", { value: String(x.id) }, x.name))]); sel.value = current; sel.addEventListener("change", () => { set(sel.value); reload(); }); return sel; };
    const zoneBtn = modes.length > 1 ? h("button", { type: "button", class: "btn btn--sm", "aria-label": "Switch the time zone used on this calendar", onclick: () => { try { localStorage.setItem("nrCalZone", modes[(modes.indexOf(mode) + 1) % modes.length]); } catch (e) { /* ignore */ } reload(); } }, "Times: " + zoneName() + " (switch)") : null;
    panel.append(h("div", { style: "display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap" },
      h("button", { type: "button", class: "btn btn--sm", onclick: () => shift(-7) }, "← Previous week"),
      h("strong", {}, "Week of " + state.calFrom),
      h("button", { type: "button", class: "btn btn--sm", onclick: () => shift(7) }, "Next week →"),
      h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.calFrom = startOfWeek(todayKey()); reload(); } }, "This week"),
      pick(F.sections, state.calSection, "All sections", (v) => { state.calSection = v; }),
      pick(F.authors, state.calAuthor, "All authors", (v) => { state.calAuthor = v; }),
      zoneBtn));

    const colour = { published: "#e6f7e9", scheduled: "#fff4d6" };
    const open = (it) => h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.articleId = it.id; setTab("article"); } }, "Open");
    const act = async (route, it, body, done) => { const r = await api(route, { body: Object.assign({ id: it.id, expected: it.published_at }, body || {}) }); if (r) { notify(done); reload(); } };
    const localInput = (iso) => (Z ? Z.isoToWall(iso, zoneId()) : iso.slice(0, 16));
    const toIso = (v) => (v ? (Z ? Z.wallToIso(v, zoneId()) : "") : "");
    const tools = (it) => {
      if (it.state !== "scheduled" || !(C.schedule || C.publish)) return null;
      const box = h("div", { style: "display:flex;gap:4px;flex-wrap:wrap;margin-top:4px" });
      if (C.schedule) box.append(h("button", { type: "button", class: "btn btn--sm", onclick: () => {
        const input = h("input", { type: "datetime-local", value: localInput(it.at_iso), "aria-label": "New publish time (" + zoneName() + ")" });
        const row = h("div", { style: "margin-top:6px" }, input, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => { const at = toIso(input.value); if (!at) { notify("Choose a date and time", "error"); return; } act("calendar/reschedule", it, { at }, "Rescheduled"); } }, "Save"));
        box.after(row); input.focus();
      } }, "Reschedule"));
      if (C.schedule) box.append(h("button", { type: "button", class: "btn btn--sm", onclick: () => { if (confirm("Unschedule this story and move it back to drafts? Nothing is deleted.")) act("calendar/unschedule", it, null, "Moved back to drafts"); } }, "Unschedule"));
      if (C.publish) box.append(h("button", { type: "button", class: "btn btn--sm", onclick: () => { if (confirm("Publish this story right now?")) act("calendar/publish-now", it, null, "Published"); } }, "Publish now"));
      return box;
    };
    const card = (it) => h("div", { style: "border:1px solid #ddd;border-radius:6px;padding:6px;margin-bottom:6px;font-size:13px;background:" + (colour[it.state] || "#fff") },
      h("div", { class: "muted" }, (it.at_iso ? clock(it.at_iso) + " · " : "") + pretty(it.state) + (it.assigned_to ? " · user " + it.assigned_to : "")),
      h("div", {}, h("strong", {}, it.title)),
      (sectionName[it.section_id] || authorName[it.author_id]) ? h("div", { class: "muted" }, [sectionName[it.section_id], authorName[it.author_id]].filter(Boolean).join(" · ")) : null,
      open(it), tools(it));
    const grid = h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px" });
    const today = todayKey();
    for (let i = 0; i < 7; i++) {
      const key = addDays(state.calFrom, i);
      const items = d.items.filter((it) => dayKey(it.at_iso) === key);
      const label = new Date(key + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
      grid.append(h("div", { style: key === today ? "outline:2px solid #4a6cf7;border-radius:6px;padding:2px" : "" }, h("div", { style: "font-weight:700;margin-bottom:6px" }, label + (key === today ? " (today)" : "")), items.length ? items.map(card) : h("p", { class: "muted" }, "—")));
    }
    panel.append(grid, h("p", { class: "muted", style: "margin-top:8px" }, "Times shown in " + zoneName() + ". Stories that are live are not editable here; open them to make changes."),
      h("h3", { style: "margin-top:24px" }, "Not scheduled yet (drafts and ideas)"),
      d.unscheduled.length ? h("div", {}, d.unscheduled.map(card)) : h("p", { class: "muted" }, "No unscheduled drafts."));
  }
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
  // ── Import from WordPress, RSS or CSV ──────────────────────
  async function renderImport(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    if (!P.manage_settings) { panel.append(h("p", { class: "muted" }, "You need the manage-settings permission to import.")); return; }
    const d = await api("import/list"); if (!d) return;
    panel.append(h("p", { class: "muted" }, "Bring in articles from a WordPress export (Tools > Export > Posts, .xml), any RSS or Atom feed file, or a CSV with a header row (title, content, slug, excerpt, published_at, author, tags, url). Everything arrives as a draft; nothing is published and no existing address is overwritten."),
      h("p", {}, "Status: ", h("strong", {}, d.enabled ? "switched on" : "switched off (turn on “Content import” in Flags)")));
    if (!d.enabled) return;

    const fmt = h("select", {}, [["wordpress", "WordPress export (.xml)"], ["rss", "RSS or Atom file"], ["csv", "CSV file"]].map((x) => h("option", { value: x[0] }, x[1])));
    const file = h("input", { type: "file", accept: ".xml,.rss,.atom,.csv,.txt" });
    const out = h("div", {});
    let text = "", name = "";
    file.addEventListener("change", () => {
      const f = file.files && file.files[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) { notify("That file is larger than 2 MB. Split it and import in parts.", "error"); file.value = ""; return; }
      const r = new FileReader(); name = f.name;
      r.onload = () => { text = String(r.result || ""); };
      r.readAsText(f);
    });
    const show = (res, done) => {
      out.replaceChildren(...[
        h("p", {}, done ? ("Created " + res.created + " drafts, skipped " + res.skipped + ".") : ("Found " + res.found + " articles: " + res.will_create + " will be created as drafts, " + res.will_skip + " will be skipped.")),
        res.over_limit ? h("p", { class: "muted" }, res.over_limit + " more than the 300-article limit were left out. Import them in another run.") : null,
        !done && res.sample ? h("ul", {}, res.sample.map((s) => h("li", {}, s.title + " → /en/news/" + s.slug + (s.skip ? "  (skipped: " + s.skip + ")" : "")))) : null
      ].filter(Boolean));
    };
    const preview = h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
      if (!text) { notify("Choose a file first", "error"); return; }
      const res = await api("import/preview", { body: { format: fmt.value, data: text } }); if (res) show(res, false);
    } }, "Preview");
    const run = h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
      if (!text) { notify("Choose a file first", "error"); return; }
      if (!window.confirm("Create these articles as drafts?")) return;
      const res = await api("import/run", { body: { format: fmt.value, data: text, filename: name } });
      if (res) { show(res, true); notify("Import finished"); }
    } }, "Import as drafts");
    panel.append(h("div", { style: "display:flex;gap:12px;flex-wrap:wrap;align-items:end" }, label("Format", fmt), label("File", file), preview, run), out);

    panel.append(h("h3", { style: "margin-top:24px" }, "Past imports"));
    if (!d.imports.length) { panel.append(h("p", { class: "muted" }, "None yet.")); return; }
    panel.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" },
      h("thead", {}, h("tr", {}, ["When", "Format", "File", "Created", "Skipped", "Old → new addresses"].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.imports.map((i) => h("tr", {}, [i.created_at || "", pretty(i.source_format), i.filename || "", String(i.created_count), String(i.skipped_count)].map((t) => h("td", {}, t)).concat([h("td", {},
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
          const res = await fetch(API + "import/mapping.csv?id=" + i.id, { credentials: "same-origin" });
          if (!res.ok) { notify("Download failed", "error"); return; }
          const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = "import-" + i.id + "-mapping.csv"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        } }, "Download CSV"))])))))));
  }
  // ── Media: podcast feed settings, video and gallery how-to ──
  async function renderMedia(panel) {
    const d = await api("media/status"); if (!d) return;
    const P = (state.meta && state.meta.permissions) || {};
    const f = d.flags || {};
    const on = (v) => (v ? "switched on" : "switched off");
    panel.append(
      h("h3", {}, "Video"), h("p", { class: "muted" }, "Status: " + on(f.news_video_embeds) + ". Put a YouTube link on a paragraph by itself. Readers see a play button and nothing loads from YouTube until they press it."),
      h("h3", {}, "Photo galleries"), h("p", { class: "muted" }, "Status: " + on(f.news_galleries) + ". In the article's HTML view, wrap images in <div class=\"nr-gallery\">…</div>. They show as a grid with a full-screen viewer."),
      h("h3", {}, "Podcast feed"), h("p", { class: "muted" }, "Status: " + on(f.news_podcast) + ". Tag an article with your podcast tag and add an audio player. Submit this address to Apple Podcasts and Spotify: "), h("code", {}, d.feed_url));
    if (!P.manage_settings) return;
    const c = d.podcast || {};
    const inp = (k, ph) => h("input", { type: "text", value: c[k] || "", placeholder: ph || "", style: "width:100%" });
    const fields = { podcast_title: inp("podcast_title", "Show name"), podcast_description: inp("podcast_description", "One or two sentences"), podcast_author: inp("podcast_author", "Host or publisher"), podcast_email: inp("podcast_email", "owner@example.com"), podcast_image: inp("podcast_image", "https://… cover image, 3000×3000"), podcast_tag: inp("podcast_tag", "podcast") };
    const explicit = h("input", { type: "checkbox" }); explicit.checked = c.podcast_explicit === "true";
    const names = { podcast_title: "Title", podcast_description: "Description", podcast_author: "Author", podcast_email: "Owner email", podcast_image: "Cover image address", podcast_tag: "Episode tag" };
    panel.append(h("div", { style: "max-width:560px" }, Object.keys(fields).map((k) => label(names[k], fields[k])), h("label", {}, explicit, " Contains explicit content"), h("div", { style: "margin-top:12px" }, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
      const body = { podcast_explicit: explicit.checked }; Object.keys(fields).forEach((k) => { body[k] = fields[k].value; });
      const r = await api("media/podcast", { body }); if (r) notify("Podcast settings saved");
    } }, "Save podcast settings"))));
  }
  // ── Commerce: affiliate / listing / blog setup for one article, plus the inquiry inbox ──
  async function renderCommerce(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    const idInput = h("input", { type: "number", min: "1", value: state.articleId || "", style: "width:140px", "aria-label": "Article id" });
    const box = h("div", {});
    const load = async () => {
      const id = Number(idInput.value); if (!id) { notify("Enter an article id", "error"); return; }
      const d = await api("commerce/article?id=" + id); if (!d) return;
      state.articleId = id; box.replaceChildren(); buildCommerceForm(box, d, P);
    };
    put(panel,
      h("p", { class: "muted" }, "Turn an article into a product review, a for-sale listing or a blog with widgets. Nothing shows on the site until the Commerce switches are on (Flags tab) and the article's mode is not Editorial. Buy buttons always go through a tracking link (/en/go)."),
      h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px" }, h("label", {}, "Article id "), idInput, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: load }, "Load")),
      box);
    if (state.articleId) load();
    const inbox = h("div", { style: "margin-top:28px" });
    panel.append(inbox);
    renderInquiries(inbox, P);
  }

  function buildCommerceForm(box, d, P) {
    const cfg = d.config || {};
    const f = d.flags || {};
    const off = ["news_commerce", "news_commerce_widgets", "news_commerce_sticky_bar", "news_commerce_gallery", "news_commerce_inquiry"].filter((k) => !f[k]);
    put(box, h("h3", {}, d.article.title),
      off.length ? h("p", { class: "muted" }, "Currently switched off (Flags tab): " + off.join(", ")) : null);
    const mode = h("select", {}, ["editorial", "review", "listing", "blog"].map((m) => h("option", { value: m, selected: cfg.mode === m }, pretty(m))));
    const cta = h("input", { type: "text", value: cfg.cta_label || "", maxlength: "30", placeholder: "Buy now", style: "width:100%" });
    const disc = h("textarea", { rows: "2", maxlength: "400", style: "width:100%", placeholder: "Leave empty for the standard affiliate disclosure" }, cfg.disclosure_text || "");
    disc.value = cfg.disclosure_text || "";
    const sticky = h("input", { type: "checkbox", checked: cfg.sticky_enabled !== false });
    put(box, label("Mode (Editorial = this article is not changed)", mode), label("Default button text", cta), label("Disclosure text", disc), h("label", {}, sticky, " Show the mobile sticky bar"));

    let links = [];
    const widgetsBox = h("div", {}); const widgetForms = [];
    const addWidget = (w) => {
      const wf = {}; wf.id = w.id || null;
      const sel = (opts, cur) => h("select", {}, opts.map((o) => h("option", { value: o, selected: cur === o }, pretty(o))));
      wf.slot = sel(["top", "bottom", "below", "sticky"], w.slot || "top");
      wf.type = sel(["buy", "product", "price", "inquiry", "cta"], w.widget_type || "buy");
      wf.title = h("input", { type: "text", value: w.title || "", maxlength: "120", placeholder: "Title", style: "width:100%" });
      wf.subtitle = h("input", { type: "text", value: w.subtitle || "", maxlength: "200", placeholder: "Subtitle", style: "width:100%" });
      wf.badge = h("input", { type: "text", value: w.badge || "", maxlength: "30", placeholder: "Badge, e.g. Our pick" });
      wf.price = h("input", { type: "text", value: w.price_text || "", maxlength: "40", placeholder: "Price text, e.g. from $199" });
      wf.cta = h("input", { type: "text", value: w.cta_label || "", maxlength: "30", placeholder: "Button text" });
      wf.image = h("input", { type: "text", value: w.image_url || "", placeholder: "Picture address (https://… or /path)", style: "width:100%" });
      wf.link = h("select", {}, h("option", { value: "" }, "— no tracking link —"), links.map((l) => h("option", { value: String(l.id), selected: Number(w.tracking_link_id) === l.id }, l.internal_name + " (" + l.tracking_code + ")" + (l.status !== "active" ? " [" + l.status + "]" : ""))));
      wf.go = h("input", { type: "text", value: w.go_code || "", maxlength: "64", placeholder: "or a /go code or casino slug" });
      wf.status = sel(["active", "paused"], w.status || "active");
      wf.starts = h("input", { type: "text", value: w.starts_at || "", placeholder: "Show from 2026-12-01" });
      wf.ends = h("input", { type: "text", value: w.ends_at || "", placeholder: "Hide after 2026-12-31" });
      wf.specs = h("textarea", { rows: "3", style: "width:100%", placeholder: "Specs, one per line: Label: Value (e.g. Bedrooms: 3)" });
      wf.specs.value = (w.specs || []).map((s) => s.label + ": " + s.value).join("\n");
      wf.position = h("input", { type: "number", value: w.position != null ? w.position : widgetForms.length, style: "width:80px" });
      const wrap = h("fieldset", { style: "border:1px solid var(--light-gray);border-radius:8px;padding:10px;margin:10px 0" });
      wf.el = wrap;
      put(wrap, h("legend", {}, "Widget"),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px" }, label("Position", wf.slot), label("Type", wf.type), label("Order", wf.position), label("Status", wf.status)),
        label("Title", wf.title), label("Subtitle", wf.subtitle),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px" }, label("Badge", wf.badge), label("Price", wf.price), label("Button text", wf.cta)),
        label("Picture", wf.image),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px" }, label("Tracking link", wf.link), label("/go code", wf.go)),
        label("Specs (listings and products)", wf.specs),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px" }, label("Show from", wf.starts), label("Hide after", wf.ends)),
        h("button", { type: "button", class: "btn btn--sm", onclick: () => { wrap.remove(); const i = widgetForms.indexOf(wf); if (i >= 0) widgetForms.splice(i, 1); } }, "Remove widget"));
      widgetForms.push(wf); widgetsBox.append(wrap);
    };

    const gallery = (d.gallery || []).map((g) => ({ media_id: g.media_id, caption: g.caption || "", url: g.thumbnail_url || g.url, alt: g.alt_text || "" }));
    const galBox = h("div", { style: "display:flex;flex-wrap:wrap;gap:10px" });
    const drawGallery = () => {
      galBox.replaceChildren();
      gallery.forEach((g, i) => {
        const cap = h("input", { type: "text", value: g.caption, placeholder: "Caption", maxlength: "200", style: "width:140px", oninput: (e) => { g.caption = e.target.value; } });
        galBox.append(h("figure", { style: "margin:0;width:150px" }, h("img", { src: g.url, alt: g.alt, style: "width:150px;height:100px;object-fit:cover;border-radius:6px" }), cap,
          h("div", {}, h("button", { type: "button", class: "btn btn--sm", onclick: () => { if (i > 0) { gallery.splice(i - 1, 0, gallery.splice(i, 1)[0]); drawGallery(); } } }, "←"), " ",
            h("button", { type: "button", class: "btn btn--sm", onclick: () => { if (i < gallery.length - 1) { gallery.splice(i + 1, 0, gallery.splice(i, 1)[0]); drawGallery(); } } }, "→"), " ",
            h("button", { type: "button", class: "btn btn--sm", onclick: () => { gallery.splice(i, 1); drawGallery(); } }, "✕"))));
      });
    };
    const pickBox = h("div", { style: "margin-top:8px" });
    const pickBtn = h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
      const q = h("input", { type: "text", placeholder: "Search by file name or alt text" });
      const grid = h("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px" });
      const run = async () => {
        const r = await api("commerce/images?q=" + encodeURIComponent(q.value)); if (!r) return; grid.replaceChildren();
        for (const im of r.images) grid.append(h("button", { type: "button", style: "border:1px solid var(--light-gray);padding:2px;background:none;cursor:pointer", title: im.filename || "", onclick: () => {
          if (!gallery.some((g) => g.media_id === im.id)) { gallery.push({ media_id: im.id, caption: "", url: im.thumbnail_url || im.url, alt: im.alt_text || "" }); drawGallery(); }
        } }, h("img", { src: im.thumbnail_url || im.url, alt: im.alt_text || "", style: "width:90px;height:60px;object-fit:cover" })));
      };
      pickBox.replaceChildren(h("div", {}, q, " ", h("button", { type: "button", class: "btn btn--sm", onclick: run }, "Search")), grid); run();
    } }, "Add photos from the media library");

    const parseSpecs = (txt) => String(txt || "").split("\n").map((l) => { const i = l.indexOf(":"); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter(Boolean);
    const saveBtn = h("button", { type: "button", class: "btn btn--primary", style: "margin-top:14px", onclick: async () => {
      const body = {
        id: d.article.id,
        config: { mode: mode.value, cta_label: cta.value, disclosure_text: disc.value, sticky_enabled: sticky.checked },
        widgets: widgetForms.map((w) => ({ slot: w.slot.value, widget_type: w.type.value, position: Number(w.position.value) || 0, title: w.title.value, subtitle: w.subtitle.value, badge: w.badge.value, price_text: w.price.value, cta_label: w.cta.value, image_url: w.image.value, tracking_link_id: w.link.value ? Number(w.link.value) : null, go_code: w.go.value, specs: parseSpecs(w.specs.value), status: w.status.value, starts_at: w.starts.value.trim() || null, ends_at: w.ends.value.trim() || null })),
        gallery: gallery.map((g) => ({ media_id: g.media_id, caption: g.caption }))
      };
      const r = await api("commerce/save", { body }); if (r) notify("Saved " + r.widgets + " widget(s) and " + r.gallery + " photo(s)");
    } }, "Save commerce setup");

    (async () => {
      const lr = await api("commerce/links"); links = (lr && lr.links) || [];
      (d.widgets || []).forEach(addWidget);
      put(box, h("h3", {}, "Widgets"), h("p", { class: "muted" }, "Top = after the first paragraph, Bottom = after the last, Below = in columns under the article, Sticky = the mobile bar."), widgetsBox,
        h("button", { type: "button", class: "btn btn--sm", onclick: () => addWidget({}) }, "Add widget"),
        h("h3", { style: "margin-top:20px" }, "Photo gallery"), galBox, pickBtn, pickBox, h("div", {}, saveBtn));
      drawGallery();
    })();
  }

  async function renderInquiries(box, P) {
    const d = await api("commerce/inquiries"); if (!d) return;
    put(box, h("h3", {}, "Inquiries (for-sale and other non-affiliate content)"));
    if (!d.inquiries.length) { put(box, h("p", { class: "muted" }, "No inquiries yet.")); return; }
    const rows = d.inquiries.map((q) => {
      const st = h("select", { "aria-label": "Status" }, ["new", "read", "replied", "spam"].map((s) => h("option", { value: s, selected: q.status === s }, pretty(s))));
      if (P.update) st.addEventListener("change", async () => { await api("commerce/inquiry-status", { body: { id: q.id, status: st.value } }); });
      else st.disabled = true;
      return h("tr", {}, h("td", {}, q.created_at || ""), h("td", {}, q.article_title || ""), h("td", {}, q.name, h("br"), q.email, q.phone ? h("br") : null, q.phone || ""), h("td", { style: "white-space:pre-wrap;max-width:360px" }, q.message), h("td", {}, st));
    });
    put(box, h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" }, h("thead", {}, h("tr", {}, ["Received", "Article", "From", "Message", "Status"].map((t) => h("th", {}, t)))), h("tbody", {}, rows))));
  }

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
  document.addEventListener("DOMContentLoaded", async () => {
    if (!$("nrPanel")) return;
    document.querySelectorAll("[data-nr-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.nrTab)));
    const d = await api("meta");
    if (!d) { $("nrPanel").textContent = "Could not load newsroom settings."; return; }
    state.meta = d; setTab("queues");
  });
})();
