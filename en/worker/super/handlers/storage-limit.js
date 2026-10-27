// Phase 5.4: control plane -> tenant storage cap sync, and the tenant's usage report back to the control plane.
// The cap arrives as a signed payload (same HMAC secret as the site-access push) carrying a monotone generation.
// The control plane pulls usage with a GET over the same authenticated Super API channel, so no inbound callback
// credential exists on the control plane.
import { fail, ok, readJsonBody } from "./helpers.js";
import { sign, equal } from "./site-access.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = Number.MAX_SAFE_INTEGER;

export async function handleSetStorageLimit(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const p = body?.payload;
  if (!p || p.purpose !== "storage_limit") return fail("invalid_storage_limit", 422);
  const bytesOk = p.maxBytes === null || (Number.isSafeInteger(p.maxBytes) && p.maxBytes >= 0 && p.maxBytes <= MAX_BYTES);
  if (!bytesOk || !Number.isSafeInteger(p.generation) || p.generation < 1 || !Number.isFinite(p.issuedAt)) return fail("invalid_storage_limit", 422);
  if (Date.now() - p.issuedAt > DAY_MS || p.issuedAt > Date.now() + 5 * 60 * 1000) return fail("stale_storage_limit", 422);
  if (!env.SUPER_API_SECRET || !equal(await sign(env.SUPER_API_SECRET, p), body.signature)) return fail("invalid_storage_limit_signature", 401);
  // One D1 batch (a single transaction). Both statements are gated on the stored generation being strictly older, so a replayed or
  // out-of-order push changes nothing. The same-generation retry of an accepted push is reported as already applied, not as an error.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO platform_storage_limits (id, max_bytes, updated_at)
       SELECT 1, ?, CURRENT_TIMESTAMP WHERE ? > COALESCE((SELECT generation FROM platform_storage_limit_sync WHERE id=1), 0)
       ON CONFLICT(id) DO UPDATE SET max_bytes=excluded.max_bytes, updated_at=CURRENT_TIMESTAMP`
    ).bind(p.maxBytes, p.generation),
    env.DB.prepare(
      `INSERT INTO platform_storage_limit_sync (id, generation, synced_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET generation=excluded.generation, synced_at=excluded.synced_at
       WHERE platform_storage_limit_sync.generation < excluded.generation`
    ).bind(p.generation, new Date().toISOString())
  ]);
  if (results?.[1]?.meta?.changes > 0) return ok({ accepted: true, generation: p.generation });
  const current = await env.DB.prepare("SELECT generation FROM platform_storage_limit_sync WHERE id=1").first();
  return ok({ accepted: false, reason: Number(current?.generation) === p.generation ? "already_applied" : "stale_generation", generation: Number(current?.generation || 0) });
}

export async function handleStorageUsage(request, env) {
  try {
    const limit = await env.DB.prepare("SELECT l.max_bytes AS max_bytes, COALESCE(g.generation, 0) AS generation FROM platform_storage_limits l LEFT JOIN platform_storage_limit_sync g ON g.id = 1 WHERE l.id=1").first();
    const used = await env.DB.prepare("SELECT COALESCE(SUM(size),0) AS bytes FROM media_library WHERE size IS NOT NULL").first();
    let reserved = 0;
    try { reserved = Number((await env.DB.prepare("SELECT COALESCE(SUM(bytes),0) AS bytes FROM platform_storage_reservations WHERE expires_at > ?").bind(new Date().toISOString()).first())?.bytes || 0); } catch { /* table absent on an unmigrated tenant */ }
    return ok({
      day: new Date().toISOString().slice(0, 10),
      usedBytes: Number(used?.bytes || 0),
      reservedBytes: reserved,
      limitBytes: limit?.max_bytes == null ? null : Number(limit.max_bytes),
      limitGeneration: Number(limit?.generation || 0),
      mode: String(env.STORAGE_METERING_MODE || "off").toLowerCase()
    });
  } catch {
    return fail("storage_metering_unavailable", 503);
  }
}
