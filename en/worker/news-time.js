// worker/news-time.js -- publish day + time for news cards and articles.
//
// The page is edge-cached and shared by every visitor, so the server cannot know the reader's timezone.
// It therefore writes a <time datetime="ISO"> whose text is a readable UTC fallback, and the public
// script (js-src/app/06-news-time.js) rewrites it into the visitor's own timezone ("Tue, 24 Nov 2026,
// 22:05 · 3 hours ago"). Without JavaScript the reader still gets the day, date and time, labelled UTC.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');

// DB values are 'YYYY-MM-DD HH:MM:SS' in UTC (no zone) or full ISO strings. Returns an ISO string or null.
export function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  const t = Date.parse(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Text shown until the script localises it (and for readers without JavaScript).
export function utcText(iso, mode = 'card') {
  const d = new Date(iso);
  const clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  return mode === 'article'
    ? `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} at ${clock}`
    : `${DAYS[d.getUTCDay()].slice(0, 3)}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()} · ${clock}`;
}

// mode: 'card' (short, with "3 hours ago" when recent) | 'article' (long, with timezone name).
// Returns '' for a missing or unreadable date so callers can drop it into a template unconditionally.
export function renderTime(value, mode = 'card', { className = '' } = {}) {
  const iso = toIso(value);
  if (!iso) return '';
  const cls = ['news-time', className].filter(Boolean).join(' ');
  return `<time class="${esc(cls)}" datetime="${iso}" data-news-time="${mode === 'article' ? 'article' : 'card'}">${esc(utcText(iso, mode))}</time>`;
}

// True when `updated` is meaningfully later than `published` (an "Updated" line is noise otherwise).
export function isMateriallyUpdated(published, updated, minutes = 60) {
  const a = Date.parse(toIso(published) || ''), b = Date.parse(toIso(updated) || '');
  return !Number.isNaN(a) && !Number.isNaN(b) && b - a >= minutes * 60000;
}
