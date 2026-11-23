/* Public copyright report form. Posts JSON to /en/api/v1/news/copyright-report. DOM calls only. */
(function () {
  "use strict";
  var form = document.getElementById("copyrightReportForm");
  if (!form) return;
  var status = document.getElementById("cr-status");
  function say(msg, bad) { status.textContent = msg; status.style.color = bad ? "#b00020" : "inherit"; }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements, btn = form.querySelector("button[type=submit]");
    var body = {};
    ["page_url", "original_work", "details", "reporter_name", "organisation", "reporter_email", "signature", "website"].forEach(function (k) { body[k] = f[k] ? f[k].value : ""; });
    body.good_faith = !!f.good_faith.checked; body.accuracy_confirmed = !!f.accuracy_confirmed.checked;
    btn.disabled = true; say("Sending…", false);
    fetch("/en/api/v1/news/copyright-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.success) { form.reset(); say("Thank you. Your report was received and will be reviewed.", false); }
        else { say((res.d && res.d.error) || "The report could not be sent. Please check the form and try again.", true); btn.disabled = false; }
      })
      .catch(function () { say("The report could not be sent. Please try again.", true); btn.disabled = false; });
  });
})();
