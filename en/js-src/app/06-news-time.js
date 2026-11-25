// =====================================================
// News times: publish day + time in the visitor's own timezone
// =====================================================
// Server markup: <time datetime="ISO" data-news-time="card|article">UTC fallback text</time>
// (worker/news-time.js). Cards get "Tue, 24 Nov 2026, 22:05 · 3 hours ago"; the article page gets the
// long form with the timezone name. The full date, time and timezone are also in the tooltip.

function nrParseDate(value) {
  if (!value) return NaN;
  var s = String(value).replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
}

function nrLocalizeTimes(root) {
  var list = (root || document).querySelectorAll("time[data-news-time]:not([data-news-done])");
  if (!list.length || typeof Intl === "undefined" || !Intl.DateTimeFormat) return;
  var now = Date.now();
  var rel = Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
  var short = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  var long = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    var t = Date.parse(el.getAttribute("datetime"));
    if (isNaN(t)) continue;
    var text = el.getAttribute("data-news-time") === "article" ? long.format(t) : short.format(t);
    var age = now - t;
    if (rel && age >= 0 && age < 86400000) {
      var mins = Math.floor(age / 60000);
      text += " · " + (mins < 1 ? rel.format(0, "second") : mins < 60 ? rel.format(-mins, "minute") : rel.format(-Math.floor(mins / 60), "hour"));
    }
    el.textContent = text;
    el.title = long.format(t);
    el.setAttribute("data-news-done", "1");
  }
}

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
window.nrTimeTag = nrTimeTag;
document.addEventListener("DOMContentLoaded", function () {
  nrLocalizeTimes(document);
  nrApplyTimezone(document);
});
