// Patch 4: secrets managed from the dashboard (no wrangler), and forwarding to trackers / Meta / TikTok.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent } from '../worker/database/analytics.js';
import { createPostbackConfig } from '../worker/database/postback-configs.js';
import { encryptSecret, decryptSecret } from '../worker/security/secret-box.js';
import { getPostbackSecret, setPostbackSecret } from '../worker/postback/secrets.js';
import { handlePostbackRequest } from '../worker/postback/handler.js';
import { clickEventFields, captureClickParams } from '../worker/tracking/click-params.js';
import * as fw from '../worker/forwarding/forward.js';

async function seed(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO affiliate_partners (id,name,slug,status,created_by) VALUES (1,'P','p','active',1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id,partner_id,name,status,created_by) VALUES (10,1,'Alpha','active',1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id,partner_id,name,status,created_by) VALUES (11,1,'Beta','active',1)`).run();
  await db.prepare(`INSERT INTO affiliate_accounts (id,program_id,account_name,status,credential_reference,created_by) VALUES (100,10,'A','active','managed',1)`).run();
  await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (200,'C','c','https://x.example','https://a.example',1)`).run();
  await db.prepare(`INSERT INTO tracking_links (id,internal_name,tracking_code,destination_url,casino_id,partner_id,program_id,status) VALUES (300,'L','l','https://o.example',200,1,10,'active')`).run();
}
const click = (db, id, qs) => logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: 200, trackingLinkId: 300, partnerId: 1, programId: 10, clickId: id, ...clickEventFields(captureClickParams(new URLSearchParams(qs))) });

describe('secret box', () => {
  test('round trip with the shared secret as key; wrong key and damaged data give null', async () => {
    const env = { SUPER_API_SECRET: 'shared-secret-1' };
    const enc = await encryptSecret(env, 'hello');
    assert.match(enc, /^v1\./);
    assert.notEqual(enc, await encryptSecret(env, 'hello'), 'a fresh IV every time');
    assert.equal(await decryptSecret(env, enc), 'hello');
    assert.equal(await decryptSecret({ SUPER_API_SECRET: 'other' }, enc), null);
    assert.equal(await decryptSecret(env, enc.slice(0, -4)), null);
    assert.equal(await decryptSecret(env, 'garbage'), null);
  });
  test('without any shared secret a per-site key is created in the database and reused', async () => {
    const db = createTestDb(); applyMigrations(db);
    const env = { DB: db };
    const enc = await encryptSecret(env, 'abc');
    assert.equal(await decryptSecret(env, enc), 'abc');
    assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM site_secret_key').first()).c, 1);
  });
});

describe('postback secrets without wrangler', () => {
  let db, env, config, token;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); await seed(db);
    env = { DB: db, SUPER_API_SECRET: 'k' };
    const created = await createPostbackConfig(db, { account_id: 100, label: 'T', auth_method: 'shared_secret', credential_reference: 'managed', signature_param: 'secret', created_by: 1 });
    token = created.endpoint_token; config = { id: created.id, credential_reference: 'managed' };
    await click(db, 'ck1', '');
  });
  const post = (qs) => handlePostbackRequest(new Request(`https://s.example/en/api/v1/conversions/postback/${token}?${qs}`), env, token);

  test('a generated secret is stored encrypted and authenticates postbacks', async () => {
    const secret = await setPostbackSecret(env, config.id);
    assert.equal(secret.length, 32);
    assert.doesNotMatch((await db.prepare('SELECT secret_enc FROM postback_secrets').first()).secret_enc, new RegExp(secret));
    assert.equal(await getPostbackSecret(env, config), secret);
    const ok = await (await post(`click_id=ck1&event=ftd&amount=50&currency=USD&transaction_id=t1&secret=${secret}`)).json();
    assert.equal(ok.outcome, 'accepted');
    assert.equal((await post('click_id=ck1&event=ftd&transaction_id=t2&secret=wrong')).status, 401);
  });
  test('regenerating makes the old secret stop working', async () => {
    const first = await setPostbackSecret(env, config.id);
    const second = await setPostbackSecret(env, config.id);
    assert.notEqual(first, second);
    assert.equal((await post(`click_id=ck1&event=ftd&transaction_id=t3&secret=${first}`)).status, 401);
    assert.equal((await post(`click_id=ck1&event=ftd&transaction_id=t3&secret=${second}`)).status, 200);
  });
  test('with no secret at all the request is refused; an older Worker-secret integration still works', async () => {
    assert.equal((await post('click_id=ck1&event=ftd&transaction_id=t4&secret=x')).status, 401);
    const legacy = await createPostbackConfig(db, { account_id: 100, label: 'Old', auth_method: 'shared_secret', credential_reference: 'OLD_SECRET', signature_param: 'secret', created_by: 1 });
    env.OLD_SECRET = 'legacy-value';
    const r = await handlePostbackRequest(new Request(`https://s.example/x?click_id=ck1&event=ftd&transaction_id=t5&secret=legacy-value`), env, legacy.endpoint_token);
    assert.equal(r.status, 200);
  });
  test('the admin routes create, reveal and regenerate', async () => {
    const { route } = await import('../worker/api/routes/postback-configs.js');
    const call = async (path, method, body) => (await route({ request: new Request(`https://s.example/en${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, path, user: { user_id: 1, role: 'admin' } })).json();
    const created = await call('/api/v1/postback-config/create', 'POST', { account_id: 100, label: 'No wrangler', auth_method: 'shared_secret', signature_param: 'secret' });
    assert.equal(created.success, true);
    assert.equal(created.secret.length, 32, 'no credential_reference needed: the secret is generated');
    assert.equal((await call('/api/v1/postback-config/secret/reveal', 'POST', { id: created.id })).secret, created.secret);
    const next = await call('/api/v1/postback-config/secret/set', 'POST', { id: created.id });
    assert.notEqual(next.secret, created.secret);
    assert.equal((await call('/api/v1/postback-config/secret/set', 'POST', { id: created.id, secret: 'short' })).success, false);
    assert.equal((await call('/api/v1/postback-config/secret/set', 'POST', { id: created.id, secret: 'a-secret-the-program-dictates' })).secret, 'a-secret-the-program-dictates');
    const live = await call('/api/v1/postback-config/live-test', 'POST', { id: created.id });
    assert.equal(live.auth_valid, true, 'the live test uses the stored secret');
    const list = await call('/api/v1/postback-configs/list', 'GET');
    assert.equal(list.configs.find((c) => c.id === created.id).secret_managed, true);
  });
});

describe('forwarding: validation and request building', () => {
  test('destination safety', () => {
    assert.equal(fw.checkDestinationUrl('https://tracker.example.com/pb?x={sub1}'), null);
    for (const bad of ['http://tracker.example.com/', 'https://127.0.0.1/x', 'https://localhost/x', 'https://10.0.0.1/', 'https://[::1]/', 'https://metadata.internal/', 'https://user:pw@tracker.example.com/', 'https://tracker.example.com:8443/', 'https://intranet/x', 'not a url']) assert.ok(fw.checkDestinationUrl(bad), bad);
  });
  test('validateForward', () => {
    assert.ok(fw.validateForward({ kind: 'tracker_url', label: 'k', settings: { url: 'http://x.example/' } }).errors.length);
    assert.ok(fw.validateForward({ kind: 'meta_capi', label: 'm', settings: { pixel_id: '123456' } }).errors.some((e) => /token/.test(e)));
    assert.equal(fw.validateForward({ kind: 'meta_capi', label: 'm', settings: { pixel_id: '123456' } }, { creating: false }).errors.length, 0, 'editing keeps the stored token');
    assert.ok(fw.validateForward({ kind: 'tiktok_events', label: 't', secret: 'x', settings: { pixel_code: 'no' } }).errors.length);
    assert.ok(fw.validateForward({ kind: 'tracker_url', label: 'k', settings: { url: 'https://t.example/' }, events: ['nope'] }).errors.length);
  });
  const conv = { id: 7, click_id: 'ck', conversion_type: 'ftd', status: 'confirmed', reported_value: 100, calculated_commission: 40, currency: 'eur', external_reference: 'tx 1', country_code: 'DE', occurred_at: '2026-11-10 10:00:00' };
  const click = { subs: { sub1: 'kei&taro' }, ids: { fbclid: 'FB1', ttclid: 'TT1' }, utm: { utm_source: 'fb' }, occurred_at: '2026-11-10 09:00:00' };
  test('tracker URL macros are filled and encoded, with event names mapped', () => {
    const f = { kind: 'tracker_url', settings: { url: 'https://t.example/pb?subid={sub1}&status={event_mapped}&payout={commission}&cur={currency}&tid={transaction_id}&x={unknown}', method: 'GET', event_map: { ftd: 'sale' } } };
    assert.equal(fw.buildRequest(f, null, conv, click).url, 'https://t.example/pb?subid=kei%26taro&status=sale&payout=40&cur=eur&tid=tx%201&x=');
    const post = fw.buildRequest({ ...f, settings: { ...f.settings, method: 'POST' } }, null, conv, click);
    assert.equal(post.method, 'POST'); assert.equal(post.url, 'https://t.example/pb'); assert.match(post.body, /subid=kei%26taro/);
  });
  test('Meta request', () => {
    const f = { kind: 'meta_capi', settings: { pixel_id: '99999', api_version: 'v26.0', test_event_code: 'TEST1', value_source: 'amount' } };
    const r = fw.buildRequest(f, 'TOKEN', conv, click, { siteUrl: 'https://s.example', now: Date.parse('2026-11-11T00:00:00Z') });
    assert.equal(r.url, 'https://graph.facebook.com/v26.0/99999/events?access_token=TOKEN');
    const b = JSON.parse(r.body);
    assert.equal(b.test_event_code, 'TEST1');
    assert.equal(b.data[0].event_name, 'Purchase'); assert.equal(b.data[0].event_id, '7-confirmed'); assert.equal(b.data[0].custom_data.value, 100); assert.equal(b.data[0].custom_data.currency, 'EUR');
    assert.match(b.data[0].user_data.fbc, /^fb\.1\.\d+\.FB1$/);
    assert.match(fw.buildRequest(f, 'T', conv, { ...click, ids: {} }, { now: Date.parse('2026-11-11T00:00:00Z') }).skip, /fbclid/);
    assert.match(fw.buildRequest(f, 'T', conv, click, { now: Date.parse('2026-12-01T00:00:00Z') }).skip, /7 days/);
  });
  test('TikTok request', () => {
    const r = fw.buildRequest({ kind: 'tiktok_events', settings: { pixel_code: 'PIX123456', value_source: 'commission' } }, 'TTOKEN', conv, click);
    assert.equal(r.headers['Access-Token'], 'TTOKEN');
    const b = JSON.parse(r.body);
    assert.equal(b.event_source, 'web'); assert.equal(b.data[0].event, 'CompletePayment'); assert.equal(b.data[0].user.ttclid, 'TT1'); assert.equal(b.data[0].properties.value, 40);
    assert.match(fw.buildRequest({ kind: 'tiktok_events', settings: { pixel_code: 'PIX123456' } }, 'T', conv, { ...click, ids: {} }).skip, /ttclid/);
  });
});

describe('forwarding: delivery', () => {
  let db, env, calls, fetchOk;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); await seed(db);
    env = { DB: db, SUPER_API_SECRET: 'k' };
    calls = [];
    fetchOk = async (url, init) => { calls.push({ url, init }); return new Response('ok', { status: 200 }); };
    await click(db, 'ck1', 'sub1=keitaro123&fbclid=FB9');
  });
  const addConv = async (type, status, id = 'tx1') => (await db.prepare(`INSERT INTO analytics_conversions (click_id, tracking_link_id, casino_id, partner_id, program_id, account_id, conversion_type, status, reported_value, calculated_commission, currency, external_reference, occurred_at, source) VALUES ('ck1',300,200,1,10,100,?,?,100,40,'USD',?,CURRENT_TIMESTAMP,'postback')`).bind(type, status, id).run()).meta.last_row_id;
  const rule = (extra = {}) => fw.saveForward(env, fw.validateForward({ kind: 'tracker_url', label: 'Keitaro', settings: { url: 'https://t.example/pb?subid={sub1}&status={event_mapped}&payout={commission}', event_map: { ftd: 'sale' } }, events: ['ftd'], statuses: ['confirmed'], ...extra }).value);

  test('sends once per status, only for matching events, statuses and programs', async () => {
    await rule();
    const pending = await addConv('ftd', 'pending');
    assert.equal((await fw.dispatchForwards(env, pending, { fetchImpl: fetchOk })).length, 0, 'pending is not selected');
    await db.prepare("UPDATE analytics_conversions SET status='confirmed' WHERE id=?").bind(pending).run();
    const r = await fw.dispatchForwards(env, pending, { fetchImpl: fetchOk });
    assert.equal(r[0].outcome, 'sent');
    assert.equal(calls[0].url, 'https://t.example/pb?subid=keitaro123&status=sale&payout=40');
    assert.equal((await fw.dispatchForwards(env, pending, { fetchImpl: fetchOk })).length, 0, 'not sent twice');
    assert.equal(calls.length, 1);
    const reg = await addConv('registration', 'confirmed', 'tx2');
    assert.equal((await fw.dispatchForwards(env, reg, { fetchImpl: fetchOk })).length, 0, 'registration is not selected');
  });
  test('a rule limited to another program does not fire', async () => {
    await rule({ program_id: 11 });
    const id = await addConv('ftd', 'confirmed');
    assert.equal((await fw.dispatchForwards(env, id, { fetchImpl: fetchOk })).length, 0);
  });
  test('failures are logged, can be retried, and never throw', async () => {
    await rule();
    const id = await addConv('ftd', 'confirmed');
    const down = async () => new Response('nope', { status: 500 });
    assert.equal((await fw.dispatchForwards(env, id, { fetchImpl: down }))[0].outcome, 'failed');
    const d = (await fw.listDeliveries(db, {}))[0];
    assert.equal(d.http_status, 500); assert.match(d.detail, /nope/);
    const throwing = async () => { throw new Error('boom'); };
    assert.equal((await fw.dispatchForwards(env, id, { fetchImpl: throwing }))[0].outcome, 'failed');
    const retry = await fw.retryDelivery(env, d.id, { fetchImpl: fetchOk });
    assert.equal(retry.result.outcome, 'sent');
    const after = (await fw.listDeliveries(db, {}))[0];
    assert.equal(after.outcome, 'sent'); assert.ok(after.attempts >= 3);
  });
  test('Meta: token is stored encrypted, listing never returns it, no fbclid means skipped', async () => {
    await fw.saveForward(env, fw.validateForward({ kind: 'meta_capi', label: 'Meta', secret: 'EAAB-secret-token', settings: { pixel_id: '123456' }, events: ['ftd'], statuses: ['confirmed'] }).value);
    assert.doesNotMatch((await db.prepare('SELECT secret_enc FROM conversion_forwards').first()).secret_enc, /EAAB/);
    const list = await fw.listForwards(db);
    assert.equal(list[0].has_secret, true); assert.equal(JSON.stringify(list).includes('EAAB'), false);
    const id = await addConv('ftd', 'confirmed');
    const r = await fw.dispatchForwards(env, id, { fetchImpl: fetchOk });
    assert.equal(r[0].outcome, 'sent');
    assert.match(calls[0].url, /graph\.facebook\.com\/v26\.0\/123456\/events\?access_token=EAAB-secret-token$/);
    await db.prepare("UPDATE analytics_events SET metadata = '{}' WHERE click_id = 'ck1'").run();
    await db.prepare("UPDATE analytics_conversions SET status='pending' WHERE id=?").bind(id).run();
    await db.prepare("UPDATE analytics_conversions SET status='confirmed' WHERE id=?").bind(id).run();
    await db.prepare('DELETE FROM forward_deliveries').run();
    assert.equal((await fw.dispatchForwards(env, id, { fetchImpl: fetchOk }))[0].outcome, 'skipped');
  });
  test('a test send to Meta or TikTok needs a test event code; previews hide the token', async () => {
    const id = await fw.saveForward(env, fw.validateForward({ kind: 'tiktok_events', label: 'TT', secret: 'TT-SECRET', settings: { pixel_code: 'PIX123456' }, events: ['ftd'], statuses: ['confirmed'] }).value);
    const prev = await fw.testForward(env, id, { send: false });
    assert.equal(prev.preview.headers['Access-Token'], '***');
    assert.match((await fw.testForward(env, id, { send: true, fetchImpl: fetchOk })).error, /test event code/);
    assert.equal(calls.length, 0);
  });
  test('a postback triggers forwarding end to end, and a forwarding failure does not change the response', async () => {
    await rule();
    const created = await createPostbackConfig(db, { account_id: 100, label: 'T', auth_method: 'shared_secret', credential_reference: 'managed', signature_param: 'secret', created_by: 1 });
    const secret = await setPostbackSecret(env, created.id);
    const realFetch = globalThis.fetch; globalThis.fetch = fetchOk;
    try {
      const res = await handlePostbackRequest(new Request(`https://s.example/x?click_id=ck1&event=ftd&status=confirmed&amount=100&currency=USD&transaction_id=e2e&secret=${secret}`), env, created.endpoint_token);
      assert.equal((await res.json()).outcome, 'accepted');
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /subid=keitaro123/);
    } finally { globalThis.fetch = realFetch; }
  });
});

describe('forwarding: admin API', () => {
  test('save, list, preview, delete', async () => {
    const db = createTestDb(); applyMigrations(db); await seed(db);
    const env = { DB: db, SUPER_API_SECRET: 'k' };
    const { route } = await import('../worker/api/routes/forwards.js');
    const call = async (path, method, body) => (await route({ request: new Request(`https://s.example/en${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, path, user: { user_id: 1, role: 'admin' } })).json();
    assert.ok((await call('/api/v1/forwards/presets', 'GET')).trackers.keitaro);
    assert.equal((await call('/api/v1/forwards/save', 'POST', { kind: 'tracker_url', label: 'x', settings: { url: 'http://bad.example/' } })).success, false);
    const saved = await call('/api/v1/forwards/save', 'POST', { kind: 'tracker_url', label: 'K', settings: { url: 'https://t.example/pb?s={sub1}' }, events: ['ftd'], statuses: ['confirmed'] });
    assert.ok(saved.id);
    assert.equal((await call('/api/v1/forwards/list', 'GET')).forwards.length, 1);
    assert.match((await call('/api/v1/forwards/test', 'POST', { id: saved.id })).preview.url, /^https:\/\/t\.example\/pb\?s=test-sub1/);
    assert.equal((await call('/api/v1/forwards/delete', 'POST', { id: saved.id })).success, true);
  });
});
