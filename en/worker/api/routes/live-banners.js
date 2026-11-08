// Live banners (floating / edge / bar / inline promotions). Admin API; permission "banners" (read for list/get, write for the rest).
import * as db from "../../database/live-banners.js";
import { validateBanner } from "../../live-banners/validate.js";
import { templateInfo } from "../../live-banners/templates.js";
import { resolveItems, clearLiveBannerCache } from "../../live-banners/load.js";
import { renderOne } from "../../live-banners/render.js";
import { MAX_LIVE } from "../../live-banners/limits.js";
import { NOT_HANDLED, failure, json, success } from "../helpers.js";

/** draft / live / paused / scheduled / expired, for the list screen. */
export function displayStatus(b, now = Date.now()) {
  if (b.status !== "live") return b.status;
  const t = (s) => (s ? Date.parse(String(s).replace(" ", "T") + "Z") : null);
  if (t(b.start_at) !== null && t(b.start_at) > now) return "scheduled";
  if (t(b.end_at) !== null && t(b.end_at) < now) return "expired";
  return "live";
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}
const idOf = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

async function save(env, body, user, id) {
  const v = validateBanner(body);
  if (!v.ok) return failure(v.errors.join("; "), 422);
  if (v.banner.status === "live" && (await db.countLive(env.DB)) >= MAX_LIVE && !(id && (await db.getBanner(env.DB, id))?.status === "live")) return failure(`At most ${MAX_LIVE} banners can be live at once`, 422);
  if (id) { if (!(await db.getBanner(env.DB, id))) return failure("Banner not found", 404); await db.updateBanner(env.DB, id, v.banner, v.items); }
  else id = await db.createBanner(env.DB, v.banner, v.items, user?.user_id ?? user?.id ?? null);
  await clearLiveBannerCache(env);
  return success({ id });
}

export async function route({ request, env, path, user }) {
  if (!path.startsWith("/api/v1/live-banner")) return NOT_HANDLED;
  const url = new URL(request.url);

  if (path === "/api/v1/live-banners/list" && request.method === "GET") {
    const rows = await db.listBanners(env.DB);
    return json({ banners: rows.map((b) => ({ id: b.id, name: b.name, status: b.status, display_status: displayStatus(b), template_key: b.template_key, placement_mode: b.placement_mode, anchor: b.anchor, priority: b.priority, views: b.views, clicks: b.clicks, ctr: b.views ? Math.round((b.clicks / b.views) * 1000) / 10 : 0 })) });
  }
  if (path === "/api/v1/live-banners/templates" && request.method === "GET") return json({ templates: templateInfo() });
  if (path === "/api/v1/live-banner/get" && request.method === "GET") {
    const id = idOf(url.searchParams.get("id"));
    const b = id && (await db.getBanner(env.DB, id));
    return b ? json({ success: true, banner: b }) : failure("Banner not found", 404);
  }

  if (request.method !== "POST") return NOT_HANDLED;
  const body = await readBody(request);
  if (!body || typeof body !== "object") return failure("Invalid JSON body");

  if (path === "/api/v1/live-banner/create") return save(env, body, user, null);
  if (path === "/api/v1/live-banner/update") { const id = idOf(body.id); return id ? save(env, body, user, id) : failure("id is required"); }

  if (path === "/api/v1/live-banner/preview") {
    const v = validateBanner({ ...body, status: "live" });
    if (!v.ok) return failure(v.errors.join("; "), 422);
    const cards = await resolveItems(env.DB, { ...v.banner, items: v.items }, null, { geo: false });
    return json({ success: true, html: renderOne({ ...v.banner, id: 0, cards }) });
  }

  if (["/api/v1/live-banner/publish", "/api/v1/live-banner/pause", "/api/v1/live-banner/delete", "/api/v1/live-banner/duplicate"].includes(path)) {
    const id = idOf(body.id);
    const b = id && (await db.getBanner(env.DB, id));
    if (!b) return failure("Banner not found", 404);
    if (path.endsWith("/publish")) {
      if (b.status !== "live" && (await db.countLive(env.DB)) >= MAX_LIVE) return failure(`At most ${MAX_LIVE} banners can be live at once`, 422);
      await db.setStatus(env.DB, id, "live");
    } else if (path.endsWith("/pause")) await db.setStatus(env.DB, id, "paused");
    else if (path.endsWith("/delete")) await db.deleteBanner(env.DB, id);
    else {
      const { id: _i, views: _v, clicks: _c, created_at: _a, updated_at: _u, created_by: _b, ...copy } = b;
      const v = validateBanner({ ...copy, name: `${b.name} (copy)`.slice(0, 80), status: "draft", items: b.items.map((i) => ({ source_type: i.source_type, source_key: i.source_key, overrides: i.overrides })) });
      if (!v.ok) return failure(v.errors.join("; "), 422);
      const newId = await db.createBanner(env.DB, v.banner, v.items, user?.user_id ?? user?.id ?? null);
      await clearLiveBannerCache(env);
      return success({ id: newId });
    }
    await clearLiveBannerCache(env);
    return success();
  }

  if (path === "/api/v1/live-banner/reorder") {
    const ids = Array.isArray(body.ids) ? body.ids.map(idOf).filter(Boolean).slice(0, 200) : [];
    if (!ids.length) return failure("ids is required");
    await db.reorder(env.DB, ids);
    await clearLiveBannerCache(env);
    return success();
  }
  return NOT_HANDLED;
}
