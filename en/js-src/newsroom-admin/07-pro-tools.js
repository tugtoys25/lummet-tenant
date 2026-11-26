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
    state.calView = state.calView === "month" ? "month" : "week";
    const monthView = state.calView === "month";
    // The grid always starts on a Monday: the week of the chosen day, or (month view) the week holding the 1st, six weeks long.
    const gridFrom = monthView ? startOfWeek(state.calFrom.slice(0, 8) + "01") : startOfWeek(state.calFrom);
    const gridDays = monthView ? 42 : 7;
    state.calSection = state.calSection || ""; state.calAuthor = state.calAuthor || "";
    const reload = () => setTab("calendar");
    const shift = (days) => { state.calFrom = addDays(state.calFrom, days); reload(); };
    const shiftMonth = (n) => { const x = new Date(state.calFrom.slice(0, 8) + "01T00:00:00Z"); x.setUTCMonth(x.getUTCMonth() + n); state.calFrom = x.toISOString().slice(0, 10); reload(); };

    const qs = "from=" + gridFrom + "&days=" + gridDays + "&tzo=" + tzo() + (state.calSection ? "&section=" + encodeURIComponent(state.calSection) : "") + (state.calAuthor ? "&author=" + encodeURIComponent(state.calAuthor) : "");
    const d = await api("calendar?" + qs); if (!d) return;
    const F = d.filters || { sections: [], authors: [] }, C = d.can || {}, PC = d.plan_can || {};
    const sectionName = {}; F.sections.forEach((x) => { sectionName[x.id] = x.name; });
    const authorName = {}; F.authors.forEach((x) => { authorName[x.id] = x.name; });

    const pick = (items, current, anyText, set) => { const sel = h("select", { "aria-label": anyText }, [h("option", { value: "" }, anyText), ...items.map((x) => h("option", { value: String(x.id) }, x.name))]); sel.value = current; sel.addEventListener("change", () => { set(sel.value); reload(); }); return sel; };
    const zoneBtn = modes.length > 1 ? h("button", { type: "button", class: "btn btn--sm", "aria-label": "Switch the time zone used on this calendar", onclick: () => { try { localStorage.setItem("nrCalZone", modes[(modes.indexOf(mode) + 1) % modes.length]); } catch (e) { /* ignore */ } reload(); } }, "Times: " + zoneName() + " (switch)") : null;
    const monthLabel = new Date(state.calFrom.slice(0, 8) + "01T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
    const setView = (v) => { state.calView = v; if (v === "week") state.calFrom = startOfWeek(state.calFrom); reload(); };
    panel.append(h("div", { style: "display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap" },
      h("button", { type: "button", class: "btn btn--sm", onclick: () => (monthView ? shiftMonth(-1) : shift(-7)) }, monthView ? "← Previous month" : "← Previous week"),
      h("strong", {}, monthView ? monthLabel : "Week of " + gridFrom),
      h("button", { type: "button", class: "btn btn--sm", onclick: () => (monthView ? shiftMonth(1) : shift(7)) }, monthView ? "Next month →" : "Next week →"),
      h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.calFrom = monthView ? todayKey() : startOfWeek(todayKey()); reload(); } }, monthView ? "This month" : "This week"),
      h("button", { type: "button", class: "btn btn--sm" + (monthView ? "" : " btn--primary"), "aria-pressed": String(!monthView), onclick: () => setView("week") }, "Week"),
      h("button", { type: "button", class: "btn btn--sm" + (monthView ? " btn--primary" : ""), "aria-pressed": String(monthView), onclick: () => setView("month") }, "Month"),
      PC.create ? h("button", { type: "button", class: "btn btn--sm btn--primary", onclick: () => newStory(todayKey()) }, "+ New story") : null,
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
    // Planned drafts (a day picked for a story that is not scheduled yet) sit on their day next to the scheduled stories.
    const planned = (d.planned || []).map((x) => Object.assign({}, x, { at_iso: x.planned_iso }));
    const plannedIds = new Set(planned.map((x) => x.id));
    const canMove = (it) => (it.state === "scheduled" && !!C.schedule) || ((it.planned || it.unscheduled) && !!PC.update);
    const wallTime = (it) => { const w = it.at_iso ? localInput(it.at_iso) : ""; return w ? w.slice(11, 16) : "09:00"; };
    // Move a story to another day, keeping its time of day. Scheduled stories are rescheduled (the server re-checks everything);
    // drafts only get a planned day. Nothing is ever published by dragging.
    const moveTo = async (data, key) => {
      const at = toIso(key + "T" + (data.time || "09:00")); if (!at) { notify("Could not work out that time", "error"); return; }
      const r = data.kind === "scheduled" ? await api("calendar/reschedule", { body: { id: data.id, expected: data.expected, at } }) : await api("calendar/plan", { body: { id: data.id, at } });
      if (r) { notify(data.kind === "scheduled" ? "Rescheduled to " + key : "Planned for " + key); reload(); }
    };
    const drag = (it, el) => {
      if (!canMove(it)) return el;
      el.draggable = true; el.style.cursor = "grab"; el.title = "Drag to another day";
      el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ nr: 1, id: it.id, kind: it.state === "scheduled" ? "scheduled" : "plan", expected: it.published_at || null, time: wallTime(it) })); e.dataTransfer.effectAllowed = "move"; });
      return el;
    };
    const dropZone = (el, key) => {
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.style.outline = "2px dashed #4a6cf7"; });
      el.addEventListener("dragleave", () => { el.style.outline = ""; });
      el.addEventListener("drop", (e) => { e.preventDefault(); el.style.outline = ""; let data = null; try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch (err) { /* not one of ours */ } if (data && data.nr) moveTo(data, key); });
      return el;
    };
    // Plan / change / clear the planned day of a draft (works without dragging, for phones).
    const planTools = (it) => {
      if (!(it.planned || it.unscheduled) || !PC.update) return null;
      const box = h("div", { style: "display:flex;gap:4px;flex-wrap:wrap;margin-top:4px" });
      box.append(h("button", { type: "button", class: "btn btn--sm", onclick: () => {
        const input = h("input", { type: "datetime-local", value: it.at_iso ? localInput(it.at_iso) : "", "aria-label": "Planned time (" + zoneName() + ")" });
        const row = h("div", { style: "margin-top:6px" }, input, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => { const at = toIso(input.value); if (!at) { notify("Choose a date and time", "error"); return; } const r = await api("calendar/plan", { body: { id: it.id, at } }); if (r) { notify("Planned"); reload(); } } }, "Save"));
        box.after(row); input.focus();
      } }, it.planned ? "Change day" : "Plan a day"));
      if (it.planned) box.append(h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const r = await api("calendar/plan", { body: { id: it.id, at: null } }); if (r) { notify("Plan cleared"); reload(); } } }, "Clear plan"));
      return box;
    };
    const card = (it) => drag(it, h("div", { style: "border:1px solid #ddd;border-radius:6px;padding:6px;margin-bottom:6px;font-size:13px;background:" + (colour[it.state] || "#fff") },
      h("div", { class: "muted" }, (it.at_iso ? clock(it.at_iso) + " · " : "") + (it.planned ? "Planned · " : "") + pretty(it.state) + (it.assigned_to ? " · user " + it.assigned_to : "")),
      h("div", {}, h("strong", {}, it.title)),
      (sectionName[it.section_id] || authorName[it.author_id]) ? h("div", { class: "muted" }, [sectionName[it.section_id], authorName[it.author_id]].filter(Boolean).join(" · ")) : null,
      open(it), tools(it), planTools(it)));
    // A line in a month cell: time and title, draggable, opens the story.
    const chip = (it) => drag(it, h("button", { type: "button", style: "display:block;width:100%;text-align:left;margin:2px 0;padding:2px 5px;border:1px solid #ddd;border-radius:4px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:" + (colour[it.state] || "#fff"), title: it.title, onclick: () => { state.articleId = it.id; setTab("article"); } },
      (it.at_iso ? clock(it.at_iso) + " " : "") + (it.planned ? "✎ " : "") + it.title));

    // New story: an empty draft with a planned day. Nothing is published; the text is written later in the normal editor.
    const formHost = h("div", {});
    const newStory = (key) => {
      const title = h("input", { type: "text", maxlength: 200, placeholder: "Working title", style: "min-width:220px", "aria-label": "Working title" });
      const when = h("input", { type: "datetime-local", value: key + "T09:00", "aria-label": "Planned time (" + zoneName() + ")" });
      const sec = h("select", { "aria-label": "Section" }, [h("option", { value: "" }, "No section"), ...F.sections.map((x) => h("option", { value: String(x.id) }, x.name))]);
      const save = async () => { const r = await api("calendar/create", { body: { title: title.value, at: toIso(when.value), section_id: sec.value || null } }); if (r) { notify("Draft created and planned. Open it to write the story."); reload(); } };
      formHost.replaceChildren(h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px" },
        title, when, sec, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: save }, "Create draft"), h("button", { type: "button", class: "btn btn--sm", onclick: () => formHost.replaceChildren() }, "Cancel")));
      title.focus();
    };

    const all = d.items.concat(planned);
    const today = todayKey();
    const addBtn = (key) => (PC.create ? h("button", { type: "button", class: "btn btn--sm", "aria-label": "New story on " + key, title: "New story on this day", onclick: () => newStory(key) }, "+") : null);
    const grid = h("div", { style: monthView ? "display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px" : "display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px" });
    if (monthView) ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((n) => grid.append(h("div", { class: "muted", style: "font-weight:700;text-align:center" }, n)));
    for (let i = 0; i < gridDays; i++) {
      const key = addDays(gridFrom, i);
      const items = all.filter((it) => dayKey(it.at_iso) === key);
      const label = monthView ? String(Number(key.slice(8))) : new Date(key + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) + (key === today ? " (today)" : "");
      const faded = monthView && key.slice(0, 7) !== state.calFrom.slice(0, 7);
      const head = h("div", { style: "display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:4px" }, h("span", {}, label), addBtn(key));
      let body;
      if (monthView) {
        const shown = items.slice(0, 3);
        body = h("div", {}, shown.map(chip), items.length > 3 ? h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.calFrom = key; setView("week"); } }, "+" + (items.length - 3) + " more") : null);
      } else body = items.length ? items.map(card) : h("p", { class: "muted" }, "—");
      grid.append(dropZone(h("div", { style: (monthView ? "min-height:92px;border:1px solid #e5e5e5;border-radius:6px;padding:4px;" : "padding:2px;") + (key === today ? "outline:2px solid #4a6cf7;border-radius:6px;" : "") + (faded ? "opacity:.55;" : "") }, head, body), key));
    }
    const drafts = d.unscheduled.filter((x) => !plannedIds.has(x.id)).map((x) => Object.assign({}, x, { unscheduled: true }));
    panel.append(formHost, grid, h("p", { class: "muted", style: "margin-top:8px" }, "Times shown in " + zoneName() + ". Drag a story to another day to move it (scheduled stories are rescheduled, drafts get a planned day). Stories that are live are not editable here; open them to make changes."),
      h("h3", { style: "margin-top:24px" }, "Not scheduled yet (drafts and ideas)"),
      drafts.length ? h("div", {}, drafts.map(card)) : h("p", { class: "muted" }, "No unscheduled drafts."));
  }
