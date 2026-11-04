// ============================================================
// SITE PROFILE (Phase 6): draft preview
// ============================================================
// An editor or admin who switches preview on gets a cookie. While it is set, public pages are rendered with the
// draft applied (what the site will look like after publishing), with a banner on top, and are never read from or
// written to the shared page cache. Everyone else, including the same person without the cookie, sees the live site.
// The dashboard and the API are never previewed: they keep using the live configuration.
import { getCurrentUser } from "../auth.js";
import { previewOverlay, permissionsFor } from "./versions.js";

export const PREVIEW_COOKIE = "cfg_preview";
const ON = new RegExp(`(?:^|;\\s*)${PREVIEW_COOKIE}=1(?:;|$)`);
const SKIP = /^\/(?:en\/)?(?:dashboard|api|login|logout|register|super|static)(?:\/|$)/i;
export const PREVIEW_MAX_AGE = 3600;

export const hasPreviewCookie = (request) => ON.test(request.headers.get("cookie") || "");

export function previewCookie(on) {
  return `${PREVIEW_COOKIE}=${on ? "1" : ""}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${on ? PREVIEW_MAX_AGE : 0}`;
}

// -> { profile, settings } to overlay for this request, or null (not previewing, not allowed, or no draft).
export async function resolvePreview(request, env, url) {
  try {
    if (request.method !== "GET" || !hasPreviewCookie(request) || SKIP.test(url.pathname)) return null;
    const user = await getCurrentUser(request, env);
    if (!user || !permissionsFor(user).preview) return null;
    return await previewOverlay(env);
  } catch { return null; }
}

const BANNER = '<div id="cfg-preview-banner" role="status" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:.6rem 1rem;display:flex;gap:1rem;align-items:center;justify-content:center;flex-wrap:wrap">'
  + '<strong>Draft preview.</strong> <span>Visitors do not see this. Only you do, while preview is on.</span>'
  + '<a href="/en/dashboard/configuration" style="color:#93c5fd">Back to configuration</a>'
  + '<a href="/en/dashboard/configuration?preview=off" style="color:#fca5a5">Exit preview</a></div>';

// Private, uncached, with the banner added to HTML pages.
export async function decoratePreview(res) {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.delete("content-length");
  const type = headers.get("content-type") || "";
  if (!/text\/html/i.test(type)) return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  const html = await res.text();
  const out = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, BANNER + "</body>") : html + BANNER;
  return new Response(out, { status: res.status, statusText: res.statusText, headers });
}
