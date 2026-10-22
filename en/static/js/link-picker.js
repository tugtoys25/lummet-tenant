// Shared picker dialog for the dashboard: search published items (casinos, news, research, authors,
// updates, sportsbooks, affiliate partners, custom content, pictures) or pages and reviews, and
// hand the choice back. Also adds a "Pick a page" button next to link fields in the Navigation
// Manager and the Homepage Content editor. Typing an address by hand keeps working.
// DOM calls only (no innerHTML).
(function () {
  "use strict";
  if (window.LummetPicker) return;

  var SOURCES = [
    ["casino", "Casinos"], ["news", "News"], ["research", "Research"], ["author", "Authors"],
    ["update", "Updates"], ["sportsbook", "Sportsbooks"], ["affiliate_partner", "Affiliate partners"],
    ["custom", "Custom content"], ["media", "Pictures"]
  ];
  var LINK_SOURCES = [["page", "Pages"], ["review", "Reviews"], ["casino", "Casinos"], ["news", "News"], ["research", "Research"], ["author", "Authors"], ["update", "Updates"], ["sportsbook", "Sportsbooks"], ["affiliate_partner", "Affiliate partners"], ["custom", "Custom content"]];
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function btn(text, cls, fn) { var b = el("button", cls || "hh-btn", text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }

  function openPicker(opts, onPick) {
    var links = opts.mode === "link";
    var sources = opts.sources || (links ? LINK_SOURCES : SOURCES);
    var src = sources[0][0];
    var back = el("div", "cs-modal"); back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true"); back.setAttribute("aria-label", links ? "Pick a page" : "Pick items");
    var box = el("div", "cs-modal__box");
    var head = el("div", "cs-modal__head"); head.appendChild(el("strong", null, links ? "Pick a page to link to" : "Pick items to add"));
    var close = btn("Done", "hh-btn", function () { back.remove(); document.removeEventListener("keydown", onKey); }); head.appendChild(close);
    var tabs = el("div", "hh-seg cs-tabs"); tabs.setAttribute("role", "tablist");
    var search = el("input"); search.type = "search"; search.placeholder = "Search by name…"; search.setAttribute("aria-label", "Search");
    var extra = el("div", "cs-modal__extra");
    var list = el("div", "cs-results"); list.setAttribute("aria-live", "polite");
    var typeIn = null;
    function onKey(e) { if (e.key === "Escape") close.click(); }
    document.addEventListener("keydown", onKey);
    var seq = 0, st = null;
    function run() {
      var mine = ++seq;
      list.textContent = ""; list.appendChild(el("p", "hh-hint", "Searching…"));
      var u = "/en/api/v1/component/pick-search?source=" + encodeURIComponent(src) + "&q=" + encodeURIComponent(search.value) + (links ? "&links=1" : "");
      if (src === "custom" && typeIn && typeIn.value) u += "&type=" + encodeURIComponent(typeIn.value.trim());
      fetch(u).then(function (r) { return r.json(); }).then(function (d) {
        if (mine !== seq) return;
        list.textContent = "";
        var rs = (d && d.results) || [];
        if (src === "custom" && !(typeIn && typeIn.value.trim())) { list.appendChild(el("p", "hh-hint", "Type the content type name above (the short name used in its address) to list its items.")); return; }
        if (!rs.length) { list.appendChild(el("p", "hh-hint", d && d.success === false ? (d.error || "Could not search.") : "Nothing found. Only published items are listed.")); return; }
        rs.forEach(function (it) {
          var row = el("div", "cs-result");
          if (it.image) { var im = el("img", "cs-thumb"); im.alt = ""; im.src = it.image; im.loading = "lazy"; row.appendChild(im); }
          var tx = el("div", "cs-result__text"); tx.appendChild(el("strong", null, it.title || it.url));
          var sub = it.excerpt || it.url || ""; if (sub) tx.appendChild(el("span", "hh-hint", String(sub).slice(0, 90)));
          row.appendChild(tx);
          var add = btn(links ? "Use" : "Add", "hh-btn", function () {
            if (links) { onPick({ url: it.url, title: it.title }); close.click(); return; }
            var ok = onPick({ source: it.source || src, key: it.key, label: it.title, card: it });
            if (ok === false) { add.textContent = "Full"; add.disabled = true; } else { add.textContent = "Added ✓"; add.disabled = true; }
          });
          row.appendChild(add); list.appendChild(row);
        });
      }).catch(function () { if (mine === seq) { list.textContent = ""; list.appendChild(el("p", "hh-hint", "Could not load results.")); } });
    }
    sources.forEach(function (s, i) {
      var b = btn(s[1], "cs-tab" + (i === 0 ? " is-on" : ""), function () {
        src = s[0]; Array.prototype.forEach.call(tabs.children, function (c) { c.classList.remove("is-on"); }); b.classList.add("is-on");
        extra.textContent = ""; typeIn = null;
        if (src === "custom") { typeIn = el("input"); typeIn.type = "text"; typeIn.placeholder = "Content type, e.g. guides"; typeIn.addEventListener("input", function () { clearTimeout(st); st = setTimeout(run, 300); }); extra.appendChild(typeIn); }
        run();
      });
      b.setAttribute("role", "tab"); tabs.appendChild(b);
    });
    search.addEventListener("input", function () { clearTimeout(st); st = setTimeout(run, 250); });
    box.appendChild(head); box.appendChild(tabs); box.appendChild(search); box.appendChild(extra);
    if (links) {
      var manual = el("div", "cs-row"); var mi = el("input"); mi.type = "text"; mi.placeholder = "…or type an address: /en/page or https://…"; mi.maxLength = 300;
      manual.appendChild(mi); manual.appendChild(btn("Use this address", null, function () { if (mi.value.trim()) { onPick({ url: mi.value.trim() }); close.click(); } }));
      box.appendChild(manual);
    }
    box.appendChild(list); back.appendChild(box);
    back.addEventListener("click", function (e) { if (e.target === back) close.click(); });
    document.body.appendChild(back); search.focus(); run();
  }


  window.LummetPicker = { open: openPicker };

  // ---- "Pick a page" next to link fields of the navigation and homepage editors
  var SELECTORS = ["#navForm input[name=\"url\"]", "#homepageSections .section-button-url", "#homepageSections .card-url"];
  function enhance(root) {
    SELECTORS.forEach(function (sel) {
      Array.prototype.forEach.call((root || document).querySelectorAll(sel), function (input) {
        if (input.getAttribute("data-pick-added")) return;
        input.setAttribute("data-pick-added", "1");
        var b = btn("Pick a page", "btn btn--ghost btn--sm lp-pick", function () {
          openPicker({ mode: "link" }, function (it) { input.value = it.url; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
        });
        b.style.marginTop = "6px";
        input.insertAdjacentElement("afterend", b);
      });
    });
  }
  // ---- "Choose from Media" next to picture-address fields (logos, icons, avatars, backgrounds)
  var IMAGE_SELECTORS = [
    'input[name="avatar_url"]', 'input[name="logo"]', 'input[name="og_image"]:not([type="hidden"])',
    'input[name="site_logo"]', 'input[name="site_og_image"]', 'input[name="site_favicon_96"]', 'input[name="site_favicon_svg"]',
    'input[name="site_favicon_ico"]', 'input[name="site_apple_touch_icon"]', 'input[name="site_pwa_icon_192"]', 'input[name="site_pwa_icon_512"]',
    ".compliance-image", ".section-background-image", ".card-image-url", ".card-background-image", 'input[data-section-field="image"]'
  ];
  function showThumb(input, thumb) {
    var v = (input.value || "").trim();
    if (/^(\/|https:\/\/)/.test(v) && !/\.(ico|webmanifest|json)(\?|$)/i.test(v)) { thumb.src = v; thumb.hidden = false; } else { thumb.hidden = true; }
  }
  function enhanceImages(root) {
    IMAGE_SELECTORS.forEach(function (sel) {
      Array.prototype.forEach.call((root || document).querySelectorAll(sel), function (input) {
        if (input.getAttribute("data-media-added")) return;
        input.setAttribute("data-media-added", "1");
        var wrap = el("div", "lp-media");
        wrap.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px";
        var thumb = el("img", "lp-media__thumb"); thumb.alt = ""; thumb.hidden = true; thumb.loading = "lazy";
        thumb.style.cssText = "width:56px;height:40px;object-fit:contain;background:#e2e8f0;border-radius:6px";
        var pick = btn("Choose from Media", "btn btn--ghost btn--sm lp-pick", function () {
          var mp = window.MediaPicker;
          if (!mp || !mp.openImagePicker) { window.alert("The Media library is not available on this page. Paste the address instead."); return; }
          mp.openImagePicker(function (m) {
            if (!m) return;
            input.value = m.url || m.public_url || "";
            showThumb(input, thumb);
            input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });
        var clear = btn("Remove", "btn btn--ghost btn--sm lp-pick", function () {
          input.value = ""; showThumb(input, thumb);
          input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        wrap.appendChild(thumb); wrap.appendChild(pick); wrap.appendChild(clear);
        input.insertAdjacentElement("afterend", wrap);
        input.addEventListener("input", function () { showThumb(input, thumb); });
        showThumb(input, thumb);
      });
    });
  }
  function enhanceAll(root) { enhance(root); enhanceImages(root); }
  function start() {
    enhanceAll(document);
    // rows that the dashboard builds later (homepage cards, footer icons, research sections)
    if (window.MutationObserver) {
      var queued = false;
      new MutationObserver(function () {
        if (queued) return; queued = true;
        window.requestAnimationFrame(function () { queued = false; enhanceAll(document); });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
