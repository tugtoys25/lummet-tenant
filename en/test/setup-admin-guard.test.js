// A new site must not let the first stranger become its administrator.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAPI } from '../worker/api.js';

let db;
beforeEach(() => { db = createTestDb(); applyMigrations(db); });

const req = (token, body = { email: 'owner@example.com', password: 'Correct-Horse-Battery-9' }) => ({
  method: 'POST', url: 'https://site.example/api/v1/setup/admin',
  headers: new Headers(token === undefined ? {} : { 'X-Setup-Token': token }), json: async () => body
});
const call = (env, r) => handleAPI(r, env, '/api/v1/setup/admin');
const admins = async () => (await db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'admin'`).first()).c;
const TOKEN = 'setup-token-0123456789abcdef';

test('with no SETUP_TOKEN configured the endpoint does not exist, whoever calls it', async () => {
  const res = await call({ DB: db }, req('anything'));
  assert.equal(res.status, 404);
  assert.equal((await call({ DB: db }, req(undefined))).status, 404);
  assert.equal(await admins(), 0);
});

test('a missing or wrong token is refused exactly like an unknown path', async () => {
  const env = { DB: db, SETUP_TOKEN: TOKEN };
  for (const t of [undefined, '', 'wrong', TOKEN.slice(0, -1), TOKEN + 'x']) assert.equal((await call(env, req(t))).status, 404, String(t));
  assert.equal(await admins(), 0);
});

test('a too-short configured token is treated as not configured', async () => {
  assert.equal((await call({ DB: db, SETUP_TOKEN: 'short' }, req('short'))).status, 404);
  assert.equal(await admins(), 0);
});

test('the right token creates the first administrator once; a second call is refused', async () => {
  const env = { DB: db, SETUP_TOKEN: TOKEN };
  const ok = await call(env, req(TOKEN));
  assert.equal(ok.status, 200);
  assert.equal(await admins(), 1);
  const again = await call(env, req(TOKEN, { email: 'second@example.com', password: 'Correct-Horse-Battery-9' }));
  assert.equal(again.status, 403);
  assert.equal(await admins(), 1);
  const row = await db.prepare(`SELECT email, password_hash FROM users WHERE role = 'admin'`).first();
  assert.equal(row.email, 'owner@example.com');
  assert.notEqual(row.password_hash, 'Correct-Horse-Battery-9');
});
