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

