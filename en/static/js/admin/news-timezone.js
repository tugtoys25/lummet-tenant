// Admin time-zone helpers (global `nrZone`). Times are STORED in UTC; editors see and type them in the site's newsroom time
// zone (Newsroom > Flags > Time zone) or, when none is set, in their own browser's zone. "" means the browser's zone.
(function () {
  "use strict";
  var cache = null;
  var pad = function (n) { return String(n).padStart(2, "0"); };

  function valid(zone) { if (!zone) return true; try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch (e) { return false; } }
  function parts(date, zone) {
    var f = new Intl.DateTimeFormat("en-CA", { timeZone: zone || undefined, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var o = {}; f.formatToParts(date).forEach(function (p) { if (p.type !== "literal") o[p.type] = p.value; });
    return o;
  }
  // Minutes the zone is ahead of UTC at that moment (Kigali +120, New York -300 or -240 in summer).
  function offsetMin(zone, date) {
    if (!zone) return -date.getTimezoneOffset();
    var p = parts(date, zone);
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - (date.getTime() - date.getMilliseconds())) / 60000);
  }
  // Database value ("2026-03-10 09:30:00" or ISO) -> ISO. Values without a zone are UTC.
  function dbToIso(v) {
    if (!v) return "";
    var s = String(v).replace(" ", "T");
    var t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
    return isNaN(t) ? "" : new Date(t).toISOString();
  }
  function dayKey(iso, zone) { var p = parts(new Date(iso), zone); return p.year + "-" + p.month + "-" + p.day; }
  function clock(iso, zone) { var p = parts(new Date(iso), zone); return p.hour + ":" + p.minute; }
  // ISO/db value -> "YYYY-MM-DDTHH:MM" for a datetime-local box, in the zone.
  function isoToWall(v, zone) { var iso = dbToIso(v); if (!iso) return ""; var p = parts(new Date(iso), zone); return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute; }
  // "YYYY-MM-DDTHH:MM" typed in the zone -> ISO (UTC). Handles daylight-saving changes.
  function wallToIso(local, zone) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ""));
    if (!m) return "";
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var off1 = offsetMin(zone, new Date(guess));
    var t = guess - off1 * 60000;
    var off2 = offsetMin(zone, new Date(t));
    if (off2 !== off1) t = guess - off2 * 60000;
    return new Date(t).toISOString();
  }
  // The site's newsroom time zone ("" = each editor's browser). Fetched once per page.
  function site() {
    if (cache) return cache;
    cache = fetch("/en/api/v1/newsroom/timezone", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { var z = j && j.data && j.data.timezone; return z && valid(z) ? z : ""; })
      .catch(function () { return ""; });
    return cache;
  }
  function label(zone) { return zone || (Intl.DateTimeFormat().resolvedOptions().timeZone || "your browser's time zone"); }
  function reset() { cache = null; }

  window.nrZone = { valid: valid, offsetMin: offsetMin, dbToIso: dbToIso, dayKey: dayKey, clock: clock, isoToWall: isoToWall, wallToIso: wallToIso, site: site, label: label, reset: reset };
})();
