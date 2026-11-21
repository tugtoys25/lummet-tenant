// Media addresses that cannot point at the wrong host.
//
// media_library stores ABSOLUTE links built from whichever host the upload request used
// (https://<host>/media/folder/123-abc.webp), and a thumbnail link through Cloudflare Image Resizing
// (https://<host>/cdn-cgi/image/width=400,format=webp/media/...). When the host is not the public site
// (staging, workers.dev, an old domain, www vs bare) or Image Resizing is off for the zone, the link
// fails and the image is broken, although the file itself is served by this Worker at /media/<key> on
// every host. These helpers turn such links into the same-site path.
import { escapeText } from "./site-text/resolve.js";

// The shape generateR2Key() produces: media/<folder>/<timestamp>-<hex>.<ext>
const OWN_MEDIA = /^(?:https?:)?(?:\/\/[^/\s]+)?(?:\/cdn-cgi\/image\/[^/\s]+)?(\/media\/[a-z0-9_-]+\/\d{10,}-[0-9a-f]{8,}(?:\.[a-z0-9]+)?)(?:\?[^#\s]*)?$/i;

/** "/media/..." for an upload of this platform (whatever host or resizing prefix it carries); anything else unchanged. */
export function sameSiteMedia(url) {
  const s = String(url == null ? "" : url).trim();
  const m = OWN_MEDIA.exec(s);
  return m ? m[1] : s;
}

/** The picture to show for a row that has featured_image_url / featured_image_thumbnail: the original, same-site. */
export function featuredImageSrc(row) {
  return sameSiteMedia((row && (row.featured_image_url || row.featured_image_thumbnail)) || "");
}

// A picture that cannot load is hidden instead of showing a broken-image icon and its alt text.
export const HIDE_BROKEN = "this.style.display='none'";

/** <img> for a card; "" when there is no picture. Every value is escaped. */
export function cardImgTag(src, alt, attrs = "") {
  const s = sameSiteMedia(src);
  if (!s) return "";
  return `<img src="${escapeText(s)}" alt="${escapeText(alt)}" loading="lazy" decoding="async"${attrs ? " " + attrs : ""} onerror="${HIDE_BROKEN}">`;
}
