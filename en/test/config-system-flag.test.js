// Phase 10: the master switch of the configurable platform. Rules under test:
// - default ON (today's behaviour); the environment variable wins over the settings key; an unreadable or unknown value means ON
// - OFF: the resolver returns the Full platform with no gating, the Configuration entry is hidden, every configuration write is refused
//   with the code config_system_off, and the welcome panel / next steps disappear
// - NOTHING stored is deleted or changed, and turning the system back on restores the stored configuration exactly
// - the Super API reports the state (capability site_system, API v17) and refuses provisioning while off
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { admin, editor, freshSite, setSetting, setting, snapshot as rawSnapshot } from './support/transfer-fixtures.js';
import { parseFlag, resolveFlag, getSystemFlag, setSystemFlag, systemEnabled, refuseWhenOff, SYSTEM_KEY, SYSTEM_ENV, SYSTEM_OFF_CODE, systemIsOff as tagged } from '../worker/site-profile/system-flag.js';
import { loadProfile, systemIsOff, saveProfile } from '../worker/site-profile/store.js';
import { applyPreset, defaultProfile, gate, pruneAdminNavHtml, isEnabled } from '../worker/site-profile/profile.js';
import { getRoute } from '../worker/routes.js';
import { readLiveDocument } from '../worker/site-profile/versions.js';
import { route as profileRoute } from '../worker/api/routes/site-profile.js';
import { route as versionsRoute } from '../worker/api/routes/site-profile-versions.js';
import { route as transferRoute } from '../worker/api/routes/site-profile-transfer.js';
import { handleGetSiteSetup, handleGetSiteSystem, handleProvisionSiteSetup } from '../worker/super/handlers/site-setup.js';
import { SUPER_API_VERSION, getCapabilities } from '../worker/super/capabilities.js';
import { SETUP_STATE, SETUP_SOURCE } from '../worker/site-profile/setup.js';

const HOST = 't.example';
// The switch row itself is the one thing that is allowed to change; everything else must be byte-identical.
const snapshot = async (db) => { const o = JSON.parse(await rawSnapshot(db)); o.settings = o.settings.filter((r) => r.key !== SYSTEM_KEY); return JSON.stringify(o); };
let db, env;
const NEWS = () => applyPreset('news');
const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, _m: m }; };
const req = (method, path, body) => ({ method, url: `https://${HOST}${path}`, headers: new Headers(), json: async () => body });
const callRoute = async (r, user, method, path, body) => { const res = await r({ request: req(method, path, body), env, path, user }); return { status: res.status, body: await res.json() }; };
const casinoRoute = () => getRoute({ url: `https://${HOST}/en/casino` });
beforeEach(async () => { ({ db, env } = freshSite()); await setSetting(db, 'site_profile', JSON.stringify(NEWS())); });

describe('reading the switch', () => {
  test('values are parsed in the usual spellings; anything else is "no opinion"', () => {
    for (const v of ['off', 'OFF', '0', 'false', 'disabled', 'no', false, ' off ']) assert.equal(parseFlag(v), false, String(v));
    for (const v of ['on', 'ON', '1', 'true', 'enabled', 'yes', true]) assert.equal(parseFlag(v), true, String(v));
    for (const v of [undefined, null, '', 'maybe', '2', {}]) assert.equal(parseFlag(v), null, String(v));
  });
  test('the environment variable wins; with no opinion the settings key decides; with nothing at all it is ON (the default)', () => {
    assert.deepEqual(resolveFlag('off', 'on'), { enabled: false, source: 'env' });
    assert.deepEqual(resolveFlag('on', 'off'), { enabled: true, source: 'env' });
    assert.deepEqual(resolveFlag(undefined, 'off'), { enabled: false, source: 'setting' });
    assert.deepEqual(resolveFlag('garbage', 'garbage'), { enabled: true, source: 'default' });
    assert.deepEqual(resolveFlag(undefined, undefined), { enabled: true, source: 'default' });
  });
  test('getSystemFlag reports the source and both raw opinions, and an unreadable database counts as ON', async () => {
    assert.deepEqual(await getSystemFlag(env), { enabled: true, source: 'default', envOverride: false, env: null, setting: null });
    await setSetting(db, SYSTEM_KEY, 'off');
    assert.deepEqual(await getSystemFlag(env), { enabled: false, source: 'setting', envOverride: false, env: null, setting: 'off' });
    assert.deepEqual(await getSystemFlag({ ...env, [SYSTEM_ENV]: 'on' }), { enabled: true, source: 'env', envOverride: true, env: 'on', setting: 'off' });
    const broken = { DB: { prepare() { throw new Error('d1 down'); } } };
    assert.equal((await getSystemFlag(broken)).enabled, true);
    assert.equal(await systemEnabled(broken), true);
  });
  test('setSystemFlag writes the settings key, and is refused while the environment variable decides', async () => {
    assert.equal((await setSystemFlag(env, false)).enabled, false); assert.equal(await setting(db, SYSTEM_KEY), 'off');
    const r = await setSystemFlag({ ...env, [SYSTEM_ENV]: 'off' }, true);
    assert.equal(r.ok, false); assert.equal(r.status, 409); assert.equal(r.code, 'flag_set_by_environment');
    assert.equal(await setting(db, SYSTEM_KEY), 'off', 'nothing was written');
  });
});

describe('the resolver', () => {
  test('ON: the stored configuration is enforced (news only: a casino page is gone)', async () => {
    const p = await loadProfile(env, HOST);
    assert.equal(systemIsOff(p), false); assert.equal(p.preset, 'news');
    assert.equal(gate(casinoRoute(), p).action, 'gone');
  });
  test('OFF by the settings key: the Full platform, nothing gated, tagged as off', async () => {
    await setSetting(db, SYSTEM_KEY, 'off');
    const p = await loadProfile(env, HOST);
    assert.equal(systemIsOff(p), true); assert.equal(tagged(p), true);
    assert.deepEqual({ ...p }, defaultProfile());
    assert.equal(gate(casinoRoute(), p).action, 'pass');
    assert.equal(isEnabled(p, 'casinos.list'), true);
  });
  test('OFF by the environment variable needs no database read at all', async () => {
    let prepares = 0; const spy = { DB: { prepare() { prepares++; throw new Error('must not be read'); } }, [SYSTEM_ENV]: 'off' };
    const p = await loadProfile(spy, HOST);
    assert.equal(systemIsOff(p), true); assert.equal(prepares, 0);
  });
  test('the environment variable beats the settings key in both directions', async () => {
    await setSetting(db, SYSTEM_KEY, 'off');
    assert.equal(systemIsOff(await loadProfile({ ...env, [SYSTEM_ENV]: 'on' }, HOST)), false);
    await setSetting(db, SYSTEM_KEY, 'on');
    assert.equal(systemIsOff(await loadProfile({ ...env, [SYSTEM_ENV]: 'off' }, HOST)), true);
  });
  test('round trip: off then on gives back exactly the stored configuration, and the stored rows were never touched', async () => {
    const before = await snapshot(db); const doc = await readLiveDocument(env);
    await setSetting(db, SYSTEM_KEY, 'off');
    const mid = await snapshot(db);
    assert.equal(mid, before, 'switching off changes only the switch row, which the snapshot leaves out');
    assert.deepEqual(await readLiveDocument(env), doc, 'the live document is identical while off');
    await setSetting(db, SYSTEM_KEY, 'on');
    const p = await loadProfile(env, HOST);
    assert.deepEqual({ ...p }, NEWS()); assert.equal(gate(casinoRoute(), p).action, 'gone');
    assert.equal(await snapshot(db), before); assert.deepEqual(await readLiveDocument(env), doc);
  });
  test('with the KV cache: a flip is seen after the cache is dropped, the cached entry is not poisoned, and a legacy bare entry still means ON', async () => {
    const cached = { ...env, CACHE: kv() };
    assert.equal(systemIsOff(await loadProfile(cached, HOST)), false);
    await setSetting(db, SYSTEM_KEY, 'off');
    const { invalidateProfile } = await import('../worker/site-profile/store.js');
    await invalidateProfile(cached, HOST);
    assert.equal(systemIsOff(await loadProfile(cached, HOST)), true);
    // while the entry is cached the environment variable still applies at once
    assert.equal(systemIsOff(await loadProfile({ ...cached, [SYSTEM_ENV]: 'on' }, HOST)), false);
    // an entry written by the previous release (a bare profile) is read as ON
    const legacy = { ...env, CACHE: kv() }; await legacy.CACHE.put(`site-profile:${HOST}`, JSON.stringify(NEWS()), { expirationTtl: 60 });
    const lp = await loadProfile(legacy, HOST); assert.equal(systemIsOff(lp), false); assert.equal(lp.preset, 'news');
  });
  test('an unreadable database is fail-open to the full platform, as before', async () => {
    const p = await loadProfile({ DB: { prepare() { throw new Error('down'); } } }, HOST);
    assert.deepEqual({ ...p }, defaultProfile());
  });
});

describe('writes while OFF', () => {
  beforeEach(async () => { await setSetting(db, SYSTEM_KEY, 'off'); });
  const refused = (r) => { assert.equal(r.status, 403); assert.equal(r.body.code, SYSTEM_OFF_CODE); assert.equal(r.body.success, false); };
  test('every configuration write is refused with config_system_off and changes nothing', async () => {
    const before = await snapshot(db); const live = await setting(db, 'site_profile');
    refused(await callRoute(profileRoute, admin, 'POST', '/api/v1/site-profile', applyPreset('static')));
    refused(await callRoute(profileRoute, admin, 'POST', '/api/v1/site-profile/settings', { settings: { site_name: 'x' } }));
    refused(await callRoute(profileRoute, admin, 'POST', '/api/v1/site-profile/setup/complete'));
    refused(await callRoute(versionsRoute, admin, 'PUT', '/api/v1/config/draft', { profile: applyPreset('static') }));
    refused(await callRoute(versionsRoute, admin, 'POST', '/api/v1/config/publish', {}));
    refused(await callRoute(versionsRoute, admin, 'POST', '/api/v1/config/rollback', { version: 1 }));
    refused(await callRoute(versionsRoute, admin, 'DELETE', '/api/v1/config/draft'));
    refused(await callRoute(transferRoute, admin, 'POST', '/api/v1/config/transfer/apply', { text: '{}' }));
    refused(await callRoute(transferRoute, admin, 'POST', '/api/v1/config/transfer/presets', { name: 'x' }));
    refused(await callRoute(transferRoute, admin, 'POST', '/api/v1/config/transfer/shares', {}));
    refused(await callRoute(transferRoute, admin, 'POST', '/api/v1/config/transfer/fetch', {}));
    assert.equal(await snapshot(db), before); assert.equal(await setting(db, 'site_profile'), live);
  });
  test('an editor gets the same refusal for what an editor may normally do (saving the draft)', async () => {
    refused(await callRoute(versionsRoute, editor, 'PUT', '/api/v1/config/draft', { profile: applyPreset('static') }));
  });
  test('reading still works, so staff can see the state, the history and the stored configuration', async () => {
    assert.equal((await callRoute(profileRoute, admin, 'GET', '/api/v1/site-profile')).status, 200);
    assert.equal((await callRoute(versionsRoute, admin, 'GET', '/api/v1/config/state')).status, 200);
    assert.equal((await callRoute(transferRoute, admin, 'GET', '/api/v1/config/transfer/state')).status, 200);
    const sys = await callRoute(profileRoute, editor, 'GET', '/api/v1/site-profile/system');
    assert.equal(sys.status, 200); assert.equal(sys.body.system.enabled, false); assert.equal(sys.body.system.source, 'setting');
  });
  test('the welcome panel and next steps disappear, whatever the stored setup state is', async () => {
    await setSetting(db, SETUP_STATE, 'pending'); await setSetting(db, SETUP_SOURCE, 'preset');
    const s = await callRoute(profileRoute, admin, 'GET', '/api/v1/site-profile/setup');
    assert.equal(s.body.setup.pending, false); assert.equal(s.body.systemOff, true); assert.equal(s.body.canConfirm, false);
    const n = await callRoute(profileRoute, admin, 'GET', '/api/v1/site-profile/next-steps');
    assert.deepEqual(n.body.steps, []); assert.equal(n.body.systemOff, true);
    assert.equal(await setting(db, SETUP_STATE), 'pending', 'the stored state is kept');
    await setSetting(db, SYSTEM_KEY, 'on');
    assert.equal((await callRoute(profileRoute, admin, 'GET', '/api/v1/site-profile/setup')).body.setup.pending, true, 'it is back when the system is switched on');
  });
  test('the switch itself can be turned back on by an administrator (and not by an editor), through the API', async () => {
    assert.equal((await callRoute(profileRoute, editor, 'PUT', '/api/v1/site-profile/system', { enabled: true })).status, 403);
    assert.equal((await callRoute(profileRoute, admin, 'PUT', '/api/v1/site-profile/system', { enabled: 'yes' })).status, 422);
    const r = await callRoute(profileRoute, admin, 'PUT', '/api/v1/site-profile/system', { enabled: true });
    assert.equal(r.status, 200); assert.equal(r.body.system.enabled, true);
    assert.equal((await callRoute(versionsRoute, admin, 'PUT', '/api/v1/config/draft', { profile: NEWS() })).status, 200, 'writes work again');
  });
  test('with the environment variable deciding, the API cannot change the switch and says why', async () => {
    env = { ...env, [SYSTEM_ENV]: 'off' };
    const r = await callRoute(profileRoute, admin, 'PUT', '/api/v1/site-profile/system', { enabled: true });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'flag_set_by_environment');
    const g = await callRoute(profileRoute, admin, 'GET', '/api/v1/site-profile/system');
    assert.equal(g.body.system.envOverride, true); assert.equal(g.body.system.source, 'env');
  });
  test('refuseWhenOff is a plain 403 JSON response with no-store', async () => {
    const res = await refuseWhenOff(env); assert.equal(res.status, 403); assert.equal(res.headers.get('cache-control'), 'no-store');
    await setSetting(db, SYSTEM_KEY, 'on'); assert.equal(await refuseWhenOff(env), null);
  });
});

describe('writes while ON are unchanged', () => {
  test('saving the draft and the live profile work as before, and the system endpoint reports ON from the default', async () => {
    assert.equal((await callRoute(versionsRoute, admin, 'PUT', '/api/v1/config/draft', { profile: NEWS() })).status, 200);
    assert.equal((await callRoute(profileRoute, admin, 'POST', '/api/v1/site-profile', applyPreset('research'))).status, 200);
    const g = await callRoute(profileRoute, admin, 'GET', '/api/v1/site-profile/system');
    assert.deepEqual(g.body.system, { enabled: true, source: 'default', envOverride: false, env: null, setting: null });
  });
  test('an editor cannot change the switch while the system is on either', async () => {
    assert.equal((await callRoute(profileRoute, editor, 'PUT', '/api/v1/site-profile/system', { enabled: false })).status, 403);
    assert.equal(await setting(db, SYSTEM_KEY), null);
  });
});

describe('the dashboard', () => {
  const NAV = readFileSync(new URL('../templates/layout/admin-nav.html', import.meta.url), 'utf8');
  test('the Configuration entry is hidden only while the system is off; every other link stays', async () => {
    const on = pruneAdminNavHtml(NAV, await loadProfile(env, HOST));
    assert.match(on, /href="\/en\/dashboard\/configuration"/);
    await setSetting(db, SYSTEM_KEY, 'off');
    const offProfile = await loadProfile(env, HOST);
    const off = pruneAdminNavHtml(NAV, offProfile);
    assert.doesNotMatch(off, /href="\/en\/dashboard\/configuration"/);
    assert.match(off, /href="\/en\/dashboard\/casinos"/, 'the full platform is shown, no module hidden');
  });
  test('the dashboard controller sends the Configuration page to the dashboard home while off', () => {
    const src = readFileSync(new URL('../worker/controllers/dashboard.js', import.meta.url), 'utf8');
    assert.match(src, /systemIsOff\(await loadProfile\(env, new URL\(request\.url\)\.hostname\)\)\) return new Response\(null, \{ status: 302, headers: \{ Location: "\/en\/dashboard"/);
  });
});

describe('Super API (v17)', () => {
  const call = async (h, method, path, body) => {
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const res = await h(new Request(`https://${HOST}${path}`, { method, body: method === 'GET' ? undefined : bodyText }), env, null, bodyText);
    return { status: res.status, body: await res.json() };
  };
  test('the capability and the version moved on, and the route is registered', () => {
    assert.ok(SUPER_API_VERSION >= 17); assert.equal(getCapabilities().site_system, true);
  });
  test('GET site-system and GET site-setup both report the switch', async () => {
    const g = await call(handleGetSiteSystem, 'GET', '/en/api/super/site-system');
    assert.equal(g.status, 200); assert.equal(g.body.system.enabled, true); assert.equal(g.body.system.source, 'default');
    await setSetting(db, SYSTEM_KEY, 'off');
    const s = await call(handleGetSiteSetup, 'GET', '/en/api/super/site-setup');
    assert.equal(s.body.system.enabled, false); assert.equal(s.body.system.source, 'setting');
  });
  test('provisioning is refused with 409 config_system_off while off, writes nothing, and works again when on', async () => {
    await setSetting(db, SETUP_STATE, 'pending'); await setSetting(db, SETUP_SOURCE, 'new'); await setSetting(db, SYSTEM_KEY, 'off');
    const before = await snapshot(db); const live = await setting(db, 'site_profile');
    const r = await call(handleProvisionSiteSetup, 'POST', '/en/api/super/site-setup', { preset: 'research' });
    assert.equal(r.status, 409); assert.equal(r.body.error, SYSTEM_OFF_CODE);
    assert.equal(await snapshot(db), before); assert.equal(await setting(db, 'site_profile'), live);
    await setSetting(db, SYSTEM_KEY, 'on');
    assert.equal((await call(handleProvisionSiteSetup, 'POST', '/en/api/super/site-setup', { preset: 'research' })).status, 200);
  });
});
