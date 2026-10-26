import test from "node:test";
import assert from "node:assert/strict";
import { createTestDb, applyMigrations } from "./support/d1-shim.js";
import { handleSetStorageLimit, handleStorageUsage } from "../worker/super/handlers/storage-limit.js";
import { sign } from "../worker/super/handlers/site-access.js";
import { reserveStorage } from "../worker/storage-quota.js";

const SECRET = "test-secret";
const mkEnv = (mode = "enforce") => { const db = createTestDb(); applyMigrations(db); return { DB: db, SUPER_API_SECRET: SECRET, STORAGE_METERING_MODE: mode }; };
async function push(env, over = {}, { secret = SECRET } = {}) {
  const payload = { purpose: "storage_limit", maxBytes: 1000, generation: 1, siteId: "s1", issuedAt: Date.now(), ...over };
  const body = JSON.stringify({ payload, signature: await sign(secret, payload) });
  const res = await handleSetStorageLimit(new Request("https://t/en/api/super/storage-limit", { method: "PUT", body }), env, null, body);
  return { status: res.status, json: await res.json() };
}
const row = (env) => env.DB.prepare("SELECT l.max_bytes AS max_bytes, g.generation AS generation FROM platform_storage_limits l LEFT JOIN platform_storage_limit_sync g ON g.id=1 WHERE l.id=1").first();

test("a signed push sets the cap and makes enforce mode actually enforce it", async () => {
  const env = mkEnv();
  assert.equal((await reserveStorage(env, 1)).reason, "storage_limit_not_configured");
  const r = await push(env, { maxBytes: 100, generation: 1 });
  assert.equal(r.json.data?.accepted ?? r.json.accepted, true);
  assert.equal((await row(env)).max_bytes, 100);
  assert.equal((await reserveStorage(env, 80)).allowed, true);
  assert.equal((await reserveStorage(env, 30)).allowed, false);
});

test("older and equal generations change nothing; newer ones apply; replays are reported, not errors", async () => {
  const env = mkEnv();
  await push(env, { maxBytes: 500, generation: 5 });
  const stale = await push(env, { maxBytes: 1, generation: 4 });
  assert.equal(stale.status, 200); assert.equal((stale.json.data ?? stale.json).reason, "stale_generation");
  const same = await push(env, { maxBytes: 1, generation: 5 });
  assert.equal((same.json.data ?? same.json).reason, "already_applied");
  assert.deepEqual({ ...(await row(env)) }, { max_bytes: 500, generation: 5 });
  await push(env, { maxBytes: 900, generation: 6 });
  assert.equal((await row(env)).max_bytes, 900);
});

test("a null cap (unlimited/unconfigured) is accepted and a bad signature or purpose is refused", async () => {
  const env = mkEnv();
  await push(env, { maxBytes: 50, generation: 1 });
  await push(env, { maxBytes: null, generation: 2 });
  assert.equal((await row(env)).max_bytes, null);
  assert.equal((await push(env, { generation: 3 }, { secret: "wrong" })).status, 401);
  assert.equal((await push(env, { generation: 3, purpose: "site_access" })).status, 422);
  assert.equal((await push(env, { generation: 3, maxBytes: -1 })).status, 422);
  assert.equal((await push(env, { generation: 3, maxBytes: 1.5 })).status, 422);
  assert.equal((await push(env, { generation: 0 })).status, 422);
  assert.equal((await push(env, { generation: 3, issuedAt: Date.now() - 2 * 86400000 })).status, 422);
  assert.equal((await row(env)).generation, 2);
});

test("a signed site-access payload cannot be replayed as a storage limit", async () => {
  const env = mkEnv();
  const payload = { state: "serving", generation: 9, siteId: "s1", issuedAt: Date.now() };
  const body = JSON.stringify({ payload, signature: await sign(SECRET, payload) });
  const res = await handleSetStorageLimit(new Request("https://t/x", { method: "PUT", body }), env, null, body);
  assert.equal(res.status, 422); assert.equal(await row(env), null);
});

test("usage report returns used, reserved, cap and generation", async () => {
  const env = mkEnv();
  await push(env, { maxBytes: 1000, generation: 3 });
  await env.DB.prepare("INSERT INTO media_library (filename, url, size) VALUES ('a','u',200)").run();
  await reserveStorage(env, 300);
  const j = await (await handleStorageUsage(new Request("https://t/x"), env)).json(); const d = j.data ?? j;
  assert.equal(d.usedBytes, 200); assert.equal(d.reservedBytes, 300); assert.equal(d.limitBytes, 1000); assert.equal(d.limitGeneration, 3); assert.equal(d.mode, "enforce");
});
