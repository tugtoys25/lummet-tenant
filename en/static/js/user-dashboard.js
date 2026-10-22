// =====================================================
// USER (CUSTOMER) DASHBOARD
// Pages: overview, bookmarks, inquiries, notifications,
// submit-casino, profile. Loaded on every page, so each
// init function returns early unless its page is present.
//
// Everything that comes from the API is escaped before it is
// placed in markup, links are restricted to safe schemes, and
// nothing is exposed on window (clicks use delegation).
// =====================================================

(function () {
  "use strict";

  var API = "/en/api/v1";

  // ---------- helpers ----------

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Internal paths and http(s) URLs only; anything else (javascript:, data:, //host) is dropped.
  function safeHref(value) {
    var v = String(value == null ? "" : value).trim();
    if (!v) return "";
    if (/^\/(?![\/\\])/.test(v)) return v;
    if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
    return "";
  }

  // SQLite timestamps ("YYYY-MM-DD HH:MM:SS") are UTC.
  function toDate(value) {
    if (!value) return null;
    var s = String(value);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(" ", "T") + "Z";
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(value) {
    var d = toDate(value);
    return d ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  }

  // Notification text may have been written in a rich editor; show it as plain, safe text.
  function htmlToText(value) {
    var s = String(value == null ? "" : value);
    if (s.indexOf("<") === -1) return s;
    try {
      var doc = new DOMParser().parseFromString(s, "text/html");
      Array.prototype.forEach.call(doc.querySelectorAll("script,style,template"), function (n) { n.remove(); });
      Array.prototype.forEach.call(doc.querySelectorAll("br"), function (b) { b.replaceWith("\n"); });
      Array.prototype.forEach.call(doc.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6"), function (el) { el.append("\n"); });
      return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    } catch (e) {
      return s.replace(/<[^>]*>/g, "");
    }
  }

  function request(path, options) {
    var opts = Object.assign({ credentials: "same-origin" }, options || {});
    if (opts.body && typeof opts.body !== "string") {
      opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(API + path, opts).then(function (res) {
      if (res.status === 401) {
        window.location.href = "/en/login";
        throw new Error("Signed out");
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.success === false) {
          var err = new Error(data.error || "Something went wrong. Please try again.");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function setAlert(el, type, message) {
    if (!el) return;
    if (!message) { el.style.display = "none"; el.textContent = ""; return; }
    el.className = "alert alert--" + type;
    el.textContent = message;
    el.style.display = "block";
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      if (label) btn.textContent = label;
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  var ICONS = {
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>'
  };
  function emptyState(icon, title, text, cta) {
    return '<div class="dash-empty-state">' +
      '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[icon] + "</svg>" +
      "<strong>" + esc(title) + "</strong>" +
      "<p>" + esc(text) + "</p>" +
      (cta ? '<a href="' + esc(cta.href) + '" class="btn btn--primary btn--sm">' + esc(cta.label) + "</a>" : "") +
      "</div>";
  }
  function errorState(message) {
    return '<div class="dash-error-state" role="alert"><span>' + esc(message) +
      '</span><button type="button" class="btn btn--ghost btn--sm" data-retry>Try again</button></div>';
  }

  function badge(status) {
    var s = String(status || "pending").toLowerCase();
    var cls = s === "answered" || s === "approved" ? "status-published" : s === "rejected" ? "status-rejected" : "status-pending";
    return '<span class="status-badge ' + cls + '">' + esc(s) + "</span>";
  }

  // Filter tabs: sets aria-pressed, fills the counts, and calls back with the chosen filter.
  function wireTabs(tabsEl, onChange) {
    if (!tabsEl) return { setCounts: function () {} };
    tabsEl.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".dash-tab") : null;
      if (!btn) return;
      Array.prototype.forEach.call(tabsEl.querySelectorAll(".dash-tab"), function (t) {
        t.setAttribute("aria-pressed", t === btn ? "true" : "false");
      });
      onChange(btn.getAttribute("data-filter") || "");
    });
    return {
      setCounts: function (counts) {
        Array.prototype.forEach.call(tabsEl.querySelectorAll("[data-count]"), function (n) {
          n.textContent = String(counts[n.getAttribute("data-count")] || 0);
        });
      }
    };
  }

  // One shared notifications request per page (overview, list and sidebar badge all use it).
  var notifPromise = null;
  function loadNotifications(force) {
    if (!notifPromise || force) {
      notifPromise = request("/user/notifications").then(function (d) { return d.notifications || []; });
      notifPromise.catch(function () { notifPromise = null; });
    }
    return notifPromise;
  }

  function onRetry(container, fn) {
    container.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-retry]")) fn();
    });
  }

  // ---------- sidebar: unread badge on Notifications ----------

  function setNavBadge(unread) {
    var link = document.querySelector('#dashNav .dash-group[data-group="account"] a[href="/en/user/notifications"]');
    if (!link) return;
    var existing = link.querySelector(".dash-count");
    if (existing) existing.remove();
    if (unread > 0) {
      var chip = document.createElement("span");
      chip.className = "dash-count";
      chip.textContent = unread > 99 ? "99+" : String(unread);
      chip.setAttribute("aria-label", unread + " unread");
      link.appendChild(chip);
    }
  }
  function initNavBadge() {
    if (!document.querySelector('#dashNav .dash-group[data-group="account"]')) return;
    loadNotifications().then(function (list) {
      setNavBadge(list.filter(function (n) { return !n.is_read; }).length);
    }).catch(function () { /* the badge is optional */ });
  }

  // ---------- overview ----------

  function initOverview() {
    if (!$("bookmarkCount")) return;

    function count(id, promise, pick) {
      var el = $(id);
      promise.then(function (d) { el.textContent = String(pick(d)); })
        .catch(function () { el.textContent = "0"; });
    }
    var bookmarks = request("/user/bookmarks");
    var inquiries = request("/user/inquiries");
    var submissions = request("/user/submissions");
    var notifications = loadNotifications();

    count("bookmarkCount", bookmarks, function (d) { return (d.bookmarks || []).length; });
    count("inquiryCount", inquiries, function (d) { return (d.inquiries || []).length; });
    count("submissionCount", submissions, function (d) { return (d.submissions || []).length; });
    count("notifCount", notifications, function (list) { return list.filter(function (n) { return !n.is_read; }).length; });

    var recentN = $("recentNotifications");
    function showNotifications() {
      notifications.then(function (list) {
        var top = list.slice(0, 4);
        recentN.innerHTML = top.length
          ? '<div class="dash-items">' + top.map(function (n) {
              var href = safeHref(n.link) || "/en/user/notifications";
              return '<div class="dash-item' + (n.is_read ? "" : " dash-item--unread") + '">' +
                '<div class="dash-item-top"><h3 class="dash-item-title"><a href="' + esc(href) + '">' + esc(n.title) + "</a></h3>" +
                (n.is_read ? "" : '<span class="status-badge status-new">New</span>') + "</div>" +
                '<p class="dash-item-meta">' + esc(fmtDate(n.created_at)) + "</p></div>";
            }).join("") + "</div>"
          : emptyState("bell", "You're all caught up", "New updates about your account will show up here.");
      }).catch(function () { recentN.innerHTML = errorState("Could not load notifications."); });
    }
    showNotifications();
    onRetry(recentN, function () { notifPromise = null; notifications = loadNotifications(true); showNotifications(); });

    var recentI = $("recentInquiries");
    inquiries.then(function (d) {
      var top = (d.inquiries || []).slice(0, 4);
      recentI.innerHTML = top.length
        ? '<div class="dash-items">' + top.map(function (i) {
            return '<div class="dash-item"><div class="dash-item-top"><h3 class="dash-item-title"><a href="/en/user/inquiries">' + esc(i.subject) + "</a></h3>" +
              badge(i.status) + "</div>" +
              '<p class="dash-item-meta">' + esc(fmtDate(i.created_at)) + "</p></div>";
          }).join("") + "</div>"
        : emptyState("message", "No inquiries yet", "Have a question? Send one to the team.", { href: "/en/user/inquiries", label: "Ask a question" });
    }).catch(function () { recentI.innerHTML = errorState("Could not load inquiries."); });
    onRetry(recentI, function () { window.location.reload(); });
  }

  // ---------- bookmarks ----------

  function initBookmarks() {
    var container = $("bookmarksContainer");
    if (!container) return;

    function stars(rating) {
      var r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
      return "★".repeat(r) + "☆".repeat(5 - r);
    }
    function card(c) {
      var slug = esc(c.slug);
      var path = encodeURIComponent(c.slug);
      var logo = safeHref(c.logo) || "/static/images/default.png";
      return '<div class="casino-card" data-casino-slug="' + slug + '">' +
        '<button type="button" class="casino-card__bookmark" data-remove-bookmark="' + slug + '" aria-label="Remove ' + esc(c.name) + ' from bookmarks" aria-pressed="true" title="Remove ' + esc(c.name) + '"><span class="bookmark-icon" aria-hidden="true">♥</span></button>' +
        '<div class="casino-card__header"><div class="casino-card__logo-wrap"><img src="' + esc(logo) + '" alt="' + esc(c.name) + '" class="casino-card__logo" loading="lazy" data-fallback></div>' +
        '<div class="casino-card__title-group"><h3 class="casino-card__name">' + esc(c.name) + '</h3><div class="casino-card__rating" aria-label="Rated ' + esc(Math.round(Number(c.rating) || 0)) + ' out of 5">' + stars(c.rating) + "</div></div></div>" +
        '<div class="casino-card__body"><div class="casino-card__bonus"><span class="bonus-title">' + esc(c.bonus_title || "Welcome Bonus") + '</span><span class="bonus-value">' + esc(c.bonus_value || "") + "</span></div></div>" +
        '<div class="casino-card__actions"><a href="/en/casino/' + path + '" class="btn btn--secondary">Review</a>' +
        '<a href="/en/go/' + path + '" class="btn btn--primary" rel="nofollow sponsored">Visit</a></div></div>';
    }
    function empty() {
      container.innerHTML = emptyState("bookmark", "No bookmarks yet", "Browse casinos and tap the heart to save them here.", { href: "/en/casino", label: "Browse casinos" });
    }
    function load() {
      request("/user/bookmarks").then(function (d) {
        var list = d.bookmarks || [];
        if (!list.length) return empty();
        container.innerHTML = list.map(card).join("");
      }).catch(function () { container.innerHTML = errorState("Could not load your bookmarks."); });
    }

    // Broken logos fall back to the default image (error events do not bubble, so capture).
    container.addEventListener("error", function (e) {
      var img = e.target;
      if (img && img.tagName === "IMG" && img.hasAttribute("data-fallback") && !img.dataset.failed) {
        img.dataset.failed = "1";
        img.src = "/static/images/default.png";
      }
    }, true);

    container.addEventListener("click", function (e) {
      var retry = e.target.closest && e.target.closest("[data-retry]");
      if (retry) { load(); return; }
      var btn = e.target.closest && e.target.closest("[data-remove-bookmark]");
      if (!btn) return;
      btn.disabled = true;
      request("/user/bookmark/remove", { method: "POST", body: { casino_slug: btn.getAttribute("data-remove-bookmark") } })
        .then(function () {
          var cardEl = btn.closest(".casino-card");
          if (cardEl) cardEl.remove();
          if (!container.querySelector(".casino-card")) empty();
        })
        .catch(function (err) {
          btn.disabled = false;
          var old = container.parentNode.querySelector(".dash-bookmark-error");
          if (old) old.remove();
          var note = document.createElement("div");
          note.className = "alert alert--error dash-bookmark-error";
          note.setAttribute("role", "alert");
          note.textContent = err.message || "Could not remove the bookmark.";
          container.parentNode.insertBefore(note, container);
        });
    });

    load();
  }

  // ---------- inquiries ----------

  function initInquiries() {
    var list = $("inquiriesList");
    var form = $("inquiryForm");
    if (!list) return;

    var all = [];
    var filter = "";
    var tabs = wireTabs($("inquiryTabs"), function (f) { filter = f; render(); });

    function render() {
      tabs.setCounts({
        all: all.length,
        pending: all.filter(function (i) { return i.status !== "answered"; }).length,
        answered: all.filter(function (i) { return i.status === "answered"; }).length
      });
      var rows = all.filter(function (i) {
        if (!filter) return true;
        return filter === "answered" ? i.status === "answered" : i.status !== "answered";
      });
      if (!all.length) {
        list.innerHTML = emptyState("message", "No inquiries yet", "Your questions and our replies will appear here.");
        return;
      }
      if (!rows.length) {
        list.innerHTML = emptyState("message", "Nothing here", "No inquiries match this filter.");
        return;
      }
      list.innerHTML = '<div class="dash-items">' + rows.map(function (i) {
        return '<article class="dash-item"><div class="dash-item-top"><div><h3 class="dash-item-title">' + esc(i.subject) + "</h3>" +
          '<p class="dash-item-meta">Sent ' + esc(fmtDate(i.created_at)) + "</p></div>" + badge(i.status) + "</div>" +
          '<p class="dash-item-body">' + esc(i.message) + "</p>" +
          (i.admin_reply ? '<div class="dash-reply"><span class="dash-reply-label">Reply from the team</span><p>' + esc(i.admin_reply) + "</p></div>" : "") +
          "</article>";
      }).join("") + "</div>";
    }
    function load() {
      request("/user/inquiries").then(function (d) { all = d.inquiries || []; render(); })
        .catch(function () { list.innerHTML = errorState("Could not load your inquiries."); });
    }
    onRetry(list, load);

    if (form) {
      var alertEl = $("inquiryFormAlert");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        setAlert(alertEl);
        var subject = form.elements.subject.value.trim();
        var message = form.elements.message.value.trim();
        if (!subject) { setAlert(alertEl, "error", "Please enter a subject."); form.elements.subject.focus(); return; }
        if (!message) { setAlert(alertEl, "error", "Please enter a message."); form.elements.message.focus(); return; }
        var btn = form.querySelector('button[type="submit"]');
        busy(btn, true, "Sending…");
        request("/user/inquiry/create", { method: "POST", body: { subject: subject, message: message } })
          .then(function () {
            setAlert(alertEl, "success", "Inquiry sent. We'll respond soon.");
            form.reset();
            load();
          })
          .catch(function (err) { setAlert(alertEl, "error", err.message); })
          .then(function () { busy(btn, false); });
      });
    }
    load();
  }

  // ---------- notifications ----------

  function initNotifications() {
    var list = $("notificationsList");
    if (!list) return;
    var markAll = $("markAllReadBtn");

    var all = [];
    var filter = "";
    var tabs = wireTabs($("notificationTabs"), function (f) { filter = f; render(); });

    function unreadCount() { return all.filter(function (n) { return !n.is_read; }).length; }

    function render() {
      var unread = unreadCount();
      tabs.setCounts({ all: all.length, unread: unread });
      if (markAll) markAll.disabled = unread === 0;
      setNavBadge(unread);
      var rows = filter === "unread" ? all.filter(function (n) { return !n.is_read; }) : all;
      if (!all.length) {
        list.innerHTML = emptyState("bell", "No notifications yet", "Updates about your account and requests will appear here.");
        return;
      }
      if (!rows.length) {
        list.innerHTML = emptyState("bell", "You're all caught up", "There are no unread notifications.");
        return;
      }
      list.innerHTML = '<div class="dash-items">' + rows.map(function (n) {
        var href = safeHref(n.link);
        var title = href
          ? '<a href="' + esc(href) + '" data-notification="' + esc(n.id) + '"' + (/^https?:/i.test(href) ? ' rel="noopener noreferrer"' : "") + ">" + esc(n.title) + "</a>"
          : esc(n.title);
        var body = htmlToText(n.message);
        return '<article class="dash-item' + (n.is_read ? "" : " dash-item--unread") + '">' +
          '<div class="dash-item-top"><div><h3 class="dash-item-title">' + title + "</h3>" +
          '<p class="dash-item-meta">' + esc(fmtDate(n.created_at)) + "</p></div>" +
          (n.is_read ? "" : '<div class="dash-item-badges"><span class="status-badge status-new">New</span></div>') + "</div>" +
          (body ? '<p class="dash-item-body">' + esc(body) + "</p>" : "") +
          (n.is_read ? "" : '<div class="dash-item-actions"><button type="button" class="btn btn--ghost btn--sm" data-mark-read="' + esc(n.id) + '">Mark as read</button></div>') +
          "</article>";
      }).join("") + "</div>";
    }
    function load(force) {
      loadNotifications(force === true).then(function (d) { all = d; render(); })
        .catch(function () { list.innerHTML = errorState("Could not load your notifications."); });
    }
    onRetry(list, function () { load(true); });

    function markRead(id, keepalive) {
      var n = all.filter(function (x) { return String(x.id) === String(id); })[0];
      if (n) n.is_read = 1;
      return request("/user/notification/read", { method: "POST", body: { id: Number(id) || id }, keepalive: !!keepalive });
    }

    list.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-mark-read]");
      if (btn) {
        btn.disabled = true;
        markRead(btn.getAttribute("data-mark-read")).then(render).catch(function () { btn.disabled = false; });
        return;
      }
      var link = e.target.closest && e.target.closest("a[data-notification]");
      if (link) {
        // Record it as read, then let the browser follow the link normally.
        markRead(link.getAttribute("data-notification"), true).catch(function () {});
      }
    });

    if (markAll) {
      markAll.addEventListener("click", function () {
        busy(markAll, true, "Marking…");
        request("/user/notifications/read-all", { method: "POST", body: {} })
          .then(function () { all.forEach(function (n) { n.is_read = 1; }); render(); })
          .catch(function (err) { window.alert(err.message); })
          .then(function () { busy(markAll, false); markAll.disabled = unreadCount() === 0; });
      });
    }
    load();
  }

  // ---------- casino submissions ----------

  function initSubmissions() {
    var list = $("userSubmissionsList");
    var form = $("userCasinoForm");
    if (!list) return;

    var all = [];
    var filter = "";
    var tabs = wireTabs($("submissionTabs"), function (f) { filter = f; render(); });
    function status(s) { return String(s.status || "pending").toLowerCase(); }

    function render() {
      tabs.setCounts({
        all: all.length,
        pending: all.filter(function (s) { return status(s) === "pending"; }).length,
        approved: all.filter(function (s) { return status(s) === "approved"; }).length,
        rejected: all.filter(function (s) { return status(s) === "rejected"; }).length
      });
      if (!all.length) {
        list.innerHTML = emptyState("box", "No submissions yet", "Casinos you suggest will be tracked here.");
        return;
      }
      var rows = all.filter(function (s) { return !filter || status(s) === filter; });
      if (!rows.length) {
        list.innerHTML = emptyState("box", "Nothing here", "No submissions match this filter.");
        return;
      }
      list.innerHTML = '<div class="dash-items">' + rows.map(function (s) {
        var url = safeHref(s.website_url);
        return '<article class="dash-item"><div class="dash-item-top"><div><h3 class="dash-item-title">' + esc(s.name) + "</h3>" +
          '<p class="dash-item-meta">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(s.website_url) + "</a>" : esc(s.website_url)) +
          " · Submitted " + esc(fmtDate(s.created_at)) + "</p></div>" + badge(s.status) + "</div>" +
          (s.admin_notes ? '<div class="dash-reply"><span class="dash-reply-label">Note from the team</span><p>' + esc(s.admin_notes) + "</p></div>" : "") +
          "</article>";
      }).join("") + "</div>";
    }
    function load() {
      request("/user/submissions").then(function (d) { all = d.submissions || []; render(); })
        .catch(function () { list.innerHTML = errorState("Could not load your submissions."); });
    }
    onRetry(list, load);

    if (form) {
      var alertEl = $("userCasinoAlert");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        setAlert(alertEl);
        var f = form.elements;
        var name = f.name.value.trim();
        var website = f.website_url.value.trim();
        if (!name) { setAlert(alertEl, "error", "Please enter the casino name."); f.name.focus(); return; }
        if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(website)) { setAlert(alertEl, "error", "Enter the website as a full address starting with https://"); f.website_url.focus(); return; }
        var affiliate = f.affiliate_url.value.trim();
        if (affiliate && !/^https?:\/\/[^\s]+$/i.test(affiliate)) { setAlert(alertEl, "error", "The affiliate URL must start with https://"); f.affiliate_url.focus(); return; }
        var btn = form.querySelector('button[type="submit"]');
        busy(btn, true, "Submitting…");
        request("/user/submit-casino", {
          method: "POST",
          body: {
            name: name,
            website_url: website,
            affiliate_url: affiliate || null,
            bonus_value: f.bonus_value.value.trim() || null,
            notes: f.notes.value.trim() || null
          }
        })
          .then(function () {
            setAlert(alertEl, "success", "Thanks! Your casino was submitted for review.");
            form.reset();
            load();
          })
          .catch(function (err) { setAlert(alertEl, "error", err.message); })
          .then(function () { busy(btn, false); });
      });
    }
    load();
  }

  // ---------- profile and password ----------

  function initProfile() {
    var avatar = $("profileAvatar");
    if (avatar) {
      var email = avatar.getAttribute("data-email") || "";
      avatar.textContent = (email.trim().charAt(0) || "•").toUpperCase();
    }

    var form = $("profileForm");
    if (form) {
      var alertEl = $("profileFormAlert");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        setAlert(alertEl);
        var email = form.elements.email.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAlert(alertEl, "error", "Enter a valid email address."); form.elements.email.focus(); return; }
        var btn = form.querySelector('button[type="submit"]');
        busy(btn, true, "Saving…");
        request("/user/profile/update", { method: "POST", body: { email: email } })
          .then(function () {
            setAlert(alertEl, "success", "Profile updated.");
            var shown = form.querySelector(".dash-identity-email");
            if (shown) shown.textContent = email;
            if (avatar) avatar.textContent = email.charAt(0).toUpperCase();
          })
          .catch(function (err) { setAlert(alertEl, "error", err.message); })
          .then(function () { busy(btn, false); });
      });
    }

    var pwForm = $("changePasswordForm");
    if (pwForm) {
      var pwAlert = $("changePasswordAlert");
      pwForm.addEventListener("submit", function (e) {
        e.preventDefault();
        setAlert(pwAlert);
        var f = pwForm.elements;
        if (!f.currentPassword.value) { setAlert(pwAlert, "error", "Enter your current password."); f.currentPassword.focus(); return; }
        if (f.newPassword.value.length < 8) { setAlert(pwAlert, "error", "The new password must be at least 8 characters."); f.newPassword.focus(); return; }
        if (f.newPassword.value !== f.newPasswordConfirm.value) { setAlert(pwAlert, "error", "The new passwords do not match."); f.newPasswordConfirm.focus(); return; }
        var btn = pwForm.querySelector('button[type="submit"]');
        busy(btn, true, "Updating…");
        request("/auth/change-password", {
          method: "POST",
          body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value }
        })
          .then(function () { setAlert(pwAlert, "success", "Password changed successfully."); pwForm.reset(); })
          .catch(function (err) { setAlert(pwAlert, "error", err.message || "Could not change the password."); })
          .then(function () { busy(btn, false); });
      });
    }
  }

  function init() {
    initNavBadge();
    initOverview();
    initBookmarks();
    initInquiries();
    initNotifications();
    initSubmissions();
    initProfile();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
