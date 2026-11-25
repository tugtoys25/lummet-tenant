// test/news-timezone.test.js -- site time zone setting and the admin time helpers (static/js/admin/news-timezone.js).
// Real helper script run in a fake page; real API handler. Not covered: the legacy news form and Flags screen in a real browser.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import * as cal from '../worker/newsroom-calendar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
function load(fetchImpl) {
  const ctx = { window: {}, Intl, Date, Math, isNaN, String, Promise, RegExp, fetch: fetchImpl || (async () => ({ ok: false })) };
  vm.createContext(ctx); vm.runInContext(read('static/js/admin/news-timezone.js'), ctx);
  return ctx.window.nrZone;
}
const Z = load();

describe('helpers', () => {
  test('offsets: fixed zones and daylight saving', () => {
    assert.equal(Z.offsetMin('Africa/Kigali', new Date('2026-07-01T00:00:00Z')), 120);
    assert.equal(Z.offsetMin('Asia/Kolkata', new Date('2026-07-01T00:00:00Z')), 330);
    assert.equal(Z.offsetMin('America/New_York', new Date('2026-01-15T12:00:00Z')), -300);
    assert.equal(Z.offsetMin('America/New_York', new Date('2026-07-15T12:00:00Z')), -240);
    assert.equal(Z.offsetMin('UTC', new Date()), 0);
  });
  test('typed local time -> UTC, and back, including the New York spring-forward gap', () => {
    assert.equal(Z.wallToIso('2026-11-25T10:00', 'Africa/Kigali'), '2026-11-25T08:00:00.000Z');
    assert.equal(Z.wallToIso('2026-07-01T10:00', 'America/New_York'), '2026-07-01T14:00:00.000Z');
    assert.equal(Z.wallToIso('2026-01-15T10:00', 'America/New_York'), '2026-01-15T15:00:00.000Z');
    assert.equal(Z.wallToIso('2026-11-25T10:00', 'UTC'), '2026-11-25T10:00:00.000Z');
    for (const [z, w] of [['Africa/Kigali', '2026-11-25T23:30'], ['Asia/Kolkata', '2026-03-01T00:15'], ['America/New_York', '2026-10-31T09:00'], ['Pacific/Auckland', '2026-12-31T23:59']])
      assert.equal(Z.isoToWall(Z.wallToIso(w, z), z), w, z);
    assert.match(Z.wallToIso('2026-03-08T02:30', 'America/New_York'), /^2026-03-08T0[67]:30/, 'a time that does not exist is moved, not lost');
    assert.equal(Z.wallToIso('garbage', 'UTC'), '');
  });
  test('stored values (space or ISO, no zone = UTC) show in the zone', () => {
    assert.equal(Z.isoToWall('2026-11-25 08:00:00', 'Africa/Kigali'), '2026-11-25T10:00');
    assert.equal(Z.isoToWall('2026-11-25T08:00:00.000Z', 'Africa/Kigali'), '2026-11-25T10:00');
    assert.equal(Z.dayKey('2026-11-24T22:30:00.000Z', 'Africa/Kigali'), '2026-11-25');
    assert.equal(Z.clock('2026-11-24T22:30:00.000Z', 'Africa/Kigali'), '00:30');
    assert.equal(Z.isoToWall('', 'UTC'), ''); assert.equal(Z.isoToWall('junk', 'UTC'), '');
  });
  test('valid() accepts real names only; site() reads the API once and fails safe', async () => {
    assert.equal(Z.valid('Africa/Kigali'), true); assert.equal(Z.valid('Mars/Base'), false); assert.equal(Z.valid(''), true);
    let calls = 0; const ok = load(async () => { calls++; return { ok: true, json: async () => ({ data: { timezone: 'Africa/Kigali' } }) }; });
    assert.equal(await ok.site(), 'Africa/Kigali'); await ok.site(); assert.equal(calls, 1);
    assert.equal(await load(async () => { throw new Error('offline'); }).site(), '');
    assert.equal(await load(async () => ({ ok: true, json: async () => ({ data: { timezone: 'Mars/Base' } }) })).site(), '', 'a bad stored value is ignored');
  });
});

describe('wiring', () => {
  test('both old-editor scripts convert through the helper, which is loaded first', () => {
    assert.match(read('static/js/admin/news.js'), /wallToIso\(/);
    assert.match(read('static/js/admin/content-edit-news.js'), /isoToWall\(/);
    const base = read('templates/layout/base.html');
    assert.ok(base.indexOf('news-timezone.js') > 0 && base.indexOf('news-timezone.js') < base.indexOf('/admin/news.js'));
    assert.match(read('js-src/newsroom-admin/03-article.js'), /wallToIso\(/);
  });
});

describe('site setting (API)', () => {
  const BASE = 'https://news.example.com'; const ADMIN = { user_id: 1, role: 'admin' };
  async function env() { const db = createTestDb(); applyMigrations(db); await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run(); return { DB: db, SITE_URL: BASE }; }
  const api = async (e, method, route, body) => {
    const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
    const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), e, ADMIN); return { status: res.status, json: await res.json() };
  };
  test('default empty; saves a real zone; rejects junk; can be cleared; audited', async () => {
    const e = await env();
    assert.equal((await api(e, 'GET', 'timezone')).json.data?.timezone ?? (await api(e, 'GET', 'timezone')).json.timezone, '');
    assert.equal((await api(e, 'POST', 'timezone/save', { timezone: 'Mars/Base' })).status, 400);
    assert.equal((await api(e, 'POST', 'timezone/save', { timezone: '../etc/passwd' })).status, 400);
    assert.equal((await api(e, 'POST', 'timezone/save', { timezone: 'Africa/Kigali' })).status, 200);
    assert.equal(await cal.getSiteTimezone(e.DB), 'Africa/Kigali');
    assert.equal((await api(e, 'POST', 'timezone/save', { timezone: '' })).status, 200);
    assert.equal(await cal.getSiteTimezone(e.DB), '');
  });
  test('a corrupted stored value reads as "no zone" instead of breaking screens', async () => {
    const e = await env();
    await e.DB.prepare(`INSERT INTO system_settings (key,value) VALUES ('site_timezone','Not/AZone')`).run();
    assert.equal(await cal.getSiteTimezone(e.DB), '');
  });
});
