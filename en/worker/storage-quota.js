// Phase 5.4 storage cap. The limit must be set by the trusted platform sync; absent/NULL means unconfigured.
export async function checkStorageQuota(env, incomingBytes) {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) return { allowed: false, reason: "invalid_size" };
  const mode = String(env.STORAGE_METERING_MODE || "off").toLowerCase();
  if (!["off", "shadow", "enforce"].includes(mode)) return { allowed: false, reason: "invalid_storage_metering_mode" };
  if (mode === "off") return { allowed: true, configured: false, mode, usedBytes: null, limitBytes: null };
  try {
    const limit = await env.DB.prepare("SELECT max_bytes FROM platform_storage_limits WHERE id=1").first();
    if (!limit || limit.max_bytes == null) return { allowed: mode !== "enforce", configured: false, mode, reason: "storage_limit_not_configured", usedBytes: null, limitBytes: null };
    const usage = await env.DB.prepare("SELECT COALESCE(SUM(size),0) AS bytes FROM media_library WHERE size IS NOT NULL").first();
    const usedBytes = Number(usage?.bytes || 0);
    const limitBytes = Number(limit.max_bytes);
    const wouldExceed = usedBytes + incomingBytes > limitBytes;
    return { allowed: mode !== "enforce" || !wouldExceed, configured: true, mode, wouldExceed, usedBytes, limitBytes, remainingBytes: Math.max(0, limitBytes - usedBytes) };
  } catch (error) {
    // A missing migration is not silently represented as a quota pass: distinguish it for telemetry.
    return { allowed: mode !== "enforce", configured: false, mode, reason: "storage_metering_unavailable" };
  }
}
export async function recordStorageSnapshot(env, now = new Date()) {
  const day = now.toISOString().slice(0,10);
  const row = await env.DB.prepare("SELECT COALESCE(SUM(size),0) AS bytes FROM media_library WHERE size IS NOT NULL").first();
  const bytes = Number(row?.bytes || 0);
  await env.DB.prepare("INSERT INTO platform_storage_usage_snapshots(day,bytes_used) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET bytes_used=excluded.bytes_used,captured_at=CURRENT_TIMESTAMP").bind(day, bytes).run();
  return { day, bytes };
}

// Atomic reservation. One INSERT ... SELECT either claims the bytes or claims nothing, so two concurrent uploads that
// each fit alone cannot both pass. A reservation counts against the cap until released or it expires (crash safety).
const RESERVATION_TTL_MS = 10 * 60 * 1000;
export async function reserveStorage(env, incomingBytes, { now = new Date() } = {}) {
  const mode = String(env.STORAGE_METERING_MODE || "off").toLowerCase();
  if (mode !== "enforce") {
    // off and shadow never block and never hold a reservation; shadow still reports what enforce would have done.
    const q = await checkStorageQuota(env, incomingBytes);
    return { ...q, reservationId: null };
  }
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) return { allowed: false, reason: "invalid_size", reservationId: null };
  const id = crypto.randomUUID();
  const nowIso = now.toISOString();
  try {
    const res = await env.DB.prepare(
      `INSERT INTO platform_storage_reservations (id, bytes, expires_at)
       SELECT ?, ?, ? WHERE (SELECT max_bytes FROM platform_storage_limits WHERE id=1) IS NOT NULL
         AND (SELECT COALESCE(SUM(size),0) FROM media_library WHERE size IS NOT NULL)
           + (SELECT COALESCE(SUM(bytes),0) FROM platform_storage_reservations WHERE expires_at > ?) + ?
           <= (SELECT max_bytes FROM platform_storage_limits WHERE id=1)`
    ).bind(id, incomingBytes, new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(), nowIso, incomingBytes).run();
    if (res?.meta?.changes > 0) return { allowed: true, configured: true, mode, reservationId: id };
    const q = await checkStorageQuota(env, incomingBytes);
    // Not claimed: either no cap is configured (enforce refuses) or the upload plus current holds would exceed it.
    return { ...q, allowed: false, reservationId: null, wouldExceed: q.configured ? true : q.wouldExceed };
  } catch {
    return { allowed: false, configured: false, mode, reason: "storage_metering_unavailable", reservationId: null };
  }
}
export async function releaseStorageReservation(env, reservationId) {
  if (!reservationId) return;
  try {
    await env.DB.prepare("DELETE FROM platform_storage_reservations WHERE id=?").bind(reservationId).run();
    await env.DB.prepare("DELETE FROM platform_storage_reservations WHERE expires_at <= ?").bind(new Date().toISOString()).run();
  } catch { /* an unreleased reservation expires on its own */ }
}
