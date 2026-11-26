// Reader features: poll voting and live-blog refresh. Both only run when the page carries the matching block (switches off = no block).
(function () {
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function showResults(sec, poll) {
    var box = sec.querySelector(".news-poll__choices"); if (box) box.remove();
    var old = sec.querySelector(".news-poll__results"); if (old) old.remove();
    var wrap = el("div", "news-poll__results");
    poll.options.forEach(function (o) {
      var row = el("div", "news-poll__row"), bar = el("div", "news-poll__bar");
      bar.style.width = o.pct + "%";
      var label = el("span"); label.textContent = o.label + " — "; label.appendChild(el("strong", "", o.pct + "%"));
      row.appendChild(bar); row.appendChild(label); wrap.appendChild(row);
    });
    wrap.appendChild(el("p", "news-poll__meta", poll.total + " vote" + (poll.total === 1 ? "" : "s") + (poll.closed ? " · poll closed" : "")));
    var h = sec.querySelector("h2"); h.parentNode.insertBefore(wrap, h.nextSibling);
  }
  function initPoll(sec) {
    var id = sec.getAttribute("data-poll"), key = "nrPoll:" + id, status = sec.querySelector("[role=status]");
    var voted = false; try { voted = !!localStorage.getItem(key); } catch (e) { /* storage is optional */ }
    if (voted) {
      fetch("/en/api/v1/news/poll?article=" + encodeURIComponent(sec.getAttribute("data-article")), { credentials: "same-origin" })
        .then(function (r) { return r.json(); }).then(function (d) { if (d && d.success) showResults(sec, d.poll); }).catch(function () {});
    }
    sec.addEventListener("click", function (e) {
      var b = e.target.closest("[data-poll-option]"); if (!b) return;
      sec.querySelectorAll("[data-poll-option]").forEach(function (x) { x.disabled = true; });
      fetch("/en/api/v1/news/poll/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ poll: Number(id), option: Number(b.getAttribute("data-poll-option")) }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.success) { try { localStorage.setItem(key, "1"); } catch (e2) { /* ignore */ } showResults(sec, d.poll); if (status) status.textContent = d.already ? "You have already voted. Here are the results." : "Thanks for voting."; }
          else { sec.querySelectorAll("[data-poll-option]").forEach(function (x) { x.disabled = false; }); if (status) status.textContent = (d && d.error) || "Could not record your vote."; }
        }).catch(function () { sec.querySelectorAll("[data-poll-option]").forEach(function (x) { x.disabled = false; }); if (status) status.textContent = "Could not record your vote. Check your connection."; });
    });
  }
  function renderPost(p) {
    var a = el("article", "news-live__post" + (p.pinned ? " news-live__post--pinned" : "")); a.setAttribute("data-live-post", p.id);
    var t = el("time", "news-live__time"); t.setAttribute("datetime", p.at); t.setAttribute("data-news-time", "card"); t.textContent = String(p.at || "").slice(0, 16).replace("T", " ") + " UTC"; a.appendChild(t);
    if (p.pinned) a.appendChild(el("strong", "", "Pinned · "));
    String(p.body || "").split(/\r?\n/).forEach(function (line, i) { if (i) a.appendChild(document.createElement("br")); a.appendChild(document.createTextNode(line)); });
    if (p.edited) a.appendChild(el("span", "news-poll__meta", " (edited)"));
    return a;
  }
  function initLive(sec) {
    var list = sec.querySelector(".news-live__list"), art = sec.getAttribute("data-article"), timer = null;
    function tick() {
      if (document.hidden) return;
      fetch("/en/api/v1/news/live?article=" + encodeURIComponent(art), { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.success) return;
        list.replaceChildren();
        if (!d.posts.length) list.appendChild(el("p", "news-poll__meta", "No updates yet."));
        d.posts.forEach(function (p) { list.appendChild(renderPost(p)); });
        if (window.nrLocalizeTimes) window.nrLocalizeTimes(list);
        if (d.status !== "live") {
          clearInterval(timer); sec.setAttribute("data-live", "ended");
          var badge = sec.querySelector(".news-live__badge"); if (badge) { badge.textContent = "ENDED"; badge.className = "news-live__badge news-live__badge--ended"; }
        }
      }).catch(function () {});
    }
    timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  }
  function init() {
    document.querySelectorAll(".news-poll[data-poll]").forEach(initPoll);
    document.querySelectorAll(".news-live[data-live=live]").forEach(initLive);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
