// =====================================================
// News times: publish day + time in the visitor's own timezone
// =====================================================
// Server markup: <time datetime="ISO" data-news-time="card|article">UTC fallback text</time>
// (worker/news-time.js). Cards get "Tue, 24 Nov 2026, 22:05 · 3 hours ago"; the article page gets the
// long form with the timezone name. The full date, time and timezone are also in the tooltip.
// The "x ago" part is live: it keeps counting while the page stays open (see nrTickTimes).

function nrParseDate(value) {
  if (!value) return NaN;
  var s = String(value).replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
}

// "How long ago", in the style newsrooms use: just now, 5 min ago, 2 hr 34 min ago, 3 days ago, 2 weeks ago, 1 month ago, 1 year ago.
// A time in the future (a scheduled story) reads "in 2 hr 10 min". Pure function: easy to test, no page access.
function nrAgo(t, now) {
  var d = (now === undefined ? Date.now() : now) - t;
  if (isNaN(d)) return "";
  var future = d < 0, a = Math.abs(d);
  var min = Math.floor(a / 60000), hr = Math.floor(min / 60), day = Math.floor(a / 86400000);
  var plural = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
  var body;
  if (a < 60000) return "just now";
  if (min < 60) body = min + " min";
  else if (hr < 24) body = hr + " hr" + (min % 60 ? " " + (min % 60) + " min" : "");
  else if (day < 7) body = plural(day, "day");
  else if (day < 30) body = plural(Math.floor(day / 7), "week");
  else if (day < 365) body = plural(Math.max(1, Math.floor(day / 30.4375)), "month");
  else body = plural(Math.max(1, Math.floor(day / 365.25)), "year");
  return future ? "in " + body : body + " ago";
}

function nrLocalizeTimes(root) {
  var list = (root || document).querySelectorAll("time[data-news-time]:not([data-news-done])");
  if (list.length && typeof Intl !== "undefined" && Intl.DateTimeFormat) {
    var now = Date.now();
    var short = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    var long = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var t = Date.parse(el.getAttribute("datetime"));
      if (isNaN(t)) continue;
      var base = el.getAttribute("data-news-time") === "article" ? long.format(t) : short.format(t);
      el.setAttribute("data-news-base", base);
      el.title = long.format(t);
      el.setAttribute("data-news-done", "1");
    }
  }
  nrTickTimes();
}

// One shared timer keeps every "x ago" on the page current: every 15 s while something is under an hour old, every minute
// while under a day, every 15 min after that. Paused while the tab is hidden; refreshed when the reader comes back.
var nrTickTimer = null;
function nrTickTimes() {
  if (nrTickTimer) { clearTimeout(nrTickTimer); nrTickTimer = null; }
  var list = document.querySelectorAll("time[data-news-base]");
  if (!list.length) return;
  var now = Date.now(), youngest = Infinity;
  for (var i = 0; i < list.length; i++) {
    var el = list[i], t = Date.parse(el.getAttribute("datetime"));
    if (isNaN(t)) continue;
    var ago = nrAgo(t, now);
    var text = el.getAttribute("data-news-base") + (ago ? " \u00b7 " + ago : "");
    if (el.textContent !== text) el.textContent = text;
    youngest = Math.min(youngest, Math.abs(now - t));
  }
  if (document.hidden) return;
  nrTickTimer = setTimeout(nrTickTimes, youngest < 3600000 ? 15000 : youngest < 86400000 ? 60000 : 900000);
}
document.addEventListener("visibilitychange", function () { if (!document.hidden) nrTickTimes(); });

// Markup for cards that the browser builds itself (home news, news feed). Falls back to a plain date.
function nrTimeTag(value, extraClass) {
  var t = nrParseDate(value);
  if (isNaN(t)) return "";
  var iso = new Date(t).toISOString();
  return '<time class="news-time' + (extraClass ? " " + extraClass : "") + '" datetime="' + iso + '" data-news-time="card">' +
    new Date(t).toLocaleDateString() + "</time>";
}

// Date filters work in the visitor's timezone: tell the server how far it is from UTC (minutes east).
function nrApplyTimezone(root) {
  var scope = root || document;
  var offset = -new Date().getTimezoneOffset();
  var inputs = scope.querySelectorAll('input[name="tzo"]');
  for (var i = 0; i < inputs.length; i++) inputs[i].value = String(offset);
  var links = scope.querySelectorAll("a[data-nr-tz]");
  for (var j = 0; j < links.length; j++) {
    var href = links[j].getAttribute("href") || "";
    if (href.indexOf("tzo=") < 0) links[j].setAttribute("href", href + (href.indexOf("?") < 0 ? "?" : "&") + "tzo=" + offset);
  }
}

window.nrLocalizeTimes = nrLocalizeTimes;
window.nrAgo = nrAgo;
window.nrTimeTag = nrTimeTag;
document.addEventListener("DOMContentLoaded", function () {
  nrLocalizeTimes(document);
  nrApplyTimezone(document);
});
