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

