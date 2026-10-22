// Casino review form: a "Show on page" checkbox above every field (plus Show all / Hide all, and a fold button
// that tucks the editor away), so a part can be switched off without deleting what was written.
// Switched-off parts disappear from the page and from the sticky top bar. Saved with review-blocks/sync.
(function () {
  "use strict";
  var form = document.getElementById("reviewForm");
  if (!form) return;
  var MAP = [["overview", "overview"], ["games", "games"], ["bonuses", "bonuses"], ["payments", "payments"], ["licenses", "licensing"], ["content", "more-details"], ["verdict", "verdict"], ["pros", "pros-cons"], ["cons", "pros-cons"], ["faq_json", "faq"]];
  var boxes = [], timer = null, status = null;

  function slug() { var s = form.querySelector("[name='slug']"); return s ? s.value.trim() : ""; }
  function editing() { var b = document.getElementById("reviewSubmitBtn"); return !!b && /^update/i.test((b.textContent || "").trim()); }
  function hiddenList() { var seen = {}, out = []; boxes.forEach(function (b) { if (!b.cb.checked && !seen[b.part]) { seen[b.part] = 1; out.push(b.part); } }); return out; }
  function say(t) { if (status) { status.textContent = t; } }
  function sync(partChanged, checked) { boxes.forEach(function (b) { if (b.part === partChanged) { b.cb.checked = checked; b.group.classList.toggle("is-off", !checked); } }); }
  function push() {
    var s = slug(); if (!s || !editing()) { say(s ? "Will apply when you save." : ""); return; }
    clearTimeout(timer);
    timer = setTimeout(function () {
      fetch("/en/api/v1/review-blocks/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_slug: s, hidden_parts: hiddenList() }) })
        .then(function (r) { return r.json(); }).then(function (d) { say(d && d.success !== false && !d.error ? "Saved." : "Could not save."); }).catch(function () { say("Network error."); });
    }, 350);
  }
  function setAll(on) { boxes.forEach(function (b) { b.cb.checked = on; b.group.classList.toggle("is-off", !on); }); push(); }

  // top bar
  var bar = document.createElement("div"); bar.className = "rf-bar";
  var title = document.createElement("strong"); title.textContent = "Parts shown on the review page";
  var all = document.createElement("button"); all.type = "button"; all.className = "btn btn--ghost btn--sm"; all.textContent = "Show all"; all.addEventListener("click", function () { setAll(true); });
  var none = document.createElement("button"); none.type = "button"; none.className = "btn btn--ghost btn--sm"; none.textContent = "Hide all"; none.addEventListener("click", function () { setAll(false); });
  status = document.createElement("span"); status.className = "rf-status"; status.setAttribute("aria-live", "polite");
  bar.appendChild(title); bar.appendChild(all); bar.appendChild(none); bar.appendChild(status);
  form.insertBefore(bar, form.firstChild);

  MAP.forEach(function (m) {
    var field = form.querySelector("[name='" + m[0] + "']"); if (!field) return;
    var group = field.closest(".form-group"); if (!group) return;
    var head = document.createElement("div"); head.className = "rf-head";
    var lab = document.createElement("label"); lab.className = "rf-show";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; cb.setAttribute("aria-label", "Show this part on the page");
    var sp = document.createElement("span"); sp.textContent = "Show on page";
    lab.appendChild(cb); lab.appendChild(sp);
    var fold = document.createElement("button"); fold.type = "button"; fold.className = "rf-fold"; fold.textContent = "Fold";
    fold.addEventListener("click", function () { var f = group.classList.toggle("is-folded"); fold.textContent = f ? "Unfold" : "Fold"; });
    head.appendChild(lab); head.appendChild(fold);
    group.insertBefore(head, group.firstChild);
    cb.addEventListener("change", function () { sync(m[1], cb.checked); push(); });
    boxes.push({ part: m[1], cb: cb, group: group });
  });

  function load(s) {
    return fetch("/en/api/v1/review-blocks/list?review_slug=" + encodeURIComponent(s)).then(function (r) { return r.json(); }).then(function (d) {
      var off = {}; ((d && d.hidden_parts) || []).forEach(function (x) { off[x] = 1; });
      boxes.forEach(function (b) { b.cb.checked = !off[b.part]; b.group.classList.toggle("is-off", !!off[b.part]); });
      say("");
    }).catch(function () {});
  }
  function reset() { boxes.forEach(function (b) { b.cb.checked = true; b.group.classList.remove("is-off"); }); say(""); }

  // when a review is opened for editing, show its saved state; when the form is cleared, reset
  var origEdit = window.editReview;
  if (typeof origEdit === "function") window.editReview = function (s) { var r = origEdit.apply(this, arguments); return Promise.resolve(r).then(function () { return load(s); }); };
  var origCancel = window.cancelReviewEdit;
  if (typeof origCancel === "function") window.cancelReviewEdit = function () { var r = origCancel.apply(this, arguments); reset(); return r; };
  // a new review: apply the choices once it has been created
  form.addEventListener("submit", function () {
    var wasEditing = editing(), s = slug(), list = hiddenList();
    if (wasEditing || !list.length) return;
    setTimeout(function () {
      fetch("/en/api/v1/review-blocks/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_slug: s, hidden_parts: list }) }).catch(function () {});
    }, 1600);
  });
})();
