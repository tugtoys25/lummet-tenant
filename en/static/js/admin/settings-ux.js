// ============================================================
// SITE SETTINGS PAGE: layout, change tracking and the save bar
//
// - collectSettingsPayload(form): exactly what a save sends (used by the save handler).
// - populateSettingsFields(form, settings): puts saved values into every kind of control (used by loadSettingsForm).
// - On DOMContentLoaded: groups the page into section cards, builds the contents menu, tracks which sections have unsaved
//   changes, drives the Save / Discard buttons, warns before leaving with unsaved edits, and turns Ctrl/Cmd+S into Save.
//
// Events (all on document): settings:loaded, settings:load-failed (from loadSettingsForm), settings:saving,
// settings:saved, settings:save-failed (from the save handler, detail.message).
// ============================================================

function collectSettingsPayload(form) {
  const payload = {};

  for (const [key, value] of new FormData(form).entries()) {
    payload[key] = String(value);
  }

  // The homepage hero is managed on Dashboard > Header & Hero. Only send these when the checkboxes exist on this
  // page, otherwise saving here would switch the hero off.
  const heroEnabled = document.getElementById("siteHeroEnabled");
  if (heroEnabled) {
    payload.site_hero_enabled = heroEnabled.checked ? "true" : "false";
  }

  const heroOverlay = document.getElementById("siteHeroOverlay");
  if (heroOverlay) {
    payload.site_hero_overlay = heroOverlay.checked ? "true" : "false";
  }

  const gpwaSealEnabledInput = document.getElementById("gpwaSealEnabled");
  payload.gpwa_seal_enabled = gpwaSealEnabledInput && gpwaSealEnabledInput.checked ? "true" : "false";

  payload.footer_compliance = JSON.stringify(collectComplianceRows());
  payload.homepage_sections = JSON.stringify(collectHomepageSections());

  return payload;
}

// Saved values go into every kind of control. (Dropdowns used to be skipped, so a saved theme preset, card style or
// button shape was shown as the first option, and saving then overwrote the real choice.)
function populateSettingsFields(form, settings) {
  form.querySelectorAll("input[name], textarea[name], select[name]").forEach((el) => {
    const key = el.name;
    if (key === "footer_compliance" || key === "homepage_sections") return;
    const value = settings[key];
    if (value === undefined || value === null) return;

    if (el.tagName === "SELECT") {
      const wanted = String(value);
      if (Array.prototype.some.call(el.options, (o) => o.value === wanted)) el.value = wanted;
    } else if (el.type === "checkbox") {
      el.checked = value === true || value === "true" || value === "on";
    } else if (el.type === "radio") {
      el.checked = el.value === String(value);
    } else {
      el.value = value;
    }
  });

  // The theme preview follows the colour fields; "input" only redraws it (a preset's "change" would overwrite colours).
  const probe = document.getElementById("themePrimary");
  if (probe) probe.dispatchEvent(new Event("input", { bubbles: true }));
}

(function () {
  "use strict";

  let form = null;
  let statusEl = null;
  let saveBtn = null;
  let discardBtn = null;
  let cards = [];
  let navTargets = [];
  let loaded = false;
  let loadFailed = false;
  let saving = false;
  let notice = null; // a message that stays until the next edit: { text, kind }

  function serialize(root) {
    const parts = [];
    root.querySelectorAll("input, select, textarea").forEach((el, i) => {
      if (el.type === "button" || el.type === "submit" || el.type === "file") return;
      const key = el.name || el.id || "#" + i;
      const val = el.type === "checkbox" || el.type === "radio" ? (el.checked ? "1" : "0") : el.value;
      parts.push(key + "=" + val);
    });
    return parts.join("\u0001");
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = "st-status" + (kind ? " is-" + kind : "");
  }

  function changedCards() {
    return cards.filter((c) => serialize(c.root) !== c.baseline);
  }

  // ---------------------------------------------------------- cards
  function makeCard(heading, container, before) {
    const root = document.createElement("section");
    root.className = "st-card";
    const head = document.createElement("header");
    head.className = "st-card__head";
    const dot = document.createElement("span");
    dot.className = "st-card__dot";
    dot.title = "Unsaved changes in this section";
    dot.hidden = true;
    const body = document.createElement("div");
    body.className = "st-card__body";
    root.appendChild(head);
    root.appendChild(body);
    container.insertBefore(root, before);
    head.appendChild(heading);
    head.appendChild(dot);
    heading.classList.add("st-card__title");
    return { root: root, body: body, dot: dot, id: heading.id, title: heading.textContent.trim(), baseline: "" };
  }

  // Everything from one section heading to the next goes into one card.
  function buildCards(container, stopAt) {
    const out = [];
    let current = null;
    Array.prototype.slice.call(container.children).forEach((el) => {
      if (stopAt && stopAt(el)) { current = null; return; }
      if (el.matches("h2[id], h3#layout")) {
        current = makeCard(el, container, el);
        out.push(current);
        return;
      }
      if (current && !el.classList.contains("st-card")) current.body.appendChild(el);
    });
    return out;
  }

  // ---------------------------------------------------------- contents bar
  // A tab bar pinned under the dashboard's own top bars. The tab of the section being read is coloured and kept in view.
  function initNav() {
    const nav = document.getElementById("settingsToc");
    if (!nav) return;
    const links = Array.prototype.slice.call(nav.querySelectorAll("a[href^='#']"));
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function activate(link) {
      links.forEach((a) => {
        const on = a === link;
        a.classList.toggle("active", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
      if (link && nav.scrollTo) {
        const left = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2;
        nav.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
      }
    }

    // The section being read is the last heading that has reached the line just under the pinned bars.
    function current() {
      const pinned = parseFloat(window.getComputedStyle(nav).top) || 0;
      const line = Math.max(nav.getBoundingClientRect().bottom, pinned + nav.offsetHeight) + 24;
      let found = null;
      navTargets.forEach((c) => {
        const h = document.getElementById(c.id);
        if (h && h.getBoundingClientRect().top <= line) found = c.id;
      });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && navTargets.length) {
        found = navTargets[navTargets.length - 1].id;
      }
      return found || (navTargets[0] && navTargets[0].id);
    }

    let last = null;
    let queued = false;
    let lockedUntil = 0; // while a click-scroll animates, the tab stays on the one clicked
    function sync() {
      queued = false;
      if (Date.now() < lockedUntil) { window.setTimeout(queue, 150); return; }
      const id = current();
      if (id === last) return;
      last = id;
      activate(links.find((a) => a.getAttribute("href") === "#" + id) || null);
    }
    function queue() { if (!queued) { queued = true; window.requestAnimationFrame(sync); } }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    links.forEach((a) => a.addEventListener("click", (e) => {
      const target = document.getElementById(a.getAttribute("href").slice(1));
      if (!target) return;
      e.preventDefault();
      // Land the heading just under the pinned bars (computed here, so the page's own scroll padding does not add to it).
      const pinned = parseFloat(window.getComputedStyle(nav).top) || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - (pinned + nav.offsetHeight + 20);
      window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
      if (window.history && window.history.replaceState) window.history.replaceState(null, "", a.getAttribute("href"));
      last = a.getAttribute("href").slice(1);
      lockedUntil = Date.now() + 800;
      activate(a);
    }));
    sync();
  }

  function markNav(changedIds) {
    const nav = document.getElementById("settingsToc");
    if (!nav) return;
    nav.querySelectorAll("a[href^='#']").forEach((a) => {
      a.classList.toggle("is-changed", changedIds.indexOf(a.getAttribute("href").slice(1)) !== -1);
    });
  }

  // ---------------------------------------------------------- tracking
  function refresh() {
    if (!form) return;
    const changed = loaded ? changedCards() : [];
    const ids = changed.map((c) => c.id);
    cards.forEach((c) => { c.dot.hidden = ids.indexOf(c.id) === -1; c.root.classList.toggle("is-changed", ids.indexOf(c.id) !== -1); });
    markNav(ids);

    const dirty = loaded && !loadFailed && changed.length > 0;
    saveBtn.disabled = !dirty || saving;
    discardBtn.disabled = !dirty || saving;

    if (saving || loadFailed || !loaded) return;
    if (notice) { setStatus(notice.text, notice.kind); return; }
    if (dirty) {
      const names = changed.map((c) => c.title);
      const shown = names.length > 3 ? names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more" : names.join(", ");
      setStatus("Unsaved changes in: " + shown + ".", "dirty");
    } else {
      setStatus("All changes saved.", "");
    }
  }

  function rebaseline() {
    cards.forEach((c) => { c.baseline = serialize(c.root); });
  }

  function onLoaded() {
    loaded = true;
    loadFailed = false;
    saving = false;
    rebaseline();
    refresh();
  }

  function onLoadFailed() {
    loaded = true;
    loadFailed = true;
    rebaseline();
    saveBtn.disabled = true;
    discardBtn.disabled = true;
    setStatus("Could not load the saved settings, so saving is turned off to protect them. Reload the page to try again.", "error");
  }

  function discard() {
    if (!loaded || saving) return;
    if (!window.confirm("Discard your unsaved changes and go back to the saved settings?")) return;
    notice = null;
    loaded = false;
    setStatus("Restoring saved settings...", "");
    loadSettingsForm();
  }

  function onSaving() {
    saving = true;
    notice = null;
    saveBtn.disabled = true;
    discardBtn.disabled = true;
    setStatus("Saving...", "");
  }

  function onSaved() {
    saving = false;
    notice = { text: "Saved. Your live site now uses these settings.", kind: "ok" };
    // Show what the server actually stored (it tidies some values), and start tracking from there.
    loaded = false;
    setStatus(notice.text, "ok");
    loadSettingsForm();
  }

  function onSaveFailed(event) {
    saving = false;
    const message = (event.detail && event.detail.message) || "Could not save.";
    notice = { text: message + " Your changes are still in the form.", kind: "error" };
    refresh();
  }

  function init() {
    form = document.getElementById("settingsForm");
    statusEl = document.getElementById("settingsStatus");
    saveBtn = document.getElementById("settingsSave");
    discardBtn = document.getElementById("settingsDiscard");
    if (!form || !statusEl || !saveBtn || !discardBtn) return;

    cards = buildCards(form, (el) => el.classList.contains("st-savebar"));

    // The ad rules section sits after the form (it saves on its own); give it the same card look, untracked.
    const main = form.parentNode;
    const rulesHeading = document.getElementById("ad-rules");
    const extra = rulesHeading && rulesHeading.parentNode === main ? buildCards(main, (el) => el === form) : [];
    navTargets = cards.concat(extra);

    document.addEventListener("settings:loaded", onLoaded);
    document.addEventListener("settings:load-failed", onLoadFailed);
    document.addEventListener("settings:saving", onSaving);
    document.addEventListener("settings:saved", onSaved);
    document.addEventListener("settings:save-failed", onSaveFailed);

    // Typing clears an old message (the error, or "Saved").
    const edited = () => { if (!loaded) return; notice = null; refresh(); };
    form.addEventListener("input", edited);
    form.addEventListener("change", edited);
    form.addEventListener("click", () => { window.setTimeout(refresh, 0); });
    // Pickers (logo, icons) and "add row" buttons change values without a typing event.
    window.setInterval(() => { if (!document.hidden) refresh(); }, 700);

    discardBtn.addEventListener("click", discard);

    window.addEventListener("beforeunload", (e) => {
      if (loaded && !loadFailed && changedCards().length) { e.preventDefault(); e.returnValue = ""; }
    });

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (!saveBtn.disabled && form.requestSubmit) form.requestSubmit(saveBtn);
      }
    });

    initNav();
    refresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
