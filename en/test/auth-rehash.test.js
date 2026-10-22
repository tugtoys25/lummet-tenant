import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, applyMigrations } from "./support/d1-shim.js";
import { login, verifyPassword } from "../worker/auth.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const req = (body) => ({ url: "https://example.com/en/api/v1/auth/login", json: async () => body, headers: { get: () => null } });

test("signing in with an old unsalted SHA-256 hash upgrades it to salted PBKDF2", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const db = createTestDb(); applyMigrations(db);
  const env = { DB: db };
  await db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'viewer')")
    .bind("old@example.com", await sha256Hex("OldPassw0rd!")).run();

  const res = await login(req({ email: "old@example.com", password: "OldPassw0rd!", "cf-turnstile-response": "t" }), env);
  assert.equal((await res.json()).success, true);
  const row = await db.prepare("SELECT password_hash FROM users WHERE email = ?").bind("old@example.com").first();
  assert.ok(row.password_hash.includes(":"), "now salted PBKDF2");
  assert.equal(await verifyPassword("OldPassw0rd!", row.password_hash), true);

  // a wrong password changes nothing
  await db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").bind(await sha256Hex("Other1!"), "old@example.com").run();
  const bad = await login(req({ email: "old@example.com", password: "nope", "cf-turnstile-response": "t" }), env);
  assert.equal(bad.status, 401);
  const same = await db.prepare("SELECT password_hash FROM users WHERE email = ?").bind("old@example.com").first();
  assert.equal(same.password_hash.includes(":"), false);
});

test("ops/invalidate_sessions.sql removes every session and pending reset link", async () => {
  const { readFileSync } = await import("node:fs");
  const db = createTestDb(); applyMigrations(db);
  await db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('a@example.com','x:y','admin')").run();
  await db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', 1, '2099-01-01')").run();
  const sql = readFileSync(new URL("../ops/invalidate_sessions.sql", import.meta.url), "utf8");
  for (const stmt of sql.split(";").map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) await db.prepare(stmt).run();
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM sessions").first()).c, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM password_resets").first()).c, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM users").first()).c, 1, "users are kept");
});
