// The one escape helper for every interpolated value, plus allow-list checks for URLs, colours and images.
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

/** Escape text for HTML text and quoted attributes. Always returns a string. */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"'`]/g, (c) => MAP[c]);
}

/** A link target: /path, https://..., mailto:... only. Returns "" when not allowed. */
export function safeUrl(v) {
  const s = String(v ?? "").trim();
  if (!s || s.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(s)) return "";
  if (/^\/(?![/\\])/.test(s)) return s;
  if (/^https:\/\/[^\s/]+/i.test(s)) return s;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s)) return s;
  return "";
}

/** An image address: Media library path (/media/..., /uploads/...) or https:// only. */
export function safeImage(v) {
  const s = safeUrl(v);
  if (!s || /^mailto:/i.test(s)) return "";
  if (s.startsWith("/") && !/^\/(media|uploads|static)\//i.test(s)) return "";
  return s;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/** hex or rgb()/rgba() only. Returns "" otherwise. */
export function safeColor(v) {
  const s = String(v ?? "").trim();
  return HEX.test(s) || RGB.test(s) ? s : "";
}

export const isExternal = (url) => /^https?:\/\//i.test(url);

/** rel for a link: sponsored on affiliate/external, always noopener. */
export function relFor(url, { affiliate = false } = {}) {
  return affiliate || isExternal(url) ? "sponsored noopener" : "";
}
