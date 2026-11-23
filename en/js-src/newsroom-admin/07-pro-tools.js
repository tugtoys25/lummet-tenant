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
  async function renderCalendar(panel) {
    const startOfWeek = (d) => { const x = new Date(d); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x.toISOString().slice(0, 10); };
    if (!state.calFrom) state.calFrom = startOfWeek(new Date());
    const shift = (days) => { const x = new Date(state.calFrom + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + days); state.calFrom = x.toISOString().slice(0, 10); setTab("calendar"); };
    panel.append(h("div", { style: "display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap" },
      h("button", { type: "button", class: "btn btn--sm", onclick: () => shift(-7) }, "← Previous week"),
      h("strong", {}, "Week of " + state.calFrom + " (times are UTC)"),
      h("button", { type: "button", class: "btn btn--sm", onclick: () => shift(7) }, "Next week →"),
      h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.calFrom = startOfWeek(new Date()); setTab("calendar"); } }, "This week")));
    const d = await api("calendar?from=" + state.calFrom + "&days=7"); if (!d) return;
    const colour = { published: "#e6f7e9", scheduled: "#fff4d6" };
    const open = (it) => h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.articleId = it.id; setTab("article"); } }, "Open");
    const card = (it) => h("div", { style: "border:1px solid #ddd;border-radius:6px;padding:6px;margin-bottom:6px;font-size:13px;background:" + (colour[it.state] || "#fff") },
      h("div", { class: "muted" }, (it.published_at ? String(it.published_at).slice(11, 16) + " · " : "") + pretty(it.state) + (it.assigned_to ? " · user " + it.assigned_to : "")),
      h("div", {}, h("strong", {}, it.title)), open(it));
    const grid = h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px" });
    for (let i = 0; i < 7; i++) {
      const x = new Date(state.calFrom + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + i); const key = x.toISOString().slice(0, 10);
      const items = d.items.filter((it) => String(it.published_at).slice(0, 10) === key);
      grid.append(h("div", {}, h("div", { style: "font-weight:700;margin-bottom:6px" }, x.toUTCString().slice(0, 11)), items.length ? items.map(card) : h("p", { class: "muted" }, "—")));
    }
    panel.append(grid, h("h3", { style: "margin-top:24px" }, "Not scheduled yet (drafts and ideas)"),
      d.unscheduled.length ? h("div", {}, d.unscheduled.map(card)) : h("p", { class: "muted" }, "No unscheduled drafts."));
  }
