// Guards the layout of the API (worker/api.js + worker/api/): one place per route,
// every route group registered, and the behaviour the split must keep.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAPI } from '../worker/api.js';
import { apiModuleFiles } from './support/api-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

describe('api layout', () => {
  test('every route group file is registered, and every registered group exists', () => {
    const onDisk = readdirSync(join(ROOT, 'worker/api/routes')).filter((f) => f.endsWith('.js') && f !== 'index.js').sort();
    const registered = [...read('worker/api/routes/index.js').matchAll(/from "\.\/([a-z0-9-]+)\.js"/g)].map((m) => `${m[1]}.js`).sort();
    assert.deepEqual(registered, onDisk);
  });

  test('every route group exports route() and nothing else does the dispatching', () => {
    for (const f of readdirSync(join(ROOT, 'worker/api/routes')).filter((x) => x.endsWith('.js') && x !== 'index.js')) {
      assert.match(read(`worker/api/routes/${f}`), /^export async function route\(\{/m, f);
    }
  });

  test('a route (path + method) is defined once, so the order of groups never matters', () => {
    const seen = new Map();
    for (const file of apiModuleFiles()) {
      const code = read(file);
      for (const m of code.matchAll(/if\s*\(\s*path === "(\/api\/v1\/[^"]+)"\s*(?:&&\s*request\.method === "(\w+)")?/g)) {
        const key = `${m[2] || 'ANY'} ${m[1]}`;
        if (seen.has(key)) assert.fail(`${key} is in ${seen.get(key)} and ${file}`);
        seen.set(key, file);
      }
    }
    assert.ok(seen.size > 250, `found ${seen.size} routes`);
    // an ANY route must not share its path with a method-specific one
    const anyPaths = new Set([...seen.keys()].filter((k) => k.startsWith('ANY ')).map((k) => k.slice(4)));
    for (const k of seen.keys()) if (!k.startsWith('ANY ')) assert.ok(!anyPaths.has(k.split(' ')[1]), k);
  });

  test('the entry file stays small and only wires the steps together', () => {
    const lines = read('worker/api.js').split('\n').length;
    assert.ok(lines < 80, `worker/api.js has ${lines} lines`);
    assert.ok(!/env\.DB/.test(read('worker/api.js')), 'no database code in the entry file');
  });

  test('no route group grows past 600 lines (split it by area instead)', () => {
    for (const f of readdirSync(join(ROOT, 'worker/api/routes'))) {
      const n = read(`worker/api/routes/${f}`).split('\n').length;
      assert.ok(n <= 600, `${f} has ${n} lines`);
    }
  });
});

describe('api behaviour kept by the split', () => {
  let db;
  const admin = { user_id: 1, id: 1, role: 'admin', email: 'a@example.com' };
  const call = (method, path, user, body = {}) =>
    handleAPI({ method, url: `https://x.com${path}`, headers: new Headers(), cf: { country: 'US' }, json: async () => body }, { DB: db }, path, user);
  before(async () => { db = createTestDb(); applyMigrations(db); });

  test('signed-out requests are refused, except the public ones', async () => {
    assert.equal((await call('GET', '/api/v1/casinos/list', null)).status, 401);
    assert.equal((await call('GET', '/api/v1/public/search', null)).status, 200);
  });

  test('an unknown path is a 404 JSON error', async () => {
    const res = await call('GET', '/api/v1/does-not-exist', admin);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { success: false, error: 'Endpoint not found' });
  });

  test('a role without permission gets 403', async () => {
    const res = await call('POST', '/api/v1/casino/create', { user_id: 3, id: 3, role: 'user' }, { slug: 'x' });
    assert.equal(res.status, 403);
  });

  test('a validation error in a create route is a JSON error with the message', async () => {
    const res = await call('POST', '/api/v1/casino/create', admin, {});
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { success: false, error: 'slug is required' });
  });
});
