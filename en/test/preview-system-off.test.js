// Phase 10: a draft preview is never shown while the master switch of the configurable platform is OFF (decision recorded in
// docs/OPERATOR_CONFIGURATION.md). Both places that hold the switch are covered; the cookie is left alone, and preview works again when ON.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { saveDraft } from '../worker/site-profile/versions.js';
import { applyPreset } from '../worker/site-profile/profile.js';
import { resolvePreview, previewCookie } from '../worker/site-profile/preview.js';
import { SYSTEM_KEY } from '../worker/site-profile/system-flag.js';

const editor = { user_id: 2, email: 'ed@t.example', role: 'editor' };
let db, ENV;
async function signIn(role) {
  const u = await db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x:y', ?)`).bind(`${role}@t.example`, role).run();
  await db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, '2099-01-01')`).bind(`tok-${role}`, u.meta.last_row_id).run();
  return `session=tok-${role}`;
}
const get = (path, cookie) => new Request(`https://t.example${path}`, { headers: cookie ? { cookie } : {} });
const setSwitch = (v) => db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(SYSTEM_KEY, v).run();
const url = (p) => new URL(`https://t.example${p}`);

beforeEach(async () => {
  db = createTestDb(); applyMigrations(db); ENV = { DB: db };
  await saveDraft(ENV, editor, { profile: applyPreset('news'), settings: { site_name: 'Draft Name' } });
});

describe('resolvePreview and the master switch', () => {
  test('ON (default): a signed-in editor with the cookie previews the draft', async () => {
    const s = await signIn('editor');
    const o = await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), ENV, url('/en/news'));
    assert.ok(o, 'overlay returned'); assert.equal(o.settings.site_name, 'Draft Name');
  });
  test('OFF by the settings key: no overlay, although the cookie and the session are valid', async () => {
    const s = await signIn('editor'); await setSwitch('off');
    assert.equal(await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), ENV, url('/en/news')), null);
  });
  test('OFF by the environment variable (every spelling): no overlay; the environment wins over a settings key that says on', async () => {
    const s = await signIn('editor'); await setSwitch('on');
    for (const v of ['off', 'OFF', '0', 'false', 'disabled', 'no']) {
      assert.equal(await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), { ...ENV, CONFIGURABLE_PLATFORM: v }, url('/en/news')), null, v);
    }
  });
  test('an unreadable or unknown switch value means ON, so preview still works', async () => {
    const s = await signIn('editor'); await setSwitch('maybe');
    assert.ok(await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), ENV, url('/en/news')));
    assert.ok(await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), { ...ENV, CONFIGURABLE_PLATFORM: 'banana' }, url('/en/news')));
  });
  test('switching back ON restores preview with the same cookie and draft', async () => {
    const s = await signIn('editor'); await setSwitch('off');
    assert.equal(await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), ENV, url('/en/news')), null);
    await setSwitch('on');
    assert.equal((await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), ENV, url('/en/news'))).settings.site_name, 'Draft Name');
  });
  test('the other refusals are unchanged: no cookie, no session, a viewer, a POST and the dashboard/API paths', async () => {
    const e = await signIn('editor'); const v = await signIn('viewer');
    assert.equal(await resolvePreview(get('/en/news', e), ENV, url('/en/news')), null, 'no cookie');
    assert.equal(await resolvePreview(get('/en/news', 'cfg_preview=1'), ENV, url('/en/news')), null, 'no session');
    assert.equal(await resolvePreview(get('/en/news', `${v}; cfg_preview=1`), ENV, url('/en/news')), null, 'viewer role');
    assert.equal(await resolvePreview(new Request('https://t.example/en/news', { method: 'POST', headers: { cookie: `${e}; cfg_preview=1` } }), ENV, url('/en/news')), null, 'POST');
    for (const p of ['/en/dashboard', '/en/api/v1/x', '/api/v1/x']) assert.equal(await resolvePreview(get(p, `${e}; cfg_preview=1`), ENV, url(p)), null, p);
  });
  test('a failing database never breaks the page: the answer is null', async () => {
    const s = await signIn('editor');
    const broken = { DB: { prepare() { throw new Error('db down'); } } };
    assert.equal(await resolvePreview(get('/en/news', `${s}; cfg_preview=1`), broken, url('/en/news')), null);
  });
  test('without the cookie the switch is not even read (ordinary traffic pays nothing)', async () => {
    let reads = 0;
    const counting = { DB: { prepare(...a) { reads += 1; return db.prepare(...a); } } };
    assert.equal(await resolvePreview(get('/en/news'), counting, url('/en/news')), null);
    assert.equal(reads, 0);
    assert.match(previewCookie(true), /cfg_preview=1/);
  });
});
