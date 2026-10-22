import { BOOL, BY_KEY, CARDS, COLOR, ENUM, FIELDS, INT, LINES, MAX_CARDS, MAX_SLIDES, SLIDES, TEXT, URL_T, VIDEOLINK, VIDEO_EXT } from "./schema.js";

// ------------------------------------------------------------
// Validators
// ------------------------------------------------------------

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim()
    .slice(0, max);
}

function cleanLines(value, max, maxLines) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => cleanText(line, max))
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
}

// Allows an on-site path, an anchor, or an http(s)/mailto/tel link.
// Anything else (javascript:, data:, //host, ...) becomes "".
export function cleanLink(value, max = 300) {
  const v = String(value ?? "").trim().slice(0, max);
  if (!v) return "";
  if (/[\u0000-\u001f\u007f\s"'<>\\]/.test(v)) return "";
  if (/^\/(?!\/)/.test(v)) return v;
  if (/^#[\w-]*$/.test(v)) return v;
  if (/^https?:\/\/[^\s/]+/i.test(v)) return v;
  if (/^mailto:[^\s]+$/i.test(v)) return v;
  if (/^tel:[+\d][\d\s().-]*$/i.test(v)) return v;
  return "";
}

// A background image must be an absolute http(s) URL or an on-site path.
export function cleanImage(value, max) {
  const v = cleanLink(value, max);
  if (!v) return "";
  if (/^(mailto|tel):/i.test(v) || v.startsWith("#")) return "";
  return v;
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

// A video must point at a playable file (mp4, webm, ogg, m4v), not a web page.
function cleanVideoSrc(value) {
  const v = cleanImage(value, 500);
  return v && VIDEO_EXT.test(v) ? v : "";
}

// ------------------------------------------------------------
// Online video (YouTube and Vimeo)
//
// Only the video's provider and id are ever kept. The address that
// reaches a visitor's browser is always built here from a fixed
// template, so a pasted link can never become an arbitrary iframe.
// ------------------------------------------------------------

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

const VIMEO_ID = /^\d{5,12}$/;

const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

/** @returns {{provider:"youtube"|"vimeo", id:string, hash:string}|null} */
export function parseVideoUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 300 || /[\u0000-\u001f\u007f\s"'<>\\]/.test(raw)) return null;
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    return YT_ID.test(parts[0] || "") ? { provider: "youtube", id: parts[0], hash: "" } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = "";
    if (parts[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1] || "";
    return YT_ID.test(id) ? { provider: "youtube", id, hash: "" } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const segs = host === "player.vimeo.com" ? (parts[0] === "video" ? parts.slice(1) : []) : parts;
    const idIndex = segs.findIndex((x) => VIMEO_ID.test(x));
    if (idIndex === -1) return null;
    const id = segs[idIndex];
    const next = segs[idIndex + 1] || "";
    const hash = VIMEO_HASH.test(next) ? next : VIMEO_HASH.test(u.searchParams.get("h") || "") ? u.searchParams.get("h") : "";
    return { provider: "vimeo", id, hash };
  }
  return null;
}

/** The address people paste back into the form: one clean form per video. */
export function canonicalVideoUrl(video) {
  if (!video) return "";
  if (video.provider === "youtube") return `https://www.youtube.com/watch?v=${video.id}`;
  return `https://vimeo.com/${video.id}${video.hash ? `/${video.hash}` : ""}`;
}

/** The iframe address. mode: "popup" (sound, controls) or "background" (silent loop, no controls). */
export function embedUrl(video, mode) {
  if (!video) return "";
  const bg = mode === "background";
  if (video.provider === "youtube") {
    const q = bg
      ? `autoplay=1&mute=1&controls=0&loop=1&playlist=${video.id}&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3&fs=0`
      : "autoplay=1&rel=0&playsinline=1&modestbranding=1";
    return `https://www.youtube-nocookie.com/embed/${video.id}?${q}`;
  }
  const q = bg ? "background=1&autoplay=1&muted=1&loop=1&dnt=1" : "autoplay=1&dnt=1";
  return `https://player.vimeo.com/video/${video.id}?${q}${video.hash ? `&h=${video.hash}` : ""}`;
}

/** Slides: [{ type: "image"|"video"|"embed", src, poster, alt, link, play? }], at most MAX_SLIDES, bad entries dropped. */
export function cleanSlides(raw) {
  const out = [];
  for (const item of parseJsonArray(raw)) {
    if (out.length >= MAX_SLIDES) break;
    if (!item || typeof item !== "object") continue;
    if (item.type === "embed") {
      const video = parseVideoUrl(item.src);
      if (!video) continue;
      const play = item.play === "background" ? "background" : "popup";
      out.push({
        type: "embed",
        src: canonicalVideoUrl(video),
        poster: cleanImage(item.poster, 500),
        alt: cleanText(item.alt, 140),
        // a pop-up slide opens the video, so it has no separate link
        link: play === "background" ? cleanImage(item.link, 300) : "",
        play
      });
      continue;
    }
    const type = item.type === "video" ? "video" : "image";
    const src = type === "video" ? cleanVideoSrc(item.src) : cleanImage(item.src, 500);
    if (!src) continue;
    out.push({
      type,
      src,
      poster: type === "video" ? cleanImage(item.poster, 500) : "",
      alt: cleanText(item.alt, 140),
      link: cleanImage(item.link, 300)
    });
  }
  return out;
}

/** Cards (images placed inside the hero): [{ src, alt, link, caption }], at most MAX_CARDS. */
export function cleanCards(raw) {
  const out = [];
  for (const item of parseJsonArray(raw)) {
    if (out.length >= MAX_CARDS) break;
    if (!item || typeof item !== "object") continue;
    const src = cleanImage(item.src, 500);
    if (!src) continue;
    out.push({ src, alt: cleanText(item.alt, 140), link: cleanImage(item.link, 300), caption: cleanText(item.caption, 60) });
  }
  return out;
}

export function cleanColor(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d\s.,%/-]+\)$/i.test(v)) return v;
  return "";
}

function toBool(value, def) {
  if (value === true || value === "true" || value === "1" || value === "on") return true;
  if (value === false || value === "false" || value === "0" || value === "off") return false;
  return def;
}

export function normalizeOne(field, raw) {
  const present = raw !== undefined && raw !== null;
  // A setting that was never saved uses its default; one saved as empty stays empty
  // (except where a blank means "use the default", marked fallbackWhenEmpty).
  if (!present && (field.type === TEXT || field.type === LINES || field.type === URL_T)) return field.def;
  switch (field.type) {
    case BOOL:
      return toBool(raw, field.def);
    case ENUM: {
      const v = String(raw ?? "").trim();
      return field.values.includes(v) ? v : field.def;
    }
    case INT: {
      const n = Math.round(Number(raw));
      if (!present || raw === "" || !Number.isFinite(n)) return field.def;
      return Math.min(field.max, Math.max(field.min, n));
    }
    case COLOR:
      return cleanColor(raw);
    case VIDEOLINK:
      return canonicalVideoUrl(parseVideoUrl(raw)) || "";
    case SLIDES:
      return JSON.stringify(cleanSlides(raw));
    case CARDS:
      return JSON.stringify(cleanCards(raw));
    case URL_T: {
      const v = field.absoluteOnly ? cleanImage(raw, field.max) : cleanLink(raw, field.max);
      return v || (field.fallbackWhenEmpty ? field.def : "");
    }
    case LINES:
      return cleanLines(raw, field.max, field.maxLines);
    case TEXT:
    default: {
      const v = cleanText(raw, field.max);
      return v || (field.fallbackWhenEmpty ? field.def : "");
    }
  }
}

// ------------------------------------------------------------
// Reading settings (public site)
// ------------------------------------------------------------

/** @param {Record<string,string>} values rows of the settings table */
export function parseHeaderHero(values = {}) {
  const out = {};
  for (const field of FIELDS) {
    const value = normalizeOne(field, values ? values[field.key] : undefined);
    // slides and cards are stored as JSON text; the rest of the code works with arrays
    out[field.prop] = field.type === SLIDES || field.type === CARDS ? JSON.parse(value) : value;
  }
  return out;
}

export function defaultHeaderHero() {
  return parseHeaderHero({});
}

// ------------------------------------------------------------
// Cleaning values on save
// ------------------------------------------------------------

/**
 * Returns a copy of `body` in which every header/hero key holds a valid,
 * string value. Keys that are not part of this feature pass through
 * untouched. Invalid values are replaced by the default instead of
 * being rejected, so a stray value can never break the public site.
 */
export function sanitizeHeaderHeroInput(body = {}) {
  const out = { ...body };
  for (const key of Object.keys(body)) {
    const field = BY_KEY.get(key);
    if (!field) continue;
    const value = normalizeOne(field, body[key]);
    out[key] = typeof value === "boolean" ? String(value) : String(value);
  }
  return out;
}
