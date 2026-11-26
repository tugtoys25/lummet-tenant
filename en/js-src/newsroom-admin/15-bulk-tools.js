  // ── Bulk: search, tick stories, apply ONE change to all of them. Each story is checked and saved on its own, so one
  // failure never blocks the rest, and every change goes through the same rules and revision history as a single edit. ──
  async function renderBulk(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    const q = h("input", { type: "search", maxlength: 200, placeholder: "Search by title, text or tag", "aria-label": "Search stories", style: "flex:1;min-width:180px" });
    const sel = (name, first) => h("select", { "aria-label": name }, [h("option", { value: "" }, first)]);
    const section = sel("Section", "Any section"), country = sel("Country", "Any country"), status = sel("Status", "Any status");
    [["draft", "Draft"], ["scheduled", "Scheduled"], ["published", "Published"]].forEach(([v, t]) => status.append(h("option", { value: v }, t)));
    const list = h("div", { role: "status", "aria-live": "polite" });
    const picked = new Set();
    const bar = h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:8px" });
    const count = h("strong", {}, "0 selected");
    const action = h("select", { "aria-label": "Action" }, [
      ["section", "Set section"], ["topic_add", "Add topic"], ["topic_remove", "Remove topic"], ["article_type", "Set article type"],
      ["country", "Set main country"], ["workflow", "Move in workflow"], ["embargo", "Set / lift embargo"]].map(([v, t]) => h("option", { value: v }, t)));
    const valueHost = h("span", {});
    let secs = [], tops = [], ctrs = [];
    const optionList = (items, first) => [h("option", { value: "" }, first), ...items.map((x) => h("option", { value: String(x.id != null ? x.id : x.code) }, x.name))];
    const valueEl = () => {
      const a = action.value; let el;
      if (a === "section") el = h("select", { "aria-label": "Section" }, optionList(secs, "No section"));
      else if (a === "topic_add" || a === "topic_remove") el = h("select", { "aria-label": "Topic" }, optionList(tops, "Choose a topic"));
      else if (a === "article_type") el = h("select", { "aria-label": "Article type" }, [h("option", { value: "" }, "News (default)"), ...state.meta.article_types.map((t) => h("option", { value: t }, pretty(t)))]);
      else if (a === "country") el = h("select", { "aria-label": "Country" }, optionList(ctrs, "No country"));
      else if (a === "workflow") el = h("select", { "aria-label": "Workflow status" }, state.meta.workflow_statuses.filter((s) => s !== "scheduled").map((s) => h("option", { value: s }, pretty(s))));
      else el = h("input", { type: "datetime-local", "aria-label": "Embargo until (empty lifts it)" });
      valueHost.replaceChildren(el); return el;
    };
    let valueControl = valueEl();
    action.addEventListener("change", () => { valueControl = valueEl(); });
    const refresh = () => { count.textContent = picked.size + " selected"; };
    const apply = async () => {
      if (!picked.size) { notify("Tick at least one story", "error"); return; }
      let value = valueControl.value;
      if (action.value === "embargo") value = value ? (window.nrZone ? window.nrZone.wallToIso(value, await window.nrZone.site()) : new Date(value).toISOString()) : null;
      if ((action.value === "topic_add" || action.value === "topic_remove") && !value) { notify("Choose a topic", "error"); return; }
      if (!confirm("Apply \"" + action.options[action.selectedIndex].text + "\" to " + picked.size + " stories?")) return;
      const r = await api("bulk/apply", { body: { ids: [...picked], action: action.value, value } });
      if (!r) return;
      notify(r.done.length + " updated" + (r.failed.length ? ", " + r.failed.length + " could not be changed" : ""), r.failed.length ? "error" : undefined);
      picked.clear(); await run();
      if (r.failed.length) list.prepend(h("div", { class: "alert alert--error" }, r.failed.map((f) => h("div", {}, "#" + f.id + ": " + f.error))));
    };
    put(bar, count, action, valueHost, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: apply }, "Apply to selected"));
    const run = async () => {
      const qs = new URLSearchParams();
      if (q.value.trim()) qs.set("q", q.value.trim());
      [["section", section], ["country", country], ["status", status]].forEach(([k, el]) => { if (el.value) qs.set(k, el.value); });
      list.replaceChildren(h("p", { class: "muted" }, "Searching…"));
      const d = await api("search?" + qs.toString()); list.replaceChildren(); if (!d) return;
      const all = h("input", { type: "checkbox", "aria-label": "Select all shown" });
      const boxes = [];
      all.addEventListener("change", () => { boxes.forEach((b) => { b.el.checked = all.checked; if (all.checked) picked.add(b.id); else picked.delete(b.id); }); refresh(); });
      list.append(h("p", { class: "muted" }, d.total + " result" + (d.total === 1 ? "" : "s") + (d.total > d.page_size ? " (first " + d.page_size + " shown, narrow the filters to reach the rest)" : "")));
      list.append(simpleTable(["", "Story", "Status", ""], d.articles.map((a) => {
        const el = h("input", { type: "checkbox", "aria-label": "Select " + a.title, checked: picked.has(a.id) });
        el.addEventListener("change", () => { if (el.checked) picked.add(a.id); else picked.delete(a.id); refresh(); });
        boxes.push({ id: a.id, el });
        return [el, h("span", {}, h("strong", {}, a.title), h("br"), h("span", { class: "muted" }, "#" + a.id + " · /" + a.slug)),
          a.workflow_status ? pretty(a.workflow_status) : (a.published ? "Published" : "Draft"),
          h("button", { type: "button", class: "btn btn--sm", onclick: () => { state.articleId = a.id; setTab("article"); } }, "Open")];
      })));
      list.querySelector("thead th") && list.querySelector("thead th").append(all);
      refresh();
    };
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    [section, country, status].forEach((el) => el.addEventListener("change", run));
    put(panel, h("p", { class: "muted" }, "Search, tick the stories you want, then choose one change to apply to all of them (up to 100 at a time). Nothing is deleted. " + (P.update ? "" : "You do not have permission to edit stories.")),
      h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px" }, q, section, country, status, h("button", { type: "button", class: "btn btn--primary", onclick: run }, "Search")), bar, list);
    const [s1, t1, c1] = await Promise.all([api("taxonomy/list?kind=sections"), api("taxonomy/list?kind=topics"), api("picker/countries")]);
    secs = (s1 && s1.items) || []; tops = (t1 && t1.items) || []; ctrs = (c1 && c1.countries) || [];
    secs.forEach((x) => section.append(h("option", { value: x.slug }, x.name)));
    ctrs.forEach((x) => country.append(h("option", { value: String(x.code).toLowerCase() }, x.name)));
    valueControl = valueEl();
    await run();
  }

