/* Live banners admin: the list (status, views, clicks, CTR, toggle, duplicate, delete, reorder). */
(function () {
  "use strict";
  var LB = window.LiveBannerAdmin, el = LB.el;
  var BADGE = { live: "status-published", draft: "status-draft", paused: "status-draft", scheduled: "status-draft", expired: "status-draft" };

  function act(url, body, ok) { return LB.api(url, body).then(function (d) { if (d.success) { if (ok) LB.say(ok); return LB.loadList(); } LB.say(d.error || "Failed", true); }); }

  LB.loadList = function () {
    var body = document.getElementById("lbListBody"); if (!body) return Promise.resolve();
    return LB.api("/en/api/v1/live-banners/list").then(function (d) {
      if (d.__status === 403 || d.__status === 401) { LB.hideTab(); return; }
      var rows = d.banners || []; LB.state.banners = rows; body.textContent = "";
      if (!rows.length) { body.appendChild(el("tr", {}, [el("td", { colspan: 9, class: "muted", text: "No live banners yet. Choose New banner." })])); return; }
      rows.forEach(function (b, i) {
        var on = b.status === "live";
        var actions = el("td", { class: "table-actions" }, [
          LB.btn("Edit", function () { LB.edit(b.id); }), LB.btn(on ? "Pause" : "Publish", function () { act("/en/api/v1/live-banner/" + (on ? "pause" : "publish"), { id: b.id }, on ? "Paused." : "Published."); }),
          LB.btn("Duplicate", function () { act("/en/api/v1/live-banner/duplicate", { id: b.id }, "Duplicated as a draft."); }),
          LB.btn("Delete", function () { if (window.confirm("Delete \"" + b.name + "\"? This cannot be undone.")) act("/en/api/v1/live-banner/delete", { id: b.id }, "Deleted."); }, "btn btn--danger btn--sm"),
          LB.btn("↑", function () { move(i, -1); }), LB.btn("↓", function () { move(i, 1); })]);
        body.appendChild(el("tr", {}, [el("td", {}, [el("strong", { text: b.name })]), el("td", {}, [el("span", { class: "status-badge " + (BADGE[b.display_status] || ""), text: b.display_status })]),
          el("td", { text: b.template_key.replace(/_/g, " ") }), el("td", { text: b.placement_mode + " / " + b.anchor.replace(/_/g, " ") }), el("td", { text: String(b.priority) }),
          el("td", { text: String(b.views) }), el("td", { text: String(b.clicks) }), el("td", { text: b.ctr + "%" }), actions]));
      });
    });
  };

  function move(i, dir) {
    var ids = LB.state.banners.map(function (b) { return b.id; }), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    act("/en/api/v1/live-banner/reorder", { ids: ids });
  }
})();
