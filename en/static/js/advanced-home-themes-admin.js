// Advanced Homepage Themes: pick a look for the Advanced Homepage, preview it on the real page, save it with the homepage settings.
(function () {
  "use strict";
  const API = "/en/api/v1/studio-pro/advanced-home";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "#cccccc");
  let themes = [], config = null, savedTheme = "", viewTheme = "", live = false, filter = "all", timer = null, seq = 0;

  const chosen = () => config.options.theme || "";
  function msg(t, bad) { const m = $("ahthMsg"); m.textContent = t || ""; m.className = "ahs-msg" + (bad ? " ahs-bad" : ""); }
  function dirty() { const d = chosen() !== savedTheme; $("ahthDirty").hidden = !d; $("ahthSave").disabled = !d; }

  function card(t) {
    const none = !t;
    const id = none ? "" : t.id;
    const sw = none ? `<div class="ahth-sw" aria-hidden="true"><i style="background:#f3f4f6"></i><i style="background:#e5e7eb"></i><i style="background:#9ca3af"></i></div>`
      : `<div class="ahth-sw" aria-hidden="true">${[t.pal.bg, t.pal.sf, t.pal.p, t.pal.p2, t.pal.tx].map((c) => `<i style="background:${hex(c)}"></i>`).join("")}</div>`;
    const tags = none ? "" : `<div class="ahth-tags"><span>${t.dark ? "Dark" : "Light"}</span><span>${esc(t.style)}</span></div>`;
    return `<div class="ahth-card" data-id="${esc(id)}" data-sel="${chosen() === id ? 1 : 0}" data-view="${viewTheme === id ? 1 : 0}">${sw}<h3>${esc(none ? "No theme" : t.label)}</h3>${tags}<small>${esc(none ? "Use my site's own colours." : t.desc)}</small>
      <div class="ahth-act"><button type="button" class="btn btn--sm" data-act="view" data-id="${esc(id)}">Preview</button><button type="button" class="btn btn--sm btn--primary" data-act="use" data-id="${esc(id)}" ${chosen() === id ? "disabled" : ""}>${chosen() === id ? "In use" : "Use this theme"}</button></div></div>`;
  }
  function renderList() {
    const items = themes.filter((t) => filter === "all" || (filter === "dark") === t.dark);
    $("ahthList").innerHTML = card(null) + items.map(card).join("");
  }
  function renderBadge() {
    const b = $("ahthLive");
    b.textContent = live ? "Advanced Homepage is live" : "Advanced Homepage is not published yet";
    b.className = "ahs-badge " + (live ? "ahs-on" : "ahs-off");
  }

  async function preview() {
    const my = ++seq; $("ahthPrevState").textContent = "Updating preview…";
    const t = themes.find((x) => x.id === viewTheme);
    $("ahthPrevName").textContent = "Preview: " + (t ? t.label : "No theme");
    const cfg = JSON.parse(JSON.stringify(config)); cfg.options.theme = viewTheme;
    try {
      const res = await fetch(API + "/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: cfg, country: $("ahthCountry").value }) });
      const d = await res.json(); if (my !== seq) return;
      if (!d.success) { $("ahthPrevState").textContent = d.error || "Preview failed"; return; }
      $("ahthFrame").srcdoc = d.html; $("ahthPrevState").textContent = $("ahthCountry").value ? "Previewing as " + $("ahthCountry").value : "Previewing as you";
    } catch { $("ahthPrevState").textContent = "Preview failed. Check your connection."; }
  }
  function schedulePreview() { clearTimeout(timer); timer = setTimeout(preview, 250); }

  async function save() {
    $("ahthSave").disabled = true; msg("Saving…");
    try {
      const res = await fetch(API + "/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      const d = await res.json();
      if (!d.success) { msg(d.error || "Could not save.", true); dirty(); return; }
      config = d.config; savedTheme = chosen(); msg("Saved." + (live ? "" : " Publish the Advanced Homepage to show it to visitors.")); renderList(); dirty();
    } catch { msg("Could not save. Check your connection.", true); dirty(); }
  }

  function bind() {
    $("ahthList").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const id = b.getAttribute("data-id") || "";
      if (b.dataset.act === "view") { viewTheme = id; renderList(); schedulePreview(); }
      else { config.options.theme = id; viewTheme = id; renderList(); dirty(); msg(""); schedulePreview(); }
    });
    document.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; document.querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderList(); }));
    document.querySelectorAll("[data-dev]").forEach((b) => b.addEventListener("click", () => { $("ahthFrame").dataset.dev = b.dataset.dev; document.querySelectorAll("[data-dev]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
    $("ahthCountry").addEventListener("change", schedulePreview);
    $("ahthSave").addEventListener("click", save);
    document.querySelectorAll("[data-guide-close]").forEach((b) => b.addEventListener("click", () => { const d = b.closest("details"); if (d) d.open = false; }));
  }

  async function init() {
    bind();
    try {
      const res = await fetch(API + "/state"); const d = await res.json();
      if (!d.success) { msg(d.error || "Could not load.", true); return; }
      themes = d.themes || []; config = d.state.config; savedTheme = chosen(); viewTheme = chosen(); live = d.state.mode === "on";
      const sel = $("ahthCountry"); sel.innerHTML = `<option value="">My own location</option>` + (d.lookups.countries || []).map((c) => `<option value="${esc(c.code)}">${esc(c.name)} (${esc(c.code)})</option>`).join("");
      renderBadge(); renderList(); dirty(); preview();
    } catch { msg("Could not load. Check your connection.", true); }
  }
  init();
})();
