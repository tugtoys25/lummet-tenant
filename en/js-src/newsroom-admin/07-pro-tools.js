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
