// =====================================================
// DASHBOARD SHELL (menu toggle + grouped navigation)
// Works with templates/layout/admin-nav.html and
// templates/layout/user-nav.html. Presentation only: it never
// decides what a user may see. Hiding or showing links by
// permission is done by admin-permissions.js, and every route
// is still checked on the server.
//
// It does not use innerHTML or any dynamic-code sink.
// =====================================================

(function () {
  "use strict";

  var DESKTOP_QUERY = "(min-width: 901px)";
  var STORE_NAV = "dash.nav";
  var STORE_GROUPS = "dash.groups";

  function read(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* storage may be blocked */ } }

  function init() {
    var wrapper = document.querySelector(".admin-wrapper");
    var nav = document.getElementById("dashNav");
    if (!wrapper || !nav) return;

    var toggle = document.getElementById("dashToggle");
    var closeBtn = document.getElementById("dashClose");
    var backdrop = document.getElementById("dashBackdrop");
    var filter = document.getElementById("dashFilter");
    var crumb = document.getElementById("dashCrumb");
    var emptyNote = document.getElementById("dashEmpty");
    var groups = Array.prototype.slice.call(nav.querySelectorAll(".dash-group"));
    var query = window.matchMedia(DESKTOP_QUERY);

    function isDesktop() { return query.matches; }
    function isOpen() {
      return isDesktop() ? !wrapper.classList.contains("dash-collapsed") : wrapper.classList.contains("dash-open");
    }
    function sync() {
      if (toggle) toggle.setAttribute("aria-expanded", String(isOpen()));
      document.body.classList.toggle("dash-lock", !isDesktop() && wrapper.classList.contains("dash-open"));
    }
    function setOpen(open) {
      if (isDesktop()) {
        wrapper.classList.toggle("dash-collapsed", !open);
        write(STORE_NAV, open ? "open" : "closed");
      } else {
        wrapper.classList.toggle("dash-open", open);
        if (!open && toggle) toggle.focus({ preventScroll: true });
      }
      sync();
    }

    if (isDesktop() && read(STORE_NAV) === "closed") wrapper.classList.add("dash-collapsed");

    if (toggle) toggle.addEventListener("click", function () { setOpen(!isOpen()); });
    if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); });
    if (backdrop) backdrop.addEventListener("click", function () { setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !isDesktop() && wrapper.classList.contains("dash-open")) setOpen(false);
    });
    nav.addEventListener("click", function (e) {
      var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (link && !isDesktop()) wrapper.classList.remove("dash-open");
    });
    var onChange = function () { wrapper.classList.remove("dash-open"); sync(); };
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);

    // ---- current page ----
    function normalise(path) { return path.length > 1 ? path.replace(/\/+$/, "") : path; }
    function findActive() {
      var path = normalise(window.location.pathname);
      var links = Array.prototype.slice.call(nav.querySelectorAll(".dash-group a[href], .dash-top-link[href]"));
      var best = null;
      var bestLen = -1;
      links.forEach(function (link) {
        var href = normalise(link.getAttribute("href") || "");
        if (!href || href === "/en/api/v1/auth/logout") return;
        var exact = href === path;
        var prefix = !exact && path.indexOf(href + "/") === 0 && href !== "/en/dashboard" && href !== "/en/user/dashboard";
        if ((exact || prefix) && href.length > bestLen) { best = link; bestLen = href.length; }
      });
      if (best) return best;
      // /en/dashboard/casino/edit/x and /create pages belong to the plural list page.
      var m = path.match(/^(\/en\/dashboard)\/([a-z-]+)\/(?:create|edit)(?:\/|$)/);
      if (m) {
        var candidates = [m[1] + "/" + m[2] + "s", m[1] + "/" + m[2]];
        if (m[2] === "review") candidates.unshift(m[1] + "/reviews/generic");
        for (var i = 0; i < candidates.length; i++) {
          var hit = nav.querySelector('a[href="' + candidates[i] + '"]');
          if (hit) return hit;
        }
      }
      return null;
    }

    var active = findActive();
    Array.prototype.forEach.call(nav.querySelectorAll("a.active, a[aria-current]"), function (a) {
      if (a !== active && a.classList.contains("dash-top-link") === false) {
        a.classList.remove("active");
        a.removeAttribute("aria-current");
      }
    });
    if (active) {
      active.classList.add("active");
      active.setAttribute("aria-current", "page");
      var host = active.closest ? active.closest(".dash-group") : null;
      if (host) {
        host.open = true;
        host.setAttribute("data-has-active", "");
      }
    }

    if (crumb) {
      var groupName = "";
      var pageName = "";
      if (active) {
        pageName = (active.textContent || "").trim();
        var summaryLabel = active.closest && active.closest(".dash-group")
          ? active.closest(".dash-group").querySelector(".dash-group-label") : null;
        groupName = summaryLabel ? summaryLabel.textContent.trim() : "";
      }
      if (pageName) {
        crumb.textContent = "";
        if (groupName) crumb.appendChild(document.createTextNode(groupName + " / "));
        var strong = document.createElement("strong");
        strong.textContent = pageName;
        crumb.appendChild(strong);
      } else {
        var heading = document.querySelector(".admin-content h1");
        if (heading) crumb.textContent = heading.textContent.trim();
      }
    }

    // ---- remembered open/closed groups ----
    var saved = {};
    try { saved = JSON.parse(read(STORE_GROUPS) || "{}") || {}; } catch (e) { saved = {}; }
    groups.forEach(function (group) {
      var id = group.getAttribute("data-group");
      if (!group.hasAttribute("data-has-active") && Object.prototype.hasOwnProperty.call(saved, id)) {
        group.open = !!saved[id];
      }
      group.addEventListener("toggle", function () {
        if (filter && filter.value) return;
        saved[id] = group.open;
        write(STORE_GROUPS, JSON.stringify(saved));
      });
    });
    if (!groups.some(function (g) { return g.open; }) && groups[0]) groups[0].open = true;

    // ---- empty groups (permissions hide links after load) ----
    function refreshGroups() {
      var anyVisible = false;
      groups.forEach(function (group) {
        var visible = Array.prototype.some.call(group.querySelectorAll("a"), function (a) {
          return a.style.display !== "none" && !a.hidden;
        });
        group.hidden = !visible;
        if (visible) anyVisible = true;
      });
      if (emptyNote) emptyNote.hidden = anyVisible || !(filter && filter.value);
    }
    if (window.MutationObserver) {
      new MutationObserver(refreshGroups).observe(nav, { attributes: true, attributeFilter: ["style"], subtree: true });
    }

    // ---- page filter ----
    if (filter) {
      var before = null;
      filter.addEventListener("input", function () {
        var q = filter.value.trim().toLowerCase();
        if (q && !before) before = groups.map(function (g) { return g.open; });
        groups.forEach(function (group) {
          var shown = 0;
          Array.prototype.forEach.call(group.querySelectorAll("a"), function (a) {
            var match = !q || a.textContent.toLowerCase().indexOf(q) !== -1;
            a.hidden = !match;
            if (match && a.style.display !== "none") shown += 1;
          });
          group.hidden = shown === 0;
          if (q && shown) group.open = true;
        });
        if (!q && before) {
          groups.forEach(function (g, i) { g.open = before[i]; });
          before = null;
        }
        if (emptyNote) emptyNote.hidden = !q || groups.some(function (g) { return !g.hidden; });
      });
    }

    refreshGroups();
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
