// Pinned links of the dashboard search (table dashboard_favourites, migration 0012). Per person; never shared.
import { safeDashboardHref } from "./dashboard-search.js";

export const MAX_FAVOURITES = 30;
export const NEEDS_FAVOURITES_MIGRATION = "Pinning needs database migration 0012_dashboard_favourites.sql. Run it, then reload this page.";
const KINDS = new Set(["screen", "setting", "capability", "content"]);
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const keyOf = (user) => String(user?.user_id ?? user?.id ?? user?.email ?? "").slice(0, 120);

const ready = new WeakSet();
export async function favouritesReady(env) {
  const db = env?.DB;
  if (!db) return false;
  if (ready.has(db)) return true;
  try { await db.prepare("SELECT 1 FROM dashboard_favourites LIMIT 1").first(); ready.add(db); return true; } catch { return false; }
}

export async function listFavourites(env, user) {
  if (!(await favouritesReady(env))) return { error: NEEDS_FAVOURITES_MIGRATION, status: 503, favourites: [] };
  const rows = (await env.DB.prepare("SELECT href, label, kind FROM dashboard_favourites WHERE user_key = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(keyOf(user), MAX_FAVOURITES).all()).results || [];
  return { favourites: rows };
}

export async function addFavourite(env, user, body = {}) {
  if (!(await favouritesReady(env))) return { error: NEEDS_FAVOURITES_MIGRATION, status: 503 };
  const href = safeDashboardHref(body.href);
  if (!href) return { error: "That link cannot be pinned.", status: 422 };
  const label = clip(body.label, 120);
  if (!label) return { error: "Give the pinned link a name.", status: 422 };
  const kind = KINDS.has(body.kind) ? body.kind : "screen";
  const key = keyOf(user);
  const have = await env.DB.prepare("SELECT 1 AS x FROM dashboard_favourites WHERE user_key = ? AND href = ?").bind(key, href).first();
  if (!have) {
    const n = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM dashboard_favourites WHERE user_key = ?").bind(key).first())?.n) || 0;
    if (n >= MAX_FAVOURITES) return { error: `You can pin up to ${MAX_FAVOURITES} links. Unpin one first.`, status: 409 };
    await env.DB.prepare("INSERT INTO dashboard_favourites(user_key, href, label, kind) VALUES(?, ?, ?, ?)").bind(key, href, label, kind).run();
  }
  return { added: true, ...(await listFavourites(env, user)) };
}

export async function removeFavourite(env, user, hrefRaw) {
  if (!(await favouritesReady(env))) return { error: NEEDS_FAVOURITES_MIGRATION, status: 503 };
  const href = safeDashboardHref(hrefRaw);
  if (!href) return { error: "That link cannot be unpinned.", status: 422 };
  await env.DB.prepare("DELETE FROM dashboard_favourites WHERE user_key = ? AND href = ?").bind(keyOf(user), href).run();
  return { removed: true, ...(await listFavourites(env, user)) };
}
