// The picture on a news card, chosen the way the author page does it.
//
// The author page reads COALESCE(media.url, media.thumbnail_url): the ORIGINAL first, the thumbnail only as a second try. The homepage
// cards used the thumbnail first, an Image Resizing link (https://<host>/cdn-cgi/image/...) that fails when resizing is off for the
// zone, so the card showed a broken image. Same rule here: original first, thumbnail as fallback, and if neither loads the picture
// area is removed (no broken-image icon, no empty box).
import { escapeText } from "./site-text/resolve.js";

/** { src, alt } : the original link first, the thumbnail as the fallback (alt is "" when there is no second link). */
export function newsImageLinks(row) {
  const url = String((row && row.featured_image_url) || "").trim();
  const thumb = String((row && row.featured_image_thumbnail) || "").trim();
  const src = url || thumb;
  return { src, alt: thumb && thumb !== src ? thumb : "" };
}

const ONERROR = "var a=this.getAttribute('data-alt');if(a&&this.src.indexOf(a)<0){this.removeAttribute('data-alt');this.src=a}else{var w=this.closest('.news-card__image');(w||this).remove()}";

/** <img> for a news card, or "" when the article has no picture. Every value is escaped. */
export function newsImageTag(row, altText) {
  const { src, alt } = newsImageLinks(row);
  if (!src) return "";
  return `<img src="${escapeText(src)}"${alt ? ` data-alt="${escapeText(alt)}"` : ""} alt="${escapeText(altText)}" loading="lazy" decoding="async" onerror="${ONERROR}">`;
}
