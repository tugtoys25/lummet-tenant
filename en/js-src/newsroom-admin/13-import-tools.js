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
