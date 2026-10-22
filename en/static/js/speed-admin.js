// Speed check page: reads /api/v1/speed/summary and draws it with DOM APIs only.
(function () {
  var msg = document.getElementById("spdMessage");
  if (!msg) return;

  function ms(v) { return v == null ? "-" : v + " ms"; }
  function set(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function cell(tr, text) { var td = document.createElement("td"); td.textContent = text; tr.appendChild(td); }

  fetch("/en/api/v1/speed/summary", { credentials: "same-origin" })
    .then(function (res) {
      if (res.status === 403) throw new Error("Only admins can see this page's data.");
      if (!res.ok) throw new Error("Could not load speed data.");
      return res.json();
    })
    .then(function (d) {
      set("spdAsset", d.asset_version || "-");
      if (!d.available) {
        msg.textContent = d.hint || "No data yet.";
        document.getElementById("spdBody").hidden = false;
        return;
      }
      if (!d.samples) {
        msg.textContent = "No samples yet. Browse a few public pages, then reload this page.";
      } else {
        msg.hidden = true;
      }
      document.getElementById("spdBody").hidden = false;
      set("spdRate", d.cache_hit_rate == null ? "-" : d.cache_hit_rate + "%");
      set("spdSamples", d.samples + " samples");
      set("spdHit", ms(d.hit.p50));
      set("spdHitSlow", d.hit.n ? "slowest 1 in 20: " + ms(d.hit.p95) : "no samples");
      set("spdMiss", ms(d.miss.p50));
      set("spdMissSlow", d.miss.n ? "slowest 1 in 20: " + ms(d.miss.p95) : "no samples");

      var body = document.getElementById("spdSlowBody");
      body.textContent = "";
      if (!d.slowest.length) {
        var tr0 = document.createElement("tr");
        var td0 = document.createElement("td");
        td0.colSpan = 4; td0.className = "muted"; td0.textContent = "Not enough samples yet.";
        tr0.appendChild(td0); body.appendChild(tr0);
        return;
      }
      d.slowest.forEach(function (r) {
        var tr = document.createElement("tr");
        cell(tr, r.path); cell(tr, String(r.n)); cell(tr, ms(r.p50)); cell(tr, ms(r.p95));
        body.appendChild(tr);
      });
    })
    .catch(function (e) { msg.textContent = e.message || "Could not load speed data."; });
})();
