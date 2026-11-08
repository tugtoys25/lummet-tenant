import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAPI } from '../worker/api.js';
import { isContentWrite } from '../worker/page-cache.js';
import { renderOne } from '../worker/live-banners/render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const admin = { user_id: 1, role: 'admin' };
const good = { name: 'Promo', template_key: 'promo_card', placement_mode: 'floating', anchor: 'bottom-right', content: { headline: 'Hi', cta_label: 'Go', link: '/en/x' } };
let env;
const call = (path, method, body, user = admin) => handleAPI(new Request('https://t.example' + path, { method, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0], user).then(async (r) => ({ status: r.status, body: await r.json() }));

beforeEach(() => { const db = createTestDb(); applyMigrations(db); db._exec(readFileSync(join(ROOT, 'migrations/0016_live_banners.sql'), 'utf8')); env = { DB: db }; });

describe('live banners API', () => {
  test('create, get, list, publish, pause, duplicate, reorder, delete', async () => {
    const c = await call('/api/v1/live-banner/create', 'POST', good); assert.equal(c.status, 200); const id = c.body.id;
    assert.equal((await call('/api/v1/live-banner/get?id=' + id, 'GET')).body.banner.name, 'Promo');
    assert.equal((await call('/api/v1/live-banner/publish', 'POST', { id })).status, 200);
    let list = (await call('/api/v1/live-banners/list', 'GET')).body.banners; assert.equal(list[0].display_status, 'live');
    const d = await call('/api/v1/live-banner/duplicate', 'POST', { id }); assert.ok(d.body.id !== id);
    assert.equal((await call('/api/v1/live-banner/reorder', 'POST', { ids: [d.body.id, id] })).status, 200);
    assert.equal((await call('/api/v1/live-banner/pause', 'POST', { id })).status, 200);
    list = (await call('/api/v1/live-banners/list', 'GET')).body.banners; assert.equal(list.find((b) => b.id === id).status, 'paused'); assert.equal(list[0].id, d.body.id);
    assert.equal((await call('/api/v1/live-banner/delete', 'POST', { id })).status, 200);
  });
  test('invalid input saves nothing', async () => {
    const r = await call('/api/v1/live-banner/create', 'POST', { ...good, content: { headline: 'a', cta_label: 'b', link: 'javascript:1' } });
    assert.equal(r.status, 422); assert.equal(env.DB._raw.prepare('select count(*) c from live_banners').get().c, 0);
  });
  test('preview renders from a draft and writes nothing', async () => {
    const r = await call('/api/v1/live-banner/preview', 'POST', good); assert.equal(r.status, 200); assert.match(r.body.html, /lb-promo/);
    assert.equal(env.DB._raw.prepare('select count(*) c from live_banners').get().c, 0);
  });
  test('permission gate: read vs write', async () => {
    const viewer = { user_id: 9, role: 'viewer' };
    const w = await call('/api/v1/live-banner/create', 'POST', good, viewer);
    assert.ok([401, 403].includes(w.status), 'viewer cannot write: ' + w.status);
    const anon = await call('/api/v1/live-banners/list', 'GET', null, null); assert.equal(anon.status, 401);
  });
  test('writes are content writes (page cache epoch bumps); the visitor beacon is not', () => {
    const req = (p) => new Request('https://t.example' + p, { method: 'POST' });
    assert.equal(isContentWrite(req('/en/api/v1/live-banner/create'), 200), true);
    assert.equal(isContentWrite(req('/en/api/v1/live-banner/event'), 202), false);
  });
  test('public event endpoint needs no sign-in and echoes nothing', async () => {
    const created = await call('/api/v1/live-banner/create', 'POST', { ...good, status: 'live' });
    const r = await call('/api/v1/live-banner/event', 'POST', { id: created.body.id, type: 'view' }, null);
    assert.equal(r.status, 202); assert.deepEqual(Object.keys(r.body), ['success']);
  });
  test('preview html is the public markup', () => { assert.match(renderOne({ id: 0, ...good, style: {}, targeting: {}, content: good.content, cards: [] }), /class="lb /); });
});
