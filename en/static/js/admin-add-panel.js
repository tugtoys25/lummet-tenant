// =====================================================
// ADMIN ADD / EDIT PANEL
// Many dashboard pages had a long list with the add form buried under it. This moves each
// of those forms into a slide-in panel and puts an "+ Add ..." button at the top of the page.
// The form itself is moved, not rebuilt, so every field, id, script and picker keeps working.
//   - Edit buttons that fill the form open the panel by themselves.
//   - Add while editing resets the form first (it uses the form's own Cancel button).
//   - A successful save closes the panel; an error keeps it open.
// Pages without a list in front of the form are left alone.
// =====================================================

(function () {
  "use strict";

  // formId -> [button label, wide]
  var FORMS = {
    accountForm: ["Add account"], partnerForm: ["Add partner"], programForm: ["Add program"],
    authorForm: ["Add author"], bannerForm: ["Add banner"], cmpForm: ["Add campaign"],
    categoryForm: ["Add category", true], termForm: ["Add commercial term"], countryForm: ["Add country"],
    countryPageForm: ["Add country page", true], navForm: ["Add menu item"], newsForm: ["Add news article", true],
    offerForm: ["Add offer", true], pageForm: ["Add page", true], paymentMethodForm: ["Add payment method"],
    pbForm: ["Add integration"], paForm: ["Add adapter"], rptForm: ["New report"], datasetForm: ["Add dataset"],
    researchForm: ["Add research item", true], reviewForm: ["Add review", true], seoForm: ["Add SEO entry"],
    tlForm: ["Add tracking link"], platformUpdateForm: ["Add platform update", true], componentForm: ["Create component", true],
    impForm: ["New import"]
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function headingBefore(form) {
    var p = form.previousElementSibling;
    return p && /^H[23]$/.test(p.tagName) ? p : null;
  }

  function hasListBefore(form, root) {
    var nodes = root.querySelectorAll("table, .table-wrap, .admin-table, [id$='List'], [id$='TableBody'], [id$='Grid']");
    for (var i = 0; i < nodes.length; i++) {
      if (!form.contains(nodes[i]) && (nodes[i].compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
    }
    return false;
  }

  function visible(n) { return !!n && n.offsetParent !== null && getComputedStyle(n).visibility !== "hidden"; }

  function editing(form) {
    var buttons = form.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var t = (b.textContent || "").trim();
      if (b.type === "submit" && /^(update|save changes|save edit)/i.test(t)) return true;
      if (b.type !== "submit" && /cancel/i.test(t + " " + b.id) && visible(b)) return true;
    }
    return false;
  }

  // Pages that are one big form (create / edit): no list to get away from, so the page gets a
  // bar that stays at the top with the Save button always in reach.
  var SINGLE = ["casinoForm", "casinoEditForm", "contentItemForm", "contentItemEditForm", "genericReviewForm", "genericReviewEditForm",
    "comparisonForm", "comparisonEditForm", "landingPageForm", "landingPageEditForm", "customTypeForm", "customTypeEditForm"];

  function saveBars(root) {
    SINGLE.forEach(function (id) {
      var form = document.getElementById(id);
      if (!form || !root.contains(form) || root.querySelector(".ap-bar")) return;
      var h1 = root.querySelector(".admin-header h1, h1");
      var bar = el("div", "ap-bar");
      bar.appendChild(el("span", "ap-bar__title", h1 ? h1.textContent.trim() : "Editing"));
      var save = el("button", "btn btn--primary", "Save");
      save.type = "button";
      save.addEventListener("click", function () {
        if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      });
      bar.appendChild(save);
      form.parentNode.insertBefore(bar, form);
    });
  }

  function init() {
    var root = document.querySelector(".admin-content");
    if (!root || root.querySelector(".ap-panel")) return;
    saveBars(root);

    var panels = [];
    Object.keys(FORMS).forEach(function (id) {
      var form = document.getElementById(id);
      if (!form || !root.contains(form) || form.hasAttribute("data-no-panel")) return;
      if (!hasListBefore(form, root)) return;
      panels.push(build(form, FORMS[id], root));
    });
    if (!panels.length) return;

    // Edit buttons that do not change the form's button text still need to open it.
    if (panels.length === 1) {
      document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("button, a");
        if (!b || panels[0].panel.contains(b) || !root.contains(b)) return;
        if (/^\s*(edit|open|view \/ edit)\b/i.test(b.textContent || "")) {
          setTimeout(function () { if (!panels[0].isOpen()) panels[0].open(); }, 700);
        }
      }, true);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      // a picker dialog on top handles its own Escape
      if (document.querySelector(".ml-modal-show, .cs-modal, dialog[open]")) return;
      panels.forEach(function (p) { if (p.isOpen()) p.close(); });
    });
  }

  function build(form, cfg, root) {
    var heading = headingBefore(form);
    var title = heading ? heading.textContent.trim() : cfg[0];
    var overlay = el("div", "ap-overlay");
    overlay.hidden = true;
    var panel = el("aside", "ap-panel" + (cfg[1] ? " ap-panel--wide" : ""));
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    var head = el("div", "ap-head");
    var h = el("h2", "ap-title", title);
    var expand = el("button", "ap-icon", "⤢");
    expand.type = "button";
    expand.title = "Wider / narrower";
    expand.setAttribute("aria-label", "Toggle panel width");
    var close = el("button", "ap-icon", "✕");
    close.type = "button";
    close.title = "Close";
    close.setAttribute("aria-label", "Close panel");
    head.appendChild(h);
    head.appendChild(expand);
    head.appendChild(close);
    var body = el("div", "ap-body");
    panel.appendChild(head);
    panel.appendChild(body);

    // the heading is now the panel title; hide the original so nothing is lost or duplicated
    if (heading) heading.classList.add("ap-moved-heading");
    form.parentNode.insertBefore(overlay, form);
    form.parentNode.insertBefore(panel, form);
    body.appendChild(form);

    // top-of-page button
    var bar = root.querySelector(".admin-header");
    if (!bar) {
      bar = el("div", "admin-header");
      root.insertBefore(bar, root.firstChild);
    }
    var add = el("button", "btn btn--primary ap-add", "+ " + cfg[0]);
    add.type = "button";
    bar.appendChild(add);

    var opener = null;
    function isOpen() { return !panel.hidden; }
    function open() {
      if (isOpen()) return;
      opener = document.activeElement;
      overlay.hidden = false;
      panel.hidden = false;
      document.body.classList.add("ap-lock");
      requestAnimationFrame(function () {
        panel.classList.add("ap-open");
        overlay.classList.add("ap-open");
      });
      var first = form.querySelector("input:not([type=hidden]), select, textarea");
      if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 220);
    }
    function close_() {
      panel.classList.remove("ap-open");
      overlay.classList.remove("ap-open");
      setTimeout(function () {
        panel.hidden = true;
        overlay.hidden = true;
        document.body.classList.remove("ap-lock");
        if (opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      }, 180);
    }

    add.addEventListener("click", function () {
      // coming from an edit: use the form's own Cancel so the next save creates, not updates
      if (editing(form)) {
        var cancel = Array.prototype.find.call(form.querySelectorAll("button"), function (b) { return b.type !== "submit" && /cancel/i.test((b.textContent || "") + " " + b.id); });
        if (cancel) cancel.click();
      }
      open();
    });
    close.addEventListener("click", close_);
    overlay.addEventListener("click", close_);
    expand.addEventListener("click", function () { panel.classList.toggle("ap-panel--wide"); });

    // the form's own edit code scrolls to it; opening the panel is what that should do now
    var nativeScroll = form.scrollIntoView ? form.scrollIntoView.bind(form) : null;
    form.scrollIntoView = function () { open(); if (nativeScroll && !isOpen()) nativeScroll.apply(null, arguments); };

    // switching into edit mode (button text / Cancel button appears) opens the panel
    var wasEditing = editing(form);
    var mo = new MutationObserver(function () {
      var now = editing(form);
      if (now && !wasEditing) open();
      if (now !== wasEditing) h.textContent = now ? title.replace(/^(add \/ edit|add|create|new)\b/i, "Edit") : title;
      wasEditing = now;
    });
    mo.observe(form, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style", "hidden", "class"] });

    // a successful save closes the panel; an error keeps it open
    form.addEventListener("submit", function () {
      var started = Date.now();
      var timer = setInterval(function () {
        if (Date.now() - started > 10000 || !isOpen()) { clearInterval(timer); return; }
        var alerts = form.querySelectorAll(".alert");
        for (var i = 0; i < alerts.length; i++) {
          var a = alerts[i];
          if (a.style.display === "none" || !visible(a)) continue;
          if (a.classList.contains("alert--success")) { clearInterval(timer); setTimeout(close_, 900); return; }
          if (a.classList.contains("alert--error")) { clearInterval(timer); return; }
        }
      }, 200);
    });

    // an edit link such as #edit-123 or ?new=1 opens it directly
    if (/[?&]new=1\b/.test(location.search)) open();

    return { panel: panel, open: open, close: close_, isOpen: isOpen };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
