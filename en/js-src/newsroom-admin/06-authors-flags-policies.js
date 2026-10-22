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

