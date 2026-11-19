// Image tag for a news card (homepage cards and the Advanced Homepage).
//
// Why this exists: media_library.thumbnail_url is an absolute Cloudflare Image Resizing link
// (https://<host>/cdn-cgi/image/width=400,format=webp/media/...) built from whichever host the upload
// request used. When that host is not the public site, or Image Resizing is off or over quota for the
// zone, the link fails and the card shows a broken image. The original (/media/...) is served by this
// Worker, so it works on any host.
//
// So: use same-site relative URLs, try the small thumbnail first, and fall back to the original.
import { escapeText } from "./site-text/resolve.js";

const MEDIA_ORIGINAL = /^https?:\/\/[^/]+(\/media\/[^\s?#]+(?:\?[^\s#]*)?)$/i;
const MEDIA_THUMB = /^https?:\/\/[^/]+(\/cdn-cgi\/image\/[^/\s]+\/media\/[^\s?#]+)$/i;

function sameSite(url, pattern) {
  const s = String(url ?? "").trim();
  if (!s) return "";
  const m = pattern.exec(s);
  return m ? m[1] : s;
}

/** { src, fallback } for a news row: src is tried first, fallback (may be "") if src fails. */
export function newsImageSources(n) {
  const original = sameSite(n?.featured_image_url, MEDIA_ORIGINAL);
  const thumb = sameSite(n?.featured_image_thumbnail, MEDIA_THUMB);
  if (thumb && original && thumb !== original) return { src: thumb, fallback: original };
  return { src: original || thumb, fallback: "" };
}

/** The <img> HTML, or "" when the article has no image. Every value is escaped. */
export function newsImageTag(n, alt) {
  const { src, fallback } = newsImageSources(n);
  if (!src) return "";
  // Second failure (or no fallback) hides the image instead of showing a broken icon.
  const onerror = "var f=this.dataset.fallback;if(f&&this.src.indexOf(f)<0){this.src=f}else{this.style.display='none'}";
  return `<img src="${escapeText(src)}"${fallback ? ` data-fallback="${escapeText(fallback)}"` : ""} alt="${escapeText(alt)}" loading="lazy" decoding="async" onerror="${onerror}">`;
}
