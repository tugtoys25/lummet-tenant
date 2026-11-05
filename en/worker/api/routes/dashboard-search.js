// Global dashboard search (Phase 8). Dispatched from worker/api/routes/index.js. Staff only (administrators and editors).
//   GET    /api/v1/dashboard/search/index        screens, settings and capabilities this person may find (ETag, revalidated)
//   GET    /api/v1/dashboard/search/content?q=   content found by title (modules that are off and resources the role cannot read are left out)
//   GET    /api/v1/dashboard/search/favourites   this person's pinned links
//   PUT    /api/v1/dashboard/search/favourites   pin   { href, label, kind }
//   DELETE /api/v1/dashboard/search/favourites?href=   unpin
// Read-only apart from pins. See worker/site-profile/dashboard-search.js for what is searched and what is hidden.
import { NOT_HANDLED, failure, json } from "../helpers.js";
import { Renderer } from "../../render.js";
import { loadProfile } from "../../site-profile/store.js";
import * as permDB from "../../database/permissions.js";
import { buildSearchIndex, searchContent, MAX_QUERY_CHARS } from "../../site-profile/dashboard-search.js";
import { listFavourites, addFavourite, removeFavourite } from "../../site-profile/dashboard-favourites.js";

const PREFIX = "/api/v1/dashboard/search";
const MUTATES = new Set(["PUT", "POST", "PATCH", "DELETE"]);

function crossSite(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).host !== new URL(request.url).host; } catch { return true; }
}
async function etagOf(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `"${[...new Uint8Array(buf)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

export async function route({ request, env, path, user }) {
  if (path !== PREFIX && !path.startsWith(PREFIX + "/")) return NOT_HANDLED;
  if (!user) return failure("Unauthorized", 401);
  if (user.role !== "admin" && user.role !== "editor") return failure("Your role cannot use the dashboard search.", 403);
  const m = request.method, sub = path.slice(PREFIX.length) || "/";
  if (MUTATES.has(m) && crossSite(request)) return failure("Cross-site request refused.", 403);
  const url = new URL(request.url);

  if (sub === "/index" && m === "GET") {
    const profile = await loadProfile(env, url.hostname);
    const perms = await permDB.getPermissionsForUser(env.DB, user);
    const navHtml = await new Renderer(env, request).loadTemplate("layout/admin-nav.html");
    const index = buildSearchIndex({ navHtml, profile, user, perms });
    const body = JSON.stringify({ success: true, role: user.role, ...index });
    const etag = await etagOf(body);
    const headers = { "Content-Type": "application/json", ETag: etag, "Cache-Control": "private, no-cache" };
    if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
    return new Response(body, { status: 200, headers });
  }

  if (sub === "/content" && m === "GET") {
    const q = (url.searchParams.get("q") || "").slice(0, MAX_QUERY_CHARS);
    const profile = await loadProfile(env, url.hostname);
    const perms = await permDB.getPermissionsForUser(env.DB, user);
    const out = await searchContent(env, { q, profile, user, perms });
    return json({ success: true, q, results: out.results, searched: out.searched });
  }

  if (sub === "/favourites") {
    if (m === "GET") { const r = await listFavourites(env, user); return r.error ? json({ success: false, error: r.error, code: "needs_migration", favourites: [] }, r.status) : json({ success: true, favourites: r.favourites }); }
    if (m === "PUT") {
      let b; try { b = await request.json(); } catch { return failure("Invalid JSON"); }
      const r = await addFavourite(env, user, b && typeof b === "object" ? b : {});
      return r.error ? json({ success: false, error: r.error, code: r.status === 503 ? "needs_migration" : undefined }, r.status) : json({ success: true, favourites: r.favourites });
    }
    if (m === "DELETE") {
      const r = await removeFavourite(env, user, url.searchParams.get("href"));
      return r.error ? json({ success: false, error: r.error }, r.status) : json({ success: true, favourites: r.favourites });
    }
    return failure("Method not allowed", 405);
  }
  return NOT_HANDLED;
}
