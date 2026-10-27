import test from "node:test";
import assert from "node:assert/strict";
import { createTestDb, applyMigrations } from "./support/d1-shim.js";
import { reserveStorage, releaseStorageReservation } from "../worker/storage-quota.js";

function makeEnv({ mode = "enforce" } = {}) {
  const db = createTestDb(); applyMigrations(db);
  return { DB: db, STORAGE_METERING_MODE: mode };
}
async function seed(mode, limit, used) {
  const env = makeEnv({ mode });
  if (limit !== null) await env.DB.prepare("INSERT INTO platform_storage_limits (id, max_bytes) VALUES (1, ?)").bind(limit).run();
  if (used) await env.DB.prepare("INSERT INTO media_library (filename, url, size) VALUES ('a','u',?)").bind(used).run();
  return env;
}
const held = async (env) => (await env.DB.prepare("SELECT COALESCE(SUM(bytes),0) AS b FROM platform_storage_reservations").first()).b;

test("concurrent uploads that each fit alone cannot jointly exceed the cap", async () => {
  const env = await seed("enforce", 100, 20);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => reserveStorage(env, 30)));
  assert.equal(results.filter((r) => r.allowed).length, 2, "20 used + 2x30 = 80 fits; a third would reach 110");
  assert.equal(await held(env), 60);
  assert.equal(results.filter((r) => !r.allowed).every((r) => r.wouldExceed === true && r.reservationId === null), true);
});

test("releasing a reservation frees the bytes; expired reservations stop counting", async () => {
  const env = await seed("enforce", 100, 0);
  const a = await reserveStorage(env, 80);
  assert.equal(a.allowed, true);
  assert.equal((await reserveStorage(env, 30)).allowed, false);
  await releaseStorageReservation(env, a.reservationId);
  assert.equal((await reserveStorage(env, 30)).allowed, true);
  const later = new Date(Date.now() + 11 * 60 * 1000);
  const env2 = await seed("enforce", 100, 0);
  await reserveStorage(env2, 90);
  assert.equal((await reserveStorage(env2, 90, { now: later })).allowed, true, "a crashed upload's hold expires after 10 minutes");
});

test("enforce refuses when no cap is configured or the size is invalid, and never claims bytes", async () => {
  const env = await seed("enforce", null, 0);
  const r = await reserveStorage(env, 1);
  assert.equal(r.allowed, false); assert.equal(r.reason, "storage_limit_not_configured"); assert.equal(await held(env), 0);
  assert.equal((await reserveStorage(env, -5)).reason, "invalid_size");
});

test("enforce fails closed when the reservation table is missing", async () => {
  const env = await seed("enforce", 100, 0);
  await env.DB.prepare("DROP TABLE platform_storage_reservations").run();
  const r = await reserveStorage(env, 1);
  assert.equal(r.allowed, false); assert.equal(r.reason, "storage_metering_unavailable");
});

test("off and shadow never block and never hold a reservation", async () => {
  const off = await seed("off", 10, 10);
  assert.equal((await reserveStorage(off, 50)).allowed, true);
  const shadow = await seed("shadow", 10, 10);
  const r = await reserveStorage(shadow, 50);
  assert.equal(r.allowed, true); assert.equal(r.wouldExceed, true); assert.equal(await held(shadow), 0);
});

test("both upload paths reserve before writing to R2 and release in a finally block", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const f of ["../worker/media-upload/upload.js", "../worker/super/handlers/media.js"]) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    assert.ok(src.indexOf("reserveStorage(") < src.indexOf("MEDIA_BUCKET.put"), f);
    assert.match(src, /finally \{\s*await releaseStorageReservation/, f);
  }
});
