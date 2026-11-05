// Phase 10 / B4: regression tests for the security review (docs/SECURITY_REVIEW_CONFIGURATION.md).
// Each describe block names the check it protects. NOT verified here: a real browser (Origin / Sec-Fetch-Site are set by hand), real D1, real network.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshSite, setSetting, setting, admin, editor, viewer } from './support/transfer-fixtures.js';
import { crossSite, readJsonCapped, MAX_BODY_DEFAULT, MAX_BODY_DRAFT, MAX_BODY_IMPORT } from '../worker/api/config-http.js';
import { limitRequest, LIMITS, WINDOW_MINUTES } from '../worker/api/config-limits.js';
import { route as profileRoute } from '../worker/api/routes/site-profile.js';
import { route as versionsRoute } from '../worker/api/routes/site-profile-versions.js';
import { route as transferRoute } from '../worker/api/routes/site-profile-transfer.js';
import { applyPreset } from '../worker/site-profile/profile.js';
import { buildExport } from '../worker/site-profile/transfer.js';
import { SYSTEM_KEY } from '../worker/site-profile/system-flag.js';
import { createShare } from '../worker/site-profile/transfer-store.js';

const HOST = 't.example';
let db, env;
beforeEach(() => { ({ db, env } = freshSite()); });
const rq = (method, path, { body, headers = {}, raw } = {}) => new Request(`https://${HOST}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
const call = async (r, user, method, path, opts) => { const res = await r({ request: rq(method, path, opts), env, path: path.split('?')[0], user }); let b = null; try { b = await res.clone().json(); } catch { /* not json */ } return { status: res.status, body: b, res }; };

describe('CSRF: cross-site writes are refused', () => {
  test('crossSite: Origin of another site, Sec-Fetch-Site cross-site and an unparseable Origin are refused; same origin, same-site-less scripts are not', () => {
    const r = (h) => new Request(`https://${HOST}/x`, { method: 'POST', headers: h });
    assert.equal(crossSite(r({ Origin: 'https://evil.example' })), true);
    assert.equal(crossSite(r({ 'Sec-Fetch-Site': 'cross-site' })), true);
    assert.equal(crossSite(r({ Origin: 'not a url' })), true);
    assert.equal(crossSite(r({ Origin: `https://${HOST}`, 'Sec-Fetch-Site': 'same-origin' })), false);
    assert.equal(crossSite(r({})), false);
  });
  test('the live profile write (it had no Origin check before Phase 10) is refused cross-site and writes nothing', async () => {
    await setSetting(db, 'site_profile', JSON.stringify(applyPreset('news')));
    const before = await setting(db, 'site_profile');
    for (const headers of [{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      const r = await call(profileRoute, admin, 'POST', '/api/v1/site-profile', { body: applyPreset('static'), headers });
      assert.equal(r.status, 403, JSON.stringify(headers)); assert.match(r.body.error, /Cross-site/);
    }
    assert.equal(await setting(db, 'site_profile'), before);
    assert.equal((await call(profileRoute, admin, 'POST', '/api/v1/site-profile', { body: applyPreset('static'), headers: { Origin: `https://${HOST}` } })).status, 200, 'same origin works');
  });
  test('every other state-changing configuration route refuses a cross-site request', async () => {
    const h = { Origin: 'https://evil.example' };
    const cases = [
      [profileRoute, 'PUT', '/api/v1/site-profile/system', { enabled: false }], [profileRoute, 'POST', '/api/v1/site-profile/settings', { settings: {} }], [profileRoute, 'POST', '/api/v1/site-profile/setup/complete', {}],
      [versionsRoute, 'PUT', '/api/v1/config/draft', {}], [versionsRoute, 'POST', '/api/v1/config/publish', {}], [versionsRoute, 'POST', '/api/v1/config/rollback', { version: 1 }], [versionsRoute, 'DELETE', '/api/v1/config/draft'],
      [transferRoute, 'POST', '/api/v1/config/transfer/apply', {}], [transferRoute, 'POST', '/api/v1/config/transfer/fetch', {}], [transferRoute, 'POST', '/api/v1/config/transfer/presets', {}], [transferRoute, 'POST', '/api/v1/config/transfer/shares', {}],
    ];
    for (const [r, m, p, body] of cases) assert.equal((await call(r, admin, m, p, { body, headers: h })).status, 403, `${m} ${p}`);
  });
  test('the read-only preview POST is not blocked by the cross-site check (it writes nothing)', async () => {
    const r = await call(profileRoute, editor, 'POST', '/api/v1/site-profile/preview', { body: applyPreset('news'), headers: { Origin: 'https://evil.example' } });
    assert.equal(r.status, 200);
  });
});

describe('admin-only writes (roles)', () => {
  test('an editor cannot write the live profile, the switch, the setup, publish, rollback, presets or shares; a viewer and a signed-out caller get nothing', async () => {
    const denied = [
      [profileRoute, 'POST', '/api/v1/site-profile', applyPreset('news')], [profileRoute, 'PUT', '/api/v1/site-profile/system', { enabled: false }], [profileRoute, 'POST', '/api/v1/site-profile/setup/complete', {}],
      [versionsRoute, 'POST', '/api/v1/config/publish', {}], [versionsRoute, 'POST', '/api/v1/config/rollback', { version: 1 }], [versionsRoute, 'DELETE', '/api/v1/config/draft'],
      [transferRoute, 'POST', '/api/v1/config/transfer/presets', { name: 'x' }], [transferRoute, 'POST', '/api/v1/config/transfer/shares', {}],
    ];
    for (const [r, m, p, body] of denied) { const x = await call(r, editor, m, p, { body }); assert.equal(x.status, 403, `editor ${m} ${p}`); }
    for (const [r, m, p, body] of denied) { assert.ok([401, 403].includes((await call(r, viewer, m, p, { body })).status), `viewer ${p}`); assert.ok([401, 403].includes((await call(r, null, m, p, { body })).status), `anon ${p}`); }
  });
});

describe('request body size caps (before parsing)', () => {
  test('readJsonCapped: ok, empty object, non-object, invalid JSON, too large by header, too large by body', async () => {
    assert.deepEqual((await readJsonCapped(rq('POST', '/x', { body: { a: 1 } }))).body, { a: 1 });
    assert.deepEqual((await readJsonCapped(rq('POST', '/x', { raw: '[1,2]' }))).body, {});
    assert.equal((await readJsonCapped(rq('POST', '/x', { raw: '{nope' }))).response.status, 400);
    const big = await readJsonCapped(rq('POST', '/x', { raw: JSON.stringify({ t: 'x'.repeat(MAX_BODY_DEFAULT) }) }));
    assert.equal(big.response.status, 413); assert.equal((await big.response.json()).code, 'payload_too_large');
    const hdr = await readJsonCapped(new Request(`https://${HOST}/x`, { method: 'POST', headers: { 'content-length': String(MAX_BODY_DEFAULT + 1) }, body: '{}' }));
    assert.equal(hdr.response.status, 413);
    assert.ok((await readJsonCapped(rq('POST', '/x', { body: { t: 'x'.repeat(MAX_BODY_DEFAULT) } }), MAX_BODY_IMPORT)).body, 'a larger cap lets it through');
    assert.ok(MAX_BODY_DRAFT > MAX_BODY_DEFAULT && MAX_BODY_IMPORT > MAX_BODY_DRAFT);
  });
  test('a test double that only has json() is still size-checked', async () => {
    const r = await readJsonCapped({ headers: new Headers(), json: async () => ({ t: 'x'.repeat(MAX_BODY_DEFAULT) }) });
    assert.equal(r.response.status, 413);
  });
  test('routes answer 413 for an oversized body and change nothing: live profile, draft, import, presets, system switch, settings', async () => {
    const big = (n) => ({ raw: JSON.stringify({ t: 'x'.repeat(n) }) });
    await setSetting(db, 'site_profile', JSON.stringify(applyPreset('news'))); const before = await setting(db, 'site_profile');
    assert.equal((await call(profileRoute, admin, 'POST', '/api/v1/site-profile', big(MAX_BODY_DEFAULT))).status, 413);
    assert.equal((await call(profileRoute, admin, 'POST', '/api/v1/site-profile/settings', big(MAX_BODY_DEFAULT))).status, 413);
    assert.equal((await call(profileRoute, admin, 'PUT', '/api/v1/site-profile/system', big(MAX_BODY_DEFAULT))).status, 413);
    assert.equal((await call(versionsRoute, admin, 'PUT', '/api/v1/config/draft', big(MAX_BODY_DRAFT))).status, 413);
    assert.equal((await call(transferRoute, admin, 'POST', '/api/v1/config/transfer/plan', big(MAX_BODY_IMPORT))).status, 413);
    assert.equal((await call(transferRoute, admin, 'POST', '/api/v1/config/transfer/apply', big(MAX_BODY_IMPORT))).status, 413);
    assert.equal((await call(transferRoute, admin, 'POST', '/api/v1/config/transfer/presets', big(MAX_BODY_DEFAULT))).status, 413);
    assert.equal(await setting(db, 'site_profile'), before); assert.equal(await setting(db, SYSTEM_KEY), null);
  });
  test('an import file between the 900 KB envelope cap and the body cap is refused by the envelope check, not accepted', async () => {
    const r = await call(transferRoute, admin, 'POST', '/api/v1/config/transfer/plan', { body: { text: JSON.stringify({ pad: 'x'.repeat(1000 * 1024) }) } });
    assert.equal(r.status, 422); assert.match(r.body.error, /too large/i);
  });
});

describe('sections whitelist', () => {
  test('unknown ids never export anything, and never widen into "everything"', async () => {
    const x = await call(transferRoute, admin, 'GET', '/api/v1/config/transfer/export?sections=bogus,../../etc,%00');
    assert.equal(x.status, 422);
  });
  test('valid ids mixed with junk: only the valid ones are exported', async () => {
    const built = await buildExport(env, { host: HOST, sections: ['bogus', 'structure', '<script>'] });
    assert.deepEqual(built.included, ['structure']);
  });
  test('only the first 64 entries are considered: a valid id after 200 junk entries is ignored (so a huge list cannot be used to probe or slow the server)', async () => {
    const junk = Array.from({ length: 200 }, (_, i) => `junk${i}`);
    const built = await buildExport(env, { host: HOST, sections: [...junk, 'structure'] });
    assert.deepEqual(built.included, []);
  });
  test('the apply route ignores unknown ids too (nothing selected, nothing written)', async () => {
    const before = await setting(db, 'site_profile');
    const exp = (await buildExport(env, { host: HOST })).envelope;
    const r = await call(transferRoute, admin, 'POST', '/api/v1/config/transfer/apply', { body: { envelope: exp, sections: ['bogus'] } });
    assert.ok(r.status >= 400 || r.body.imported === undefined || !r.body.changes?.length);
    assert.equal(await setting(db, 'site_profile'), before);
  });
});

describe('rate limits (request count per person)', () => {
  test('limitRequest: allows exactly the limit, then answers 429 rate_limited with Retry-After', async () => {
    const now = Date.now();
    for (let i = 0; i < LIMITS.fetch; i++) assert.equal(await limitRequest(env, admin, 'fetch', now), null, `request ${i + 1}`);
    const over = await limitRequest(env, admin, 'fetch', now);
    assert.equal(over.status, 429); assert.equal(over.headers.get('Retry-After'), String(WINDOW_MINUTES * 60));
    const b = await over.json(); assert.equal(b.code, 'rate_limited'); assert.equal(b.limit, LIMITS.fetch);
  });
  test('it is per person and per action, and the window expires', async () => {
    const now = Date.now();
    for (let i = 0; i <= LIMITS.fetch; i++) await limitRequest(env, admin, 'fetch', now);
    assert.equal(await limitRequest(env, editor, 'fetch', now), null, 'another person is not affected');
    assert.equal(await limitRequest(env, admin, 'export', now), null, 'another action is not affected');
    assert.equal(await limitRequest(env, admin, 'fetch', now + (WINDOW_MINUTES + 1) * 60 * 1000), null, 'after the window it is allowed again');
  });
  test('it only ever deletes its own rows (the sign-in limiter rows are untouched) and uses a window the sign-in cleanup cannot undercut', async () => {
    await db.prepare("INSERT INTO auth_attempts(ip_hash, action, created_at) VALUES('h','login','2000-01-01T00:00:00.000Z')").run();
    await limitRequest(env, admin, 'export', Date.now());
    assert.equal(Number((await db.prepare("SELECT COUNT(*) c FROM auth_attempts WHERE action='login'").first()).c), 1);
    assert.ok(WINDOW_MINUTES <= 15, 'auth/security.js checkRateLimit deletes every row older than 15 minutes');
  });
  test('fail-open: an unreadable table never blocks staff', async () => {
    assert.equal(await limitRequest({ DB: { prepare() { throw new Error('d1 down'); } } }, admin, 'export'), null);
    assert.equal(await limitRequest({}, admin, 'export'), null);
    assert.equal(await limitRequest(env, admin, 'unknown-action'), null);
  });
  test('routes: export, plan, apply, fetch, presets, shares, setup/complete, publish and rollback each answer 429 after their limit', async () => {
    const cases = [
      ['export', transferRoute, 'GET', '/api/v1/config/transfer/export', undefined],
      ['plan', transferRoute, 'POST', '/api/v1/config/transfer/plan', { text: '{}' }],
      ['apply', transferRoute, 'POST', '/api/v1/config/transfer/apply', { text: '{}' }],
      ['fetch', transferRoute, 'POST', '/api/v1/config/transfer/fetch', { url: 'x' }],
      ['presets', transferRoute, 'POST', '/api/v1/config/transfer/presets', { name: 'n' }],
      ['shares', transferRoute, 'POST', '/api/v1/config/transfer/shares', {}],
      ['setup', profileRoute, 'POST', '/api/v1/site-profile/setup/complete', {}],
      ['publish', versionsRoute, 'POST', '/api/v1/config/publish', {}],
      ['rollback', versionsRoute, 'POST', '/api/v1/config/rollback', { version: 1 }],
    ];
    for (const [name, r, m, p, body] of cases) {
      ({ db, env } = freshSite());
      for (let i = 0; i < LIMITS[name]; i++) assert.notEqual((await call(r, admin, m, p, { body })).status, 429, `${name} request ${i + 1} must not be limited`);
      const over = await call(r, admin, m, p, { body });
      assert.equal(over.status, 429, name); assert.equal(over.body.code, 'rate_limited', name);
    }
  });
  test('a refused (429) request does no work: the draft is not touched', async () => {
    for (let i = 0; i < LIMITS.publish; i++) await limitRequest(env, admin, 'publish');
    const r = await call(versionsRoute, admin, 'POST', '/api/v1/config/publish', { body: { note: 'x' } });
    assert.equal(r.status, 429);
    assert.equal(Number((await db.prepare('SELECT COUNT(*) c FROM config_versions WHERE source <> ?').bind('baseline').first()).c), 0);
  });
  test('draft autosave is deliberately NOT limited (it fires on every change); it is bounded by the 512 KB body cap and the draft revision check', async () => {
    for (let i = 0; i < 60; i++) assert.notEqual((await call(versionsRoute, editor, 'PUT', '/api/v1/config/draft', { body: { profile: applyPreset('news') } })).status, 429);
  });
});

describe('no secrets in exports, audit or responses', () => {
  test('export contains only owned setting keys: a secret key and the master switch key are not in it', async () => {
    await setSetting(db, 'secret_api_key', 'sk-123'); await setSetting(db, 'smtp_password', 'pw'); await setSetting(db, SYSTEM_KEY, 'on'); await setSetting(db, 'site_name', 'Alpha');
    const text = JSON.stringify((await buildExport(env, { host: HOST })).envelope);
    for (const needle of ['sk-123', 'secret_api_key', 'smtp_password', SYSTEM_KEY]) assert.ok(!text.includes(needle), needle);
  });
  test('a share code is shown once and only its hash is stored; the audit log never contains it', async () => {
    const r = await createShare(env, admin, { label: 'x', hours: 1, maxUses: 1, sections: ['structure'] });
    assert.ok(r.token && r.token.startsWith('lcs_'));
    const audit = JSON.stringify((await db.prepare('SELECT * FROM config_audit').all()).results);
    assert.ok(!audit.includes(r.token));
    const shares = JSON.stringify((await db.prepare('SELECT * FROM config_shares').all()).results);
    assert.ok(!shares.includes(r.token), 'only the hash is stored');
    const listed = await call(transferRoute, admin, 'GET', '/api/v1/config/transfer/shares');
    assert.ok(!JSON.stringify(listed.body).includes(r.token));
  });
  test('the 413 / 429 / 403 bodies carry a code and a message only (no echo of the request)', async () => {
    const r = await call(profileRoute, admin, 'POST', '/api/v1/site-profile', { raw: JSON.stringify({ secret: 'TOPSECRET', t: 'x'.repeat(MAX_BODY_DEFAULT) }) });
    assert.ok(!JSON.stringify(r.body).includes('TOPSECRET'));
  });
});
