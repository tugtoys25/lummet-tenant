// Cache headers for /static/* and ?v=<hash> versioning of CSS/JS URLs.
import { ASSET_VERSION } from "./asset-version.js";

const YEAR = "public, max-age=31536000, immutable";

export function staticCacheControl(pathname, hasVersion) {
  if (pathname === "/static/sw.js") return "no-cache";
  if (/\.(css|js)$/.test(pathname)) {
    return hasVersion ? YEAR : "public, max-age=300, stale-while-revalidate=86400";
  }
  return "public, max-age=86400, stale-while-revalidate=604800";
}

export function versionAssetUrls(html, version = ASSET_VERSION) {
  if (!html || !version) return html;
  // ES module parts are imported by path, so the import map carries their ?v= (maps "/static/js/x.js" to "/static/js/x.js?v=<hash>").
  html = html.replace(/(<script type="importmap">)([\s\S]*?)(<\/script>)/g, (_, open, map, close) =>
    open + map.replace(/:\s*"(\/static\/js\/[^"?#]+\.js)"/g, (__, path) => `: "${path}?v=${version}"`) + close);
  return html.replace(
    /\b(href|src)="(\/static\/(?:css|js)\/[^"?#]+\.(?:css|js))"/g,
    (_, attr, path) => `${attr}="${path}?v=${version}"`
  );
}

// Read-only JSON the public pages fetch on every load (sidebar lists, geo
// status). The browser keeps them for 2 minutes, so moving between pages
// repeats none of these requests. `private`: some depend on the visitor's country.
const PUBLIC_JSON = /^\/(?:en\/)?api\/v1\/(?:public\/(?:casinos\/(?:geo|list)|news\/list|categories\/list|countries\/list|casino-reviews)|geo\/check)$/;
export const PUBLIC_JSON_CACHE = "private, max-age=120, stale-while-revalidate=600";

export async function finalizeResponse(request, response) {
  let url;
  try { url = new URL(request.url); } catch { return response; }
  if (request.method !== "GET" && request.method !== "HEAD") return response;

  if (url.pathname.startsWith("/static/")) {
    if (response.status !== 200) return response;
    const headers = new Headers(response.headers);
    headers.set("cache-control", staticCacheControl(url.pathname, url.searchParams.has("v")));
    return new Response(response.body, { status: response.status, headers });
  }

  const type = response.headers.get("content-type") || "";
  if (response.status === 200 && type.includes("application/json") && PUBLIC_JSON.test(url.pathname) && !response.headers.get("cache-control")) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", PUBLIC_JSON_CACHE);
    return new Response(response.body, { status: 200, headers });
  }
  if (response.status === 200 && type.includes("text/html")) {
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(versionAssetUrls(html), { status: 200, headers });
  }
  return response;
}
